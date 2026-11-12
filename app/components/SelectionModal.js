'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { SELECTION_KINDS, SELECTION_STATUSES, getSelectionStatusLabel } from '@/lib/selections';
import { normalizeStatus } from '@/lib/status';
import ModalFrame from './ModalFrame';
import './Selections.css';

export default function SelectionModal({
  selection = null,
  companies = [],
  initialCompanyId,
  initialKind = 'internship',
  onSave,
  onDelete,
  onClose,
  saving = false,
}) {
  const formId = useId();
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [initialForm] = useState(() => ({
    company_id: selection?.company_id || initialCompanyId || '',
    kind: selection?.kind || initialKind,
    title: selection?.title || '',
    status: normalizeStatus(selection?.status),
  }));
  const [form, setForm] = useState(initialForm);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const busy = saving || pending;
  const company = companies.find(item => String(item.id) === String(form.company_id));
  const close = useCallback(() => { if (!busyRef.current && !saving) onClose(); }, [onClose, saving]);
  const setField = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current || saving) return;
    if (!form.company_id || !company) {
      setError('企業を選択してください。');
      return;
    }
    if (!['internship', 'fulltime'].includes(form.kind)) {
      setError('インターンまたは本選考を選択してください。');
      return;
    }
    setError('');
    busyRef.current = true;
    setPending(true);
    try {
      const data = { ...form, title: form.title.trim() };
      if (selection?.id) {
        data.id = selection.id;
        delete data.company_id;
      }
      await onSave(data);
    } catch (cause) {
      setError(cause?.message || '選考の保存に失敗しました。もう一度お試しください。');
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  };

  const remove = async () => {
    if (busyRef.current || saving || !onDelete) return;
    busyRef.current = true;
    setPending(true);
    setError('');
    try {
      await onDelete(selection);
    } catch (cause) {
      setError(cause?.message || '選考の削除に失敗しました。もう一度お試しください。');
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  };

  return (
    <ModalFrame
      title={confirmDelete ? '選考を削除' : selection ? '選考を編集' : '選考を追加'}
      onClose={close}
      isDirty={isDirty && !confirmDelete}
      maxWidth={560}
      footer={({ requestClose }) => (
        <div className="selection-modal-actions">
          {selection && onDelete && !confirmDelete && (
            <button className="btn btn-danger btn-sm selection-delete-button" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>選考を削除</button>
          )}
          <button className="btn" type="button" disabled={busy} onClick={confirmDelete ? () => setConfirmDelete(false) : requestClose}>{confirmDelete ? '戻る' : 'キャンセル'}</button>
          {confirmDelete ? (
            <button className="btn btn-danger" type="button" disabled={busy} onClick={remove}>{busy ? '削除中…' : 'この選考を削除'}</button>
          ) : (
            <button className="btn btn-primary" type="submit" form={formId} disabled={busy || companies.length === 0}>{busy ? '保存中…' : '保存'}</button>
          )}
        </div>
      )}
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      {confirmDelete ? (
        <p className="confirm-message">{company?.name}の「{selection.title || SELECTION_KINDS[selection.kind]?.label || '選考'}」を削除します。企業情報と、ほかの選考は残ります。</p>
      ) : (
        <form id={formId} onSubmit={submit}>
          <p className="selection-form-description">企業ごとに複数の選考を登録できます。進捗は選考ごとに管理し、企業情報や志望度は共通です。</p>
          {companies.length === 0 && <p className="form-error">先に企業を追加してください。</p>}
          <div className="form-group">
            <label className="form-label" htmlFor={`${formId}-company`}>企業 *</label>
            <select id={`${formId}-company`} className="form-select" value={form.company_id} disabled={Boolean(selection) || busy} required onChange={event => setField('company_id', event.target.value)}>
              <option value="">企業を選択</option>
              {companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${formId}-kind`}>選考種別 *</label>
            <select id={`${formId}-kind`} className="form-select" value={form.kind} disabled={busy} required onChange={event => setField('kind', event.target.value)}>
              {form.kind === 'unclassified' && <option value="unclassified" disabled>種別を選択してください</option>}
              <option value="internship">インターン</option>
              <option value="fulltime">本選考</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${formId}-title`}>選考名（任意）</label>
            <input id={`${formId}-title`} className="form-input" value={form.title} disabled={busy} maxLength={120} placeholder={form.kind === 'fulltime' ? '例：技術職・早期選考' : '例：夏インターン・開発職'} onChange={event => setField('title', event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${formId}-status`}>ステータス</label>
            <select id={`${formId}-status`} className="form-select" value={form.status} disabled={busy} onChange={event => setField('status', event.target.value)}>
              {SELECTION_STATUSES.map(status => <option key={status} value={status}>{getSelectionStatusLabel(status, form.kind)}</option>)}
            </select>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}
