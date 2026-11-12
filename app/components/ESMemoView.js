'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { apiFetch } from '../lib/api-client';
import { getEntryCompanyIds } from '@/lib/es-entries';
import { formatShortDate, parseLocalDate } from '@/lib/date';
import {
  ES_CATEGORIES,
  buildQuestionThreads,
  countCharsWithoutNewlines,
  getCharCountState,
  getDeadlineQuote,
  getEntryCompanyLabel,
  getEntryThreadKey,
  getPersistedThreadId,
  isAnswerEmpty,
  normalizeCategory,
  sortQuestionThreads,
} from '@/lib/es-memo';
import { readStorage, writeStorage } from '../lib/storage';
import { useAnswerAutosave } from '../lib/use-answer-autosave';
import { usePaneHeight } from '../lib/use-pane-height';
import { useToday } from '../lib/use-today';
import ConfirmDialog from './ConfirmDialog';
import ModalFrame from './ModalFrame';
import Icon from './Icon';

const SELECTED_THREAD_STORAGE_KEY = 'esMemo.selectedThreadId.v1';

function CharCounter({ text, limit }) {
  const state = getCharCountState(countCharsWithoutNewlines(text), limit);
  return <span className={`char-count char-count--${state.stage}`}>{state.text}</span>;
}

const SAVE_LABELS = {
  dirty: '未保存',
  saving: '保存中…',
  saved: '保存済み',
  error: '保存できませんでした',
};

function SaveStatus({ status, error, onRetry }) {
  return (
    <span className={`save-status${status ? ` save-status--${status}` : ''}`} role="status">
      {status && (
        <>
          {status === 'error' && <Icon name="alert" size="sm" />}
          <span title={status === 'error' && error?.message ? error.message : undefined}>{SAVE_LABELS[status]}</span>
          {status === 'error' && (
            <button type="button" className="save-status-retry" onClick={onRetry}>再試行</button>
          )}
        </>
      )}
    </span>
  );
}

// A textarea that grows with its content, so a long answer reads as a page
// instead of a scrolling box.
function GrowingTextarea({ value, inputRef, isActive, ...props }) {
  const localRef = useRef(null);
  const widthRef = useRef(0);

  const fit = useCallback(() => {
    const element = localRef.current;
    if (!element || !element.clientWidth) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight + 2}px`;
  }, []);

  useLayoutEffect(() => { fit(); }, [value, isActive, fit]);

  useEffect(() => {
    const element = localRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === widthRef.current) return;
      widthRef.current = element.clientWidth;
      fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <textarea
      {...props}
      ref={element => {
        localRef.current = element;
        if (inputRef) inputRef(element);
      }}
      value={value}
      rows={3}
    />
  );
}

function AnswerSection({ entry, value, status, error, isActive, inputRef, onChange, onBlur, onRetry, onCopy, onEdit, onDelete }) {
  const headingId = useId();
  const label = getEntryCompanyLabel(entry);
  const hasAnswer = value.trim().length > 0;
  return (
    <section className="es-answer" aria-labelledby={headingId}>
      <div className="es-answer-head">
        <h3 className="es-answer-company" id={headingId}>{label}</h3>
        <CharCounter text={value} limit={entry.char_limit} />
        <SaveStatus status={status} error={error} onRetry={onRetry} />
        <div className="es-answer-actions">
          <button className="icon-btn" type="button" title="回答をコピー" aria-label={`${label}の回答をコピー`} onClick={() => onCopy(value)} disabled={!hasAnswer}>
            <Icon name="copy" size="sm" />
          </button>
          <button className="icon-btn" type="button" title="設問・企業を編集" aria-label={`${label}の設問・企業を編集`} onClick={onEdit}>
            <Icon name="pencil" size="sm" />
          </button>
          <button className="icon-btn icon-btn--danger" type="button" title="回答を削除" aria-label={`${label}の回答を削除`} onClick={onDelete}>
            <Icon name="trash" size="sm" />
          </button>
        </div>
      </div>
      <GrowingTextarea
        id={`es-answer-${entry.id}`}
        className="es-answer-input"
        aria-label={`${label}の回答`}
        placeholder="ここに回答を書く"
        value={value}
        isActive={isActive}
        inputRef={inputRef}
        onChange={event => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </section>
  );
}

// The entry modal. scope 'question' edits only the shared question fields
// (question, category, limit) of a whole thread.
function ESEntryModal({ entry, scope = 'entry', companies, defaultCompanyIds, onClose, onSave }) {
  const isEdit = !!entry?.id;
  const questionOnly = scope === 'question';
  const ids = {
    category: useId(),
    limit: useId(),
    companies: useId(),
    question: useId(),
    answer: useId(),
  };

  const [initialCompanyIds] = useState(() => {
    const linked = getEntryCompanyIds(entry);
    return linked.length > 0 ? linked : defaultCompanyIds || [];
  });
  const [initialForm] = useState(() => ({
    question: entry?.question || '',
    answer: entry?.answer || '',
    char_limit: entry?.char_limit || '',
    sort_order: entry?.sort_order || 0,
    category: normalizeCategory(entry?.category),
    is_template: false,
    ...(!isEdit && entry?.thread_id ? { thread_id: entry.thread_id } : {}),
    ...(isEdit ? { id: entry.id } : {}),
  }));
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(initialCompanyIds);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isDirty = JSON.stringify({ form, ids: selectedCompanyIds })
    !== JSON.stringify({ form: initialForm, ids: initialCompanyIds });

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleCompany = (id) => {
    setSelectedCompanyIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!form.question?.trim()) {
      setError('設問を入力してください');
      return;
    }
    const charLimit = form.char_limit ? parseInt(form.char_limit, 10) : null;
    setSaving(true);
    if (questionOnly) {
      await onSave({ question: form.question, category: normalizeCategory(form.category), char_limit: charLimit });
    } else {
      await onSave({
        ...form,
        category: normalizeCategory(form.category),
        is_template: selectedCompanyIds.length === 0,
        char_limit: charLimit,
        company_ids: selectedCompanyIds,
      });
    }
    setSaving(false);
  };

  const limit = form.char_limit ? parseInt(form.char_limit, 10) : null;
  const title = questionOnly ? '設問を編集' : isEdit ? 'ES回答を編集' : 'ES回答を追加';

  return (
    <ModalFrame
      title={title}
      onClose={onClose}
      isDirty={isDirty}
      footer={({ requestClose }) => (
        <>
          <button className="btn" type="button" onClick={requestClose}>キャンセル</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
            <Icon name="save" /> {saving ? '保存中…' : '保存'}
          </button>
        </>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor={ids.question}>設問 *</label>
        <textarea
          id={ids.question}
          className="form-textarea"
          rows={2}
          placeholder="例: 学生時代に最も力を入れて取り組んだことを教えてください。"
          value={form.question}
          onChange={e => { set('question', e.target.value); if (error) setError(''); }}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor={ids.category}>カテゴリ</label>
          <select id={ids.category} className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {ES_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={ids.limit}>文字数上限（任意）</label>
          <input
            id={ids.limit}
            className="form-input"
            type="number"
            min="0"
            placeholder="例: 400"
            value={form.char_limit}
            onChange={e => set('char_limit', e.target.value)}
          />
        </div>
      </div>
      {questionOnly && (
        <p className="form-hint">この設問のすべての回答に反映されます。</p>
      )}

      {!questionOnly && (
        <>
          <div className="form-group" role="group" aria-labelledby={ids.companies}>
            <span className="form-label" id={ids.companies}>企業（任意・複数選択可）</span>
            <div className="es-company-checkboxes">
              {companies.map(c => (
                <label key={c.id} className={`es-company-checkbox-item${selectedCompanyIds.includes(c.id) ? ' selected' : ''}`}>
                  <input type="checkbox" checked={selectedCompanyIds.includes(c.id)} onChange={() => toggleCompany(c.id)} />
                  <span>{c.name}</span>
                </label>
              ))}
              {companies.length === 0 && <span className="form-hint">登録済みの企業がありません</span>}
            </div>
            <p className="form-hint">企業を選ばない場合は「企業未指定」として保存されます。</p>
          </div>

          <div className="form-group">
            <div className="es-modal-answer-head">
              <label className="form-label" htmlFor={ids.answer}>回答</label>
              <CharCounter text={form.answer} limit={limit} />
            </div>
            <textarea
              id={ids.answer}
              className="form-textarea es-answer-textarea"
              rows={10}
              placeholder="ここに回答を書く"
              value={form.answer}
              onChange={e => set('answer', e.target.value)}
            />
          </div>
        </>
      )}
    </ModalFrame>
  );
}

export default function ESMemoView({
  companies,
  entries = [],
  events = [],
  loading = false,
  isActive = true,
  onShowToast,
  onEntrySaved,
  onEntryDeleted,
  draftRequest,
  onDraftRequestDone,
  openRequest,
  onOpenRequestDone,
  onRegisterBeforeLeave,
}) {
  const today = useToday();
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [answerFilter, setAnswerFilter] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [selectedId, setSelectedId] = useState(() => readStorage(SELECTED_THREAD_STORAGE_KEY) || '');
  // Phones show one pane at a time: the list, or the selected question.
  const [pane, setPane] = useState('list');
  const [modal, setModal] = useState(null);
  const [deleteEntryId, setDeleteEntryId] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const toolbarRef = useRef(null);
  const panelRef = useRef(null);
  const detailRef = useRef(null);
  const rowRefs = useRef(new Map());
  const inputRefs = useRef(new Map());
  const answerGroupId = useId();
  const companySelectId = useId();
  const categorySelectId = useId();

  // The status beside the answer reports each save. A save that fails after
  // the user left the tab could go unseen, so that one also leaves an error
  // toast.
  const isActiveRef = useRef(isActive);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  const autosave = useAnswerAutosave({
    save: async (id, answer) => {
      try {
        return await apiFetch('/api/es-entries', { method: 'PUT', body: { id, answer } });
      } catch (error) {
        if (!isActiveRef.current) {
          onShowToast?.(`ESの回答を保存できませんでした。ESメモに戻ると入力内容が残っています。${error.message}`, { tone: 'error' });
        }
        throw error;
      }
    },
    onSaved: onEntrySaved,
  });
  const { drafts, statuses, flush, flushAll, reset, getError } = autosave;
  const valueOf = entry => (Object.hasOwn(drafts, String(entry.id)) ? drafts[String(entry.id)] : entry.answer || '');

  const threads = useMemo(() => sortQuestionThreads(buildQuestionThreads(entries), events, { today: parseLocalDate(today) }), [entries, events, today]);
  const unansweredTotal = threads.filter(thread => thread.unansweredCount > 0).length;

  const filteredThreads = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return threads.filter(thread => {
      if (filterCompanyId && !thread.entries.some(entry => getEntryCompanyIds(entry).includes(filterCompanyId))) return false;
      if (filterCategory !== 'all' && thread.category !== filterCategory) return false;
      // The question being written stays listed after its last blank is
      // filled in, so answering does not pull it away mid-sentence.
      if (answerFilter === 'unanswered' && thread.unansweredCount === 0 && thread.id !== selectedId) return false;
      if (!q) return true;
      return (
        thread.question.toLowerCase().includes(q)
        || thread.category.toLowerCase().includes(q)
        || thread.companyNames.join(' ').toLowerCase().includes(q)
        || thread.entries.some(entry => (entry.answer || '').toLowerCase().includes(q))
      );
    });
  }, [threads, searchQ, filterCategory, filterCompanyId, answerFilter, selectedId]);

  const selectedThread = filteredThreads.find(thread => thread.id === selectedId) || filteredThreads[0] || null;
  const activeId = selectedThread?.id || '';

  const height = usePaneHeight(panelRef, toolbarRef, isActive, [filteredThreads.length > 0, entries.length > 0]);

  // Leaving the tab sends whatever is still waiting.
  useEffect(() => {
    if (!isActive) flushAll();
  }, [isActive, flushAll]);

  // Logout must wait for pending answers while authentication still exists.
  // A failed save returns false so the page can keep the editor and its draft.
  useEffect(() => {
    onRegisterBeforeLeave?.(flushAll);
    return () => onRegisterBeforeLeave?.(null);
  }, [flushAll, onRegisterBeforeLeave]);

  const changeAnswer = (entry, value) => {
    // The first visible thread is a fallback until the user clicks a row.
    // Anchor it before saving changes the unanswered-first sort order.
    const threadId = getEntryThreadKey(entry);
    setSelectedId(threadId);
    writeStorage(SELECTED_THREAD_STORAGE_KEY, threadId);
    autosave.change(entry, value);
  };

  const selectThread = useCallback((threadId, { showDetail = true } = {}) => {
    if (threadId !== activeId) {
      flushAll();
      if (detailRef.current) detailRef.current.scrollTop = 0;
    }
    setSelectedId(threadId);
    writeStorage(SELECTED_THREAD_STORAGE_KEY, threadId);
    if (showDetail) setPane('detail');
  }, [activeId, flushAll]);

  const backToList = () => {
    flushAll();
    // Show the list now so focus can return to the row that was open.
    flushSync(() => setPane('list'));
    rowRefs.current.get(activeId)?.focus();
  };

  // One-off requests from other tabs (add an ES for a company, open a
  // specific entry). The parent clears each through its onXxxDone callback,
  // so updating state here is intended.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!draftRequest) return;
    const companyId = draftRequest.companyId || '';
    setFilterCompanyId(companyId);
    setModal({
      scope: 'entry',
      entry: { question: '', answer: '', category: 'その他', char_limit: '', is_template: false, company_ids: companyId ? [companyId] : [] },
    });
    onDraftRequestDone?.();
  }, [draftRequest, onDraftRequestDone]);

  useEffect(() => {
    if (!openRequest) return;
    if (!openRequest.entryId && openRequest.companyId) {
      setFilterCompanyId(openRequest.companyId);
      setFilterCategory('all');
      setAnswerFilter('all');
      setSearchQ('');
      setSelectedId('');
      setPane('list');
      onOpenRequestDone?.();
      return;
    }
    if (!openRequest.entryId) return;
    const entry = entries.find(item => String(item.id) === String(openRequest.entryId));
    if (!entry) {
      if (!loading) {
        onShowToast?.('対象のESメモが見つかりませんでした。削除された可能性があります', { tone: 'error' });
        onOpenRequestDone?.();
      }
      return;
    }
    // Clear whatever filter would hide the entry, then select its question
    // and put the cursor in its answer.
    const companyIds = getEntryCompanyIds(entry);
    setFilterCompanyId(prev => (prev && !companyIds.includes(prev) ? '' : prev));
    setFilterCategory('all');
    setSearchQ('');
    if (!isAnswerEmpty(entry)) setAnswerFilter('all');
    const threadId = getEntryThreadKey(entry);
    flushAll();
    setSelectedId(threadId);
    writeStorage(SELECTED_THREAD_STORAGE_KEY, threadId);
    setPane('detail');
    setFocusRequest({ entryId: String(entry.id) });
    onOpenRequestDone?.();
  }, [entries, flushAll, loading, onOpenRequestDone, onShowToast, openRequest]);

  useEffect(() => {
    if (!focusRequest || !isActive) return;
    const input = inputRefs.current.get(focusRequest.entryId);
    if (!input) return;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: 'nearest' });
    const end = input.value.length;
    input.setSelectionRange(end, end);
    setFocusRequest(null);
  }, [focusRequest, isActive, activeId, entries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openEntryModal = async (entry) => {
    await flush(entry.id);
    setModal({ scope: 'entry', entry: { ...entry, answer: valueOf(entry) } });
  };

  const openQuestionModal = async (thread) => {
    await flushAll();
    setModal({ scope: 'question', thread, entry: thread.entries[0] });
  };

  const addAnswer = (thread) => {
    flushAll();
    setModal({
      scope: 'entry',
      entry: {
        question: thread.question,
        answer: '',
        char_limit: thread.char_limit || '',
        category: normalizeCategory(thread.category),
        is_template: false,
        sort_order: 0,
        company_ids: filterCompanyId ? [filterCompanyId] : [],
        ...(getPersistedThreadId(thread) ? { thread_id: getPersistedThreadId(thread) } : {}),
      },
    });
  };

  const saveEntry = async (formData) => {
    try {
      const isEdit = !!formData.id;
      const { companies: _c, company_names: _n, ...cleanData } = formData;
      const savedEntry = await apiFetch('/api/es-entries', { method: isEdit ? 'PUT' : 'POST', body: cleanData });
      if (isEdit) reset(formData.id);
      onShowToast(isEdit ? 'ES回答を更新しました' : 'ES回答を追加しました');
      onEntrySaved?.(savedEntry);
      setModal(null);
      if (savedEntry?.id) {
        const threadId = getEntryThreadKey(savedEntry);
        setSelectedId(threadId);
        writeStorage(SELECTED_THREAD_STORAGE_KEY, threadId);
        setPane('detail');
        setFocusRequest({ entryId: String(savedEntry.id) });
      }
    } catch (e) {
      onShowToast(`ES回答を保存できませんでした。入力内容はそのまま残っています。${e.message}`, { tone: 'error' });
    }
  };

  // One database transaction updates every answer, so a failed rename never
  // splits a question into old and new threads.
  const saveQuestion = async (thread, fields) => {
    try {
      const saved = await apiFetch('/api/es-question-threads', {
        method: 'PUT',
        body: { entry_ids: thread.entries.map(entry => entry.id), ...fields },
      });
      saved.forEach(entry => onEntrySaved?.(entry));
      onShowToast('設問を更新しました');
      setModal(null);
      if (saved[0]) {
        const threadId = getEntryThreadKey(saved[0]);
        setSelectedId(threadId);
        writeStorage(SELECTED_THREAD_STORAGE_KEY, threadId);
      }
    } catch (e) {
      onShowToast(`設問を保存できませんでした。入力内容はそのまま残っています。${e.message}`, { tone: 'error' });
    }
  };

  const deleteEntry = async (id) => {
    setDeleteEntryId(null);
    try {
      await apiFetch(`/api/es-entries?id=${id}`, { method: 'DELETE' });
      reset(id);
      onShowToast('ES回答を削除しました');
      onEntryDeleted?.(id);
    } catch (e) {
      onShowToast(`ES回答を削除できませんでした。${e.message}`, { tone: 'error' });
    }
  };

  const copyAnswer = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => onShowToast('回答をコピーしました'))
      .catch(() => onShowToast('コピーできませんでした。手動で選択してください', { tone: 'error' }));
  };

  // Switching to 未回答 moves off a fully answered question; only a question
  // answered while it is open stays listed.
  const showUnanswered = () => {
    if (selectedThread && selectedThread.unansweredCount === 0) {
      flushAll();
      setSelectedId('');
    }
    setAnswerFilter('unanswered');
  };

  const clearFilters = () => {
    setFilterCompanyId('');
    setFilterCategory('all');
    setAnswerFilter('all');
    setSearchQ('');
  };

  const openNewEntry = () => {
    flushAll();
    setModal({ scope: 'entry', entry: { category: 'その他', company_ids: filterCompanyId ? [filterCompanyId] : [] } });
  };

  const renderList = () => (
    <ul className="split-list-items" aria-label="設問の一覧">
      {filteredThreads.map(thread => {
        const quote = getDeadlineQuote(thread.deadline);
        const deadlineEvent = thread.deadline?.event;
        return (
          <li key={thread.id}>
            <button
              type="button"
              className="split-row es-row"
              aria-current={thread.id === activeId ? 'true' : undefined}
              ref={element => {
                if (element) rowRefs.current.set(thread.id, element);
                else rowRefs.current.delete(thread.id);
              }}
              onClick={() => selectThread(thread.id)}
            >
              <span className="es-row-question">{thread.question}</span>
              <span className="split-row-meta">
                <span className="split-row-meta-text">{thread.category} · {thread.companyLabel}</span>
                {thread.unansweredCount > 0 ? (
                  <span className="split-row-status">未回答 <span className="split-row-count">{thread.unansweredCount}</span></span>
                ) : (
                  <span className="split-row-status split-row-status--quiet">{thread.entries.length}件</span>
                )}
                {quote && (
                  <span
                    className={`quote quote--${quote.tone}`}
                    title={deadlineEvent ? `締切：${deadlineEvent.title}（${formatShortDate(deadlineEvent.start_date)}）` : undefined}
                  >{quote.text}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const renderDetail = () => {
    if (!selectedThread) return null;
    const thread = selectedThread;
    return (
      <div className="split-detail-inner">
        <header className="split-detail-head">
          <div className="split-detail-heading">
            <h2 className="split-detail-title">{thread.question}</h2>
            <p className="split-detail-meta">
              <span>{thread.category}</span>
              <span>{thread.char_limit ? `上限${thread.char_limit}字` : '文字数上限なし'}</span>
            </p>
          </div>
          <button className="btn btn-sm" type="button" onClick={() => openQuestionModal(thread)}>
            <Icon name="pencil" size="sm" /> 設問を編集
          </button>
        </header>
        {thread.entries.map(entry => (
          <AnswerSection
            key={entry.id}
            entry={entry}
            value={valueOf(entry)}
            status={statuses[String(entry.id)]}
            error={getError(entry.id)}
            isActive={isActive}
            inputRef={element => {
              if (element) inputRefs.current.set(String(entry.id), element);
              else inputRefs.current.delete(String(entry.id));
            }}
            onChange={value => changeAnswer(entry, value)}
            onBlur={() => flush(entry.id)}
            onRetry={() => flush(entry.id)}
            onCopy={copyAnswer}
            onEdit={() => openEntryModal(entry)}
            onDelete={() => setDeleteEntryId(entry.id)}
          />
        ))}
        <div className="split-detail-foot">
          <button className="btn btn-sm" type="button" onClick={() => addAnswer(thread)}>
            <Icon name="plus" size="sm" /> 別の企業の回答を追加
          </button>
        </div>
      </div>
    );
  };

  const showSpinner = loading && entries.length === 0;

  return (
    <div className="es-memo-view" data-split-pane={pane}>
      <div className="view-toolbar" ref={toolbarRef}>
        <h1 className="view-title">ESメモ</h1>
        <div className="filter-bar">
          <div className="filter-group">
            <label className="filter-label" htmlFor={companySelectId}>企業</label>
            <select
              id={companySelectId}
              className="filter-select"
              value={filterCompanyId}
              onChange={e => setFilterCompanyId(e.target.value)}
            >
              <option value="">すべての企業</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label" htmlFor={categorySelectId}>カテゴリ</label>
            <select
              id={categorySelectId}
              className="filter-select"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            >
              <option value="all">すべて</option>
              {ES_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label" id={answerGroupId}>回答</span>
            <div className="segmented" role="group" aria-labelledby={answerGroupId}>
              <button type="button" aria-pressed={answerFilter === 'all'} onClick={() => setAnswerFilter('all')}>すべて</button>
              <button type="button" aria-pressed={answerFilter === 'unanswered'} onClick={showUnanswered}>
                未回答{unansweredTotal > 0 ? ` ${unansweredTotal}` : ''}
              </button>
            </div>
          </div>
          <input
            type="search"
            className="filter-select toolbar-search"
            placeholder="設問・回答・企業を検索"
            aria-label="設問・回答・企業を検索"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-primary" type="button" onClick={openNewEntry}>
            <Icon name="plus" /> ES回答を追加
          </button>
        </div>
      </div>

      {showSpinner ? (
        <div className="es-loading" role="status"><div className="spinner" /><span>読み込み中…</span></div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <Icon name="file" />
          <div className="empty-state-text">
            ESの設問と回答をここにまとめます。設問ごとに、企業別の回答を並べて書けます。
          </div>
          <button className="btn btn-primary" type="button" onClick={openNewEntry}>
            <Icon name="plus" /> 最初のES回答を追加
          </button>
        </div>
      ) : filteredThreads.length === 0 ? (
        <div className="empty-state">
          <Icon name="search" />
          <div className="empty-state-text">条件に一致する設問がありません。</div>
          <button className="btn" type="button" onClick={clearFilters}>絞り込みを解除</button>
        </div>
      ) : (
        <div
          className="split-view"
          data-pane={pane}
          ref={panelRef}
          style={{ '--split-height': `${height}px` }}
        >
          <div className="split-list">
            {renderList()}
          </div>
          <div className="split-detail" ref={detailRef}>
            <button className="split-back" type="button" onClick={backToList}>
              <Icon name="chevronLeft" size="sm" /> 一覧に戻る
            </button>
            {renderDetail()}
          </div>
        </div>
      )}

      {modal && (
        <ESEntryModal
          key={modal.entry?.id || 'new'}
          entry={modal.entry}
          scope={modal.scope}
          companies={companies}
          defaultCompanyIds={filterCompanyId ? [filterCompanyId] : []}
          onClose={() => setModal(null)}
          onSave={modal.scope === 'question' ? fields => saveQuestion(modal.thread, fields) : saveEntry}
        />
      )}
      {deleteEntryId !== null && (
        <ConfirmDialog
          title="ES回答を削除"
          message="この回答を削除しますか？"
          confirmLabel="削除"
          onCancel={() => setDeleteEntryId(null)}
          onConfirm={() => deleteEntry(deleteEntryId)}
        />
      )}
    </div>
  );
}
