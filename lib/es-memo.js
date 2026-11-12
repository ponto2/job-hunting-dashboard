// ES memo helpers: question threads, their order in the list, and the
// character counter. Relative imports keep this usable from plain Node tests.
import { daysUntil, formatDueLabel } from './date.js';
import { getEntryCompanyIds } from './es-entries.js';
import { getEventCompanyId, isEventDone } from './events.js';

export const ES_CATEGORIES = Object.freeze(['ガクチカ', '志望動機', '自己PR', '研究', '強み弱み', 'その他']);
export const ES_DEADLINE_WINDOW_DAYS = 7;

export function normalizeCategory(category) {
  return ES_CATEGORIES.includes(category) ? category : 'その他';
}

// Line breaks do not count toward an ES character limit.
export function countCharsWithoutNewlines(text) {
  return String(text || '').replace(/\r?\n/g, '').length;
}

export function isAnswerEmpty(entry) {
  return String(entry?.answer || '').trim().length === 0;
}

// The counter's stage. Writing close to the limit is the goal, so 80% to 100%
// reads strong rather than as a warning; only going over is red.
//   none:  no limit, 'N字'
//   under: below 80%, 'N / M字'
//   near:  80% to 100%, 'N / M字'
//   over:  past the limit, 'N / M字 超過K字'
export function getCharCountState(current, limit) {
  const count = Number.isFinite(current) ? current : 0;
  const max = Number(limit);
  if (!Number.isFinite(max) || max <= 0) return { stage: 'none', text: `${count}字`, over: 0 };
  if (count > max) return { stage: 'over', text: `${count} / ${max}字 超過${count - max}字`, over: count - max };
  return { stage: count >= max * 0.8 ? 'near' : 'under', text: `${count} / ${max}字`, over: 0 };
}

function normalizeQuestionKey(question) {
  return String(question || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function splitCompanyNames(names) {
  if (!names) return [];
  return String(names).split(' / ').map(name => name.trim()).filter(Boolean);
}

export function getEntryThreadKey(entry) {
  return entry?.thread_id || `question:${normalizeQuestionKey(entry?.question) || entry?.id}`;
}

// A thread's ID is stored only when it came from es_question_threads; the
// fallback key built from the question text is not a real row.
export function getPersistedThreadId(thread) {
  return thread?.id && !String(thread.id).startsWith('question:') ? thread.id : null;
}

// The server resolves company_names for every entry, so an ID without a name
// belongs to a deleted company rather than one that is still loading.
export function getEntryCompanyLabel(entry) {
  const names = splitCompanyNames(entry?.company_names);
  return names.length > 0 ? names.join(' / ') : '企業未指定';
}

// 'A社', 'A社 ほか2社', or '企業未指定'.
export function formatCompanySummary(names) {
  const list = (names || []).filter(Boolean);
  if (list.length === 0) return '企業未指定';
  if (list.length === 1) return list[0];
  return `${list[0]} ほか${list.length - 1}社`;
}

function entryTime(entry) {
  const time = new Date(entry?.updated_at || entry?.created_at || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// Entries grouped by question. Entries keep the order they were created in.
export function buildQuestionThreads(entries) {
  const groups = new Map();
  (entries || []).forEach(entry => {
    if (!entry) return;
    const key = getEntryThreadKey(entry);
    if (!groups.has(key)) groups.set(key, { id: key, entries: [] });
    groups.get(key).entries.push(entry);
  });

  return Array.from(groups.values()).map(thread => {
    const sorted = [...thread.entries].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
    );
    const representative = sorted[0] || {};
    const companyNames = Array.from(new Set(sorted.flatMap(entry => splitCompanyNames(entry.company_names))));
    const unanswered = sorted.filter(isAnswerEmpty);
    return {
      id: thread.id,
      entries: sorted,
      question: representative.question || '未入力の設問',
      category: normalizeCategory(representative.category),
      char_limit: representative.char_limit || null,
      companyNames,
      companyLabel: formatCompanySummary(companyNames),
      unansweredCount: unanswered.length,
      unansweredCompanyIds: Array.from(new Set(unanswered.flatMap(getEntryCompanyIds))),
      updatedAt: Math.max(0, ...sorted.map(entryTime)),
    };
  });
}

// The nearest open deadline, today to `withinDays` days ahead, for any of the
// given companies. Returns { event, days } or null.
export function findNearestDeadline(companyIds, events, { withinDays = ES_DEADLINE_WINDOW_DAYS, today = new Date() } = {}) {
  const ids = new Set((companyIds || []).map(String));
  if (ids.size === 0) return null;
  let nearest = null;
  (events || []).forEach(event => {
    if (!event || event.event_type !== 'deadline' || isEventDone(event)) return;
    const companyId = getEventCompanyId(event);
    if (!companyId || !ids.has(String(companyId))) return;
    const days = daysUntil(event.start_date, today);
    if (days === null || Number.isNaN(days) || days < 0 || days > withinDays) return;
    if (!nearest || days < nearest.days) nearest = { event, days };
  });
  return nearest;
}

// The list order: questions with an unanswered entry first (nearest deadline
// of an unanswered entry's company first, those without a deadline after,
// ties by question text), then fully answered questions, most recently
// updated first. Each thread gains `deadline` ({ event, days } or null).
export function sortQuestionThreads(threads, events, { today = new Date() } = {}) {
  const byQuestion = (a, b) => a.question.localeCompare(b.question, 'ja');
  const withDeadline = (threads || []).map(thread => ({
    ...thread,
    deadline: thread.unansweredCount > 0 ? findNearestDeadline(thread.unansweredCompanyIds, events, { today }) : null,
  }));
  const open = withDeadline.filter(thread => thread.unansweredCount > 0);
  const done = withDeadline.filter(thread => thread.unansweredCount === 0);
  open.sort((a, b) => {
    const da = a.deadline ? a.deadline.days : Infinity;
    const db = b.deadline ? b.deadline.days : Infinity;
    if (da !== db) return da < db ? -1 : 1;
    return byQuestion(a, b);
  });
  done.sort((a, b) => (b.updatedAt - a.updatedAt) || byQuestion(a, b));
  return [...open, ...done];
}

// The list's quote cell for a deadline: within three days a reversed red
// cell, otherwise the strong figure tone.
export function getDeadlineQuote(deadline) {
  if (!deadline) return null;
  return { text: formatDueLabel(deadline.days), tone: deadline.days <= 3 ? 'hot' : 'due' };
}
