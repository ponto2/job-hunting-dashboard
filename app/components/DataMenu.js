'use client';

import { useRef } from 'react';
import { apiFetch } from '../lib/api-client';
import { formatDateInput } from '@/lib/date';
import { selectionsFromLegacyExport, validateSelectionInput } from '@/lib/selections';
import { isBackupFile } from '@/lib/backup';
import Icon from './Icon';

// App-wide data actions: full backup, restore, and logout. They act on every
// table, so they live in the app bar rather than inside one view.
export default function DataMenu({ onShowToast, onCompaniesChange, onEventsChange, onLogout }) {
  const menuRef = useRef(null);
  const close = () => { if (menuRef.current) menuRef.current.open = false; };

  // Exports every table (companies, selections, events, ES, interview memos)
  // with original IDs, so a restore keeps all the links between them.
  const exportData = async () => {
    close();
    try {
      const backup = await apiFetch('/api/backup');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-hunting-backup_${formatDateInput()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      onShowToast('すべてのデータをエクスポートしました');
    } catch (error) {
      onShowToast(`エクスポートできませんでした。${error.message}`, { tone: 'error' });
    }
  };

  const importData = async (file) => {
    close();
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      onShowToast('JSONを読み取れませんでした。ファイルを確認してください', { tone: 'error' });
      return;
    }
    if (isBackupFile(data)) {
      // Restored in one database transaction: all rows or none.
      try {
        const { summary } = await apiFetch('/api/backup', { method: 'POST', body: data });
        onShowToast(`復元しました：${summary}`);
      } catch (error) {
        onShowToast(`復元できませんでした。${error.message}`, { tone: 'error' });
      } finally {
        await onCompaniesChange();
        onEventsChange?.();
      }
      return;
    }
    // Older exports were a plain array of companies; they are imported as new
    // companies one by one.
    if (!Array.isArray(data)) { onShowToast('このファイルはバックアップの形式ではありません。エクスポートしたJSONを選んでください', { tone: 'error' }); return; }
    let added = 0;
    try {
      // Validate every selection before creating any companies, including old
      // exports whose company status becomes an unclassified selection.
      const prepared = data.filter(item => item?.name && item.industry).map(item => {
        const rest = { ...item };
        delete rest.id;
        delete rest.created_at;
        delete rest.updated_at;
        delete rest.selections;
        delete rest.status;
        const selections = selectionsFromLegacyExport(item).map((selection, index) => {
          if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
            throw new Error(`${item.name}の選考 ${index + 1}件目の形式が正しくありません。`);
          }
          const input = validateSelectionInput({
            // The imported company receives a new ID after validation.
            company_id: '00000000-0000-0000-0000-000000000000',
            kind: selection.kind ?? 'unclassified',
            title: selection.title ?? '',
            status: selection.status ?? '未応募',
          });
          if (input.error) throw new Error(`${item.name}の選考 ${index + 1}件目：${input.error}`);
          const { company_id, ...fields } = input.data;
          return fields;
        });
        return { company: rest, selections };
      });
      if (prepared.some(item => item.selections.length > 0)) {
        await apiFetch('/api/selections');
      }
      for (const item of prepared) {
        const company = await apiFetch('/api/companies', { method: 'POST', body: item.company });
        added++;
        for (const selection of item.selections) {
          await apiFetch('/api/selections', {
            method: 'POST',
            body: { company_id: company.id, ...selection },
          });
        }
      }
      onShowToast(`${added}社と選考をインポートしました`);
    } catch (error) {
      onShowToast(added > 0
        ? `インポートを中断しました（企業 ${added}社を追加済み）。${error.message || '保存に失敗しました'}`
        : `インポートできませんでした。${error.message || '保存に失敗しました'}`, { tone: 'error' });
    } finally {
      await onCompaniesChange();
    }
  };

  return (
    <details className="menu" ref={menuRef}>
      <summary className="btn btn-shell" aria-label="データとアカウントのメニュー">
        <Icon name="more" /> <span className="btn-label">その他</span>
      </summary>
      <div className="menu-list">
        <button className="menu-item" type="button" onClick={exportData}>
          <Icon name="download" /> エクスポート（全データ）
        </button>
        <label className="menu-item">
          <Icon name="upload" /> インポート（復元）
          <input
            type="file"
            accept=".json"
            className="visually-hidden"
            onChange={e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; }}
          />
        </label>
        <div className="menu-sep" role="separator" />
        <button className="menu-item menu-item--danger" type="button" onClick={() => { close(); onLogout(); }}>
          <Icon name="logout" /> ログアウト
        </button>
      </div>
    </details>
  );
}
