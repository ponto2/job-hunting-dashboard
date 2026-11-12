'use client';

import { useToday } from '../lib/use-today';
import { parseLocalDate } from '@/lib/date';

import { useEffect, useState, useMemo } from 'react';
import { STATUSES, parseSalary, parseNum } from '../lib/constants';
import { createCompanyActions } from '../lib/company-actions';
import { buildNextEventMap } from '../lib/board';
import { getCompanySelections } from '@/lib/selections';
import { compareNullableNumbers } from '@/lib/numbers';
import CompanyTable from './CompanyTable';
import CompanyDetailModals from './CompanyDetailModals';
import EditModal from './EditModal';
import AIResearchModal from './AIResearchModal';
import SelectionModal from './SelectionModal';
import Icon from './Icon';

const ACTIVE_STATUSES = ['興味あり', 'ES準備中', 'ES提出済', '面接中'];

export default function CompaniesView({
  companies,
  onShowToast,
  onCompaniesChange,
  onEventsChange,
  relatedEvents = [],
  relatedEsEntries = [],
  relatedInterviewMemos = [],
  detailRequest,
  onDetailRequestDone,
  onAddES,
  onOpenES,
}) {
  // --- Filter State ---
  const [filterIndustry, setFilterIndustry] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('interest-desc');
  const [companySearch, setCompanySearch] = useState('');

  // --- Modal State ---
  const [detailCompanyId, setDetailCompanyId] = useState(null);
  const detailCompany = detailCompanyId ? companies.find(company => company.id === detailCompanyId) || null : null;
  const [addingCompany, setAddingCompany] = useState(false);
  const [selectionEditor, setSelectionEditor] = useState(null);
  const [aiModal, setAiModal] = useState(false);
  const actions = createCompanyActions({ onShowToast, onCompaniesChange, onEventsChange });
  const today = useToday();
  const nextEventMap = useMemo(() => buildNextEventMap(relatedEvents, 14, parseLocalDate(today)), [relatedEvents, today]);
  // Quiet running totals beside the heading (not stat tiles).
  const activeCount = useMemo(() => companies.filter(c => getCompanySelections(c).some(selection => ACTIVE_STATUSES.includes(selection.status))).length, [companies]);
  const keenCount = useMemo(() => companies.filter(c => (c.interest || 0) >= 4).length, [companies]);

  // Opens a company another tab asked for. This responds to a one-off request
  // from the parent, which clears it through onDetailRequestDone.
  useEffect(() => {
    if (!detailRequest?.companyId) return;
    if (companies.some(c => c.id === detailRequest.companyId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetailCompanyId(detailRequest.companyId);
    } else {
      onShowToast('対象の企業が見つかりませんでした。削除された可能性があります', { tone: 'error' });
    }
    onDetailRequestDone?.();
  }, [companies, detailRequest, onDetailRequestDone, onShowToast]);

  // --- Filtered & Sorted ---
  const industries = useMemo(() => [...new Set(companies.map(c => c.industry))].sort(), [companies]);

  const filtered = useMemo(() => {
    let list = [...companies];
    if (filterIndustry !== 'all') list = list.filter(c => c.industry === filterIndustry);
    if (filterStatus !== 'all') list = list.filter(c => getCompanySelections(c).some(selection => selection.status === filterStatus));
    const q = companySearch.trim().toLowerCase();
    if (q) {
      list = list.filter(c => [
        c.name,
        c.industry,
        c.headquarters,
        c.business,
        c.products,
        c.memo,
        c.notes,
        ...getCompanySelections(c).map(selection => selection.title),
      ].some(value => (value || '').toLowerCase().includes(q)));
    }
    switch (sortBy) {
      case 'interest-desc': list.sort((a, b) => (b.interest || 0) - (a.interest || 0)); break;
      case 'interest-asc':  list.sort((a, b) => (a.interest || 0) - (b.interest || 0)); break;
      case 'name-asc':      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja')); break;
      // Companies without a value go last in both directions.
      case 'salary-desc':   list.sort((a, b) => compareNullableNumbers(parseSalary(a), parseSalary(b), 'desc')); break;
      case 'overtime-asc':  list.sort((a, b) => compareNullableNumbers(parseNum(a.overtime_hours), parseNum(b.overtime_hours), 'asc')); break;
    }
    return list;
  }, [companies, filterIndustry, filterStatus, sortBy, companySearch]);

  const groups = useMemo(() => {
    const g = {};
    filtered.forEach(c => { if (!g[c.industry]) g[c.industry] = []; g[c.industry].push(c); });
    return Object.keys(g).sort().map(industry => [industry, g[industry]]);
  }, [filtered]);

  const addCompany = async (data) => {
    if (await actions.saveCompany(data)) setAddingCompany(false);
  };

  return (
    <>
      <div className="view-toolbar">
        <h1 className="view-title">企業一覧<span className="view-title-count">{filtered.length === companies.length ? `${companies.length}社` : `${filtered.length} / ${companies.length}社`}</span></h1>
        <dl className="view-title-stats">
          <div><dt>進行中</dt><dd>{activeCount}</dd></div>
          <div><dt>志望度4以上</dt><dd>{keenCount}</dd></div>
        </dl>
        <div className="filter-bar">
          <label className="filter-group">
            <span className="filter-label">業界</span>
            <select className="filter-select" value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)}>
              <option value="all">すべて</option>
              {industries.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          <label className="filter-group">
            <span className="filter-label">選考</span>
            <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">すべて</option>
              {STATUSES.map(s => <option key={s} value={s}>{s === '合格' ? '合格（内定・参加決定）' : s}</option>)}
            </select>
          </label>
          <label className="filter-group">
            <span className="filter-label">並び替え</span>
            <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="interest-desc">志望度が高い順</option>
              <option value="interest-asc">志望度が低い順</option>
              <option value="name-asc">企業名順</option>
              <option value="salary-desc">平均年収が高い順</option>
              <option value="overtime-asc">残業が少ない順</option>
            </select>
          </label>
          <input
            type="search"
            className="filter-select company-search-input"
            placeholder="企業・メモを検索"
            aria-label="企業・メモを検索"
            value={companySearch}
            onChange={e => setCompanySearch(e.target.value)}
          />
        </div>
        <div className="toolbar-actions">
          <button className="btn" type="button" onClick={() => setAiModal(true)}>
            <Icon name="sparkle" /> AIリサーチ
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setAddingCompany(true)}>
            <Icon name="plus" /> 企業を追加
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Icon name={companies.length === 0 ? 'building' : 'search'} />
          <div className="empty-state-text">
            {companies.length === 0
              ? '企業がまだ登録されていません。「企業を追加」か「AIリサーチ」から始めましょう。'
              : '条件に一致する企業がありません。絞り込みを変えてください。'}
          </div>
        </div>
      ) : (
        <CompanyTable groups={groups} nextEventMap={nextEventMap} onOpen={setDetailCompanyId} />
      )}

      {/* Modals */}
      {/* The detail stays mounted (hidden) while a selection is edited, then reappears. */}
      <CompanyDetailModals
        company={detailCompany}
        hidden={Boolean(selectionEditor)}
        companies={companies}
        events={relatedEvents}
        esEntries={relatedEsEntries}
        interviewMemos={relatedInterviewMemos}
        actions={actions}
        onClose={() => setDetailCompanyId(null)}
        onAddSelection={company => setSelectionEditor({ selection: null, companyId: company.id })}
        onEditSelection={(selection, company) => setSelectionEditor({ selection, companyId: company.id })}
        onAddES={onAddES}
        onOpenES={onOpenES}
      />
      {selectionEditor && (
        <SelectionModal
          selection={selectionEditor.selection}
          companies={companies}
          initialCompanyId={selectionEditor.companyId}
          onClose={() => setSelectionEditor(null)}
          onSave={async data => { await actions.saveSelection(data); setSelectionEditor(null); }}
          onDelete={async selection => { await actions.deleteSelection(selection); setSelectionEditor(null); }}
        />
      )}
      {addingCompany && (
        <EditModal
          company={{}}
          companies={companies}
          onClose={() => setAddingCompany(false)}
          onSave={addCompany}
        />
      )}
      {aiModal && (
        <AIResearchModal
          onClose={() => setAiModal(false)}
          onAdd={async (data) => { if (await actions.saveCompany(data)) setAiModal(false); }}
        />
      )}
    </>
  );
}
