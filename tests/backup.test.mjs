import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_TABLES, buildBackup, isBackupFile, summarizeRestore, validateBackup } from '../lib/backup.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('a backup lists every table in insert order', () => {
  const backup = buildBackup({ companies: [{ id: id(1) }] }, new Date('2026-11-05T00:00:00Z'));
  assert.equal(backup.exported_at, '2026-11-05T00:00:00.000Z');
  assert.deepEqual(Object.keys(backup.data), BACKUP_TABLES);
  assert.deepEqual(backup.data.events, []);
  assert.equal(isBackupFile(backup), true);
  assert.equal(isBackupFile([{ id: id(1) }]), false);
});

test('restores accept only this format, version, and rows with IDs', () => {
  const ok = validateBackup(buildBackup({ companies: [{ id: id(1), name: 'A社', industry: 'IT' }] }));
  assert.deepEqual(ok.data.companies, [{ id: id(1), name: 'A社', industry: 'IT' }]);
  assert.match(validateBackup({ format: 'other' }).error, /バックアップファイルではありません/);
  assert.match(validateBackup({ ...buildBackup({}), version: 3 }).error, /version 3/);
  assert.match(validateBackup(buildBackup({ events: [{ id: id(1) }, { id: 'x' }] })).error, /予定の2件目/);
  assert.match(validateBackup({ ...buildBackup({}), data: { companies: {} } }).error, /企業のデータ形式/);
});

test('legacy date-only events default done and invalid field values are rejected', () => {
  const event={id:id(1),title:'古い予定',event_type:'deadline',start_date:'2026-11-12'};
  assert.deepEqual(validateBackup(buildBackup({events:[event]})).data.events,[{...event,done:false}]);
  assert.match(validateBackup(buildBackup({events:[{...event,done:'yes'}]})).error,/予定の1件目/);
  assert.match(validateBackup(buildBackup({companies:[{id:id(1),name:'A',industry:'IT',interest:999}]})).error,/志望度/);
  assert.match(validateBackup(buildBackup({events:[{...event,end_date:'2026-11-11'}]})).error,/終了日/);
  assert.match(validateBackup(buildBackup({events:[{...event,event_type:'invalid'}]})).error,/イベントタイプ/);
});

test('the restore summary separates new rows from existing ones', () => {
  assert.equal(summarizeRestore({
    companies: { total: 3, inserted: 1 },
    events: { total: 2, inserted: 2 },
    selections: { total: 0, inserted: 0 },
  }), '企業1件（既存2件は変更なし）、予定2件');
  assert.equal(summarizeRestore({}), '復元するデータはありませんでした');
});
