'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from './lib/api-client';
import { normalizeStatus } from './lib/constants';
import { useToday } from './lib/use-today';
import { daysUntil, parseLocalDate } from '@/lib/date';
import { isEventDone, toEventPayload } from '@/lib/events';
import { buildAttentionItems, countHotDeadlines } from '@/lib/attention';
import { getCompanySelections } from '@/lib/selections';
import { readStorage, writeStorage } from './lib/storage';
import CalendarView from './components/CalendarView';
import CompanyCompareView from './components/CompanyCompareView';
import ESMemoView from './components/ESMemoView';
import CompaniesView from './components/CompaniesView';
import InterviewMemoView from './components/InterviewMemoView';
import KanbanView from './components/KanbanView';
import DataMenu from './components/DataMenu';
import Icon, { BrandMark } from './components/Icon';
import AttentionStrip from './components/AttentionStrip';
import ToastStack from './components/ToastStack';

const TABS = [
  { key: 'kanban', label: '選考状況', icon: 'board' },
  { key: 'companies', label: '企業一覧', icon: 'building' },
  { key: 'compare', label: '企業比較', icon: 'compare' },
  { key: 'calendar', label: 'カレンダー', icon: 'calendar' },
  { key: 'es', label: 'ESメモ', icon: 'file' },
  { key: 'interviews', label: '面接メモ', icon: 'message' },
];
const VALID_TABS = new Set(TABS.map(tab => tab.key));
const MAX_TOASTS = 3;
const LOAD_ERROR_LABELS = {
  companies: '企業',
  events: '予定',
  esEntries: 'ESメモ',
  interviewMemos: '面接メモ',
};

function sortEsEntries(entries) {
  return [...entries].sort((a, b) => {
    const sortOrderDiff = (a.sort_order || 0) - (b.sort_order || 0);
    if (sortOrderDiff !== 0) return sortOrderDiff;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
}

function sortInterviewMemos(memos) {
  return [...memos].sort((a, b) => {
    const eventDateA = a.events?.start_date || '';
    const eventDateB = b.events?.start_date || '';
    const dateDiff = String(eventDateA).localeCompare(String(eventDateB));
    if (dateDiff !== 0) return dateDiff;
    const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
}

// A failed load must not look like an empty list, or the user may think their
// data is gone. Identical messages (e.g. a missing server key) are merged.
function LoadErrorBanner({ errors, onRetry }) {
  const groups = new Map();
  Object.entries(errors).forEach(([key, message]) => {
    if (!groups.has(message)) groups.set(message, []);
    groups.get(message).push(LOAD_ERROR_LABELS[key] || key);
  });
  if (groups.size === 0) return null;

  return (
    <div className="load-error-banner" role="alert">
      <Icon name="alert" className="load-error-banner-icon" />
      <div className="load-error-banner-content">
        <div className="load-error-banner-title">データを読み込めませんでした</div>
        <ul className="load-error-banner-list">
          {[...groups].map(([message, labels]) => (
            <li key={message}><strong>{labels.join('・')}</strong>：{message}</li>
          ))}
        </ul>
      </div>
      <button type="button" className="btn btn-sm" onClick={onRetry}>
        <Icon name="refresh" size="sm" /> 再読み込み
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const today = useToday();
  const beforeLeaveRef = useRef(null);
  const logoutPendingRef = useRef(false);
  const registerBeforeLeave = useCallback(handler => { beforeLeaveRef.current = handler; }, []);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  // Restoring the tab during the first render is safe: until the companies
  // load, the page renders only the loading screen, on the server and client.
  // A first visit opens on the selection boards.
  const [activeTab, setActiveTab] = useState(() => {
    const stored = readStorage('activeTab');
    return stored && VALID_TABS.has(stored) ? stored : 'kanban';
  });
  const [allEvents, setAllEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [esEntries, setEsEntries] = useState([]);
  const [esEntriesLoading, setEsEntriesLoading] = useState(true);
  const [interviewMemos, setInterviewMemos] = useState([]);
  const [interviewMemosLoading, setInterviewMemosLoading] = useState(true);
  const [esDraftRequest, setEsDraftRequest] = useState(null);
  const [calendarOpenRequest, setCalendarOpenRequest] = useState(null);
  const [esOpenRequest, setEsOpenRequest] = useState(null);
  const [interviewMemoRequest, setInterviewMemoRequest] = useState(null);
  const [companyDetailRequest, setCompanyDetailRequest] = useState(null);
  const [kanbanDetailRequest, setKanbanDetailRequest] = useState(null);
  const toastSeqRef = useRef(0);
  const pendingDoneRef = useRef(new Set());
  const [loadErrors, setLoadErrors] = useState({});
  const tabNavRef = useRef(null);
  const tabButtonRefs = useRef({});
  const kanbanScrollSnapshotRef = useRef(null);

  // showToast(message, { tone: 'error', action: { label, onClick }, duration }).
  // A plain toast fades after 3s (6s with an action); an error stays until
  // closed. At most three show at once: a fourth replaces the oldest plain
  // one, or the oldest of all when every one is an error.
  const showToast = useCallback((message, options = {}) => {
    toastSeqRef.current += 1;
    const tone = options.tone === 'error' ? 'error' : 'info';
    const action = options.action?.label && typeof options.action.onClick === 'function' ? options.action : null;
    const duration = tone === 'error' ? null : (options.duration ?? (action ? 6000 : 3000));
    const toast = { id: toastSeqRef.current, message, tone, action, duration };
    setToasts(prev => {
      const next = [...prev];
      while (next.length >= MAX_TOASTS) {
        const plain = next.findIndex(item => item.tone !== 'error');
        next.splice(plain === -1 ? 0 : plain, 1);
      }
      return [...next, toast];
    });
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const setTab = useCallback((tab) => {
    const nextTab = VALID_TABS.has(tab) ? tab : 'companies';
    if (activeTab === 'kanban' && nextTab !== 'kanban') {
      kanbanScrollSnapshotRef.current?.();
    }
    setActiveTab(nextTab);
  }, [activeTab]);

  const registerKanbanScrollSnapshot = useCallback((snapshot) => {
    kanbanScrollSnapshotRef.current = snapshot;
  }, []);

  const setLoadError = useCallback((key, error) => {
    setLoadErrors(prev => {
      if (!error) {
        if (!Object.hasOwn(prev, key)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: error.message || '読み込みに失敗しました' };
    });
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const data = await apiFetch('/api/companies');
      if (Array.isArray(data)) {
        setCompanies(data);
      }
      setLoadError('companies', null);
    } catch (e) {
      console.error(e);
      setLoadError('companies', e);
    } finally {
      setLoading(false);
    }
  }, [setLoadError]);

  const fetchEvents = useCallback(async () => {
    try {
      const eventsData = await apiFetch('/api/events');
      if (Array.isArray(eventsData)) setAllEvents(eventsData);
      setLoadError('events', null);
    } catch (e) {
      console.error(e);
      setLoadError('events', e);
    } finally {
      setEventsLoading(false);
    }
  }, [setLoadError]);

  const fetchEsEntries = useCallback(async () => {
    setEsEntriesLoading(true);
    try {
      const esData = await apiFetch('/api/es-entries');
      if (Array.isArray(esData)) setEsEntries(sortEsEntries(esData));
      setLoadError('esEntries', null);
    } catch (e) {
      console.error(e);
      setLoadError('esEntries', e);
    } finally {
      setEsEntriesLoading(false);
    }
  }, [setLoadError]);

  const fetchInterviewMemos = useCallback(async () => {
    setInterviewMemosLoading(true);
    try {
      const data = await apiFetch('/api/interview-memos');
      if (Array.isArray(data)) setInterviewMemos(sortInterviewMemos(data));
      setLoadError('interviewMemos', null);
    } catch (e) {
      // Keep the memos already shown; the banner explains the failure.
      console.error(e);
      setLoadError('interviewMemos', e);
    } finally {
      setInterviewMemosLoading(false);
    }
  }, [setLoadError]);

  const fetchDashboardMeta = useCallback(() => {
    fetchEvents();
    fetchEsEntries();
    fetchInterviewMemos();
  }, [fetchEvents, fetchEsEntries, fetchInterviewMemos]);

  const replaceSelection = useCallback((updatedSelection) => {
    if (!updatedSelection?.id) return;
    setCompanies(prev => prev.map(company => (
      String(company.id) === String(updatedSelection.company_id)
        ? {
          ...company,
          selections: getCompanySelections(company).map(selection => (
            String(selection.id) === String(updatedSelection.id)
              ? { ...selection, ...updatedSelection, status: normalizeStatus(updatedSelection.status ?? selection.status) }
              : selection
          )),
        }
        : company
    )));
  }, []);

  const upsertEsEntry = useCallback((entry) => {
    if (!entry?.id) return;
    setEsEntries(prev => {
      const next = prev.some(current => current.id === entry.id)
        ? prev.map(current => current.id === entry.id ? entry : current)
        : [...prev, entry];
      return sortEsEntries(next);
    });
  }, []);

  const removeEsEntry = useCallback((id) => {
    setEsEntries(prev => prev.filter(entry => String(entry.id) !== String(id)));
  }, []);

  const upsertInterviewMemo = useCallback((memo) => {
    if (!memo?.id) return;
    setInterviewMemos(prev => {
      const next = prev.some(current => current.id === memo.id)
        ? prev.map(current => current.id === memo.id ? memo : current)
        : [...prev, memo];
      return sortInterviewMemos(next);
    });
  }, []);

  const removeInterviewMemo = useCallback((id) => {
    setInterviewMemos(prev => prev.filter(memo => String(memo.id) !== String(id)));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await apiFetch('/api/auth/check');
      } catch {
        router.replace('/login');
        return;
      }
      fetchCompanies();
      fetchDashboardMeta();
    })();
  }, [fetchCompanies, fetchDashboardMeta, router]);

  useEffect(() => {
    writeStorage('activeTab', activeTab);
    const activeButton = tabButtonRefs.current[activeTab];
    if (activeButton && window.innerWidth < 768) {
      activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTab, loading]);

  const handleLogout = async () => {
    if (logoutPendingRef.current) return;
    logoutPendingRef.current = true;
    try {
      if (beforeLeaveRef.current && !(await beforeLeaveRef.current())) {
        showToast('未保存のES回答があります。保存を再試行してからログアウトしてください。', { tone: 'error' });
        return;
      }
      await apiFetch('/api/auth/logout', { method: 'POST' });
      router.replace('/login');
    } catch (error) {
      showToast(error.message, { tone: 'error' });
    } finally { logoutPendingRef.current = false; }
  };

  const refreshCompaniesAndMeta = useCallback(() => {
    fetchDashboardMeta();
    return fetchCompanies();
  }, [fetchCompanies, fetchDashboardMeta]);

  // Interview memos embed their event (title, date), so they reload with events.
  const refreshEvents = useCallback(() => {
    fetchEvents();
    fetchInterviewMemos();
  }, [fetchEvents, fetchInterviewMemos]);

  const refreshInterviewMemos = useCallback(() => {
    fetchInterviewMemos();
  }, [fetchInterviewMemos]);

  const reloadAll = useCallback(() => {
    fetchCompanies();
    fetchDashboardMeta();
  }, [fetchCompanies, fetchDashboardMeta]);

  // Everything due, in date order. The strip, its list, and the calendar
  // tab's badge share these items, so "hot" means the same in all three.
  const attentionItems = useMemo(
    () => buildAttentionItems({ events: allEvents, esEntries, today: parseLocalDate(today) }),
    [allEvents, esEntries, today],
  );
  const hotDeadlineCount = useMemo(() => countHotDeadlines(attentionItems), [attentionItems]);

  // Each tab states how much it holds; the calendar counts upcoming events.
  const tabCounts = useMemo(() => ({
    kanban: companies.reduce((sum, c) => sum + getCompanySelections(c).length, 0),
    companies: companies.length,
    calendar: allEvents.filter(ev => {
      const days = daysUntil(ev.end_date || ev.start_date, parseLocalDate(today));
      return days !== null && days >= 0;
    }).length,
    es: esEntries.length,
    interviews: interviewMemos.length,
  }), [companies, allEvents, esEntries, interviewMemos, today]);

  // Marks an event done (or not done) from the strip's list or the calendar's
  // day panel. The screen changes first; a failed save puts it back. Resolves
  // to whether the save succeeded.
  const toggleEventDone = useCallback((event, done) => {
    // A plain function so the undo button can call it again.
    async function save(target, nextDone) {
      if (!target?.id || pendingDoneRef.current.has(target.id)) return false;
      const sameEvent = item => String(item.id) === String(target.id);
      const previous = isEventDone(target);
      pendingDoneRef.current.add(target.id);
      setAllEvents(prev => prev.map(item => (sameEvent(item) ? { ...item, done: nextDone } : item)));
      try {
        await apiFetch('/api/events', { method: 'PUT', body: toEventPayload(target, { done: nextDone }) });
        if (nextDone) {
          showToast(`「${target.title}」を完了にしました`, {
            action: { label: '元に戻す', onClick: () => save({ ...target, done: true }, false) },
          });
        } else {
          showToast(`「${target.title}」を未完了に戻しました`);
        }
        return true;
      } catch (error) {
        setAllEvents(prev => prev.map(item => (sameEvent(item) ? { ...item, done: previous } : item)));
        showToast(`「${target.title}」の完了状態を保存できませんでした。${error.message}`, { tone: 'error' });
        return false;
      } finally {
        pendingDoneRef.current.delete(target.id);
      }
    }
    return save(event, done);
  }, [showToast]);

  // Where an item leads: a deadline with a company opens that company (over
  // the boards when they are showing, otherwise over the company list); a
  // deadline without one opens the event; interviews open their memos; the ES
  // summary opens the first unanswered entry.
  const handleAttentionOpen = useCallback((item) => {
    const nonce = Date.now();
    if (item.kind === 'deadline' && item.companyId) {
      if (activeTab === 'kanban') {
        setKanbanDetailRequest({ companyId: item.companyId, nonce });
      } else {
        setCompanyDetailRequest({ companyId: item.companyId, nonce });
        setTab('companies');
      }
      return;
    }
    if (item.kind === 'deadline') {
      setCalendarOpenRequest({ eventId: item.eventId, event: item.event, nonce });
      setTab('calendar');
      return;
    }
    if (item.kind === 'interview') {
      setInterviewMemoRequest({ eventId: item.eventId, event: item.event, nonce });
      setTab('interviews');
      return;
    }
    if (item.kind === 'es') {
      setEsOpenRequest({ entryId: item.entryId, companyId: item.companyId, nonce });
      setTab('es');
    }
  }, [activeTab, setTab]);

  if (loading) {
    return (
      <div className="app-shell">
        <header className="app-bar"><div className="app-brand"><BrandMark /><span className="app-brand-name">就活ダッシュボード</span></div></header>
        <div className="loading-overlay" role="status"><div className="spinner" />読み込み中…</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div className="app-brand"><BrandMark /><span className="app-brand-name">就活ダッシュボード</span></div>
        <nav className="app-tabs" ref={tabNavRef} aria-label="表示切り替え">
          {TABS.map(tab => (
            <button
              key={tab.key}
              ref={element => { tabButtonRefs.current[tab.key] = element; }}
              type="button"
              aria-current={activeTab === tab.key ? 'page' : undefined}
              className="app-tab"
              onClick={() => setTab(tab.key)}
            >
              <Icon name={tab.icon} />
              {tab.label}
              {tabCounts[tab.key] !== undefined && <span className="app-tab-count">{tabCounts[tab.key]}</span>}
              {tab.key === 'calendar' && hotDeadlineCount > 0 && (
                <span className="app-tab-due" title={`3日以内または期限超過の締切 ${hotDeadlineCount}件`}>
                  <span className="visually-hidden">3日以内または期限超過の締切</span>{hotDeadlineCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="app-bar-end">
          <DataMenu
            onShowToast={showToast}
            onCompaniesChange={refreshCompaniesAndMeta}
            onEventsChange={refreshEvents}
            onLogout={handleLogout}
          />
        </div>
      </header>

      <AttentionStrip
        items={attentionItems}
        companies={companies}
        onOpen={handleAttentionOpen}
        onToggleDone={toggleEventDone}
      />

      <main className="app-main">
      <LoadErrorBanner errors={loadErrors} onRetry={reloadAll} />

      <div style={{ display: activeTab === 'companies' ? 'contents' : 'none' }}>
        <CompaniesView
          companies={companies}
          onShowToast={showToast}
          onCompaniesChange={refreshCompaniesAndMeta}
          onEventsChange={refreshEvents}
          relatedEvents={allEvents}
          relatedEsEntries={esEntries}
          relatedInterviewMemos={interviewMemos}
          detailRequest={companyDetailRequest}
          onDetailRequestDone={() => setCompanyDetailRequest(null)}
          onAddES={(companyId) => {
            setEsDraftRequest({ companyId, nonce: Date.now() });
            setTab('es');
          }}
          onOpenES={companyId => { setEsOpenRequest({ companyId, nonce: Date.now() }); setTab('es'); }}
        />
      </div>
      <div style={{ display: activeTab === 'kanban' ? 'contents' : 'none' }}>
        <KanbanView
          companies={companies}
          onShowToast={showToast}
          onCompaniesChange={refreshCompaniesAndMeta}
          onSelectionReplace={replaceSelection}
          onEventsChange={refreshEvents}
          relatedEvents={allEvents}
          relatedEsEntries={esEntries}
          relatedInterviewMemos={interviewMemos}
          onAddES={(companyId) => {
            setEsDraftRequest({ companyId, nonce: Date.now() });
            setTab('es');
          }}
          onOpenES={companyId => { setEsOpenRequest({ companyId, nonce: Date.now() }); setTab('es'); }}
          isActive={activeTab === 'kanban'}
          onRegisterScrollSnapshot={registerKanbanScrollSnapshot}
          detailRequest={kanbanDetailRequest}
          onDetailRequestDone={() => setKanbanDetailRequest(null)}
        />
      </div>
      <div className="app-view" style={{ display: activeTab === 'compare' ? 'block' : 'none' }}>
        <CompanyCompareView
          companies={companies}
          relatedEvents={allEvents}
          relatedEsEntries={esEntries}
          onOpenCompany={(companyId) => {
            setCompanyDetailRequest({ companyId, nonce: Date.now() });
            setTab('companies');
          }}
        />
      </div>
      <div className="app-view" style={{ display: activeTab === 'calendar' ? 'block' : 'none' }}>
        <CalendarView
          companies={companies}
          onShowToast={showToast}
          events={allEvents}
          loading={eventsLoading}
          onEventsChanged={refreshEvents}
          onToggleEventDone={toggleEventDone}
          openRequest={calendarOpenRequest}
          onOpenRequestDone={() => setCalendarOpenRequest(null)}
        />
      </div>
      <div className="app-view" style={{ display: activeTab === 'es' ? 'block' : 'none' }}>
        <ESMemoView
          companies={companies}
          onRegisterBeforeLeave={registerBeforeLeave}
          entries={esEntries}
          events={allEvents}
          loading={esEntriesLoading}
          isActive={activeTab === 'es'}
          onShowToast={showToast}
          onEntrySaved={upsertEsEntry}
          onEntryDeleted={removeEsEntry}
          draftRequest={esDraftRequest}
          onDraftRequestDone={() => setEsDraftRequest(null)}
          openRequest={esOpenRequest}
          onOpenRequestDone={() => setEsOpenRequest(null)}
        />
      </div>
      <div className="app-view" style={{ display: activeTab === 'interviews' ? 'block' : 'none' }}>
        <InterviewMemoView
          companies={companies}
          events={allEvents}
          memos={interviewMemos}
          loading={interviewMemosLoading}
          isActive={activeTab === 'interviews'}
          onShowToast={showToast}
          onMemoSaved={upsertInterviewMemo}
          onMemoDeleted={removeInterviewMemo}
          onRefresh={refreshInterviewMemos}
          openRequest={interviewMemoRequest}
          onOpenRequestDone={() => setInterviewMemoRequest(null)}
        />
      </div>
      </main>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
