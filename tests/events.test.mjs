import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEventIndex, getEventCompanyId, getNextEventForSelection, isEventDone, pickFallbackSelectionId, toEventPayload,
} from '../lib/events.js';
import { formatDueLabel, formatShortDate } from '../lib/date.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = new Date(2026, 10, 10, 15, 30); // 2026-11-10 afternoon
const on = offset => {
  const d = new Date(2026, 10, 10 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const companyA = id(1);
const companyB = id(2);
const event = (n, offset, fields = {}) => ({
  id: id(100 + n), title: `予定${n}`, event_type: 'deadline', start_date: on(offset), company_id: companyA, ...fields,
});
const selection = (n, status, fields = {}) => ({ id: id(n), company_id: companyA, kind: 'internship', status, ...fields });

test('done and company helpers read the event as the API returns it', () => {
  assert.equal(isEventDone({ done: true }), true);
  assert.equal(isEventDone({ done: 'true' }), false);
  assert.equal(isEventDone({}), false);
  assert.equal(isEventDone(null), false);
  assert.equal(getEventCompanyId({ company_id: companyA }), companyA);
  assert.equal(getEventCompanyId({ companies: { id: companyB } }), companyB);
  assert.equal(getEventCompanyId({}), null);
});

test('the event index keeps the nearest open deadline or interview within range', () => {
  const index = buildEventIndex([
    event(1, 5),
    event(2, 2),
    event(3, 1, { done: true }),
    event(4, -1),
    event(5, 8),
    event(6, 0, { event_type: 'internship' }),
    event(7, 3, { event_type: 'interview', company_id: companyB }),
    event(8, 1, { company_id: null }),
  ], { today });
  assert.equal(index.unlinkedByCompany.get(companyA).event.id, id(102));
  assert.equal(index.unlinkedByCompany.get(companyA).days, 2);
  assert.equal(index.unlinkedByCompany.get(companyB).event.id, id(107));
  assert.equal(index.byCompany.size, 2);
  assert.equal(index.bySelection.size, 0);

  assert.equal(buildEventIndex([event(5, 8)], { today, withinDays: 14 }).byCompany.get(companyA).days, 8);
  assert.equal(buildEventIndex([event(9, 0)], { today }).byCompany.get(companyA).days, 0);
  assert.equal(buildEventIndex(null, { today }).byCompany.size, 0);
});

test('linked events index by selection, and byCompany ignores the link', () => {
  const index = buildEventIndex([
    event(1, 1, { selection_id: id(11) }),
    event(2, 4, { selection_id: id(11) }),
    event(3, 3),
    event(4, 2, { selection_id: id(12), done: true }),
  ], { today });
  assert.equal(index.bySelection.get(id(11)).event.id, id(101));
  assert.equal(index.bySelection.has(id(12)), false);
  assert.equal(index.unlinkedByCompany.get(companyA).event.id, id(103));
  assert.equal(index.byCompany.get(companyA).event.id, id(101));
});

test('the fallback selection is the furthest-along open one', () => {
  assert.equal(pickFallbackSelectionId([
    selection(11, 'ES準備中'), selection(12, '興味あり'), selection(13, '合格'), selection(14, '不合格'),
  ]), id(11));
  assert.equal(pickFallbackSelectionId([selection(11, '面接中'), selection(12, '内定')]), id(11));
  assert.equal(pickFallbackSelectionId([
    selection(11, 'ES提出済', { updated_at: '2026-11-01T00:00:00Z' }),
    selection(12, 'ES提出済', { updated_at: '2026-11-05T00:00:00Z' }),
  ]), id(12));
  assert.equal(pickFallbackSelectionId([selection(12, 'ES提出済'), selection(11, 'ES提出済')]), id(11));
  assert.equal(pickFallbackSelectionId([selection(11, '辞退'), selection(12, '合格')]), null);
  assert.equal(pickFallbackSelectionId([]), null);
  assert.equal(pickFallbackSelectionId(undefined), null);
});

test('a selection shows its own events, and unlinked ones only when it is the fallback', () => {
  const internship = selection(11, 'ES準備中');
  const fulltime = selection(12, '興味あり', { kind: 'fulltime' });
  const siblings = [internship, fulltime];

  const linked = buildEventIndex([event(1, 1, { selection_id: internship.id })], { today });
  assert.equal(getNextEventForSelection(internship, siblings, linked).event.id, id(101));
  assert.equal(getNextEventForSelection(fulltime, siblings, linked), null);

  const unlinked = buildEventIndex([event(2, 2)], { today });
  assert.equal(getNextEventForSelection(internship, siblings, unlinked).event.id, id(102));
  assert.equal(getNextEventForSelection(fulltime, siblings, unlinked), null);

  // Whichever is sooner wins for the fallback selection; a tie keeps the linked one.
  const both = buildEventIndex([event(1, 3, { selection_id: internship.id }), event(2, 1)], { today });
  assert.equal(getNextEventForSelection(internship, siblings, both).event.id, id(102));
  const tie = buildEventIndex([event(1, 2, { selection_id: internship.id }), event(2, 2)], { today });
  assert.equal(getNextEventForSelection(internship, siblings, tie).event.id, id(101));

  // An event linked to another selection never borrows the fallback.
  const other = buildEventIndex([event(1, 1, { selection_id: fulltime.id })], { today });
  assert.equal(getNextEventForSelection(internship, siblings, other), null);
  assert.equal(getNextEventForSelection(fulltime, siblings, other).event.id, id(101));

  // The company can come from the attached company object, as on the board.
  const boardCard = { ...internship, company_id: undefined, company: { id: companyA } };
  assert.equal(getNextEventForSelection(boardCard, siblings, unlinked).event.id, id(102));
  assert.equal(getNextEventForSelection(internship, siblings, null), null);
});

test('the event payload sends every column with the requested change', () => {
  const loaded = {
    id: id(101), title: 'ES締切', event_type: 'deadline', start_date: on(1), end_date: null, memo: '',
    companies: { id: companyA, name: 'A社' }, created_at: 'x',
  };
  assert.deepEqual(toEventPayload(loaded, { done: true }), {
    id: id(101), title: 'ES締切', event_type: 'deadline', start_date: on(1), end_date: null,
    company_id: companyA, memo: null, selection_id: null, done: true,
  });
  assert.equal(toEventPayload({ ...loaded, done: true, selection_id: id(11) }).selection_id, id(11));
  assert.equal(toEventPayload({ ...loaded, done: true }).done, true);
});

test('short dates carry the weekday and drop the current year', () => {
  assert.equal(formatShortDate('2026-11-12', today), '11/12(木)');
  assert.equal(formatShortDate('2026-01-01', today), '1/1(木)');
  assert.equal(formatShortDate('2027-01-05', today), '2027/1/5(火)');
  for (const value of ['2026-02-30', '2026/11/12', '', null, undefined, '2026-11-12T00:00:00Z']) {
    assert.equal(formatShortDate(value, today), '', String(value));
  }
});

test('due labels read as overdue, today, or days left', () => {
  assert.equal(formatDueLabel(-3), '3日超過');
  assert.equal(formatDueLabel(0), '今日');
  assert.equal(formatDueLabel(1), 'あと1日');
  assert.equal(formatDueLabel(null), '');
  assert.equal(formatDueLabel(undefined), '');
  assert.equal(formatDueLabel(Number.NaN), '');
});
