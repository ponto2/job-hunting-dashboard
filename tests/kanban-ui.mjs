// Run with the app at http://127.0.0.1:3000. All /api requests use isolated fixtures.
// Set PLAYWRIGHT_MODULE to the Playwright package path when it is not installed locally.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.KANBAN_TEST_URL || 'http://localhost:3000';
const outputDir = new URL('../.next/qa/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
const writes = [];
let failNextUpdate = false;
let failNextEventUpdate = false;
let nextId = 100;
const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const selection = (id, company, kind, title, status) => ({ id: uuid(id), company_id: uuid(company), kind, title, status });
const companies = [
  { id: uuid(1), name: '並行選考株式会社', industry: 'IT・通信', interest: 4, status: '面接中', intern_url: 'https://example.com/intern', recruit_url: 'https://example.com/recruit', selections: [
    selection(11, 1, 'internship', '夏インターン', '未応募'),
    selection(12, 1, 'internship', '冬インターン', 'ES提出済'),
    selection(13, 1, 'fulltime', '本選考・技術職', 'ES提出済'),
  ] },
  { id: uuid(2), name: '分類待ち株式会社', industry: 'メーカー', interest: 3, status: '面接中', selections: [
    selection(21, 2, 'unclassified', '既存の選考', '面接中'),
  ] },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: uuid(30 + index), name: index === 0 ? '長い企業名でもカードが縦に伸びないことを確認する株式会社' : `追加企業${index + 1}`, industry: 'IT・通信', interest: 2, intern_url: 'https://example.com/intern-only', selections: [
      selection(50 + index, 30 + index, 'internship', index === 0 ? '' : '開発体験', '未応募'),
      ...(index === 0 ? [selection(80, 30, 'internship', '', '面接中')] : []),
    ],
  })),
  // Due dates on the quote cell: a linked deadline shows only on its own card,
  // an unlinked one only on the company's furthest-along open selection.
  { id: uuid(90), name: '気配検証株式会社', industry: 'IT・通信', interest: 3, selections: [
    selection(91, 90, 'internship', '冬インターン', 'ES準備中'),
    selection(92, 90, 'fulltime', '本選考', '興味あり'),
  ] },
  { id: uuid(93), name: '未紐づけ検証株式会社', industry: 'IT・通信', interest: 3, selections: [
    selection(94, 93, 'internship', '夏インターン', 'ES準備中'),
    selection(95, 93, 'fulltime', '本選考', '興味あり'),
  ] },
];
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const event = (id, companyId, title, offset, fields) => ({
  id: uuid(id), company_id: uuid(companyId), companies: { id: uuid(companyId), name: companies.find(c => c.id === uuid(companyId)).name },
  title, event_type: 'deadline', start_date: day(offset), end_date: null, memo: '', selection_id: null, done: false, ...fields,
});
const events = [
  event(201, 90, '冬インターンES締切', 1, { selection_id: uuid(91) }),
  event(202, 90, '本選考エントリー締切', 0, { selection_id: uuid(92), done: true }),
  event(203, 93, 'Webテスト受検期限', 2),
  event(204, 93, '提出済みの書類締切', 0, { done: true }),
  // The 要確認 strip: a 2-day interview must sort before a 6-day deadline,
  // and enough items to overflow the strip at 1440px.
  event(205, 31, '一次面接', 2, { event_type: 'interview' }),
  event(206, 32, '6日後のES締切', 6),
  ...Array.from({ length: 10 }, (_, index) => event(207 + index, 33 + (index % 5), `確認用の締切${index + 1}`, index < 3 ? -(index + 1) : index - 2)),
];
const eventWrites = [];
const lookup = id => companies.flatMap(company => company.selections).find(item => item.id === id);
const fulfill = (route, json, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
await context.route('**/api/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path === '/api/auth/check') return fulfill(route, { authenticated: true });
  if (path === '/api/companies' && request.method() === 'GET') return fulfill(route, companies);
  if (path === '/api/events' && request.method() === 'GET') return fulfill(route, events);
  if (path === '/api/events' && request.method() === 'PUT') {
    const body = request.postDataJSON();
    eventWrites.push(body);
    if (failNextEventUpdate) { failNextEventUpdate = false; return fulfill(route, { error: '検証用の保存エラー' }, 500); }
    const current = events.find(item => item.id === body.id);
    Object.assign(current, body);
    return fulfill(route, current);
  }
  if (['/api/es-entries', '/api/interview-memos'].includes(path) && request.method() === 'GET') return fulfill(route, []);
  if (path === '/api/selections') {
    const method = request.method();
    const body = ['PUT', 'POST'].includes(method) ? request.postDataJSON() : null;
    writes.push({ method, body });
    if (method === 'PUT') {
      if (failNextUpdate) { failNextUpdate = false; return fulfill(route, { error: '検証用の保存エラー' }, 500); }
      const current = lookup(body.id);
      Object.assign(current, body);
      return fulfill(route, current);
    }
    if (method === 'POST') {
      const created = { id: uuid(nextId++), ...body };
      companies.find(company => company.id === body.company_id).selections.push(created);
      return fulfill(route, created, 201);
    }
    if (method === 'DELETE') {
      const id = new URL(request.url()).searchParams.get('id');
      companies.forEach(company => { company.selections = company.selections.filter(item => item.id !== id); });
      return fulfill(route, { success: true });
    }
  }
  errors.push(`Unexpected API request: ${request.method()} ${path}`);
  return fulfill(route, { error: 'Unexpected request blocked by test' }, 500);
});
await context.route('https://example.com/**', route => route.fulfill({ body: '<title>Test mypage</title>', contentType: 'text/html' }));
page.on('pageerror', error => errors.push(error.message));
const internship = page.getByRole('region', { name: 'インターンのカンバン', exact: true });
const fulltime = page.getByRole('region', { name: '本選考のカンバン', exact: true });
const switches = page.getByRole('group', { name: '表示する選考' });
const tab = label => page.getByRole('navigation', { name: '表示切り替え' }).getByRole('button', { name: new RegExp(`^${label}`) });
const attention = page.getByRole('region', { name: '要確認', exact: true });
const editButton = (board, title) => board.getByRole('button', { name: `並行選考株式会社・${title}の選考を編集`, exact: true });
const column = (board, status) => board.locator(`.kanban-column[aria-label="${status}"]`);
const waitFor = async (predicate, label) => {
  const deadline = Date.now() + 8000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
};
const log = label => console.log(`PASS ${label}`);
const quoteText = async (board, company, title) => {
  const quote = board.getByRole('button', { name: `${company}・${title}の選考を編集`, exact: true })
    .locator('xpath=ancestor::article').locator('.quote');
  return (await quote.count()) ? (await quote.textContent()).trim() : '';
};
const dragSelection = async (title, status) => {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const card = editButton(internship, title).locator('xpath=ancestor::article');
  await card.dispatchEvent('dragstart', { dataTransfer });
  await column(internship, status).dispatchEvent('dragover', { dataTransfer });
  await column(internship, status).dispatchEvent('drop', { dataTransfer });
  await internship.dispatchEvent('dragend', { dataTransfer });
  await dataTransfer.dispose();
};

try {
  await page.goto(baseURL);
  // A first visit opens on the selection boards.
  await attention.waitFor({ state: 'visible' });
  assert.equal(await tab('選考状況').getAttribute('aria-current'), 'page');
  await internship.waitFor({ state: 'visible' });
  await fulltime.waitFor({ state: 'visible' });
  assert.equal(await internship.locator('article').count(), 13);
  assert.equal(await fulltime.locator('article').count(), 3);
  const bounds = await Promise.all([internship.boundingBox(), fulltime.boundingBox()]);
  assert(bounds[0].y + bounds[0].height <= bounds[1].y);
  assert(bounds[1].y + bounds[1].height <= 1000);
  log('two simultaneous boards with independent selections for one company');

  assert.equal(await attention.count(), 1);
  const cardHeights = await internship.locator('article').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
  assert(cardHeights.every(height => height >= 60 && height <= 66), JSON.stringify(cardHeights));
  assert.equal(await fulltime.locator('.selection-card-title').count(), 0);
  assert.deepEqual(await internship.locator('.selection-card-title').allTextContents().then(values => values.sort()), ['冬インターン', '夏インターン', '選考1', '選考2'].sort());
  const unnamed = internship.getByRole('button', { name: /長い企業名.*選考1の選考を編集/ });
  assert(await unnamed.locator('.kanban-card-name').evaluate(element => element.scrollWidth > element.clientWidth));
  const firstCard = editButton(internship, '夏インターン').locator('xpath=ancestor::article');
  assert.equal(await firstCard.locator('.kanban-card-meta .selection-card-actions').count(), 1);
  assert.equal(await firstCard.getByRole('link').getAttribute('href'), 'https://example.com/recruit');
  assert.equal(await fulltime.getByRole('link').getAttribute('href'), 'https://example.com/recruit');
  assert.equal(await unnamed.locator('xpath=ancestor::article').getByRole('link').count(), 0);
  const popupPromise = page.waitForEvent('popup');
  await firstCard.getByRole('link').click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.equal(popup.url(), 'https://example.com/recruit');
  await popup.close();
  assert.equal(await page.getByRole('dialog').count(), 0);
  const columnMetrics = await column(internship, '未応募').locator('.kanban-column-body').evaluate(element => ({
    height: element.clientHeight,
    fullyVisibleCards: Array.from(element.children).filter(card => card.getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom).length,
  }));
  assert(columnMetrics.fullyVisibleCards >= 4, JSON.stringify(columnMetrics));
  log(`compact cards (${cardHeights[0]}px), duplicate labels, icon links, and ${columnMetrics.fullyVisibleCards} fully visible cards per column`);

  await waitFor(async () => await quoteText(internship, '気配検証株式会社', '冬インターン') === 'あと1日', 'linked deadline on its card');
  const linkedQuote = internship.getByRole('button', { name: '気配検証株式会社・冬インターンの選考を編集', exact: true })
    .locator('xpath=ancestor::article').locator('.quote');
  assert.match(await linkedQuote.getAttribute('class'), /quote--hot/);
  assert.doesNotMatch(await quoteText(fulltime, '気配検証株式会社', '本選考'), /あと|今日/);
  assert.equal(await quoteText(internship, '未紐づけ検証株式会社', '夏インターン'), 'あと2日');
  assert.doesNotMatch(await quoteText(fulltime, '未紐づけ検証株式会社', '本選考'), /あと|今日/);
  log('a linked deadline shows only on its selection, an unlinked one only on the furthest-along selection, done ones nowhere');

  // All eight stage columns fit at 1440px; narrower windows scroll the boards together.
  await page.setViewportSize({ width: 1100, height: 1000 });
  await waitFor(async () => await internship.evaluate(element => element.scrollWidth - element.clientWidth > 200), 'board overflow at 1100px');
  await internship.evaluate(element => { element.scrollLeft = 200; });
  await waitFor(async () => Math.abs(await fulltime.evaluate(element => element.scrollLeft) - 200) < 2, 'horizontal scroll sync');
  await switches.getByRole('button', { name: '本選考', exact: true }).click();
  assert.equal(await internship.count(), 0);
  assert((await fulltime.boundingBox()).height > bounds[1].height);
  assert.equal(await fulltime.evaluate(element => element.scrollLeft), 200);
  await switches.getByRole('button', { name: 'インターン', exact: true }).click();
  assert.equal(await fulltime.count(), 0);
  await switches.getByRole('button', { name: 'すべて', exact: true }).click();
  await fulltime.waitFor({ state: 'visible' });
  await waitFor(async () => await fulltime.evaluate(element => element.scrollLeft) === 200, 'restored scroll');
  await page.setViewportSize({ width: 1440, height: 1000 });
  log('view switches and synchronized/restored horizontal scroll');

  const splitter = page.getByRole('separator', { name: 'インターンと本選考の表示割合を調整' });
  await splitter.focus();
  await splitter.press('ArrowDown');
  assert.equal(await splitter.getAttribute('aria-valuenow'), '55');
  await splitter.press('Home');
  assert.equal(await splitter.getAttribute('aria-valuenow'), '30');
  await splitter.press('End');
  assert.equal(await splitter.getAttribute('aria-valuenow'), '70');
  await splitter.dblclick();
  const handle = await splitter.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 55, { steps: 5 });
  await page.mouse.up();
  assert(Number(await splitter.getAttribute('aria-valuenow')) > 50);
  await splitter.dblclick();
  assert.equal(await splitter.getAttribute('aria-valuenow'), '50');
  log('keyboard, pointer, clamp, and reset of split ratio');

  await internship.evaluate(element => { element.scrollLeft = 0; });
  const vertical = column(internship, '未応募').locator('.kanban-column-body');
  assert(await vertical.evaluate(element => element.scrollHeight > element.clientHeight));
  await vertical.evaluate(element => { element.scrollTop = 100; });
  assert.equal(await column(fulltime, '未応募').locator('.kanban-column-body').evaluate(element => element.scrollTop), 0);
  await vertical.evaluate(element => { element.scrollTop = 0; });
  log('independent vertical scrolling');

  await dragSelection('夏インターン', '興味あり');
  await waitFor(async () => lookup(uuid(11)).status === '興味あり', 'status update saved');
  await waitFor(async () => await column(internship, '興味あり').getByRole('button', { name: /夏インターンの選考を編集/ }).count() === 1, 'card moved');
  assert.equal(lookup(uuid(13)).status, 'ES提出済');
  assert.equal(writes.at(-1).body.id, uuid(11));
  log('drag updates only the selected application, preserving other selection at same company');

  failNextUpdate = true;
  const failure = page.waitForResponse(response => response.url().endsWith('/api/selections') && response.status() === 500);
  await dragSelection('夏インターン', 'ES準備中');
  await failure;
  await waitFor(async () => await column(internship, '興味あり').getByRole('button', { name: /夏インターンの選考を編集/ }).count() === 1, 'failed update rolled back');
  assert.equal(lookup(uuid(11)).status, '興味あり');
  const dragError = page.getByRole('alert').filter({ hasText: '選考状況を保存できませんでした' });
  await dragError.waitFor({ state: 'visible' });
  await dragError.getByRole('button', { name: '通知を閉じる', exact: true }).click();
  await dragError.waitFor({ state: 'hidden' });
  log('failed drag update rolls back with an error toast');

  await editButton(internship, '夏インターン').click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('選考名（任意）').fill('夏インターン・更新');
  await dialog.getByLabel('ステータス', { exact: true }).selectOption('合格');
  assert.equal(await dialog.getByLabel('ステータス', { exact: true }).locator('option:checked').textContent(), '参加決定');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await waitFor(async () => await column(internship, '参加決定').getByRole('button', { name: /夏インターン・更新/ }).count() === 1, 'edited selection');
  log('editing selection and internship accepted label');

  await page.locator('.selection-pane--fulltime').getByRole('button', { name: '選考を追加', exact: true }).click();
  dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('選考種別 *', { exact: true }).inputValue(), 'fulltime');
  await dialog.getByLabel('企業 *', { exact: true }).selectOption(uuid(1));
  await dialog.getByLabel('選考名（任意）').fill('追加本選考');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await editButton(fulltime, '追加本選考').click();
  await page.getByRole('dialog').getByRole('button', { name: '選考を削除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'この選考を削除', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(companies[0].selections.length, 3);
  assert.equal(lookup(uuid(13)).status, 'ES提出済');
  log('add and delete selection without deleting company or sibling applications');

  await page.locator('.selection-unclassified summary').click();
  await page.getByRole('button', { name: '種別を指定', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('選考種別 *', { exact: true }).selectOption('fulltime');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await waitFor(async () => await fulltime.getByRole('button', { name: /分類待ち株式会社・既存の選考/ }).count() === 1, 'unclassified moved');
  assert.equal(lookup(uuid(21)).status, '面接中');
  log('classifying legacy selection preserves original progress');

  const infoButton = editButton(fulltime, '本選考・技術職').locator('xpath=ancestor::article').getByRole('button', { name: '並行選考株式会社の企業情報を開く', exact: true });
  await infoButton.focus();
  await infoButton.press('Enter');
  dialog = page.getByRole('dialog');
  assert.equal(await dialog.locator('.company-selection-item').count(), 3);
  assert.match(await dialog.locator('.company-selection-list').textContent(), /夏インターン・更新[\s\S]*参加決定/);
  assert.match(await dialog.locator('.company-selection-list').textContent(), /本選考・技術職[\s\S]*ES提出済/);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  log('company details list every selection and its independent status');

  // The event form links a deadline to a selection and marks it done.
  await tab('カレンダー').click();
  const formChip = page.getByRole('button', { name: '気配検証株式会社 · 冬インターンES締切を編集', exact: true });
  if (!(await formChip.count())) await page.getByRole('button', { name: '次の月', exact: true }).click();
  await formChip.click();
  dialog = page.getByRole('dialog');
  const selectionField = dialog.getByLabel('選考（任意）', { exact: true });
  assert.equal(await selectionField.inputValue(), uuid(91));
  assert.deepEqual(await selectionField.locator('option').allTextContents(), [
    '選考を指定しない', 'インターン · 冬インターン（ES準備中）', '本選考 · 本選考（興味あり）',
  ]);
  const linkHint = dialog.getByText('選考を指定すると、その選考のカードにだけ期限が表示されます。');
  assert.equal(await linkHint.count(), 0);
  await selectionField.selectOption('');
  await linkHint.waitFor({ state: 'visible' });
  await selectionField.selectOption(uuid(92));
  // Every field is tied to its label; the type buttons form a labelled group.
  for (const label of ['タイトル *', '開始日 *', '終了日（任意）', '企業（任意）', 'メモ（任意）']) {
    assert.equal(await dialog.getByLabel(label, { exact: true }).count(), 1, label);
  }
  assert.equal(await dialog.getByRole('group', { name: 'イベントタイプ *', exact: true }).getByRole('button').count(), 4);
  const companyField = dialog.getByLabel('企業（任意）', { exact: true });
  await companyField.selectOption(uuid(93));
  assert.equal(await selectionField.inputValue(), '');
  await companyField.selectOption(uuid(90));
  assert.equal(await selectionField.inputValue(), '');
  await selectionField.selectOption(uuid(91));
  const doneField = dialog.getByLabel('完了済みにする', { exact: true });
  assert.equal(await doneField.isChecked(), false);
  await doneField.check();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(eventWrites.length, 1);
  assert.equal(eventWrites[0].id, uuid(201));
  assert.equal(eventWrites[0].done, true);
  assert.equal(eventWrites[0].selection_id, uuid(91));
  assert.equal(eventWrites[0].company_id, uuid(90));
  await tab('選考状況').click();
  await waitFor(async () => !/あと|今日/.test(await quoteText(internship, '気配検証株式会社', '冬インターン')), 'done deadline leaves the quote cell');
  assert.equal(await attention.getByRole('button', { name: /冬インターンES締切/ }).count(), 0);
  log('event form links a selection, clears it on company change, and saving done removes the due cell');

  // 要確認: date order, the list button, done with undo, where a row leads,
  // and a failure that stays until closed.
  const stripItems = attention.locator('.attention-item');
  const stripTexts = await stripItems.allTextContents();
  const interviewIndex = stripTexts.findIndex(text => text.includes('一次面接'));
  const sixDayIndex = stripTexts.findIndex(text => text.includes('6日後のES締切'));
  assert(interviewIndex !== -1 && sixDayIndex !== -1 && interviewIndex < sixDayIndex, JSON.stringify(stripTexts));
  assert.match(stripTexts[0], /1日超過/);
  const listButton = attention.getByRole('button', { name: /^要確認の一覧を開く（全\d+件）$/ });
  const totalItems = stripTexts.length;
  assert.equal(await listButton.getAttribute('aria-label'), `要確認の一覧を開く（全${totalItems}件）`);
  const moreText = (await listButton.textContent()).trim();
  const hiddenItems = Number(/^\+(\d+)件$/.exec(moreText)?.[1]);
  assert(hiddenItems > 0 && hiddenItems < totalItems, moreText);
  const stripBox = await attention.boundingBox();
  const visibleRights = await stripItems.evaluateAll(items => items.filter(item => item.getAttribute('aria-hidden') !== 'true').map(item => item.getBoundingClientRect().right));
  assert.equal(visibleRights.length, totalItems - hiddenItems);
  assert(visibleRights.every(right => right <= stripBox.x + stripBox.width), JSON.stringify(visibleRights));
  // Keyboard: open, the first row takes focus, Escape returns to the button.
  await listButton.focus();
  await page.keyboard.press('Enter');
  const list = page.getByRole('dialog', { name: /^要確認/ });
  await list.waitFor({ state: 'visible' });
  assert.equal(await listButton.getAttribute('aria-expanded'), 'true');
  assert.equal(await list.locator('.attention-row').count(), totalItems);
  await waitFor(async () => await page.evaluate(() => document.activeElement?.classList.contains('attention-row-main')), 'first row focused');
  assert.match(await page.evaluate(() => document.activeElement.textContent), /1日超過/);
  await page.keyboard.press('Escape');
  await list.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), `要確認の一覧を開く（全${totalItems}件）`);
  log(`strip in date order, +${hiddenItems}件 opens all ${totalItems} items, Escape returns focus`);

  // Done keeps the list open, sends done: true, and undo brings the item back.
  await listButton.click();
  await list.waitFor({ state: 'visible' });
  const writesBefore = eventWrites.length;
  await list.getByRole('button', { name: '「追加企業3 · 6日後のES締切」を完了にする', exact: true }).click();
  await waitFor(async () => await list.getByText('6日後のES締切').count() === 0, 'done row removed');
  assert(await list.isVisible());
  await waitFor(async () => eventWrites.length === writesBefore + 1, 'done saved');
  assert.equal(eventWrites.at(-1).id, uuid(206));
  assert.equal(eventWrites.at(-1).done, true);
  assert.equal(eventWrites.at(-1).title, '6日後のES締切');
  const undoToast = page.getByRole('status').filter({ hasText: '「6日後のES締切」を完了にしました' });
  await undoToast.waitFor({ state: 'visible' });
  await undoToast.getByRole('button', { name: '元に戻す', exact: true }).click();
  await waitFor(async () => eventWrites.length === writesBefore + 2, 'undo saved');
  assert.equal(eventWrites.at(-1).done, false);
  await waitFor(async () => await attention.locator('.attention-item').filter({ hasText: '6日後のES締切' }).count() === 1, 'undone item back');
  log('done removes the row with done: true, and undo restores it');

  // A deadline row opens its company over the boards.
  await listButton.click();
  await list.getByRole('button', { name: /^締切 追加企業3 · 6日後のES締切/ }).click();
  await list.waitFor({ state: 'hidden' });
  dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  assert.match(await dialog.textContent(), /追加企業3/);
  assert.equal(await tab('選考状況').getAttribute('aria-current'), 'page');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  log('a deadline row opens the company detail over the boards');

  // A failed save rolls back and leaves an error toast until it is closed.
  failNextEventUpdate = true;
  await listButton.click();
  await list.getByRole('button', { name: '「追加企業4 · 確認用の締切1」を完了にする', exact: true }).click();
  const errorToast = page.getByRole('alert').filter({ hasText: '「確認用の締切1」の完了状態を保存できませんでした' });
  await errorToast.waitFor({ state: 'visible' });
  await waitFor(async () => await list.getByRole('button', { name: '「追加企業4 · 確認用の締切1」を完了にする', exact: true }).count() === 1, 'failed done rolled back');
  await page.keyboard.press('Escape');
  await new Promise(resolve => setTimeout(resolve, 3500));
  assert(await errorToast.isVisible());
  await errorToast.getByRole('button', { name: '通知を閉じる', exact: true }).click();
  await errorToast.waitFor({ state: 'hidden' });
  log('a failed save stays as an error toast past 3 seconds and closes with its button');

  await tab('企業一覧').click();
  await page.getByRole('heading', { name: /^企業一覧/ }).waitFor({ state: 'visible' });
  // The 28卒 jump sits right beside the company name in the fixed name
  // column; there is no trailing jump column, and the table fits at 1440px.
  const companyTable = page.locator('.company-table');
  assert.equal(await companyTable.locator('thead th').count(), 11);
  const nameCell = companyTable.locator('tr.company-row').filter({ hasText: '並行選考株式会社' }).locator('th.col-name');
  const nameJump = nameCell.getByRole('link', { name: '並行選考株式会社の28卒マイページを開く（新しいタブ）', exact: true });
  await nameJump.waitFor({ state: 'visible' });
  const [nameBox, jumpBox] = await Promise.all([nameCell.getByRole('button').boundingBox(), nameJump.boundingBox()]);
  assert(jumpBox.x >= nameBox.x + nameBox.width && jumpBox.x - (nameBox.x + nameBox.width) <= 12, JSON.stringify({ nameBox, jumpBox }));
  const tableFit = await page.locator('.company-table-wrap').evaluate(wrap => [wrap.scrollWidth, wrap.clientWidth]);
  assert(tableFit[0] <= tableFit[1], JSON.stringify(tableFit));
  log('the 28卒 jump sits beside the company name and the table fits without horizontal scroll');

  // The company form: every field has its label, industries are suggested,
  // and the interest pips are a labelled group.
  await page.getByRole('button', { name: '企業を追加', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '企業を追加' });
  for (const label of ['企業名 *', '業界 *', '本社所在地', '初任給', '募集ページURL', 'メモ（エントリー開始時期など）', '採用ページURL', 'AIリサーチメモ']) {
    assert.equal(await dialog.getByLabel(label, { exact: true }).count(), 1, label);
  }
  const industryField = dialog.getByLabel('業界 *', { exact: true });
  const industryOptions = await industryField.evaluate(input => [...(input.list?.options || [])].map(option => option.value));
  assert(industryOptions.includes('IT・通信') && industryOptions.includes('半導体'), JSON.stringify(industryOptions));
  const interestGroup = dialog.getByRole('group', { name: '志望度', exact: true });
  assert.equal(await interestGroup.getByRole('button').count(), 5);
  const pipBox = await interestGroup.getByRole('button', { name: '志望度 5', exact: true }).boundingBox();
  assert(pipBox.width >= 24 && pipBox.height >= 24, JSON.stringify(pipBox));
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  log('company form fields are labelled, the industry has suggestions, and interest is a labelled group');

  // 企業比較: "最良" only where companies differ, and equal company columns.
  await tab('企業比較').click();
  await page.getByRole('heading', { name: '企業比較' }).waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('searchbox', { name: '比較する企業を検索', exact: true }).count(), 1);
  const compareRow = label => page.locator('.compare-table tbody tr').filter({ has: page.locator('th', { hasText: new RegExp(`^${label}$`) }) });
  const pick = name => page.getByRole('checkbox', { name: new RegExp(`^${name}`) });
  for (const name of ['気配検証株式会社', '未紐づけ検証株式会社', '並行選考株式会社']) {
    if (!(await pick(name).isChecked())) await pick(name).check();
  }
  for (const name of ['分類待ち株式会社']) {
    if (await pick(name).isChecked()) await pick(name).uncheck();
  }
  await waitFor(async () => await page.locator('.compare-table thead th').count() === 4, 'three companies compared');
  assert.equal(await compareRow('志望度').locator('.compare-best-badge').count(), 1);
  assert.match(await compareRow('志望度').locator('.compare-best-cell').textContent(), /最良/);
  await pick('並行選考株式会社').uncheck();
  await waitFor(async () => await page.locator('.compare-table thead th').count() === 3, 'two companies compared');
  assert.equal(await compareRow('志望度').locator('.compare-best-badge').count(), 0);
  await pick('並行選考株式会社').check();
  await waitFor(async () => await page.locator('.compare-table thead th').count() === 4, 'three companies again');
  const columnWidths = await page.locator('.compare-table thead th').evaluateAll(cells => cells.slice(1).map(cell => cell.getBoundingClientRect().width));
  assert(Math.max(...columnWidths) - Math.min(...columnWidths) <= 1, JSON.stringify(columnWidths));
  assert.equal(await compareRow('選考状況').locator('.status-badge').count(), 7);
  log('compare marks 最良 only where companies differ, shows selection chips, and keeps company columns equal');

  await tab('選考状況').click();
  assert.equal(await tab('選考状況').getAttribute('aria-current'), 'page');
  assert.equal(await attention.count(), 1);

  await internship.evaluate(element => { element.scrollLeft = 0; });
  await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0);
  await page.screenshot({ path: new URL('kanban-desktop.png', outputDir).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitFor(async () => (await internship.boundingBox()).width < 390, 'mobile layout');
  const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert(overflow.scroll <= overflow.client + 1, JSON.stringify(overflow));
  assert(await internship.isVisible());
  assert(await fulltime.isVisible());
  const mobileIcons = await internship.locator('.kanban-card-company, .kanban-card-jump').evaluateAll(icons => icons.map(icon => ({ width: icon.getBoundingClientRect().width, height: icon.getBoundingClientRect().height })));
  assert(mobileIcons.length > 0 && mobileIcons.every(icon => icon.width >= 32 && icon.height >= 32), JSON.stringify(mobileIcons));
  await page.screenshot({ path: new URL('kanban-mobile.png', outputDir).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  log('mobile stacked boards without page horizontal overflow');
  assert.deepEqual(errors, []);
  console.log('ALL KANBAN UI CHECKS PASSED');
} catch (error) {
  await page.screenshot({ path: new URL('kanban-failure.png', outputDir).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true }).catch(() => {});
  console.error('PAGE ERRORS', errors);
  throw error;
} finally {
  await browser.close();
}
