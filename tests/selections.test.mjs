import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUSES, normalizeStatus } from '../lib/status.js';
import {
  getCompanySelections,
  getSelectionStatusLabel,
  isSelectionTableMissing,
  isUuid,
  selectionsFromLegacyExport,
  validateSelectionInput,
} from '../lib/selections.js';

const companyId = '48229372-685c-4e1c-8cce-03478666cabd';
const selectionId = '974f7929-c35a-4e11-b9e6-25449bf8a153';

test('an empty migrated company never resurrects its legacy selection', () => {
  assert.deepEqual(getCompanySelections({ id: companyId, status: '面接中', selections: [] }), []);
});

test('a company without a selections array has no selections', () => {
  assert.deepEqual(getCompanySelections({ id: companyId, selections: null }), []);
  assert.deepEqual(getCompanySelections({ id: companyId }), []);
});

test('old exports turn a company status into one unclassified selection', () => {
  assert.deepEqual(selectionsFromLegacyExport({ id: companyId, status: '面接中' }), [
    { kind: 'unclassified', title: '', status: '面接中' },
  ]);
  assert.deepEqual(selectionsFromLegacyExport({ id: companyId }), [
    { kind: 'unclassified', title: '', status: '未応募' },
  ]);
  const nested = [{ kind: 'internship', title: '夏', status: '内定' }];
  assert.equal(selectionsFromLegacyExport({ id: companyId, status: '辞退', selections: nested }), nested);
});

test('multiple selections of the same company remain independent', () => {
  const selections = [
    { id: selectionId, company_id: companyId, kind: 'internship', title: '夏', status: '面接中' },
    { id: '66f36812-195a-4dd7-b67a-03bc1a1e89be', company_id: companyId, kind: 'fulltime', title: '', status: 'ES提出済' },
  ];
  assert.deepEqual(getCompanySelections({ id: companyId, selections }), selections);
  assert.equal(getSelectionStatusLabel('内定', 'internship'), '参加決定');
  assert.equal(getSelectionStatusLabel('内定', 'fulltime'), '内定');
});

test('create validates explicit kind and applies safe defaults', () => {
  assert.deepEqual(validateSelectionInput({ company_id: companyId, kind: 'internship' }), {
    data: { company_id: companyId, kind: 'internship', title: '', status: '未応募' },
  });
  assert.ok(validateSelectionInput({ company_id: companyId }).error);
  assert.ok(validateSelectionInput({ company_id: companyId, kind: '__proto__' }).error);
  assert.ok(validateSelectionInput({ company_id: companyId, kind: 'constructor' }).error);
});

test('a drag status update does not reset title or kind', () => {
  assert.deepEqual(validateSelectionInput({ id: selectionId, status: 'ES提出済' }, { update: true }), {
    data: { status: 'ES提出済' },
  });
  assert.ok(validateSelectionInput({ id: selectionId }, { update: true }).error);
});

test('unknown fields, company reassignment, and unmanaged status values are rejected', () => {
  for (const body of [
    { id: selectionId, status: '面接中', company_id: companyId },
    { id: selectionId, updated_at: '2026-01-01', status: '面接中' },
    { id: selectionId, status: '参加決定' },
    { id: selectionId, kind: null },
  ]) assert.ok(validateSelectionInput(body, { update: true }).error);
});

test('invalid JSON shapes and UUIDs are rejected without exceptions', () => {
  for (const body of [null, [], '', 0, { company_id: 'bad', kind: 'fulltime' }]) {
    assert.ok(validateSelectionInput(body).error);
  }
  assert.equal(isUuid(companyId), true);
  assert.equal(isUuid(`legacy:${companyId}`), false);
  assert.equal(isUuid(null), false);
});

test('titles are trimmed and bounded', () => {
  assert.equal(validateSelectionInput({ id: selectionId, title: '  夏インターン  ' }, { update: true }).data.title, '夏インターン');
  for (const title of [null, 12, 'x'.repeat(121)]) {
    assert.ok(validateSelectionInput({ id: selectionId, title }, { update: true }).error);
  }
});

test('only the missing selections table is treated as an uninstalled migration', () => {
  assert.equal(isSelectionTableMissing({ code: 'PGRST205', message: "Could not find the table 'public.selections' in the schema cache" }), true);
  assert.equal(isSelectionTableMissing({ code: '42P01', message: 'relation "public.selections" does not exist' }), true);
  assert.equal(isSelectionTableMissing({ code: '42501', message: 'permission denied for table selections' }), false);
  assert.equal(isSelectionTableMissing({ code: 'PGRST205', message: "Could not find the table 'public.companies'" }), false);
  assert.equal(isSelectionTableMissing({ message: 'network error' }), false);
  assert.equal(isSelectionTableMissing(null), false);
});

test('old and new success values share one column while retaining kind-specific labels', () => {
  assert.equal(STATUSES.includes('合格'), true);
  assert.equal(STATUSES.includes('内定'), false);
  for (const status of ['内定', '合格']) {
    assert.equal(normalizeStatus(status), '合格');
    assert.equal(getSelectionStatusLabel(status, 'internship'), '参加決定');
    assert.equal(getSelectionStatusLabel(status, 'fulltime'), '内定');
    assert.equal(getSelectionStatusLabel(status, 'unclassified'), '合格');
    assert.equal(getCompanySelections({ id: companyId, selections: [{ status }] })[0].status, '合格');
  }
});

test('nested legacy successes normalize without changing IDs, sibling progress, or source data', () => {
  const source = { id: companyId, selections: [
    { id: selectionId, kind: 'internship', status: '内定' },
    { id: 'sibling', kind: 'fulltime', status: '面接中' },
  ] };
  const normalized = getCompanySelections(source);
  assert.deepEqual(normalized, [
    { id: selectionId, kind: 'internship', status: '合格' },
    { id: 'sibling', kind: 'fulltime', status: '面接中' },
  ]);
  assert.equal(source.selections[0].status, '内定');
});

test('legacy imports and status edits save canonical success without accepting invalid status types', () => {
  for (const status of ['内定', '合格']) {
    assert.equal(validateSelectionInput({ company_id: companyId, kind: 'fulltime', status }).data.status, '合格');
    assert.deepEqual(validateSelectionInput({ id: selectionId, status }, { update: true }).data, { status: '合格' });
  }
  for (const status of [null, '', 0, {}, '__proto__', 'constructor']) {
    assert.ok(validateSelectionInput({ id: selectionId, status }, { update: true }).error);
  }
});
