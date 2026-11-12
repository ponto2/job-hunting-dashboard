'use client';

import { cloneElement, useId, useMemo, useRef, useState } from 'react';
import { INDUSTRY_CONFIG } from '../lib/constants';
import { formatDateInput } from '@/lib/date';
import ModalFrame from './ModalFrame';
import Icon from './Icon';
import ResearchSources from './ResearchSources';
import { validateCompanyInput } from '@/lib/validation';

// A labelled field: the label is tied to its one input, select or textarea.
function FG({ label, children }) {
  const id = useId();
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}

export default function EditModal({ company, companies = [], onClose, onSave, title }) {
  const isEdit = !!company.id;
  const [initialForm] = useState(() => ({
    name: '', industry: '', headquarters: '', employees: '', founded: '', revenue: '',
    business: '', products: '', salary_master_start: '', salary_average: '',
    overtime_hours: '', paid_leave_rate: '', turnover_rate: '', benefits: '',
    intern_period: '', intern_duration: '', intern_content: '', intern_selection: '',
    intern_url: '', interest: 3, notes: '', memo: '',
    official_url: '', recruit_url: '', ...Object.fromEntries(Object.entries(company).map(([key,value]) => [key, key === 'research_sources' ? (value || []) : (value ?? '')])),
  }));
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Guards a second click that lands before the disabled state renders.
  const savingRef = useRef(false);
  const industryListId = useId();
  const interestLabelId = useId();
  // Industries already in use first, then the configured ones.
  const industryOptions = useMemo(() => [...new Set([
    ...companies.map(c => c.industry?.trim()).filter(Boolean),
    ...Object.keys(INDUSTRY_CONFIG),
  ])], [companies]);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (savingRef.current) return;
    if (!form.name?.trim() || !form.industry?.trim()) {
      setError('企業名と業界は必須です');
      return;
    }
    const data = { ...form, research_date: form.research_date || formatDateInput() };
    delete data.status;
    delete data.selections;
    const checked = validateCompanyInput(data, { update: isEdit });
    if (checked.error) { setError(checked.error); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(data);
    } finally {
      // The modal usually unmounts on success; this only matters on failure.
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <ModalFrame
      title={title || (isEdit ? '企業を編集' : '企業を追加')}
      onClose={() => { if (!savingRef.current) onClose(); }}
      isDirty={!saving && isDirty}
      footer={({ requestClose }) => (
        <>
          <button className="btn" type="button" disabled={saving} onClick={requestClose}>キャンセル</button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? <><div className="spinner" /> 保存中…</> : <><Icon name="save" /> 保存</>}
          </button>
        </>
      )}
    >
          {error && <div className="form-error" role="alert">{error}</div>}
          <ResearchSources sources={form.research_sources} />
          <div className="form-section-title">基本情報</div>
          <FG label="企業名 *"><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} /></FG>
          <div className="form-row">
            <FG label="業界 *"><input className="form-input" value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="例: 半導体" list={industryListId} autoComplete="off" /></FG>
            <FG label="本社所在地"><input className="form-input" value={form.headquarters} onChange={e => set('headquarters', e.target.value)} /></FG>
          </div>
          <div className="form-row-3">
            <FG label="従業員数"><input className="form-input" value={form.employees} onChange={e => set('employees', e.target.value)} /></FG>
            <FG label="設立年"><input className="form-input" value={form.founded} onChange={e => set('founded', e.target.value)} /></FG>
            <FG label="売上高"><input className="form-input" value={form.revenue} onChange={e => set('revenue', e.target.value)} /></FG>
          </div>
          <FG label="事業概要"><textarea className="form-textarea" value={form.business} onChange={e => set('business', e.target.value)} rows={3} /></FG>
          <FG label="主要プロダクト"><input className="form-input" value={form.products} onChange={e => set('products', e.target.value)} /></FG>

          <div className="form-section-title">待遇・WLB</div>
          <div className="form-row">
            <FG label="初任給"><input className="form-input" value={form.salary_master_start} onChange={e => set('salary_master_start', e.target.value)} /></FG>
            <FG label="平均年収"><input className="form-input" value={form.salary_average} onChange={e => set('salary_average', e.target.value)} /></FG>
          </div>
          <div className="form-row-3">
            <FG label="月平均残業"><input className="form-input" value={form.overtime_hours} onChange={e => set('overtime_hours', e.target.value)} /></FG>
            <FG label="有休消化率"><input className="form-input" value={form.paid_leave_rate} onChange={e => set('paid_leave_rate', e.target.value)} /></FG>
            <FG label="離職率"><input className="form-input" value={form.turnover_rate} onChange={e => set('turnover_rate', e.target.value)} /></FG>
          </div>
          <FG label="福利厚生"><textarea className="form-textarea" value={form.benefits} onChange={e => set('benefits', e.target.value)} rows={2} /></FG>

          <div className="form-section-title">インターンシップ</div>
          <div className="form-row">
            <FG label="募集時期"><input className="form-input" value={form.intern_period} onChange={e => set('intern_period', e.target.value)} /></FG>
            <FG label="期間"><input className="form-input" value={form.intern_duration} onChange={e => set('intern_duration', e.target.value)} /></FG>
          </div>
          <FG label="内容概要"><textarea className="form-textarea" value={form.intern_content} onChange={e => set('intern_content', e.target.value)} rows={2} /></FG>
          <FG label="選考フロー"><input className="form-input" value={form.intern_selection} onChange={e => set('intern_selection', e.target.value)} /></FG>
          <FG label="募集ページURL"><input className="form-input" value={form.intern_url} onChange={e => set('intern_url', e.target.value)} /></FG>

          <datalist id={industryListId}>
            {industryOptions.map(industry => <option key={industry} value={industry} />)}
          </datalist>

          <div className="form-section-title">志望度</div>
          <div className="form-group" role="group" aria-labelledby={interestLabelId}>
            <div className="form-label" id={interestLabelId}>志望度</div>
            <div className="interest-input">
              {[1, 2, 3, 4, 5].map(v => (
                <button key={v} type="button" className={`interest-star${v <= form.interest ? ' active' : ''}`} onClick={() => set('interest', v)} aria-label={`志望度 ${v}`} aria-pressed={v === form.interest} />
              ))}
            </div>
          </div>

          <div className="form-section-title">個人メモ</div>
          <FG label="メモ（エントリー開始時期など）"><textarea className="form-textarea" value={form.memo} onChange={e => set('memo', e.target.value)} rows={3} placeholder="例: インターンエントリー 6/1開始、ES締切 7/15" /></FG>

          <div className="form-section-title">リンク・その他</div>
          <div className="form-row">
            <FG label="公式サイトURL"><input className="form-input" value={form.official_url} onChange={e => set('official_url', e.target.value)} /></FG>
            <FG label="採用ページURL"><input className="form-input" value={form.recruit_url} onChange={e => set('recruit_url', e.target.value)} /></FG>
          </div>
          <FG label="AIリサーチメモ"><textarea className="form-textarea" value={form.notes} onChange={e => set('notes', e.target.value)} rows={4} /></FG>
    </ModalFrame>
  );
}
