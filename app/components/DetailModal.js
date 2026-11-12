'use client';

import { STATUS_CONFIG, IndustryTag, Stars } from '../lib/constants';
import { useToday } from '../lib/use-today';
import { parseLocalDate, daysUntil, formatDueLabel, formatFullDate, formatShortDate } from '@/lib/date';
import { isEventDone } from '@/lib/events';
import { SELECTION_KINDS, getCompanySelections, getSelectionStatusLabel } from '@/lib/selections';
import { isHttpUrl } from '@/lib/validation';
import ModalFrame from './ModalFrame';
import './Selections.css';
import Icon from './Icon';
import ResearchSources from './ResearchSources';

function countCharsWithoutNewlines(text) {
  return (text || '').replace(/\r?\n/g, '').length;
}

// Stored URLs may predate validation, so only http(s) links become clickable.
function ExternalLink({ url, children }) {
  if (!isHttpUrl(url)) return url || '-';
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="detail-link">
      {children}
    </a>
  );
}

// Open events from today on, nearest first, then done or past events, most
// recent first; five in all.
function pickRelatedEvents(events, today) {
  const withDays = events.map(event => ({ event, days: daysUntil(event.start_date, today) }));
  const upcoming = withDays
    .filter(({ event, days }) => !isEventDone(event) && days !== null && days >= 0)
    .sort((a, b) => String(a.event.start_date).localeCompare(String(b.event.start_date)));
  const rest = withDays
    .filter(item => !upcoming.includes(item))
    .sort((a, b) => String(b.event.start_date).localeCompare(String(a.event.start_date)));
  return [...upcoming, ...rest].slice(0, 5);
}

// 'あと2日' ahead; behind, an open deadline is overdue and anything else
// simply happened.
function relatedEventDue(event, days) {
  if (isEventDone(event)) return '完了';
  if (days === null || Number.isNaN(days)) return '';
  if (days < 0 && event.event_type !== 'deadline') return `${-days}日前`;
  return formatDueLabel(days);
}

function DI({ label, value, full }) {
  return (
    <div className={`detail-item${full ? ' detail-full' : ''}`}>
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value || '-'}</div>
    </div>
  );
}

export default function DetailModal({
  company: c,
  onClose,
  onEdit,
  onDelete,
  onAddToCalendar,
  onAddES,
  onOpenES,
  onAddSelection,
  onEditSelection,
  relatedEvents = [],
  relatedEsEntries = [],
}) {
  const today = useToday();
  const selections = getCompanySelections(c);
  const upcomingEvents = pickRelatedEvents(relatedEvents, parseLocalDate(today));
  const selectionNames = new Map(selections.map(selection => [
    String(selection.id),
    selection.title?.trim() || (SELECTION_KINDS[selection.kind] || SELECTION_KINDS.unclassified).label,
  ]));
  const relatedEs = [...relatedEsEntries]
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .slice(0, 5);

  return (
    <ModalFrame
      title={c.name}
      onClose={onClose}
      footer={(
        <div className="detail-modal-footer">
          <div className="detail-modal-footer-left">
            <button className="btn btn-danger btn-sm" type="button" onClick={onDelete}><Icon name="trash" size="sm" /> 削除</button>
          </div>
          <div className="detail-modal-footer-right">
            <button className="btn" type="button" onClick={onAddToCalendar}><Icon name="calendar" /> カレンダーに追加</button>
            <button className="btn" type="button" onClick={onAddES}><Icon name="file" /> ESを追加</button>
            <button className="btn btn-primary" type="button" onClick={onEdit}><Icon name="pencil" /> 編集</button>
          </div>
        </div>
      )}
    >
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18,flexWrap:'wrap'}}>
            <Stars count={c.interest || 0} />
            <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:'auto'}}>リサーチ日: {formatFullDate(c.research_date) || c.research_date || '-'}</span>
          </div>

          <div className="detail-section-title detail-section-title--with-action">
            <span>選考状況 <span className="selection-empty-label">{selections.length}件</span></span>
            {onAddSelection && <button className="btn btn-sm" type="button" onClick={onAddSelection}><Icon name="plus" size="sm" /> 選考を追加</button>}
          </div>
          <div className="company-selection-list">
            {selections.length === 0 && <div className="related-empty">選考を追加して、インターン・本選考の進捗を管理できます。</div>}
            {selections.map(selection => {
              const kind = SELECTION_KINDS[selection.kind] || SELECTION_KINDS.unclassified;
              const status = STATUS_CONFIG[selection.status] || STATUS_CONFIG['未応募'];
              return (
                <div key={selection.id} className="company-selection-item">
                  <span className="company-selection-kind" style={{ color: kind.color }}>{kind.label}</span>
                  <span className="company-selection-title">{selection.title || kind.label}</span>
                  <span className="status-badge" style={{ background: status.bg, color: status.color }}>{getSelectionStatusLabel(selection.status, selection.kind)}</span>
                  {onEditSelection && (
                    <button className="btn btn-sm" type="button" onClick={() => onEditSelection(selection)} aria-label={`${selection.title || kind.label}を編集`}>{selection.kind === 'unclassified' ? '種別を設定' : '編集'}</button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="detail-section-title">基本情報</div>
          <div className="detail-grid">
            <DI label="業界" value={<IndustryTag industry={c.industry} />} />
            <DI label="本社所在地" value={c.headquarters} />
            <DI label="従業員数" value={c.employees} />
            <DI label="設立年" value={c.founded} />
            <DI label="売上高" value={c.revenue} />
            <DI label="事業概要" value={c.business} full />
            <DI label="主要プロダクト" value={c.products} full />
          </div>

          <div className="detail-section-title">待遇・WLB</div>
          <div className="detail-grid">
            <DI label="初任給" value={c.salary_master_start} />
            <DI label="平均年収" value={c.salary_average} />
            <DI label="月平均残業時間" value={c.overtime_hours} />
            <DI label="有休消化率" value={c.paid_leave_rate} />
            <DI label="離職率" value={c.turnover_rate} />
            <DI label="福利厚生" value={c.benefits} full />
          </div>

          <div className="detail-section-title">インターンシップ</div>
          <div className="detail-grid">
            <DI label="募集時期" value={c.intern_period} />
            <DI label="期間" value={c.intern_duration} />
            <DI label="内容概要" value={c.intern_content} full />
            <DI label="選考フロー" value={c.intern_selection} />
            <DI label="募集ページ" value={<ExternalLink url={c.intern_url}>リンク <Icon name="external" size="sm" /></ExternalLink>} />
          </div>

          {(c.official_url || c.recruit_url) && <>
            <div className="detail-section-title">リンク</div>
            <div className="detail-grid">
              {c.official_url && <DI label="公式サイト" value={<ExternalLink url={c.official_url}>{c.official_url} <Icon name="external" size="sm" /></ExternalLink>} />}
              {c.recruit_url && <DI label="採用ページ" value={<ExternalLink url={c.recruit_url}>{c.recruit_url} <Icon name="external" size="sm" /></ExternalLink>} />}
            </div>
          </>}

          {c.memo && <>
            <div className="detail-section-title">個人メモ</div>
            <div className="detail-notes detail-memo">{c.memo}</div>
          </>}

          {c.notes && <>
            <div className="detail-section-title">AIリサーチメモ</div>
            <div className="detail-notes">{c.notes}</div>
          </>}

          <ResearchSources sources={c.research_sources} />
          <div className="detail-section-title">関連予定</div>
          <div className="related-list">
            {upcomingEvents.length === 0 ? (
              <div className="related-empty">この企業に紐づく予定はまだありません。</div>
            ) : upcomingEvents.map(({ event: ev, days }) => {
              const done = isEventDone(ev);
              const selectionName = ev.selection_id ? selectionNames.get(String(ev.selection_id)) : null;
              const due = relatedEventDue(ev, days);
              const date = formatShortDate(ev.start_date);
              return (
                <div key={ev.id} className={`related-item${done ? ' related-item--done' : ''}`}>
                  <span className={`related-kind related-kind--${ev.event_type}`}>
                    {ev.event_type === 'deadline' ? '締切' : ev.event_type === 'interview' ? '面接' : ev.event_type === 'internship' ? 'インターン' : '予定'}
                  </span>
                  <span className="related-title">
                    {ev.title}
                    {selectionName && <span className="related-selection">{selectionName}</span>}
                  </span>
                  <span className="related-meta">{[date, ev.start_time?.slice(0, 5), due].filter(Boolean).join(' · ')}</span>
                </div>
              );
            })}
          </div>

          <div className="detail-section-title detail-section-title--with-action">
            <span>関連ES</span>
            <button className="btn btn-sm" type="button" onClick={onOpenES}>関連ESを見る</button>
          </div>
          <div className="related-list">
            {relatedEs.length === 0 ? (
              <div className="related-empty">この企業に紐づくESメモはまだありません。</div>
            ) : relatedEs.map(entry => {
              const answered = Boolean((entry.answer || '').trim());
              return (
                <div key={entry.id} className="related-item">
                  <span className="related-kind related-kind--es">{entry.category || 'その他'}</span>
                  <span className="related-title">{entry.question}</span>
                  <span className="related-meta">{answered ? `${countCharsWithoutNewlines(entry.answer)}字` : '未回答'}</span>
                </div>
              );
            })}
          </div>
    </ModalFrame>
  );
}
