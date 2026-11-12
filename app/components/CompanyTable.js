'use client';

import { Stars, getIndustryConfig } from '../lib/constants';
import { formatDue } from '../lib/board';
import { formatShortDate } from '@/lib/date';
import { GRADUATION_LABEL } from '@/lib/graduation';
import { isHttpUrl } from '@/lib/validation';
import SelectionChips from './SelectionChips';
import Icon from './Icon';

function NextEvent({ next }) {
  if (!next) return <span className="cell-muted">—</span>;
  const date = formatShortDate(next.event.start_date);
  return (
    <span className={`next-event${next.days <= 3 ? ' next-event--hot' : ''}`} title={next.event.title}>
      <span className="next-event-date">{date}</span>
      <span className="next-event-title">{next.event.title}</span>
      <span className="next-event-due">{formatDue(next.days)}</span>
    </span>
  );
}

export default function CompanyTable({ groups, nextEventMap, onOpen }) {
  return (
    <div className="company-table-wrap">
      <table className="company-table">
        <thead>
          <tr>
            <th scope="col" className="col-name">企業</th>
            <th scope="col">志望度</th>
            <th scope="col">選考</th>
            <th scope="col">次の予定</th>
            <th scope="col" className="num">初任給</th>
            <th scope="col" className="num">平均年収</th>
            <th scope="col" className="num">残業/月</th>
            <th scope="col" className="num">有休消化</th>
            <th scope="col" className="num">離職率</th>
            <th scope="col">本社</th>
            <th scope="col">メモ</th>
          </tr>
        </thead>
        {groups.map(([industry, companies]) => (
          <tbody key={industry}>
            <tr className="sector-row">
              <th colSpan={11} scope="rowgroup">
                <span className="industry-swatch" style={{ background: getIndustryConfig(industry).color }} aria-hidden="true" />
                {industry}
                <span className="sector-count">{companies.length}社</span>
              </th>
            </tr>
            {companies.map(c => {
              const recruitUrl = isHttpUrl(c.recruit_url) ? c.recruit_url : null;
              return (
                <tr key={c.id} className="company-row">
                  <th scope="row" className="col-name">
                    <div className="company-name-cell">
                      <button type="button" className="company-open" onClick={() => onOpen(c.id)} aria-label={`${c.name}の詳細を開く`} title={c.name}>
                        {c.name}
                      </button>
                      {recruitUrl && (
                        <a
                          className="kanban-card-jump"
                          href={recruitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${c.name}の${GRADUATION_LABEL}マイページを開く（新しいタブ）`}
                          title={`${GRADUATION_LABEL}マイページを開く（新しいタブ）`}
                        >
                          <span>{GRADUATION_LABEL}</span><Icon name="external" size="sm" />
                        </a>
                      )}
                    </div>
                  </th>
                  <td><Stars count={c.interest || 0} /></td>
                  <td><SelectionChips company={c} /></td>
                  <td><NextEvent next={nextEventMap.get(String(c.id))} /></td>
                  <td className="num">{c.salary_master_start || '—'}</td>
                  <td className="num">{c.salary_average || '—'}</td>
                  <td className="num">{c.overtime_hours || '—'}</td>
                  <td className="num">{c.paid_leave_rate || '—'}</td>
                  <td className="num">{c.turnover_rate || '—'}</td>
                  <td className="cell-clip"><span className="cell-clip-text" title={c.headquarters || undefined}>{c.headquarters || '—'}</span></td>
                  <td className="cell-memo">{c.memo ? <span className="cell-clip-text" title={c.memo}>{c.memo}</span> : <span className="cell-muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
