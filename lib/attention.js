// Items for the 要確認 strip and its list: overdue and upcoming deadlines,
// upcoming interviews, and one summary line for unanswered ES questions.
// The strip, the list, and the calendar tab's badge all read "hot" from
// here, so the three never disagree. Relative imports keep this usable from
// plain Node tests.
import { daysUntil, formatDueLabel } from './date.js';
import { getEventCompanyId, isEventDone } from './events.js';
import { getEntryCompanyIds } from './es-entries.js';

export const OVERDUE_WINDOW_DAYS = 14;
const DEADLINE_AHEAD_DAYS = 7;
const INTERVIEW_AHEAD_DAYS = 14;
const HOT_WITHIN_DAYS = 3;
// On the same day a deadline comes before an interview.
const KIND_ORDER = { deadline: 0, interview: 1 };

function compareTitles(a, b) {
  return String(a.title).localeCompare(String(b.title), 'ja');
}

function eventItem(event, days) {
  const kind = event.event_type;
  const overdue = days < 0;
  const companyName = event.companies?.name;
  return {
    id: `${kind}-${event.id}`,
    kind,
    title: companyName ? `${companyName} · ${event.title}` : String(event.title || ''),
    meta: formatDueLabel(days),
    date: event.start_date,
    days,
    hot: overdue || days <= HOT_WITHIN_DAYS,
    overdue,
    event,
    eventId: event.id,
    companyId: getEventCompanyId(event),
    selectionId: event.selection_id || null,
    entryId: null,
    count: null,
  };
}

function isIncluded(event, days) {
  if (event.event_type === 'deadline') return days >= -OVERDUE_WINDOW_DAYS && days <= DEADLINE_AHEAD_DAYS;
  if (event.event_type === 'interview') return days >= 0 && days <= INTERVIEW_AHEAD_DAYS;
  return false;
}

export function buildAttentionItems({ events = [], esEntries = [], today = new Date() } = {}) {
  const overdue = [];
  const upcoming = [];
  (events || []).forEach(event => {
    if (!event || isEventDone(event)) return;
    const days = daysUntil(event.start_date, today);
    if (days === null || Number.isNaN(days) || !isIncluded(event, days)) return;
    const item = eventItem(event, days);
    (item.overdue ? overdue : upcoming).push(item);
  });

  // Overdue: the most recently missed first. Upcoming: nearest first.
  overdue.sort((a, b) => b.days - a.days || compareTitles(a, b));
  upcoming.sort((a, b) => a.days - b.days || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || compareTitles(a, b));

  const items = [...overdue, ...upcoming];
  const unanswered = (esEntries || []).filter(entry => entry && !String(entry.answer || '').trim());
  if (unanswered.length) {
    const first = unanswered[0];
    items.push({
      id: 'es-unanswered',
      kind: 'es',
      title: '未回答の設問',
      meta: `${unanswered.length}件`,
      date: null,
      days: null,
      hot: false,
      overdue: false,
      event: null,
      eventId: null,
      companyId: getEntryCompanyIds(first)[0] || null,
      selectionId: null,
      entryId: first.id,
      count: unanswered.length,
    });
  }
  return items;
}

// Hot deadlines (overdue, or due within three days): the calendar tab's badge.
export function countHotDeadlines(items) {
  return (items || []).filter(item => item.kind === 'deadline' && item.hot).length;
}
