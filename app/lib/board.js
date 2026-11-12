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

// The quote cell on a kanban card: the next deadline or interview when one is
// within a week and the selection is still open, otherwise the age of the
// selection's last move, marked ▲ on success and ▼ on rejection.
export function getSelectionQuote(selection, nextEvent) {
  const status = selection.status;
  if (nextEvent && !CLOSED_STATUSES.has(status)) {
    const kind = EVENT_TYPE_CONFIG[nextEvent.event.event_type]?.label || '予定';
    return {
      text: formatDue(nextEvent.days),
      tone: nextEvent.days <= 3 ? 'hot' : 'due',
      title: `${kind}：${nextEvent.event.title}（${formatShortDate(nextEvent.event.start_date) || nextEvent.event.start_date}）`,
    };
  }
  const days = daysSince(selection.updated_at);
  const age = formatAge(days, selection.updated_at);
  if (status === '合格') return { text: age ? `▲ ${age}` : '▲', tone: 'up', title: age ? `${age}に更新` : '' };
  if (status === '不合格') return { text: age ? `▼ ${age}` : '▼', tone: 'down', title: age ? `${age}に更新` : '' };
  return { text: age, tone: status === '辞退' ? 'muted' : 'plain', title: age ? `最終更新：${age}` : '' };
}
