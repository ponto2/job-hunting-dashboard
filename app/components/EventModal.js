'use client';

import { useId, useRef, useState } from 'react';
import { EVENT_TYPE_CONFIG, EVENT_TYPES } from '../lib/constants';
import { formatDateInput } from '@/lib/date';
import { isEventDone } from '@/lib/events';
import { SELECTION_KINDS, getCompanySelections, getSelectionStatusLabel } from '@/lib/selections';
import ConfirmDialog from './ConfirmDialog';
import ModalFrame from './ModalFrame';
import Icon from './Icon';

function buildEventForm(event, defaultDate, initialCompanyId) {
  if (event) {
    return {
      title: event.title || '',
      event_type: event.event_type || 'deadline',
      start_date: event.start_date || '',
      end_date: event.end_date || '',
      start_time: event.start_time?.slice(0, 5) || '',
      end_time: event.end_time?.slice(0, 5) || '',
      company_id: event.company_id || '',
      selection_id: event.selection_id || '',
      memo: event.memo || '',
      done: isEventDone(event),
    };
  }
  return {
    title: '',
    event_type: 'deadline',
    start_date: defaultDate || formatDateInput(),
    end_date: '',
    start_time: '',
    end_time: '',
    company_id: initialCompanyId || '',
    selection_id: '',
    memo: '',
    done: false,
  };
}

// 'インターン · 冬インターン（面接中）'
function selectionOptionLabel(selection) {
  const kind = SELECTION_KINDS[selection.kind]?.label || SELECTION_KINDS.unclassified.label;
  const title = selection.title?.trim();
  return `${kind}${title ? ` · ${title}` : ''}（${getSelectionStatusLabel(selection.status, selection.kind)}）`;
}

export default function EventModal({ event, defaultDate, companies, onClose, onSave, onDelete, initialCompanyId }) {
  const isEdit = !!event?.id;
  const fieldId = useId();

  // Callers give each event its own `key`, so opening a different event
  // mounts a fresh form instead of resetting this one.
  const [initialForm] = useState(() => buildEventForm(event, defaultDate, initialCompanyId));
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const selectionsOf = companyId => getCompanySelections(companies.find(c => String(c.id) === String(companyId)));
  const companySelections = form.company_id ? selectionsOf(form.company_id) : [];
  // A selection from another company never stays linked.
  const changeCompany = companyId => setForm(prev => ({
    ...prev,
    company_id: companyId,
    selection_id: selectionsOf(companyId).some(s => String(s.id) === String(prev.selection_id)) ? prev.selection_id : '',
  }));

  const close = () => { if (!busyRef.current) onClose(); };

  const handleSave = async () => {
    if (busyRef.current) return;
    if (!form.title.trim() || !form.start_date) {
      setError('タイトルと開始日は必須です');
      return;
    }
    if (form.end_date && form.end_date < form.start_date) {
      setError('終了日は開始日以降にしてください');
      return;
    }
    if (form.end_time && !form.start_time) {
      setError('終了時刻を指定する場合は開始・締切時刻も入力してください');
      return;
    }
    if (form.start_time && form.end_time && (!form.end_date || form.end_date === form.start_date) && form.end_time < form.start_time) {
      setError('終了時刻は開始時刻以降にしてください');
      return;
    }
    busyRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, start_time: form.start_time || null, end_time: form.end_time || null, id: event?.id });
    } catch (cause) {
      setError(cause.message || 'イベントを保存できませんでした');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setConfirmDelete(false);
    try {
      await onDelete(event.id);
    } catch (cause) {
      setError(cause.message || 'イベントを削除できませんでした');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <ModalFrame
        title={isEdit ? 'イベントを編集' : 'イベントを追加'}
        onClose={close}
        isDirty={!saving && isDirty}
        maxWidth={520}
        footer={({ requestClose }) => (
          <>
            {isEdit && (
              <button className="btn btn-danger btn-sm modal-footer-danger" type="button" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Icon name="trash" size="sm" /> 削除
              </button>
            )}
            <button className="btn" type="button" onClick={requestClose} disabled={saving}>キャンセル</button>
            <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
              {saving ? <><div className="spinner" /> 保存中...</> : <><Icon name="save" /> 保存</>}
            </button>
          </>
        )}
      >
          {error && <div className="form-error" role="alert">{error}</div>}
          <fieldset className="event-form-fields" disabled={saving} aria-busy={saving}>
          {/* タイトル */}
          <div className="form-group">
            <label className="form-label" htmlFor={`${fieldId}-title`}>タイトル *</label>
            <input
              id={`${fieldId}-title`}
              className="form-input"
              placeholder="例: ES締切、1次面接、夏インターン..."
              value={form.title}
              onChange={e => { set('title', e.target.value); if (error) setError(''); }}
              autoFocus
            />
          </div>

          {/* イベントタイプ */}
          <div className="form-group" role="group" aria-labelledby={`${fieldId}-type`}>
            <div className="form-label" id={`${fieldId}-type`}>イベントタイプ *</div>
            <div className="event-type-selector">
              {EVENT_TYPES.map(type => {
                const c = EVENT_TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    type="button"
                    className={`event-type-btn${form.event_type === type ? ' active' : ''}`}
                    style={form.event_type === type ? { borderColor: c.color, background: c.bg, color: c.color } : {}}
                    onClick={() => set('event_type', type)}
                    aria-pressed={form.event_type === type}
                  >
                    <span className="legend-dot" style={{ background: c.color }} aria-hidden="true" />{c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 日付 */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor={`${fieldId}-start`}>開始日 *</label>
              <input
                id={`${fieldId}-start`}
                className="form-input"
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${fieldId}-end`}>終了日（任意）</label>
              <input
                id={`${fieldId}-end`}
                className="form-input"
                type="date"
                value={form.end_date}
                min={form.start_date}
                onChange={e => set('end_date', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor={`${fieldId}-start-time`}>開始・締切時刻（任意）</label>
              <input id={`${fieldId}-start-time`} className="form-input" type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} aria-describedby={`${fieldId}-time-hint`} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`${fieldId}-end-time`}>終了時刻（任意）</label>
              <input id={`${fieldId}-end-time`} className="form-input" type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} aria-describedby={`${fieldId}-time-hint`} />
            </div>
          </div>
          <p className="form-hint" id={`${fieldId}-time-hint`}>時刻は日本時間（Asia/Tokyo）です。空欄なら日付だけの予定として保存します。</p>

          {/* 紐づけ企業 */}
          <div className="form-group">
            <label className="form-label" htmlFor={`${fieldId}-company`}>企業（任意）</label>
            <select
              id={`${fieldId}-company`}
              className="form-select"
              value={form.company_id}
              onChange={e => changeCompany(e.target.value)}
            >
              <option value="">企業を選択しない</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* 紐づけ選考 */}
          {companySelections.length > 0 && (
            <div className="form-group">
              <label className="form-label" htmlFor={`${fieldId}-selection`}>選考（任意）</label>
              <select
                id={`${fieldId}-selection`}
                className="form-select"
                value={form.selection_id}
                onChange={e => set('selection_id', e.target.value)}
                aria-describedby={companySelections.length >= 2 && !form.selection_id ? `${fieldId}-selection-hint` : undefined}
              >
                <option value="">選考を指定しない</option>
                {companySelections.map(selection => (
                  <option key={selection.id} value={selection.id}>{selectionOptionLabel(selection)}</option>
                ))}
              </select>
              {companySelections.length >= 2 && !form.selection_id && (
                <p className="form-hint" id={`${fieldId}-selection-hint`}>選考を指定すると、その選考のカードにだけ期限が表示されます。</p>
              )}
            </div>
          )}

          {/* メモ */}
          <div className="form-group">
            <label className="form-label" htmlFor={`${fieldId}-memo`}>メモ（任意）</label>
            <textarea
              id={`${fieldId}-memo`}
              className="form-textarea"
              rows={3}
              placeholder="詳細メモ..."
              value={form.memo}
              onChange={e => set('memo', e.target.value)}
            />
          </div>

          {/* 完了 */}
          <div className="form-group">
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.done}
                onChange={e => set('done', e.target.checked)}
                aria-describedby={`${fieldId}-done-hint`}
              />
              <span>完了済みにする</span>
            </label>
            <p className="form-hint" id={`${fieldId}-done-hint`}>要確認と、カードの期限表示から外れます。</p>
          </div>
          </fieldset>
      </ModalFrame>
      {confirmDelete && (
        <ConfirmDialog
          title="イベントを削除"
          message="このイベントを削除しますか？"
          confirmLabel="削除"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
