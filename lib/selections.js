import { STATUSES, normalizeStatus } from './status.js';

export const SELECTION_KINDS = Object.freeze({
  internship: { label: 'インターン', color: '#8FC9D6' },
  fulltime: { label: '本選考', color: '#D9C9A3' },
  unclassified: { label: '種別未設定', color: '#8E8A80' },
});

export const SELECTION_STATUSES = STATUSES;

export function getSelectionStatusLabel(status, kind) {
  const normalized = normalizeStatus(status);
  if (normalized !== '合格') return normalized;
  if (kind === 'internship') return '参加決定';
  return kind === 'fulltime' ? '内定' : '合格';
}

export const SELECTIONS_MIGRATION_MESSAGE = '選考管理のデータベース更新が必要です。READMEの「既存環境を更新する場合」に従って、未実行のマイグレーションを実行してください。';

// A company's selections, with success values normalized. Companies always
// carry a selections array from the API; an empty array means none yet.
export function getCompanySelections(company) {
  if (!Array.isArray(company?.selections)) return [];
  return company.selections.map(selection => selection && typeof selection === 'object' && !Array.isArray(selection)
    ? { ...selection, status: normalizeStatus(selection.status) }
    : selection);
}

// Old exports (a plain array of companies) keep progress either as nested
// selections or, from before selections existed, as a company status, which
// becomes one unclassified selection.
export function selectionsFromLegacyExport(company) {
  if (Array.isArray(company?.selections)) return company.selections;
  return [{ kind: 'unclassified', title: '', status: company?.status || '未応募' }];
}

export function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isSelectionTableMissing(error) {
  return ['42P01', 'PGRST205'].includes(error?.code)
    && /\bselections\b/.test(error.message || '');
}

// The API accepts a strict, small set of fields; callers cannot change company
// ownership or database-managed timestamps when updating a selection.
export function validateSelectionInput(body, { update = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: '選考の入力形式が正しくありません' };
  }
  const allowedFields = new Set(update
    ? ['id', 'kind', 'title', 'status']
    : ['company_id', 'kind', 'title', 'status']);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return { error: '変更できない項目が含まれています' };
  }
  if (update ? !isUuid(body.id) : !isUuid(body.company_id)) {
    return { error: update ? '選考IDが正しくありません' : '企業IDが正しくありません' };
  }
  if ((!update || Object.hasOwn(body, 'kind'))
    && !Object.hasOwn(SELECTION_KINDS, body.kind)) {
    return { error: '選考種別が正しくありません' };
  }
  if (Object.hasOwn(body, 'status') && (typeof body.status !== 'string' || !body.status || !SELECTION_STATUSES.includes(normalizeStatus(body.status)))) {
    return { error: '選考ステータスが正しくありません' };
  }
  if (Object.hasOwn(body, 'title')
    && (typeof body.title !== 'string' || body.title.trim().length > 120)) {
    return { error: '選考名は120文字以内で入力してください' };
  }
  const data = update ? {} : { company_id: body.company_id, title: '', status: '未応募' };
  for (const key of ['kind', 'title', 'status']) {
    if (Object.hasOwn(body, key)) {
      data[key] = key === 'title' ? body[key].trim() : key === 'status' ? normalizeStatus(body[key]) : body[key];
    }
  }
  if (update && !Object.keys(data).length) {
    return { error: '更新する項目がありません' };
  }
  return { data };
}
