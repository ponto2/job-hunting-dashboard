// Interview memo helpers: which interviews come next, how memos group under
// an interview, and the topic index. Relative imports keep this usable from
// plain Node tests.
import { daysUntil, formatDueLabel } from './date.js';
import { getEventCompanyId } from './events.js';

export const MEMO_TYPES = Object.freeze([
  { value: 'prep', label: '準備' },
  { value: 'asked', label: '本番質問' },
  { value: 'answer', label: '回答案' },
  { value: 'reverse_question', label: '逆質問' },
  { value: 'reflection', label: '振り返り' },
  { value: 'follow_up', label: '次回改善' },
  { value: 'other', label: 'その他' },
]);

export const DEFAULT_MEMO_TYPE = 'prep';

export function getMemoTypeLabel(type) {
  return MEMO_TYPES.find(item => item.value === type)?.label || 'その他';
}

function normalizeMemoType(type) {
  return MEMO_TYPES.some(item => item.value === type) ? type : (type ? 'other' : DEFAULT_MEMO_TYPE);
}

export function normalizeTopic(topic) {
  return String(topic || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// The interview events, split into upcoming (today and later, nearest first)
// and past (most recent first). Each item is { event, days }.
export function groupInterviewEvents(events, { today = new Date() } = {}) {
  const upcoming = [];
  const past = [];
  (events || []).forEach(event => {
    if (!event || event.event_type !== 'interview') return;
    const days = daysUntil(event.start_date, today);
    const item = { event, days: Number.isNaN(days) ? null : days };
    if (item.days !== null && item.days >= 0) upcoming.push(item);
    else past.push(item);
  });
  const byTitle = (a, b) => String(a.event.title || '').localeCompare(String(b.event.title || ''), 'ja');
  upcoming.sort((a, b) => (a.days - b.days) || byTitle(a, b));
  // Undated interviews go last among the past ones.
  past.sort((a, b) => {
    if (a.days === null || b.days === null) return (a.days === null) - (b.days === null);
    return (b.days - a.days) || byTitle(a, b);
  });
  return { upcoming, past };
}

// Memos whose interview is not in the list: never linked, or linked to an
// event that is gone or no longer an interview. They show under 予定なし so
// every memo stays reachable.
export function getUnlinkedMemos(memos, interviewEventIds) {
  const ids = interviewEventIds instanceof Set ? interviewEventIds : new Set((interviewEventIds || []).map(String));
  return (memos || []).filter(memo => memo && (!memo.event_id || !ids.has(String(memo.event_id))));
}

// What the right pane shows first: the nearest upcoming interview, else the
// most recent past one, else the unlinked memos, else nothing.
export function pickDefaultInterviewSelection({ upcoming = [], past = [], unlinkedCount = 0 } = {}) {
  if (upcoming.length) return { type: 'event', id: String(upcoming[0].event.id) };
  if (past.length) return { type: 'event', id: String(past[0].event.id) };
  if (unlinkedCount > 0) return { type: 'unlinked' };
  return null;
}

// The list's quote cell: 'あとN日' / '今日' ahead (within three days a reversed
// red cell, within a week the strong tone), 'N日前' behind.
export function getInterviewQuote(days) {
  if (typeof days !== 'number' || !Number.isFinite(days)) return null;
  if (days < 0) return { text: `${-days}日前`, tone: 'plain' };
  return { text: formatDueLabel(days), tone: days <= 3 ? 'hot' : days <= 7 ? 'due' : 'plain' };
}

// An interview's memos grouped by type, in the fixed type order. Within a
// type, memos keep sort_order, then creation order.
export function groupMemosByType(memos) {
  const sorted = [...(memos || [])].sort((a, b) => (
    ((a.sort_order || 0) - (b.sort_order || 0))
    || (new Date(a.created_at || 0) - new Date(b.created_at || 0))
  ));
  return MEMO_TYPES
    .map(type => ({ ...type, memos: sorted.filter(memo => normalizeMemoType(memo.memo_type) === type.value) }))
    .filter(group => group.memos.length > 0);
}

// The topic heading of a memo, or null when it only repeats the type label.
export function getVisibleTopic(memo) {
  const topic = String(memo?.topic || '').trim();
  if (!topic || topic === getMemoTypeLabel(memo?.memo_type)) return null;
  return topic;
}

// Memos grouped by topic (a memo without one falls under its type label),
// topics in Japanese collation order.
export function buildTopicGroups(memos) {
  const groups = new Map();
  (memos || []).forEach(memo => {
    if (!memo) return;
    const topic = String(memo.topic || '').trim() || getMemoTypeLabel(memo.memo_type);
    const key = normalizeTopic(topic) || `memo:${memo.id}`;
    if (!groups.has(key)) groups.set(key, { key, topic, memos: [] });
    groups.get(key).memos.push(memo);
  });
  return Array.from(groups.values()).sort((a, b) => a.topic.localeCompare(b.topic, 'ja'));
}

export function getMemoCompanyId(memo, eventsById) {
  const event = memo?.event_id && eventsById ? eventsById.get(String(memo.event_id)) : null;
  return memo?.company_id || getEventCompanyId(event) || getEventCompanyId(memo?.events) || null;
}
