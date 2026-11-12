// Full-data backup format. A backup keeps every row's original ID, so a
// restore recreates the same links between companies, selections, events,
// ES entries, and interview memos. Restoring skips rows whose ID already
// exists, which makes it safe to run twice or into a partly filled database.
import { isUuid, validateSelectionInput } from './selections.js';
import { validateCompanyInput, validateEventInput, validateEsEntryInput, validateInterviewMemoInput } from './validation.js';

export const BACKUP_FORMAT = 'job-hunting-dashboard-backup';
export const BACKUP_VERSION = 2;

// Insert order matters: each table only references tables listed before it.
export const BACKUP_TABLES = Object.freeze([
  'companies', 'selections', 'events', 'es_question_threads', 'es_entries', 'interview_memos',
]);

export const BACKUP_TABLE_LABELS = Object.freeze({
  companies: '企業',
  selections: '選考',
  events: '予定',
  es_question_threads: 'ES設問',
  es_entries: 'ESメモ',
  interview_memos: '面接メモ',
});

const MAX_ROWS_PER_TABLE = 20000;

export function isBackupFile(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && value.format === BACKUP_FORMAT;
}

export function buildBackup(data, exportedAt = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: exportedAt.toISOString(),
    data: Object.fromEntries(BACKUP_TABLES.map(table => [table, data[table] || []])),
  };
}

export function validateBackup(value) {
  if (!isBackupFile(value)) return { error: 'このアプリのバックアップファイルではありません' };
  if (value.version !== BACKUP_VERSION) {
    return { error: `対応していないバックアップの形式です（version ${value.version}）` };
  }
  if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
    return { error: 'バックアップの中身が正しくありません' };
  }

  const data = {};
  for (const table of BACKUP_TABLES) {
    const rows = value.data[table] ?? [];
    const label = BACKUP_TABLE_LABELS[table];
    if (!Array.isArray(rows)) return { error: `${label}のデータ形式が正しくありません` };
    if (rows.length > MAX_ROWS_PER_TABLE) return { error: `${label}の件数が多すぎます` };
    const index = rows.findIndex(row => !row || typeof row !== 'object' || Array.isArray(row) || !isUuid(row.id));
    if (index !== -1) return { error: `${label}の${index + 1}件目の形式が正しくありません` };
    // Backups exported before events.done existed lack it, and restoring a
    // NULL would break its NOT NULL constraint.
    const seen = new Set();
    for (const [i, row] of rows.entries()) {
      if (seen.has(row.id)) return { error: `${label}の${i + 1}件目：IDが重複しています` };
      seen.add(row.id);
      let checked;
      if (table === 'companies') checked = validateCompanyInput(row);
      if (table === 'events') checked = validateEventInput({ ...row, done: row.done ?? false });
      if (table === 'es_entries') checked = validateEsEntryInput(row);
      if (table === 'interview_memos') checked = validateInterviewMemoInput(row);
      if (table === 'selections') checked = validateSelectionInput(Object.fromEntries(['company_id','kind','title','status'].filter(key => Object.hasOwn(row,key)).map(key => [key,row[key]])));
      if (table === 'es_question_threads') {
        checked = validateEsEntryInput({ question: row.question_text, category: row.category, char_limit: row.char_limit });
        if (typeof row.question_key !== 'string' || !row.question_key.trim()) checked = { error: '設問キーが正しくありません' };
      }
      if (checked?.error) return { error: `${label}の${i + 1}件目：${checked.error}` };
    }
    data[table] = table === 'events' ? rows.map(row => ({ ...row, done: row.done ?? false })) : rows;
  }
  const selections = new Map(data.selections.map(row => [row.id, row]));
  const events = new Map(data.events.map(row => [row.id, row]));
  for (const row of data.events) {
    const linked = selections.get(row.selection_id);
    if (linked && row.company_id && row.company_id !== linked.company_id) return { error: '予定の選考と企業が一致しません' };
  }
  for (const row of data.interview_memos) {
    const linked = events.get(row.event_id);
    if (linked && row.company_id && row.company_id !== linked.company_id) return { error: '面接予定とメモの企業が一致しません' };
  }
  return { data };
}

// The restore function reports, per table, how many rows were in the file and
// how many were newly added.
export function summarizeRestore(result) {
  const parts = BACKUP_TABLES
    .filter(table => result?.[table]?.total > 0)
    .map(table => {
      const { total, inserted } = result[table];
      const skipped = total - inserted;
      return `${BACKUP_TABLE_LABELS[table]}${inserted}件${skipped ? `（既存${skipped}件は変更なし）` : ''}`;
    });
  return parts.length ? parts.join('、') : '復元するデータはありませんでした';
}
