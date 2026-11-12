'use client';

import { STATUS_CONFIG } from '../lib/constants';
import { SELECTION_KINDS, getCompanySelections, getSelectionStatusLabel } from '@/lib/selections';

const KIND_SHORT = { internship: 'イン', fulltime: '本選', unclassified: '未分類' };

// A company's selections as status chips (kind abbreviation, then status),
// shared by the company table and the compare view. Past `limit` the rest
// collapse into '+N'.
export default function SelectionChips({ company, limit = 3 }) {
  const selections = getCompanySelections(company);
  if (selections.length === 0) return <span className="cell-muted">未登録</span>;
  return (
    <span className="selection-chips">
      {selections.slice(0, limit).map(selection => {
        const st = STATUS_CONFIG[selection.status] || STATUS_CONFIG['未応募'];
        const kind = SELECTION_KINDS[selection.kind]?.label || '種別未設定';
        const status = getSelectionStatusLabel(selection.status, selection.kind);
        return (
          <span
            key={selection.id}
            className="status-badge"
            style={{ background: st.bg, color: st.color }}
            title={`${kind}${selection.title ? `・${selection.title}` : ''}：${status}`}
          >
            <span className="selection-chip-kind" aria-hidden="true">{KIND_SHORT[selection.kind] || '未'}</span>
            <span className="visually-hidden">{kind}</span>
            {status}
          </span>
        );
      })}
      {selections.length > limit && <span className="cell-muted">+{selections.length - limit}</span>}
    </span>
  );
}
