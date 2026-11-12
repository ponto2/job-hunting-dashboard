'use client';

import { getEntryCompanyIds } from '@/lib/es-entries';
import ConfirmDialog from './ConfirmDialog';

// Mirrors the database: selections and events are deleted with the company
// (on delete cascade), while ES and interview memos stay and only lose the link.
export function summarizeCompanyDeletion(company, { events = [], esEntries = [], interviewMemos = [] } = {}) {
  const id = String(company.id);
  const matches = value => value != null && String(value) === id;
  return {
    selections: Array.isArray(company.selections) ? company.selections.length : 0,
    events: events.filter(event => matches(event.company_id ?? event.companies?.id)).length,
    esEntries: esEntries.filter(entry => getEntryCompanyIds(entry).some(matches)).length,
    interviewMemos: interviewMemos.filter(memo => matches(memo.company_id) || matches(memo.events?.company_id)).length,
  };
}

export default function CompanyDeleteDialog({
  company,
  events,
  esEntries,
  interviewMemos,
  onCancel,
  onConfirm,
}) {
  const counts = summarizeCompanyDeletion(company, { events, esEntries, interviewMemos });
  const deleted = [
    counts.selections > 0 && `選考${counts.selections}件`,
    counts.events > 0 && `予定${counts.events}件`,
  ].filter(Boolean);
  const unlinked = [
    counts.esEntries > 0 && `ESメモ${counts.esEntries}件`,
    counts.interviewMemos > 0 && `面接メモ${counts.interviewMemos}件`,
  ].filter(Boolean);

  return (
    <ConfirmDialog
      title="企業を削除"
      confirmLabel="削除"
      onCancel={onCancel}
      onConfirm={onConfirm}
      message={(
        <>
          <p>「{company.name}」を削除します。この操作は取り消せません。</p>
          {(deleted.length > 0 || unlinked.length > 0) && (
            <ul className="confirm-impact-list">
              {deleted.length > 0 && (
                <li className="confirm-impact-item--danger">{deleted.join('・')}も一緒に削除されます。</li>
              )}
              {unlinked.length > 0 && (
                <li>{unlinked.join('・')}は残りますが、この企業との紐付けが外れます。</li>
              )}
            </ul>
          )}
        </>
      )}
    />
  );
}
