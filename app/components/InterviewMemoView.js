'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { apiFetch } from '../lib/api-client';
import { useToday } from '../lib/use-today';
import { parseLocalDate, formatShortDate } from '@/lib/date';
import { getEventCompanyId } from '@/lib/events';
import {
  DEFAULT_MEMO_TYPE,
  MEMO_TYPES,
  buildTopicGroups,
  getInterviewQuote,
  getMemoCompanyId,
  getMemoTypeLabel,
  getUnlinkedMemos,
  getVisibleTopic,
  groupInterviewEvents,
  groupMemosByType,
  pickDefaultInterviewSelection,
} from '@/lib/interview-memo';
import { usePaneHeight } from '../lib/use-pane-height';
import ConfirmDialog from './ConfirmDialog';
import ModalFrame from './ModalFrame';
import Icon from './Icon';

function filterTextMatches(values, query) {
  if (!query) return true;
  return values.some(value => String(value || '').toLowerCase().includes(query));
}

function InterviewMemoModal({
  memo,
  companies,
  interviewEvents,
  companyName,
  onClose,
  onSave,
}) {
  const isEdit = Boolean(memo?.id);
  const ids = { event: useId(), company: useId(), type: useId(), topic: useId(), content: useId() };
  const initialEventId = memo?.event_id || '';
  const initialEvent = initialEventId ? interviewEvents.find(event => String(event.id) === String(initialEventId)) : null;
  const [initialForm] = useState(() => ({
    id: memo?.id,
    event_id: initialEventId,
    company_id: memo?.company_id || getEventCompanyId(initialEvent) || '',
    memo_type: memo?.memo_type || DEFAULT_MEMO_TYPE,
    topic: memo?.topic || '',
    content: memo?.content || '',
    sort_order: memo?.sort_order || 0,
  }));
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleEventChange = (eventId) => {
    const event = interviewEvents.find(item => String(item.id) === String(eventId));
    setForm(prev => ({
      ...prev,
      event_id: eventId,
      company_id: getEventCompanyId(event) || prev.company_id,
    }));
  };

  const handleSave = async () => {
    if (!form.content.trim()) {
      setError('メモ本文を入力してください');
      return;
    }
    setSaving(true);
    const topic = form.topic.trim() || getMemoTypeLabel(form.memo_type);
    await onSave({
      ...form,
      topic,
      event_id: form.event_id || null,
      company_id: form.company_id || null,
      sort_order: Number(form.sort_order) || 0,
    });
    setSaving(false);
  };

  return (
    <ModalFrame
      title={isEdit ? '面接メモを編集' : '面接メモを追加'}
      onClose={onClose}
      isDirty={isDirty}
      className="interview-memo-modal"
      footer={({ requestClose }) => (
        <>
          <button className="btn" type="button" onClick={requestClose}>キャンセル</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? <><div className="spinner" /> 保存中…</> : '保存'}
          </button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor={ids.event}>面接予定</label>
          <select id={ids.event} className="form-select" value={form.event_id || ''} onChange={event => handleEventChange(event.target.value)}>
            <option value="">予定に紐づけない</option>
            {interviewEvents.map(event => (
              <option key={event.id} value={event.id}>
                {formatShortDate(event.start_date) || '日付未定'} · {companyName(event)} · {event.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={ids.company}>企業</label>
          <select id={ids.company} className="form-select" value={form.company_id || ''} onChange={event => set('company_id', event.target.value)}>
            <option value="">企業未指定</option>
            {companies.map(company => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor={ids.type}>種別</label>
          <select id={ids.type} className="form-select" value={form.memo_type} onChange={event => set('memo_type', event.target.value)}>
            {MEMO_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={ids.topic}>トピック</label>
          <input
            id={ids.topic}
            className="form-input"
            value={form.topic}
            onChange={event => set('topic', event.target.value)}
            placeholder="例: ガクチカ、研究、逆質問"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={ids.content}>本文 *</label>
        <textarea
          id={ids.content}
          className="form-textarea interview-memo-textarea"
          value={form.content}
          onChange={event => { set('content', event.target.value); if (error) setError(''); }}
          placeholder="準備内容、本番で聞かれたこと、振り返りなど"
          rows={10}
        />
      </div>
    </ModalFrame>
  );
}

// One memo in the right pane. `context` names what the heading does not
// (company, date, interview), so it is empty under an interview heading.
function MemoItem({ memo, context, showType = false, onEdit, onDelete }) {
  const topic = getVisibleTopic(memo);
  const name = topic || getMemoTypeLabel(memo.memo_type);
  return (
    <article className="memo-item">
      {(showType || topic || context) && (
        <div className="memo-item-heading">
          {showType && <span className="memo-item-type">{getMemoTypeLabel(memo.memo_type)}</span>}
          {topic && <h4 className="memo-item-topic">{topic}</h4>}
          {context && <span className="memo-item-context">{context}</span>}
        </div>
      )}
      <p className="memo-item-content">{memo.content}</p>
      <div className="memo-item-actions">
        <button className="icon-btn" type="button" title="編集" aria-label={`「${name}」のメモを編集`} onClick={() => onEdit(memo)}>
          <Icon name="pencil" size="sm" />
        </button>
        <button className="icon-btn icon-btn--danger" type="button" title="削除" aria-label={`「${name}」のメモを削除`} onClick={() => onDelete(memo.id)}>
          <Icon name="trash" size="sm" />
        </button>
      </div>
    </article>
  );
}

function QuoteCell({ days }) {
  const quote = getInterviewQuote(days);
  if (!quote) return null;
  return <span className={`quote quote--${quote.tone}`}>{quote.text}</span>;
}

export default function InterviewMemoView({
  companies,
  events = [],
  memos = [],
  loading = false,
  isActive = true,
  onShowToast,
  onMemoSaved,
  onMemoDeleted,
  openRequest,
  onOpenRequestDone,
}) {
  const [mode, setMode] = useState('events');
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedTopicKey, setSelectedTopicKey] = useState('');
  const [pane, setPane] = useState('list');
  const [editMemo, setEditMemo] = useState(null);
  const [deleteMemoId, setDeleteMemoId] = useState(null);
  const toolbarRef = useRef(null);
  const panelRef = useRef(null);
  const detailRef = useRef(null);
  const listRef = useRef(null);
  const modeGroupId = useId();
  const companySelectId = useId();
  const upcomingId = useId();
  const pastId = useId();
  const unlinkedId = useId();

  const companiesById = useMemo(() => {
    const map = new Map();
    companies.forEach(company => map.set(String(company.id), company));
    return map;
  }, [companies]);

  const companyName = useCallback((event) => {
    const companyId = getEventCompanyId(event);
    return event?.companies?.name || companiesById.get(String(companyId))?.name || '企業未指定';
  }, [companiesById]);

  const interviewEvents = useMemo(() => (
    events
      .filter(event => event.event_type === 'interview')
      .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))
  ), [events]);

  const eventsById = useMemo(() => {
    const map = new Map();
    interviewEvents.forEach(event => map.set(String(event.id), event));
    return map;
  }, [interviewEvents]);

  const memoCompanyName = useCallback((memo) => {
    const companyId = getMemoCompanyId(memo, eventsById);
    return memo.companies?.name || companiesById.get(String(companyId))?.name || '企業未指定';
  }, [companiesById, eventsById]);

  const memosByEventId = useMemo(() => {
    const map = new Map();
    memos.forEach(memo => {
      if (!memo.event_id) return;
      const key = String(memo.event_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(memo);
    });
    return map;
  }, [memos]);

  const query = search.trim().toLowerCase();
  const memoMatches = useCallback((memo) => {
    if (filterCompanyId && String(getMemoCompanyId(memo, eventsById) || '') !== String(filterCompanyId)) return false;
    const event = memo.event_id ? eventsById.get(String(memo.event_id)) : null;
    return filterTextMatches([
      memo.topic, memo.content, getMemoTypeLabel(memo.memo_type), memoCompanyName(memo), event?.title,
    ], query);
  }, [eventsById, filterCompanyId, memoCompanyName, query]);

  const filteredEvents = useMemo(() => interviewEvents.filter(event => {
    if (filterCompanyId && String(getEventCompanyId(event) || '') !== String(filterCompanyId)) return false;
    const eventMemos = memosByEventId.get(String(event.id)) || [];
    return filterTextMatches([
      event.title,
      companyName(event),
      ...eventMemos.flatMap(memo => [memo.topic, memo.content, getMemoTypeLabel(memo.memo_type)]),
    ], query);
  }), [companyName, filterCompanyId, interviewEvents, memosByEventId, query]);

  const today = useToday();
  const groups = useMemo(() => groupInterviewEvents(filteredEvents, { today: parseLocalDate(today) }), [filteredEvents, today]);
  const interviewIds = useMemo(() => new Set(eventsById.keys()), [eventsById]);
  const unlinkedMemos = useMemo(
    () => getUnlinkedMemos(memos, interviewIds).filter(memoMatches),
    [interviewIds, memoMatches, memos],
  );
  const topicGroups = useMemo(() => buildTopicGroups(memos.filter(memoMatches)), [memoMatches, memos]);

  const listedEventIds = useMemo(
    () => new Set([...groups.upcoming, ...groups.past].map(item => String(item.event.id))),
    [groups],
  );
  const isListed = sel => (
    sel && ((sel.type === 'event' && listedEventIds.has(sel.id)) || (sel.type === 'unlinked' && unlinkedMemos.length > 0))
  );
  const activeSelection = isListed(selected)
    ? selected
    : pickDefaultInterviewSelection({ ...groups, unlinkedCount: unlinkedMemos.length });
  const activeTopic = topicGroups.find(group => group.key === selectedTopicKey) || topicGroups[0] || null;

  const hasAnything = interviewEvents.length > 0 || memos.length > 0;
  const listEmpty = mode === 'events'
    ? groups.upcoming.length + groups.past.length === 0 && unlinkedMemos.length === 0
    : topicGroups.length === 0;

  const height = usePaneHeight(panelRef, toolbarRef, isActive, [mode, listEmpty, hasAnything]);

  // Answers a one-off request from another tab (open the memos for an
  // interview). The parent clears it through onOpenRequestDone, so updating
  // state here is intended.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!openRequest?.eventId) return;
    const eventId = String(openRequest.eventId);
    const event = eventsById.get(eventId);
    if (!event) {
      if (!loading) {
        onShowToast?.('対象の面接予定が見つかりませんでした。削除された可能性があります', { tone: 'error' });
        onOpenRequestDone?.();
      }
      return;
    }
    setMode('events');
    setSearch('');
    setFilterCompanyId(prev => (prev && String(getEventCompanyId(event) || '') !== String(prev) ? '' : prev));
    setSelected({ type: 'event', id: eventId });
    setPane('detail');
    onOpenRequestDone?.();
  }, [eventsById, loading, onOpenRequestDone, onShowToast, openRequest]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A newly selected interview or topic starts at its top.
  const detailKey = mode === 'events'
    ? `${activeSelection?.type || ''}:${activeSelection?.id || ''}`
    : `topic:${activeTopic?.key || ''}`;
  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0;
  }, [detailKey]);

  const select = (next) => {
    setSelected(next);
    setPane('detail');
  };

  const selectTopic = (key) => {
    setSelectedTopicKey(key);
    setPane('detail');
  };

  const backToList = () => {
    // Show the list now so focus can return to the row that was open.
    flushSync(() => setPane('list'));
    listRef.current?.querySelector('[aria-current="true"]')?.focus();
  };

  const clearFilters = () => {
    setFilterCompanyId('');
    setSearch('');
  };

  const saveMemo = async (formData) => {
    try {
      const saved = await apiFetch('/api/interview-memos', {
        method: formData.id ? 'PUT' : 'POST',
        body: formData,
      });
      onMemoSaved?.(saved);
      setEditMemo(null);
      onShowToast?.(formData.id ? '面接メモを更新しました' : '面接メモを追加しました');
    } catch (error) {
      onShowToast?.(`面接メモを保存できませんでした。入力内容はそのまま残っています。${error.message}`, { tone: 'error' });
    }
  };

  const deleteMemo = async (id) => {
    setDeleteMemoId(null);
    try {
      await apiFetch(`/api/interview-memos?id=${id}`, { method: 'DELETE' });
      onMemoDeleted?.(id);
      onShowToast?.('面接メモを削除しました');
    } catch (error) {
      onShowToast?.(`面接メモを削除できませんでした。${error.message}`, { tone: 'error' });
    }
  };

  const addMemoForEvent = (event) => {
    setEditMemo({
      event_id: event?.id || '',
      company_id: getEventCompanyId(event) || '',
      memo_type: DEFAULT_MEMO_TYPE,
      topic: '',
      content: '',
    });
  };

  const eventContext = (memo) => {
    const event = memo.event_id ? eventsById.get(String(memo.event_id)) : null;
    const parts = [memoCompanyName(memo)];
    if (event) parts.push(formatShortDate(event.start_date) || '日付未定', event.title || '面接');
    else parts.push('予定なし');
    return parts.join(' · ');
  };

  const renderEventRow = ({ event, days }) => {
    const count = (memosByEventId.get(String(event.id)) || []).length;
    const current = activeSelection?.type === 'event' && activeSelection.id === String(event.id);
    return (
      <li key={event.id}>
        <button
          type="button"
          className="split-row interview-row"
          aria-current={current ? 'true' : undefined}
          onClick={() => select({ type: 'event', id: String(event.id) })}
        >
          <span className="interview-row-date">{formatShortDate(event.start_date) || '日付未定'}</span>
          <span className="interview-row-main">
            <span className="interview-row-title">{event.title || '面接'}</span>
            <span className="split-row-meta-text">{companyName(event)} · メモ{count}件</span>
          </span>
          <QuoteCell days={days} />
        </button>
      </li>
    );
  };

  const renderEventsList = () => (
    <>
      {groups.upcoming.length > 0 && (
        <section className="split-list-section" aria-labelledby={upcomingId}>
          <h2 className="split-list-label" id={upcomingId}>今後</h2>
          <ul className="split-list-items">{groups.upcoming.map(renderEventRow)}</ul>
        </section>
      )}
      {groups.past.length > 0 && (
        <section className="split-list-section" aria-labelledby={pastId}>
          <h2 className="split-list-label" id={pastId}>過去</h2>
          <ul className="split-list-items">{groups.past.map(renderEventRow)}</ul>
        </section>
      )}
      {unlinkedMemos.length > 0 && (
        <section className="split-list-section" aria-labelledby={unlinkedId}>
          <h2 className="split-list-label" id={unlinkedId}>予定なし</h2>
          <ul className="split-list-items">
            <li>
              <button
                type="button"
                className="split-row interview-row interview-row--unlinked"
                aria-current={activeSelection?.type === 'unlinked' ? 'true' : undefined}
                onClick={() => select({ type: 'unlinked' })}
              >
                <span className="interview-row-main">
                  <span className="interview-row-title">予定に紐づけていないメモ {unlinkedMemos.length}件</span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      )}
    </>
  );

  const renderTopicsList = () => (
    <ul className="split-list-items" aria-label="質問の一覧">
      {topicGroups.map(group => (
        <li key={group.key}>
          <button
            type="button"
            className="split-row topic-row"
            aria-current={activeTopic?.key === group.key ? 'true' : undefined}
            onClick={() => selectTopic(group.key)}
          >
            <span className="topic-row-name">{group.topic}</span>
            <span className="split-row-status split-row-status--quiet">{group.memos.length}件</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const renderTypeGroups = (list, contextOf) => groupMemosByType(list).map(group => (
    <section key={group.value} className="memo-group" aria-label={group.label}>
      <h3 className="memo-group-label">{group.label}</h3>
      {group.memos.map(memo => (
        <MemoItem
          key={memo.id}
          memo={memo}
          context={contextOf ? contextOf(memo) : ''}
          onEdit={setEditMemo}
          onDelete={setDeleteMemoId}
        />
      ))}
    </section>
  ));

  const renderEventDetail = () => {
    if (!activeSelection) return null;
    if (activeSelection.type === 'unlinked') {
      return (
        <div className="split-detail-inner">
          <header className="split-detail-head">
            <div className="split-detail-heading">
              <h2 className="split-detail-title">予定に紐づけていないメモ</h2>
              <p className="split-detail-meta"><span>{unlinkedMemos.length}件</span></p>
            </div>
            <button className="btn btn-sm" type="button" onClick={() => addMemoForEvent(null)}>
              <Icon name="plus" size="sm" /> 面接メモを追加
            </button>
          </header>
          {renderTypeGroups(unlinkedMemos, memo => memoCompanyName(memo))}
        </div>
      );
    }
    const event = eventsById.get(activeSelection.id);
    if (!event) return null;
    const item = [...groups.upcoming, ...groups.past].find(entry => String(entry.event.id) === activeSelection.id);
    const eventMemos = memosByEventId.get(String(event.id)) || [];
    return (
      <div className="split-detail-inner">
        <header className="split-detail-head">
          <div className="split-detail-heading">
            <h2 className="split-detail-title">{event.title || '面接'}</h2>
            <p className="split-detail-meta">
              <span>{companyName(event)}</span>
              <span>{formatShortDate(event.start_date) || '日付未定'}</span>
              <QuoteCell days={item?.days ?? null} />
            </p>
          </div>
          <button className="btn btn-sm" type="button" onClick={() => addMemoForEvent(event)}>
            <Icon name="plus" size="sm" /> この面接にメモ
          </button>
        </header>
        {eventMemos.length === 0
          ? <p className="split-detail-empty">この面接のメモはまだありません。</p>
          : renderTypeGroups(eventMemos)}
      </div>
    );
  };

  const renderTopicDetail = () => {
    if (!activeTopic) return null;
    const dateOf = memo => eventsById.get(String(memo.event_id))?.start_date || '';
    const sorted = [...activeTopic.memos].sort((a, b) => String(dateOf(b)).localeCompare(String(dateOf(a))));
    return (
      <div className="split-detail-inner">
        <header className="split-detail-head">
          <div className="split-detail-heading">
            <h2 className="split-detail-title">{activeTopic.topic}</h2>
            <p className="split-detail-meta"><span>{activeTopic.memos.length}件</span></p>
          </div>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => setEditMemo({ topic: activeTopic.topic, memo_type: 'answer', content: '' })}
          >
            <Icon name="plus" size="sm" /> このトピックに追加
          </button>
        </header>
        <div className="memo-group">
          {sorted.map(memo => (
            <MemoItem
              key={memo.id}
              memo={memo}
              showType
              context={eventContext(memo)}
              onEdit={setEditMemo}
              onDelete={setDeleteMemoId}
            />
          ))}
        </div>
      </div>
    );
  };

  const emptyText = mode === 'events'
    ? '条件に一致する面接がありません。'
    : memos.length === 0 ? '面接メモはまだありません。' : '条件に一致する面接メモがありません。';

  return (
    <div className="interview-view" data-split-pane={pane}>
      <div className="view-toolbar" ref={toolbarRef}>
        <h1 className="view-title">面接メモ</h1>
        <div className="filter-bar">
          <div className="filter-group">
            <span className="filter-label" id={modeGroupId}>表示</span>
            <div className="segmented" role="group" aria-labelledby={modeGroupId}>
              <button type="button" aria-pressed={mode === 'events'} onClick={() => setMode('events')}>面接回別</button>
              <button type="button" aria-pressed={mode === 'topics'} onClick={() => setMode('topics')}>質問別</button>
            </div>
          </div>
          <div className="filter-group">
            <label className="filter-label" htmlFor={companySelectId}>企業</label>
            <select
              id={companySelectId}
              className="filter-select"
              value={filterCompanyId}
              onChange={event => setFilterCompanyId(event.target.value)}
            >
              <option value="">すべての企業</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
          <input
            type="search"
            className="filter-select toolbar-search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="面接・質問・メモを検索"
            aria-label="面接・質問・メモを検索"
          />
        </div>
        <div className="toolbar-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setEditMemo({ memo_type: DEFAULT_MEMO_TYPE, topic: '', content: '' })}
          >
            <Icon name="plus" /> 面接メモを追加
          </button>
        </div>
      </div>

      {loading && memos.length === 0 ? (
        <div className="es-loading" role="status"><div className="spinner" /><span>読み込み中…</span></div>
      ) : !hasAnything ? (
        <div className="empty-state">
          <Icon name="message" />
          <div className="empty-state-text">
            面接の予定はまだありません。カレンダーで「面接・選考」の予定を追加すると、ここに面接ごとのメモを残せます。
          </div>
          <button className="btn btn-primary" type="button" onClick={() => addMemoForEvent(null)}>
            <Icon name="plus" /> 面接メモを追加
          </button>
        </div>
      ) : listEmpty ? (
        <div className="empty-state">
          <Icon name="search" />
          <div className="empty-state-text">{emptyText}</div>
          {(filterCompanyId || query) && (
            <button className="btn" type="button" onClick={clearFilters}>絞り込みを解除</button>
          )}
        </div>
      ) : (
        <div
          className="split-view"
          data-pane={pane}
          ref={panelRef}
          style={{ '--split-height': `${height}px` }}
        >
          <div className="split-list" ref={listRef}>
            {mode === 'events' ? renderEventsList() : renderTopicsList()}
          </div>
          <div className="split-detail" ref={detailRef}>
            <button className="split-back" type="button" onClick={backToList}>
              <Icon name="chevronLeft" size="sm" /> 一覧に戻る
            </button>
            {mode === 'events' ? renderEventDetail() : renderTopicDetail()}
          </div>
        </div>
      )}

      {editMemo !== null && (
        <InterviewMemoModal
          memo={editMemo}
          companies={companies}
          interviewEvents={interviewEvents}
          companyName={companyName}
          onClose={() => setEditMemo(null)}
          onSave={saveMemo}
        />
      )}
      {deleteMemoId !== null && (
        <ConfirmDialog
          title="面接メモを削除"
          message="この面接メモを削除しますか？"
          confirmLabel="削除"
          onCancel={() => setDeleteMemoId(null)}
          onConfirm={() => deleteMemo(deleteMemoId)}
        />
      )}
    </div>
  );
}
