import test from 'node:test';
import assert from 'node:assert/strict';
import { OVERDUE_WINDOW_DAYS, buildAttentionItems, countHotDeadlines } from '../lib/attention.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = new Date(2026, 10, 10, 15, 30); // 2026-11-10 afternoon
const on = offset => {
  const d = new Date(2026, 10, 10 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const event = (n, type, offset, fields = {}) => ({
  id: id(100 + n), title: `予定${n}`, event_type: type, start_date: on(offset),
  company_id: id(1), companies: { id: id(1), name: 'A社' }, selection_id: null, done: false, ...fields,
});
const build = (events, esEntries = []) => buildAttentionItems({ events, esEntries, today });
const ids = items => items.map(item => item.id);

test('deadlines are included from 14 days overdue to 7 days ahead', () => {
  assert.equal(OVERDUE_WINDOW_DAYS, 14);
  const items = build([
    event(1, 'deadline', -15),
    event(2, 'deadline', -14),
    event(3, 'deadline', -1),
    event(4, 'deadline', 0),
    event(5, 'deadline', 7),
    event(6, 'deadline', 8),
  ]);
  assert.deepEqual(ids(items), ['deadline-' + id(103), 'deadline-' + id(102), 'deadline-' + id(104), 'deadline-' + id(105)]);
});

test('interviews are included from today to 14 days ahead, never overdue', () => {
  const items = build([
    event(1, 'interview', -1),
    event(2, 'interview', 0),
    event(3, 'interview', 14),
    event(4, 'interview', 15),
  ]);
  assert.deepEqual(ids(items), ['interview-' + id(102), 'interview-' + id(103)]);
});

test('other event types, done events, and undated events are left out', () => {
  const items = build([
    event(1, 'internship', 1),
    event(2, 'other', 1),
    event(3, 'deadline', 1, { done: true }),
    event(4, 'interview', 1, { done: true }),
    event(5, 'deadline', -2, { done: true }),
    event(6, 'deadline', 1, { start_date: '' }),
    null,
  ]);
  assert.deepEqual(items, []);
});

test('hot marks overdue deadlines and anything within three days', () => {
  const items = build([
    event(1, 'deadline', -10),
    event(2, 'deadline', 3),
    event(3, 'deadline', 4),
    event(4, 'interview', 3),
    event(5, 'interview', 4),
  ]);
  const hot = Object.fromEntries(items.map(item => [item.eventId, item.hot]));
  assert.deepEqual(hot, { [id(101)]: true, [id(102)]: true, [id(103)]: false, [id(104)]: true, [id(105)]: false });
  assert.equal(items.find(item => item.eventId === id(101)).overdue, true);
  assert.equal(countHotDeadlines(items), 2);
  assert.equal(countHotDeadlines([]), 0);
});

test('order: overdue (fewest days first), then upcoming by date, then the ES summary', () => {
  const items = build([
    event(1, 'deadline', 6, { title: '6日後の締切' }),
    event(2, 'interview', 2, { title: '2日後の面接' }),
    event(3, 'deadline', -5, { title: '5日超過' }),
    event(4, 'deadline', -1, { title: '1日超過' }),
    event(5, 'deadline', 0, { title: '今日の締切' }),
  ], [{ id: id(900), answer: '' }]);
  assert.deepEqual(items.map(item => item.event?.title ?? item.title), [
    '1日超過', '5日超過', '今日の締切', '2日後の面接', '6日後の締切', '未回答の設問',
  ]);
});

test('on the same day a deadline comes before an interview, then titles in order', () => {
  const items = build([
    event(1, 'interview', 2, { title: 'あ面接' }),
    event(2, 'deadline', 2, { title: 'い締切' }),
    event(3, 'deadline', 2, { title: 'あ締切' }),
  ]);
  assert.deepEqual(items.map(item => item.event.title), ['あ締切', 'い締切', 'あ面接']);
});

test('item fields: title with company, due label, links', () => {
  const [linked, unlinked] = build([
    event(1, 'deadline', 0, { selection_id: id(50) }),
    event(2, 'deadline', 2, { company_id: null, companies: null }),
  ]);
  assert.equal(linked.title, 'A社 · 予定1');
  assert.equal(linked.meta, '今日');
  assert.equal(linked.date, on(0));
  assert.equal(linked.days, 0);
  assert.equal(linked.companyId, id(1));
  assert.equal(linked.selectionId, id(50));
  assert.equal(linked.kind, 'deadline');
  assert.equal(unlinked.title, '予定2');
  assert.equal(unlinked.meta, 'あと2日');
  assert.equal(unlinked.companyId, null);
  const [overdue] = build([event(3, 'deadline', -3)]);
  assert.equal(overdue.meta, '3日超過');
});

test('unanswered ES entries collapse into one item pointing at the first', () => {
  const items = build([], [
    { id: id(901), answer: '書いた', company_ids: [id(1)] },
    { id: id(902), answer: '   ', company_ids: [id(2), id(3)] },
    { id: id(903), answer: null, company_ids: [] },
  ]);
  assert.equal(items.length, 1);
  assert.deepEqual(
    { kind: items[0].kind, title: items[0].title, meta: items[0].meta, count: items[0].count, entryId: items[0].entryId, companyId: items[0].companyId, hot: items[0].hot },
    { kind: 'es', title: '未回答の設問', meta: '2件', count: 2, entryId: id(902), companyId: id(2), hot: false },
  );
  assert.deepEqual(build([], [{ id: id(904), answer: '回答済み' }]), []);
});

test('there is no item limit', () => {
  const events = Array.from({ length: 20 }, (_, n) => event(n, 'deadline', n % 8));
  assert.equal(build(events).length, 20);
});
