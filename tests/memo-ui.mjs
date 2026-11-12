// ESメモ and 面接メモ in the browser. Run with the app at KANBAN_TEST_URL
// (default http://localhost:3000). All /api requests use isolated fixtures.
// Set PLAYWRIGHT_MODULE to the Playwright package path when it is not installed locally.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.KANBAN_TEST_URL || 'http://localhost:3000';
const outputDir = new URL('../.next/qa/', import.meta.url);
await mkdir(outputDir, { recursive: true });
const shot = name => new URL(name, outputDir).pathname.replace(/^\/(\w:)/, '$1');

const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const companies = [
  { id: uuid(1), name: '締切近い株式会社', industry: 'IT・通信', interest: 4, selections: [] },
  { id: uuid(2), name: '締切なし株式会社', industry: 'メーカー', interest: 3, selections: [] },
  { id: uuid(3), name: '回答済み株式会社', industry: '金融', interest: 2, selections: [] },
  { id: uuid(4), name: '自己PR株式会社', industry: '商社', interest: 2, selections: [] },
];
const company = id => ({ id: uuid(id), name: companies.find(c => c.id === uuid(id)).name });
const events = [
  { id: uuid(201), company_id: uuid(1), companies: company(1), title: 'ES締切', event_type: 'deadline', start_date: day(2), end_date: null, memo: '', selection_id: null, done: false },
  { id: uuid(202), company_id: uuid(2), companies: company(2), title: '二次面接', event_type: 'interview', start_date: day(3), end_date: null, memo: '', selection_id: null, done: false },
  { id: uuid(203), company_id: uuid(3), companies: company(3), title: '一次面接', event_type: 'interview', start_date: day(-5), end_date: null, memo: '', selection_id: null, done: false },
];
const entry = (id, companyId, question, answer, fields = {}) => ({
  id: uuid(id), question, answer, category: '志望動機', char_limit: 400, sort_order: 0, thread_id: null,
  company_ids: [uuid(companyId)], company_names: company(companyId).name,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...fields,
});
const esEntries = [
  entry(301, 3, 'あなたの強みを教えてください。', '粘り強さです。', { updated_at: '2026-11-01T00:00:00Z' }),
  entry(302, 1, '当社を志望する理由を教えてください。', ''),
  entry(303, 2, '研究内容を説明してください。', ''),
  entry(304, 4, '自己PRをしてください。', ''),
];
const memos = [
  { id: uuid(401), event_id: uuid(203), company_id: uuid(3), companies: company(3), events: events[2], memo_type: 'asked', topic: 'ガクチカ', content: '深掘りを3回された。', sort_order: 0, created_at: '2026-11-01T00:00:00Z' },
  { id: uuid(402), event_id: null, company_id: uuid(2), companies: company(2), events: null, memo_type: 'prep', topic: '業界研究', content: '予定に紐づけていないメモの本文', sort_order: 0, created_at: '2026-11-02T00:00:00Z' },
];

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
const esWrites = [];
let failNextPut = false;
let putGate = null;
const fulfill = (route, json, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
await context.route('**/api/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const method = request.method();
  if (path === '/api/auth/check') return fulfill(route, { authenticated: true });
  if (method === 'GET' && path === '/api/companies') return fulfill(route, companies);
  if (method === 'GET' && path === '/api/events') return fulfill(route, events);
  if (method === 'GET' && path === '/api/es-entries') return fulfill(route, esEntries);
  if (method === 'GET' && path === '/api/interview-memos') return fulfill(route, memos);
  if (method === 'PUT' && path === '/api/es-entries') {
    const body = request.postDataJSON();
    esWrites.push(body);
    if (putGate) await putGate;
    if (failNextPut) { failNextPut = false; return fulfill(route, { error: '検証用の保存エラー' }, 500); }
    const current = esEntries.find(item => item.id === body.id);
    Object.assign(current, body, { updated_at: new Date().toISOString() });
    return fulfill(route, current);
  }
  errors.push(`Unexpected API request: ${method} ${path}`);
  return fulfill(route, { error: 'Unexpected request blocked by test' }, 500);
});
page.on('pageerror', error => errors.push(error.message));

const tab = label => page.getByRole('navigation', { name: '表示切り替え' }).getByRole('button', { name: new RegExp(`^${label}`) });
const esList = page.getByRole('list', { name: '設問の一覧' });
const answer = name => page.getByRole('textbox', { name: `${name}の回答`, exact: true });
const detailAnswer = page.locator('.es-memo-view .split-detail .es-answer-input').first();
const detailStatus = page.locator('.es-memo-view .split-detail .save-status').first();
const status = name => page.getByRole('region', { name, exact: true }).getByRole('status');
const waitFor = async (predicate, label, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
};
const log = label => console.log(`PASS ${label}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const noHorizontalOverflow = async () => {
  const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert(size.scroll <= size.client + 1, JSON.stringify(size));
};

try {
  await page.goto(baseURL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(baseURL);
  await tab('ESメモ').click();
  await esList.waitFor();

  // Unanswered questions first (the one whose company has the nearer
  // deadline leads), each showing 未回答 N; the answered one last.
  const rows = esList.getByRole('button');
  const rowTexts = await rows.allTextContents();
  assert.equal(rowTexts.length, 4);
  assert.match(rowTexts[0], /^当社を志望する理由/);
  assert.match(rowTexts[0], /未回答 1/);
  assert.match(rowTexts[0], /あと2日/);
  // Without a deadline, unanswered questions follow in question order.
  const noDeadline = ['研究内容を説明してください。', '自己PRをしてください。'].sort((a, b) => a.localeCompare(b, 'ja'));
  assert(rowTexts[1].startsWith(noDeadline[0]) && rowTexts[2].startsWith(noDeadline[1]), JSON.stringify(rowTexts));
  assert.match(rowTexts[1], /未回答 1/);
  assert.match(rowTexts[2], /未回答 1/);
  assert.doesNotMatch(rowTexts[1], /あと/);
  assert.match(rowTexts[3], /^あなたの強み/);
  assert.doesNotMatch(rowTexts[3], /未回答/);
  assert.equal(await rows.first().getAttribute('aria-current'), 'true');
  log('unanswered questions lead the list with 未回答 N, deadline first');

  // Keyboard only: Tab from the first row to the second, Enter selects it,
  // Tab reaches its answer field.
  await rows.first().focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await waitFor(async () => (await rows.nth(1).getAttribute('aria-current')) === 'true', 'second row selected by keyboard');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (await detailAnswer.evaluate(element => element === document.activeElement)) break;
  }
  assert(await detailAnswer.evaluate(element => element === document.activeElement), 'answer field reached by Tab');
  // The rule eases to cyan over 120ms.
  await waitFor(
    async () => (await detailAnswer.evaluate(element => getComputedStyle(element).borderColor)) === 'rgb(60, 199, 218)',
    'focused answer shows the cyan rule',
    1000,
  );

  // One save, one second after typing stops, with only { id, answer }.
  await page.keyboard.type('研究の説明です。');
  await sleep(500);
  assert.equal(esWrites.length, 0, 'no save while typing');
  await waitFor(async () => esWrites.length === 1, 'autosave after a second');
  const secondId = noDeadline[0].startsWith('研究') ? uuid(303) : uuid(304);
  assert.deepEqual(esWrites[0], { id: secondId, answer: '研究の説明です。' });
  await waitFor(async () => (await detailStatus.textContent()).includes('保存済み'), '保存済み');
  await sleep(1200);
  assert.equal(esWrites.length, 1, 'exactly one save');
  log('typing saves once after 1s with { id, answer } and shows 保存済み');

  // A slow reply must not roll back what was typed after it was sent.
  let release;
  putGate = new Promise(resolve => { release = resolve; });
  const field = page.locator(`#es-answer-${secondId}`);
  await field.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('一');
  await waitFor(async () => esWrites.length === 2, 'second save sent');
  await page.keyboard.type('二三');
  release();
  putGate = null;
  await sleep(200);
  assert.equal(await field.inputValue(), '研究の説明です。一二三', 'reply did not overwrite newer text');
  await waitFor(async () => esWrites.length === 3, 'queued text sent after the reply');
  assert.equal(esWrites[2].answer, '研究の説明です。一二三');
  await waitFor(async () => (await detailStatus.textContent()).includes('保存済み'), '保存済み after queue');
  assert.equal(await field.inputValue(), '研究の説明です。一二三');
  log('a slow reply never rolls back newer typing; the newer text is sent after it');

  // Moving to another question saves right away, before the pause ends.
  await field.focus();
  await page.keyboard.type('四');
  const before = esWrites.length;
  await esList.getByRole('button', { name: /^当社を志望する理由/ }).click();
  await waitFor(async () => esWrites.length === before + 1, 'flush on question change', 600);
  assert.equal(esWrites.at(-1).answer, '研究の説明です。一二三四');
  log('switching question flushes the pending save immediately');

  // A failed save keeps the text and offers a retry.
  failNextPut = true;
  const failing = answer('締切近い株式会社');
  await failing.click();
  await page.keyboard.type('失敗しても残る');
  await waitFor(async () => (await status('締切近い株式会社').textContent()).includes('保存できませんでした'), 'save error shown');
  assert.equal(await failing.inputValue(), '失敗しても残る');
  const retry = page.getByRole('region', { name: '締切近い株式会社', exact: true }).getByRole('button', { name: '再試行' });
  assert(await retry.isVisible());
  await page.screenshot({ path: shot('memo-es-error.png') });
  await retry.click();
  await waitFor(async () => (await status('締切近い株式会社').textContent()).includes('保存済み'), 'retry saved');
  assert.equal(esWrites.at(-1).answer, '失敗しても残る');
  log('a failed save keeps the text, shows 保存できませんでした with 再試行, and retry saves');

  // Leaving the tab saves right away too.
  await failing.focus();
  await page.keyboard.type('。');
  const beforeTab = esWrites.length;
  await tab('面接メモ').click();
  await waitFor(async () => esWrites.length === beforeTab + 1, 'flush on tab change', 600);
  assert.equal(esWrites.at(-1).answer, '失敗しても残る。');
  log('switching tab flushes the pending save immediately');

  // 面接メモ: upcoming above past, unlinked memos reachable.
  const interviewList = page.locator('.interview-view .split-list');
  await interviewList.waitFor();
  const labels = await interviewList.locator('.split-list-label').allTextContents();
  assert.deepEqual(labels, ['今後', '過去', '予定なし']);
  const interviewRows = await interviewList.locator('.interview-row-title').allTextContents();
  assert.deepEqual(interviewRows, ['二次面接', '一次面接', '予定に紐づけていないメモ 1件']);
  assert.equal(await page.locator('.interview-view .split-detail-title').textContent(), '二次面接');
  await interviewList.getByRole('button', { name: /予定に紐づけていないメモ/ }).click();
  await page.getByText('予定に紐づけていないメモの本文').waitFor();
  log('upcoming interviews sit above past ones, and unlinked memos open from 予定なし');

  // Opening an unanswered question from the 要確認 list focuses its answer.
  await page.getByRole('button', { name: /^要確認の一覧を開く/ }).click();
  await page.locator('.attention-row-main', { hasText: '未回答の設問' }).click();
  await waitFor(async () => (await tab('ESメモ').getAttribute('aria-current')) === 'page', 'ES tab opened');
  await waitFor(
    async () => page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'),
    'answer focused from the attention list',
  );
  assert.equal(await page.evaluate(() => document.querySelectorAll('.modal-overlay, [role="dialog"]').length), 0, 'no modal opened');
  log('the 要確認 ES item selects the question and focuses its answer without a modal');

  // Phone: list, then the question, then back to the list, without
  // horizontal overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '一覧に戻る' }).first().click();
  await esList.waitFor();
  await noHorizontalOverflow();
  await esList.getByRole('button', { name: /^あなたの強み/ }).click();
  await answer('回答済み株式会社').waitFor();
  assert.equal(await esList.isVisible(), false, 'list hidden while reading');
  await noHorizontalOverflow();
  await page.screenshot({ path: shot('memo-es-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '一覧に戻る' }).first().click();
  await esList.waitFor();
  assert(await esList.getByRole('button', { name: /^あなたの強み/ }).evaluate(element => element === document.activeElement), 'focus returns to the row');
  await noHorizontalOverflow();
  log('390x844: list → question → list with no horizontal overflow');

  assert.deepEqual(errors, []);
  console.log('ALL MEMO UI CHECKS PASSED');
} catch (error) {
  await page.screenshot({ path: shot('memo-failure.png'), fullPage: true }).catch(() => {});
  console.error('PAGE ERRORS', errors);
  throw error;
} finally {
  await browser.close();
}
