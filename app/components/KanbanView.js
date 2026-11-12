'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { apiFetch } from '../lib/api-client';
import { createCompanyActions } from '../lib/company-actions';
import { SELECTION_KINDS, getCompanySelections, getSelectionStatusLabel } from '@/lib/selections';
import KanbanBoard from './KanbanBoard';
import Icon from './Icon';
import { buildEventIndex, getNextEventForSelection } from '@/lib/events';
import CompanyDetailModals from './CompanyDetailModals';
import SelectionModal from './SelectionModal';
import { readStorage, writeStorage } from '../lib/storage';
import './SplitKanban.css';
import { useToday } from '../lib/use-today';
import { parseLocalDate } from '@/lib/date';

const SCROLL_KEY = 'kanbanScrollLeft';
const VIEW_KEY = 'kanbanSelectionView';
const SPLIT_KEY = 'kanbanSplitRatio';
const clampRatio = value => Math.max(30, Math.min(70, value));
const remember = writeStorage;
const VIEWS = ['all', 'internship', 'fulltime'];

function readStoredNumber(key) {
  const stored = readStorage(key);
  return stored !== null && Number.isFinite(Number(stored)) ? Number(stored) : null;
}

export default function KanbanView({
  companies, onShowToast, onCompaniesChange, onEventsChange, onSelectionReplace,
  relatedEvents = [], relatedEsEntries = [], relatedInterviewMemos = [], onAddES, onOpenES,
  isActive = true, onRegisterScrollSnapshot, detailRequest, onDetailRequestDone,
}) {
  const today = useToday();
  const [view, setView] = useState(() => {
    const stored = readStorage(VIEW_KEY);
    return VIEWS.includes(stored) ? stored : 'all';
  });
  const [ratio, setRatio] = useState(() => {
    const stored = readStoredNumber(SPLIT_KEY);
    return stored === null ? 50 : clampRatio(stored);
  });
  const [workspaceHeight, setWorkspaceHeight] = useState(520);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [selectionModal, setSelectionModal] = useState(null);
  const [detailCompanyId, setDetailCompanyId] = useState(null);
  const [pendingIds, setPendingIds] = useState(new Set());
  // The card that just moved stage; its quote cell ticks once.
  const [tickedId, setTickedId] = useState(null);
  const tickTimerRef = useRef(null);
  const pendingRef = useRef(new Set());
  const workspaceRef = useRef(null);
  const scrollersRef = useRef(new Map());
  const scrollLeftRef = useRef(0);
  const resizeRef = useRef(null);

  const selections = useMemo(() => companies.flatMap(company =>
    getCompanySelections(company).map(selection => ({ ...selection, company }))
  ), [companies]);
  const byKind = useMemo(() => ({
    internship: selections.filter(item => item.kind === 'internship'),
    fulltime: selections.filter(item => item.kind === 'fulltime'),
    unclassified: selections.filter(item => item.kind === 'unclassified'),
  }), [selections]);
  // Each card's next due event, keyed by selection ID. An event linked to a
  // selection shows only on that card; an unlinked one only on the company's
  // furthest-along open selection.
  const nextEventMap = useMemo(() => {
    const index = buildEventIndex(relatedEvents, { today: parseLocalDate(today) });
    const map = new Map();
    selections.forEach(selection => {
      const next = getNextEventForSelection(selection, getCompanySelections(selection.company), index);
      if (next) map.set(String(selection.id), next);
    });
    return map;
  }, [relatedEvents, selections, today]);
  const detailCompany = companies.find(company => company.id === detailCompanyId) || null;
  const actions = createCompanyActions({ onShowToast, onCompaniesChange, onEventsChange });

  // Opens a company another part of the page asked for (the 要確認 list),
  // over the boards. This responds to a one-off request from the parent,
  // which clears it through onDetailRequestDone.
  useEffect(() => {
    if (!detailRequest?.companyId) return;
    if (companies.some(company => company.id === detailRequest.companyId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetailCompanyId(detailRequest.companyId);
    } else {
      onShowToast('対象の企業が見つかりませんでした。削除された可能性があります', { tone: 'error' });
    }
    onDetailRequestDone?.();
  }, [companies, detailRequest, onDetailRequestDone, onShowToast]);

  useEffect(() => {
    const storedScroll = readStoredNumber(SCROLL_KEY);
    if (storedScroll !== null) scrollLeftRef.current = Math.max(0, storedScroll);
  }, []);

  const registerScroller = useCallback((kind, element) => {
    if (element) scrollersRef.current.set(kind, element);
    else scrollersRef.current.delete(kind);
  }, []);

  const syncHorizontalScroll = useCallback(source => {
    if (!isActive || !source.clientWidth) return;
    const left = source.scrollLeft;
    if (Math.abs(scrollLeftRef.current - left) < 1) return;
    scrollLeftRef.current = left;
    scrollersRef.current.forEach(element => {
      if (element !== source && element.clientWidth && Math.abs(element.scrollLeft - left) >= 1) element.scrollLeft = left;
    });
    remember(SCROLL_KEY, left);
  }, [isActive]);

  useEffect(() => () => clearTimeout(tickTimerRef.current), []);

  const saveScrollSnapshot = useCallback(() => remember(SCROLL_KEY, scrollLeftRef.current), []);
  useEffect(() => {
    onRegisterScrollSnapshot?.(saveScrollSnapshot);
    return () => onRegisterScrollSnapshot?.(null);
  }, [onRegisterScrollSnapshot, saveScrollSnapshot]);

  useEffect(() => {
    if (!isActive) return;
    const measure = () => {
      const workspace = workspaceRef.current;
      if (!workspace) return;
      // Keep both panes usable on short screens; the page can still scroll.
      setWorkspaceHeight(Math.max(460, window.innerHeight - Math.max(0, workspace.getBoundingClientRect().top) - 20));
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', measure); };
  }, [isActive, view, classificationOpen, byKind.unclassified.length]);

  const changeView = next => {
    saveScrollSnapshot();
    setView(next);
    remember(VIEW_KEY, next);
  };
  const changeRatio = next => {
    const value = clampRatio(next);
    setRatio(value);
    remember(SPLIT_KEY, value);
  };

  const handleStatusChange = async (selection, status) => {
    if (pendingRef.current.has(selection.id)) return;
    const { company, ...previous } = selection;
    pendingRef.current.add(selection.id);
    setPendingIds(new Set(pendingRef.current));
    onSelectionReplace?.({ ...previous, status });
    try {
      const updated = await apiFetch('/api/selections', { method: 'PUT', body: { id: selection.id, status } });
      onSelectionReplace?.(updated);
      clearTimeout(tickTimerRef.current);
      setTickedId(selection.id);
      tickTimerRef.current = setTimeout(() => setTickedId(null), 1400);
      onShowToast(`${company.name} → ${getSelectionStatusLabel(status, selection.kind)}`);
    } catch (error) {
      onSelectionReplace?.(previous);
      onShowToast(`${company.name}の選考状況を保存できませんでした。元の列に戻しました。${error.message}`, { tone: 'error' });
    } finally {
      pendingRef.current.delete(selection.id);
      setPendingIds(new Set(pendingRef.current));
    }
  };

  const saveSelection = async data => {
    await actions.saveSelection(data);
    setSelectionModal(null);
  };
  const deleteSelection = async selection => {
    await actions.deleteSelection(selection);
    setSelectionModal(null);
  };
  const openSelection = selection => {
    if (!pendingRef.current.has(selection.id)) setSelectionModal({ selection });
  };
  const addSelection = (kind, companyId) => setSelectionModal({ initialKind: kind, initialCompanyId: companyId });

  const pane = kind => (
    <section className={`selection-pane selection-pane--${kind}`} aria-labelledby={`selection-heading-${kind}`}>
      <header className="selection-pane-header">
        <div>
          <h2 id={`selection-heading-${kind}`}>{SELECTION_KINDS[kind].label}</h2>
          <span className="selection-pane-count">{byKind[kind].length}件</span>
        </div>
        <button type="button" className="btn btn-sm" disabled={!companies.length} onClick={() => addSelection(kind)}><Icon name="plus" size="sm" />選考を追加</button>
      </header>
      <KanbanBoard
        selections={byKind[kind]} kind={kind} onEdit={openSelection}
        onDetail={company => setDetailCompanyId(company.id)}
        onStatusChange={handleStatusChange} pendingIds={pendingIds} nextEventMap={nextEventMap} tickedId={tickedId} isActive={isActive}
        registerScroller={registerScroller} onHorizontalScroll={syncHorizontalScroll} scrollLeftRef={scrollLeftRef}
      />
    </section>
  );

  return (
    <div className="split-kanban-view">
      <div className="split-kanban-toolbar">
        <h1>選考状況</h1>
        <div className="selection-view-switch" role="group" aria-label="表示する選考">
          {[['all', 'すべて'], ['internship', 'インターン'], ['fulltime', '本選考']].map(([key, label]) => (
            <button type="button" key={key} aria-pressed={view === key} className={view === key ? 'active' : ''} onClick={() => changeView(key)}>{label}</button>
          ))}
        </div>
      </div>

      {!!byKind.unclassified.length && (
        <details className="selection-unclassified" open={classificationOpen} onToggle={event => setClassificationOpen(event.currentTarget.open)}>
          <summary><Icon name="chevronRight" size="sm" className="disclosure-icon" />種別未設定 <strong>{byKind.unclassified.length}件</strong><span>インターン／本選考を指定すると、対応するボードに表示されます</span></summary>
          <div className="selection-unclassified-list">
            {byKind.unclassified.map(selection => (
              <div key={selection.id}>
                <button type="button" className="selection-unclassified-company" onClick={() => setDetailCompanyId(selection.company.id)}>{selection.company.name}</button>
                <span>{selection.title || '既存の選考'}</span>
                <span>{selection.status}</span>
                <button type="button" className="btn btn-sm" onClick={() => openSelection(selection)}>種別を指定</button>
              </div>
            ))}
          </div>
        </details>
      )}
      {!companies.length && <p className="selection-setup-notice">「企業一覧」で企業を登録すると、選考を追加できます。</p>}

      <div
        ref={workspaceRef}
        className={`selection-workspace${view === 'all' ? ' selection-workspace--split' : ''}`}
        style={{ height: workspaceHeight, gridTemplateRows: view === 'all' ? `minmax(0, ${ratio}fr) 16px minmax(0, ${100 - ratio}fr)` : 'minmax(0, 1fr)' }}
      >
        {(view === 'all' || view === 'internship') && pane('internship')}
        {view === 'all' && (
          <div
            className="selection-splitter" role="separator" tabIndex={0}
            aria-label="インターンと本選考の表示割合を調整" aria-orientation="horizontal"
            aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(ratio)}
            aria-valuetext={`インターン ${Math.round(ratio)}%、本選考 ${100 - Math.round(ratio)}%`}
            aria-controls="selection-heading-internship selection-heading-fulltime"
            title="ドラッグまたは上下キーで調整・ダブルクリックで半分に戻す"
            onDoubleClick={() => changeRatio(50)}
            onKeyDown={event => {
              const values = { ArrowUp: ratio - 5, ArrowDown: ratio + 5, Home: 30, End: 70 };
              if (event.key in values) { event.preventDefault(); changeRatio(values[event.key]); }
            }}
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              resizeRef.current = workspaceRef.current.getBoundingClientRect();
            }}
            onPointerMove={event => {
              if (!resizeRef.current) return;
              const rect = resizeRef.current;
              changeRatio(((event.clientY - rect.top - 8) / (rect.height - 16)) * 100);
            }}
            onPointerUp={event => {
              resizeRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { resizeRef.current = null; }}
            onLostPointerCapture={() => { resizeRef.current = null; }}
          ><span aria-hidden="true" /></div>
        )}
        {(view === 'all' || view === 'fulltime') && pane('fulltime')}
      </div>

      {selectionModal && <SelectionModal
        {...selectionModal} companies={companies} onClose={() => setSelectionModal(null)}
        onSave={saveSelection} onDelete={deleteSelection}
      />}
      <CompanyDetailModals
        company={detailCompany}
        companies={companies}
        events={relatedEvents}
        esEntries={relatedEsEntries}
        interviewMemos={relatedInterviewMemos}
        actions={actions}
        onClose={() => setDetailCompanyId(null)}
        onAddSelection={company => { addSelection('internship', company.id); setDetailCompanyId(null); }}
        onEditSelection={selection => { openSelection(selection); setDetailCompanyId(null); }}
        onAddES={onAddES}
        onOpenES={onOpenES}
      />
    </div>
  );
}
