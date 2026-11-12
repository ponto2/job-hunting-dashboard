import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuestionThreads,
  countCharsWithoutNewlines,
  findNearestDeadline,
  formatCompanySummary,
  getCharCountState,
  getDeadlineQuote,
  getPersistedThreadId,
  sortQuestionThreads,
} from '../lib/es-memo.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = new Date(2026, 10, 10, 15, 30); // 2026-11-10 afternoon
const on = offset => {
  const d = new Date(2026, 10, 10 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const entry = (n, fields = {}) => ({
  id: id(n), question: `設問${n}`, answer: '回答', category: 'ガクチカ', char_limit: 400,
  company_ids: [], company_names: null, thread_id: null, created_at: `2026-10-${String(n).padStart(2, '0')}T00:00:00Z`, ...fields,
});
const deadline = (n, companyN, offset, fields = {}) => ({
  id: id(500 + n), title: `締切${n}`, event_type: 'deadline', start_date: on(offset),
  company_id: id(companyN), selection_id: null, done: false, ...fields,
});

test('the counter ignores line breaks', () => {
  assert.equal(countCharsWithoutNewlines('あい\nう\r\nえ'), 4);
  assert.equal(countCharsWithoutNewlines(null), 0);
});

test('the counter stages: none, under 80%, 80% to 100% strong, over in red with the excess', () => {
  assert.deepEqual(getCharCountState(12, null), { stage: 'none', text: '12字', over: 0 });
  assert.deepEqual(getCharCountState(12, 0), { stage: 'none', text: '12字', over: 0 });
  assert.equal(getCharCountState(319, 400).stage, 'under');
  assert.equal(getCharCountState(319, 400).text, '319 / 400字');
  assert.equal(getCharCountState(320, 400).stage, 'near');
  assert.equal(getCharCountState(400, 400).stage, 'near');
  assert.deepEqual(getCharCountState(415, 400), { stage: 'over', text: '415 / 400字 超過15字', over: 15 });
});

test('threads group entries by thread or question and count unanswered entries', () => {
  const threads = buildQuestionThreads([
    entry(1, { thread_id: id(900), company_ids: [id(1)], company_names: 'A社' }),
    entry(2, { thread_id: id(900), question: '設問1', answer: ' ', company_ids: [id(2)], company_names: 'B社' }),
    entry(3, { question: '  同じ  設問 ' }),
    entry(4, { question: '同じ 設問', answer: '' }),
  ]);
  assert.equal(threads.length, 2);
  const first = threads.find(thread => thread.id === id(900));
  assert.equal(first.unansweredCount, 1);
  assert.deepEqual(first.unansweredCompanyIds, [id(2)]);
  assert.equal(first.companyLabel, 'A社 ほか1社');
  assert.equal(getPersistedThreadId(first), id(900));
  const second = threads.find(thread => thread.id !== id(900));
  assert.equal(second.unansweredCount, 1);
  assert.equal(second.companyLabel, '企業未指定');
  assert.equal(getPersistedThreadId(second), null);
});

test('company summary', () => {
  assert.equal(formatCompanySummary([]), '企業未指定');
  assert.equal(formatCompanySummary(['A社']), 'A社');
  assert.equal(formatCompanySummary(['A社', 'B社', 'C社']), 'A社 ほか2社');
});

test('the nearest deadline is an open deadline of the companies within 7 days', () => {
  const events = [
    deadline(1, 1, 5),
    deadline(2, 1, 2, { done: true }),
    deadline(3, 1, 3, { event_type: 'interview' }),
    deadline(4, 1, -1),
    deadline(5, 1, 8),
    deadline(6, 2, 1),
    deadline(7, 1, 4, { company_id: null, companies: { id: id(1) } }),
  ];
  assert.equal(findNearestDeadline([id(1)], events, { today }).event.id, id(507));
  assert.equal(findNearestDeadline([id(1)], events, { today }).days, 4);
  assert.equal(findNearestDeadline([id(3)], events, { today }), null);
  assert.equal(findNearestDeadline([], events, { today }), null);
  assert.deepEqual(getDeadlineQuote({ days: 3 }), { text: 'あと3日', tone: 'hot' });
  assert.deepEqual(getDeadlineQuote({ days: 0 }), { text: '今日', tone: 'hot' });
  assert.deepEqual(getDeadlineQuote({ days: 5 }), { text: 'あと5日', tone: 'due' });
  assert.equal(getDeadlineQuote(null), null);
});

test('unanswered questions come first by deadline, then without one by question; answered by latest update', () => {
  const threads = buildQuestionThreads([
    entry(1, { question: 'う 回答済み古い', updated_at: '2026-11-01T00:00:00Z' }),
    entry(2, { question: 'え 回答済み新しい', updated_at: '2026-11-09T00:00:00Z' }),
    entry(3, { question: 'か 締切なし', answer: '' }),
    entry(4, { question: 'あ 締切なし', answer: '' }),
    entry(5, { question: 'き 締切5日', answer: '', company_ids: [id(1)] }),
    entry(6, { question: 'く 締切1日', answer: '', company_ids: [id(2)] }),
    // The deadline belongs to an answered entry's company, so it does not count.
    entry(7, { question: 'こ 回答済みの企業だけ締切', thread_id: id(901), company_ids: [id(3)] }),
    entry(8, { question: 'こ 回答済みの企業だけ締切', thread_id: id(901), answer: '', company_ids: [id(4)] }),
  ]);
  const events = [deadline(1, 1, 5), deadline(2, 2, 1), deadline(3, 3, 0)];
  const sorted = sortQuestionThreads(threads, events, { today });
  assert.deepEqual(sorted.map(thread => thread.question), [
    'く 締切1日',
    'き 締切5日',
    'あ 締切なし',
    'か 締切なし',
    'こ 回答済みの企業だけ締切',
    'え 回答済み新しい',
    'う 回答済み古い',
  ]);
  assert.equal(sorted[0].deadline.days, 1);
  assert.equal(sorted[4].deadline, null);
  assert.equal(sorted[5].deadline, null);
});
