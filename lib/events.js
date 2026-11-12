// Event helpers shared by the board, the company views, and the attention
// strip. An event may be marked done, and may name the selection (選考) it
// belongs to; an event without a selection belongs to its company as a whole.
// Relative imports keep this usable from plain Node tests.
import { daysUntil } from './date.js';
import { STATUSES, normalizeStatus } from './status.js';

const ACTIONABLE_TYPES = new Set(['deadline', 'interview']);
const CLOSED_STATUSES = new Set(['合格', '辞退', '不合格']);

export function isEventDone(event) {
  return event?.done === true;
}

export function getEventCompanyId(event) {
  return event?.company_id || event?.companies?.id || null;
}

function keepNearest(map, key, entry) {
  const current = map.get(key);
  if (!current || entry.days < current.days) map.set(key, entry);
}

// The nearest open deadline or interview between today and `withinDays` days
// ahead: per linked selection, per company for events without a selection,
// and per company regardless of the link.
export function buildEventIndex(events, { withinDays = 7, today = new Date() } = {}) {
  const bySelection = new Map();
  const unlinkedByCompany = new Map();
  const byCompany = new Map();
  (events || []).forEach(event => {
    if (!event || !ACTIONABLE_TYPES.has(event.event_type) || isEventDone(event)) return;
    const days = daysUntil(event.start_date, today);
    if (days === null || Number.isNaN(days) || days < 0 || days > withinDays) return;
    const entry = { event, days };
    const companyId = getEventCompanyId(event);
    if (event.selection_id) keepNearest(bySelection, String(event.selection_id), entry);
    else if (companyId) keepNearest(unlinkedByCompany, String(companyId), entry);
    if (companyId) keepNearest(byCompany, String(companyId), entry);
  });
  return { bySelection, unlinkedByCompany, byCompany };
}

// The selection that carries a company's unlinked events: the furthest-along
// open selection, then the most recently updated, then the lowest ID.
export function pickFallbackSelectionId(selections) {
  const candidates = (selections || [])
    .filter(selection => selection && selection.id && !CLOSED_STATUSES.has(normalizeStatus(selection.status)));
  if (!candidates.length) return null;
  const rank = selection => STATUSES.indexOf(normalizeStatus(selection.status));
  candidates.sort((a, b) => (
    rank(b) - rank(a)
    || String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    || String(a.id).localeCompare(String(b.id))
  ));
  return candidates[0].id;
}

// The event a selection's quote cell shows: its own nearest event, or the
// company's unlinked one when this selection is the fallback, whichever is
// sooner. Each event therefore shows on at most one card.
export function getNextEventForSelection(selection, companySelections, index) {
  if (!selection || !index) return null;
  const linked = index.bySelection.get(String(selection.id)) || null;
  let unlinked = null;
  const fallbackId = pickFallbackSelectionId(companySelections);
  if (fallbackId !== null && String(fallbackId) === String(selection.id)) {
    const companyId = selection.company_id || selection.company?.id;
    if (companyId) unlinked = index.unlinkedByCompany.get(String(companyId)) || null;
  }
  if (linked && unlinked) return unlinked.days < linked.days ? unlinked : linked;
  return linked || unlinked;
}

// The PUT /api/events body for an event as loaded from the API, with changes.
// The update replaces the whole event, so every column is sent.
export function toEventPayload(event, changes = {}) {
  return {
    id: event.id,
    title: event.title,
    event_type: event.event_type,
    start_date: event.start_date,
    end_date: event.end_date || null,
    ...(Object.hasOwn(event, 'start_time') ? { start_time: event.start_time?.slice(0, 5) || null } : {}),
    ...(Object.hasOwn(event, 'end_time') ? { end_time: event.end_time?.slice(0, 5) || null } : {}),
    company_id: getEventCompanyId(event),
    memo: event.memo || null,
    selection_id: event.selection_id || null,
    done: isEventDone(event),
    ...changes,
  };
}
