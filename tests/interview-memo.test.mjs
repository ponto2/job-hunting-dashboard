import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopicGroups,
  getInterviewQuote,
  getUnlinkedMemos,
  getVisibleTopic,
  groupInterviewEvents,
  groupMemosByType,
  pickDefaultInterviewSelection,
} from '../lib/interview-memo.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = new Date(2026, 10, 10, 15, 30); // 2026-11-10 afternoon
const on = offset => {
  const d = new Date(2026, 10, 10 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const interview = (n, offset, fields = {}) => ({
  id: id(100 + n), title: `面接${n}`, event_type: 'interview', start_date: offset === null ? null : on(offset), company_id: id(1), ...fields,
});
const memo = (n, fields = {}) => ({
  id: id(300 + n), event_id: null, company_id: id(1), memo_type: 'prep', topic: '', content: `本文${n}`, sort_order: 0,
  created_at: `2026-10-${String(n).padStart(2, '0')}T00:00:00Z`, ...fields,
});
const titles = items => items.map(item => item.event.title);

test('upcoming interviews nearest first, past ones most recent first', () => {
  const { upcoming, past } = groupInterviewEvents([
    interview(1, 5),
    interview(2, 0),
    interview(3, -1),
    interview(4, -10),
    interview(5, 2),
    interview(6, -3),
    interview(7, 1, { event_type: 'deadline' }),
    interview(8, null),
  ], { today });
  assert.deepEqual(titles(upcoming), ['面接2', '面接5', '面接1']);
  assert.deepEqual(titles(past), ['面接3', '面接6', '面接4', '面接8']);
  assert.equal(upcoming[0].days, 0);
  assert.equal(past[0].days, -1);
});

test('the default selection is the nearest upcoming, else the latest past, else unlinked memos', () => {
  const groups = groupInterviewEvents([interview(1, 5), interview(2, 2), interview(3, -1)], { today });
  assert.deepEqual(pickDefaultInterviewSelection({ ...groups, unlinkedCount: 3 }), { type: 'event', id: id(102) });
  const pastOnly = groupInterviewEvents([interview(3, -4), interview(4, -1)], { today });
  assert.deepEqual(pickDefaultInterviewSelection({ ...pastOnly, unlinkedCount: 0 }), { type: 'event', id: id(104) });
  assert.deepEqual(pickDefaultInterviewSelection({ upcoming: [], past: [], unlinkedCount: 2 }), { type: 'unlinked' });
  assert.equal(pickDefaultInterviewSelection({ upcoming: [], past: [], unlinkedCount: 0 }), null);
});

test('memos without a listed interview are unlinked', () => {
  const ids = new Set([id(101)]);
  const memos = [memo(1, { event_id: id(101) }), memo(2), memo(3, { event_id: id(199) })];
  assert.deepEqual(getUnlinkedMemos(memos, ids).map(item => item.id), [id(302), id(303)]);
});

test('the quote cell: ahead within 3 days is hot, within a week strong, behind shows days ago', () => {
  assert.deepEqual(getInterviewQuote(0), { text: '今日', tone: 'hot' });
  assert.deepEqual(getInterviewQuote(3), { text: 'あと3日', tone: 'hot' });
  assert.deepEqual(getInterviewQuote(5), { text: 'あと5日', tone: 'due' });
  assert.deepEqual(getInterviewQuote(12), { text: 'あと12日', tone: 'plain' });
  assert.deepEqual(getInterviewQuote(-4), { text: '4日前', tone: 'plain' });
  assert.equal(getInterviewQuote(null), null);
});

test('memos group by type in the fixed order, and a topic equal to the type is hidden', () => {
  const groups = groupMemosByType([
    memo(1, { memo_type: 'reflection' }),
    memo(2, { memo_type: 'prep', sort_order: 2 }),
    memo(3, { memo_type: 'prep', sort_order: 1 }),
    memo(4, { memo_type: 'asked' }),
    memo(5, { memo_type: 'unknown' }),
  ]);
  assert.deepEqual(groups.map(group => group.label), ['準備', '本番質問', '振り返り', 'その他']);
  assert.deepEqual(groups[0].memos.map(item => item.id), [id(303), id(302)]);
  assert.equal(getVisibleTopic({ memo_type: 'reverse_question', topic: '逆質問' }), null);
  assert.equal(getVisibleTopic({ memo_type: 'prep', topic: '' }), null);
  assert.equal(getVisibleTopic({ memo_type: 'prep', topic: 'ガクチカ' }), 'ガクチカ');
});

test('topics group case- and space-insensitively in Japanese order', () => {
  const groups = buildTopicGroups([
    memo(1, { topic: 'ガクチカ' }),
    memo(2, { topic: ' ガクチカ ' }),
    memo(3, { topic: '', memo_type: 'reverse_question' }),
    memo(4, { topic: 'あいさつ' }),
  ]);
  assert.deepEqual(groups.map(group => [group.topic, group.memos.length]), [['あいさつ', 1], ['ガクチカ', 2], ['逆質問', 1]]);
});
