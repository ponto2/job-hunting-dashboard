import { formatDueLabel, formatShortDate, startOfDay } from '@/lib/date';
import { buildEventIndex } from '@/lib/events';
import { EVENT_TYPE_CONFIG } from './constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = new Set(['合格', '辞退', '不合格']);

// The nearest open deadline or interview per company, within `withinDays`,
// whether or not it is linked to a selection. Done events are left out.
export function buildNextEventMap(events, withinDays = 7, today = new Date()) {
  return buildEventIndex(events, { withinDays, today }).byCompany;
}

// Calendar days since an ISO timestamp, in the viewer's time zone.
export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return Math.round((startOfDay(now) - startOfDay(then)) / MS_PER_DAY);
}

export function formatAge(days, iso) {
  if (days === null) return '';
  if (days <= 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 100) return `${days}日前`;
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export const formatDue = formatDueLabel;

// Within three days a deadline turns hot (red) and an interview soon (the
// accent); red is kept for deadlines.
function dueTone(nextEvent) {
  if (nextEvent.days > 3) return 'due';
  return nextEvent.event.event_type === 'deadline' ? 'hot' : 'soon';
}

// The due cell beside a kanban card's name: the next deadline or interview
// within a week while the selection is still open, otherwise nothing. The
// column already names the stage, so a card without a date shows no cell.
export function getSelectionDue(selection, nextEvent) {
  if (!nextEvent || CLOSED_STATUSES.has(selection.status)) return null;
  const kind = EVENT_TYPE_CONFIG[nextEvent.event.event_type]?.label || '予定';
  return {
    text: formatDue(nextEvent.days),
    tone: dueTone(nextEvent),
    title: `${kind}：${nextEvent.event.title}（${formatShortDate(nextEvent.event.start_date) || nextEvent.event.start_date}）`,
  };
}

// The age of a selection's last move ('3日前'), for the card's hover text.
export function getSelectionAge(selection) {
  return formatAge(daysSince(selection.updated_at), selection.updated_at);
}
