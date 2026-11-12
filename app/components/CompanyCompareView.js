'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseNum, parseSalary, Stars } from '../lib/constants';
import { useToday } from '../lib/use-today';
import { parseLocalDate, daysUntil, formatDueLabel, formatShortDate } from '@/lib/date';
import { getEventCompanyId, isEventDone } from '@/lib/events';
import { getBestCompanyIds } from '@/lib/compare';
import { getEntryCompanyIds } from '@/lib/es-entries';
import { readStorageJson, writeStorage } from '../lib/storage';
import SelectionChips from './SelectionChips';
import Icon from './Icon';
import ResearchSources from './ResearchSources';

const STORAGE_KEY = 'companyCompare.selectedCompanyIds.v1';

function parsePercent(value) {
  const match = String(value || '').match(/[\d.]+/);
  return match ? Number(match[0]) : null;
}

function getNextEvent(companyId, events, now) {
  return events
    .filter(event => !isEventDone(event) && String(getEventCompanyId(event) || '') === String(companyId))
    .filter(event => {
      const days = daysUntil(event.start_date, now);
      return days !== null && days >= 0;
    })
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] || null;
}

function MetricCell({ company, bestIds, children }) {
  const isBest = bestIds?.has(String(company.id));
  return (
    <td className={isBest ? 'compare-best-cell' : ''}>
      {children || '-'}
      {isBest && <span className="compare-best-badge">最良</span>}
    </td>
  );
}

export default function CompanyCompareView({
  companies,
  relatedEvents = [],
  relatedEsEntries = [],
  onOpenCompany,
}) {
  const today = useToday();
  const [search, setSearch] = useState('');
  // The user's own choice, or null until they pick companies.
  const [chosenIds, setChosenIds] = useState(() => {
    const stored = readStorageJson(STORAGE_KEY);
    return Array.isArray(stored) ? stored.map(String) : null;
  });

  const sortedCompanies = useMemo(() => (
    [...companies].sort((a, b) => (b.interest || 0) - (a.interest || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ja'))
  ), [companies]);

  // Deleted companies drop out of the choice. Until the user chooses (or when
  // every chosen company is gone), the three highest-interest companies are
  // compared.
  const selectedIds = useMemo(() => {
    const topThree = sortedCompanies.slice(0, 3).map(company => String(company.id));
    if (chosenIds === null) return topThree;
    const validIds = new Set(companies.map(company => String(company.id)));
    const kept = chosenIds.filter(id => validIds.has(id));
    return kept.length === 0 && chosenIds.length > 0 ? topThree : kept;
  }, [chosenIds, companies, sortedCompanies]);

  useEffect(() => {
    if (chosenIds !== null) writeStorage(STORAGE_KEY, JSON.stringify(chosenIds));
  }, [chosenIds]);

  const selectedCompanies = useMemo(() => {
    const selectedSet = new Set(selectedIds.map(String));
    return sortedCompanies.filter(company => selectedSet.has(String(company.id)));
  }, [selectedIds, sortedCompanies]);

  const companyOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedCompanies;
    return sortedCompanies.filter(company => [
      company.name,
      company.industry,
      company.headquarters,
      company.memo,
      company.notes,
    ].some(value => String(value || '').toLowerCase().includes(q)));
  }, [search, sortedCompanies]);

  const unansweredEsCountByCompany = useMemo(() => {
    const counts = new Map();
    relatedEsEntries.forEach(entry => {
      if ((entry.answer || '').trim()) return;
      getEntryCompanyIds(entry).forEach(companyId => {
        counts.set(String(companyId), (counts.get(String(companyId)) || 0) + 1);
      });
    });
    return counts;
  }, [relatedEsEntries]);

  const nextEventByCompany = useMemo(() => {
    const map = new Map();
    selectedCompanies.forEach(company => {
      map.set(String(company.id), getNextEvent(company.id, relatedEvents, parseLocalDate(today)));
    });
    return map;
  }, [relatedEvents, selectedCompanies, today]);

  const best = useMemo(() => ({
    interest: getBestCompanyIds(selectedCompanies, company => company.interest || 0, 'max'),
    salary: getBestCompanyIds(selectedCompanies, parseSalary, 'max'),
    overtime: getBestCompanyIds(selectedCompanies, company => parseNum(company.overtime_hours), 'min'),
    paidLeave: getBestCompanyIds(selectedCompanies, company => parsePercent(company.paid_leave_rate), 'max'),
    turnover: getBestCompanyIds(selectedCompanies, company => parsePercent(company.turnover_rate), 'min'),
  }), [selectedCompanies]);

  const toggleCompany = (id) => {
    const normalizedId = String(id);
    setChosenIds(selectedIds.includes(normalizedId)
      ? selectedIds.filter(current => current !== normalizedId)
      : [...selectedIds, normalizedId]);
  };

  const resetTopCompanies = () => {
    setChosenIds(sortedCompanies.slice(0, 3).map(company => String(company.id)));
  };

  return (
    <div className="compare-view">
      <div className="compare-controls">
        <h1 className="view-title">企業比較</h1>
        <div className="compare-controls-main">
          <input
            type="search"
            className="filter-select compare-search-input"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="企業を検索..."
            aria-label="比較する企業を検索"
          />
          <button className="btn btn-sm" type="button" onClick={resetTopCompanies}>志望度上位に戻す</button>
        </div>
        <div className="compare-selected-count">{selectedCompanies.length}社を比較中</div>
      </div>

      <div className="compare-picker">
        {companyOptions.length === 0 ? (
          <div className="compare-empty-inline">一致する企業がありません。</div>
        ) : companyOptions.map(company => {
          const checked = selectedIds.includes(String(company.id));
          return (
            <label key={company.id} className={`compare-picker-item${checked ? ' selected' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleCompany(company.id)}
              />
              <span className="compare-picker-name">{company.name}</span>
              <span className="compare-picker-meta">{company.industry || '-'}</span>
            </label>
          );
        })}
      </div>

      {selectedCompanies.length === 0 ? (
        <div className="empty-state">
          <Icon name="compare" />
          <div className="empty-state-text">比較したい企業を選択してください。</div>
        </div>
      ) : (
        <div className="compare-table-wrap">
          <table className="compare-table" style={{ '--compare-columns': selectedCompanies.length }}>
            <colgroup>
              <col className="compare-heading-col" />
              {selectedCompanies.map(company => <col key={company.id} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="compare-row-heading">項目</th>
                {selectedCompanies.map(company => (
                  <th key={company.id}>
                    <button type="button" className="compare-company-title" onClick={() => onOpenCompany?.(company.id)}>
                      {company.name}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>選考状況</th>
                {selectedCompanies.map(company => (
                  <td key={company.id} className="compare-chips-cell">
                    <SelectionChips company={company} limit={Infinity} />
                  </td>
                ))}
              </tr>
              <tr>
                <th>志望度</th>
                {selectedCompanies.map(company => (
                  <MetricCell key={company.id} company={company} bestIds={best.interest}>
                    <Stars count={company.interest || 0} />
                  </MetricCell>
                ))}
              </tr>
              <tr>
                <th>業界</th>
                {selectedCompanies.map(company => <td key={company.id}>{company.industry || '-'}</td>)}
              </tr>
              <tr>
                <th>所在地</th>
                {selectedCompanies.map(company => <td key={company.id}>{company.headquarters || '-'}</td>)}
              </tr>
              <tr>
                <th>初任給</th>
                {selectedCompanies.map(company => <td key={company.id}>{company.salary_master_start || '-'}</td>)}
              </tr>
              <tr>
                <th>平均年収</th>
                {selectedCompanies.map(company => (
                  <MetricCell key={company.id} company={company} bestIds={best.salary}>
                    {company.salary_average || '-'}
                  </MetricCell>
                ))}
              </tr>
              <tr>
                <th>月平均残業</th>
                {selectedCompanies.map(company => (
                  <MetricCell key={company.id} company={company} bestIds={best.overtime}>
                    {company.overtime_hours || '-'}
                  </MetricCell>
                ))}
              </tr>
              <tr>
                <th>有休消化率</th>
                {selectedCompanies.map(company => (
                  <MetricCell key={company.id} company={company} bestIds={best.paidLeave}>
                    {company.paid_leave_rate || '-'}
                  </MetricCell>
                ))}
              </tr>
              <tr>
                <th>離職率</th>
                {selectedCompanies.map(company => (
                  <MetricCell key={company.id} company={company} bestIds={best.turnover}>
                    {company.turnover_rate || '-'}
                  </MetricCell>
                ))}
              </tr>
              <tr>
                <th>福利厚生</th>
                {selectedCompanies.map(company => <td key={company.id} className="compare-long-cell">{company.benefits || '-'}</td>)}
              </tr>
              <tr>
                <th>次の予定</th>
                {selectedCompanies.map(company => {
                  const event = nextEventByCompany.get(String(company.id));
                  const days = event ? daysUntil(event.start_date, parseLocalDate(today)) : null;
                  return (
                    <td key={company.id}>
                      {event ? (
                        <span className="compare-event-pill">
                          {event.title}
                          <span>{[formatShortDate(event.start_date), formatDueLabel(days)].filter(Boolean).join(' · ')}</span>
                        </span>
                      ) : '-'}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <th>未回答ES</th>
                {selectedCompanies.map(company => (
                  <td key={company.id}>{unansweredEsCountByCompany.get(String(company.id)) || 0}件</td>
                ))}
              </tr>
              <tr>
                <th>個人メモ</th>
                {selectedCompanies.map(company => <td key={company.id} className="compare-long-cell">{company.memo || '-'}</td>)}
              </tr>
              <tr><th>出典・対象年度</th>{selectedCompanies.map(company => <td key={company.id}><ResearchSources sources={company.research_sources} /></td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
