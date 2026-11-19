'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_CONFIG, Stars, getIndustryConfig } from '../lib/constants';
import { getSelectionAge, getSelectionDue } from '../lib/board';
import Icon from './Icon';
import { SELECTION_STATUSES, getSelectionStatusLabel } from '@/lib/selections';
import { isHttpUrl } from '@/lib/validation';

const DRAG_TYPE = 'application/x-job-selection';
const ENDED_STATUSES = new Set(['辞退', '不合格']);

// 合格 is the route's end; 辞退 and 不合格 left it. Both read apart from the
// open stages, arrival in green and an exit in quiet grey.
function columnState(status) {
  if (status === '合格') return 'done';
  return ENDED_STATUSES.has(status) ? 'ended' : 'open';
}

export default function KanbanBoard({
  selections, kind, onEdit, onDetail, onStatusChange, pendingIds, nextEventMap, tickedId,
  isActive, registerScroller, onHorizontalScroll, scrollLeftRef,
}) {
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const boardRef = useRef(null);
  const columns = useMemo(() => SELECTION_STATUSES.map(status => ({
    status, config: STATUS_CONFIG[status], selections: selections.filter(item => item.status === status),
  })), [selections]);
  const selectionLabels = useMemo(() => {
    const groups = new Map();
    selections.forEach(selection => {
      const companyId = selection.company.id;
      if (!groups.has(companyId)) groups.set(companyId, []);
      groups.get(companyId).push(selection);
    });
    const labels = new Map();
    groups.forEach(group => {
      if (group.length < 2) return;
      // Number unnamed selections independently of the column they occupy.
      [...group].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))
        .forEach((selection, index) => labels.set(selection.id, selection.title?.trim() || `選考${index + 1}`));
    });
    return labels;
  }, [selections]);

  const attachBoard = useCallback(element => {
    boardRef.current = element;
    registerScroller(kind, element);
  }, [kind, registerScroller]);

  useEffect(() => {
    if (!isActive) return;
    const restore = () => {
      const board = boardRef.current;
      if (board?.clientWidth) board.scrollLeft = scrollLeftRef.current;
    };
    const frame = requestAnimationFrame(restore);
    const observer = new ResizeObserver(restore);
    if (boardRef.current) observer.observe(boardRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [isActive, scrollLeftRef]);

  const endDrag = () => { setDragId(null); setDragOver(null); };
  const drop = (event, status) => {
    event.preventDefault();
    endDrag();
    // Cross-board drops must never silently change a selection's kind.
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const selection = selections.find(item => item.id === id);
    if (selection && !pendingIds.has(id) && selection.status !== status) onStatusChange(selection, status);
  };

  return (
    <div
      ref={attachBoard}
      className="kanban-board selection-board"
      role="region"
      aria-label={kind === 'internship' ? 'インターンのカンバン' : '本選考のカンバン'}
      tabIndex={0}
      onScroll={event => onHorizontalScroll(event.currentTarget)}
      onDragEnd={endDrag}
    >
      {columns.map(column => (
        <section
          key={column.status}
          className={`kanban-column kanban-column--${columnState(column.status)}${dragOver === column.status ? ' kanban-column-dragover' : ''}`}
          aria-label={getSelectionStatusLabel(column.status, kind)}
          onDragOver={event => {
            if (!dragId || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDragOver(column.status);
          }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(null); }}
          onDrop={event => drop(event, column.status)}
        >
          <div className={`kanban-column-header kanban-column-header--${columnState(column.status)}`}>
            <span className="kanban-column-title">{getSelectionStatusLabel(column.status, kind)}</span>
            <span className="kanban-column-count">{column.selections.length}</span>
          </div>
          <div className="kanban-column-body" tabIndex={0} aria-label={`${getSelectionStatusLabel(column.status, kind)}の選考一覧`}>
            {!column.selections.length && <div className="kanban-empty" aria-hidden="true">—</div>}
            {column.selections.map(selection => {
              const company = selection.company;
              const pending = pendingIds.has(selection.id);
              const label = kind === 'internship' ? 'インターン' : '本選考';
              const selectionLabel = selectionLabels.get(selection.id);
              const url = isHttpUrl(company.recruit_url) ? company.recruit_url : null;
              const due = getSelectionDue(selection, nextEventMap?.get(String(selection.id)));
              const age = getSelectionAge(selection);
              return (
                <article
                  key={selection.id}
                  className={`kanban-card${dragId === selection.id ? ' kanban-card-dragging' : ''}${ENDED_STATUSES.has(selection.status) ? ' kanban-card--ended' : ''}${tickedId === selection.id ? ' kanban-card--tick' : ''}`}
                  draggable={!pending}
                  aria-busy={pending}
                  onDragStart={event => {
                    setDragId(selection.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(DRAG_TYPE, selection.id);
                    event.dataTransfer.setData('text/plain', selection.id);
                  }}
                >
                  <div className="kanban-card-detail">
                    <div className="kanban-card-head">
                      <button type="button" className="kanban-card-open" disabled={pending} onClick={() => onEdit(selection)} aria-label={`${company.name}・${selectionLabel || selection.title || label}の選考を編集`} title={`${company.name}${selectionLabel ? ` · ${selectionLabel}` : ''}${age ? `（最終更新：${age}）` : ''}`}>
                        <span className="kanban-card-name">{company.name}</span>
                      </button>
                      {due && <span className={`quote quote--${due.tone}`} title={due.title}>{due.text}</span>}
                    </div>
                    <div className="kanban-card-meta">
                      <button type="button" className="kanban-card-company" onClick={() => onDetail(company)} aria-label={`${company.name}の企業情報を開く`} title={`企業情報を開く：${company.industry || '業界未設定'}${selectionLabel ? `・${selectionLabel}` : ''}`} draggable={false}>
                        <span className="industry-swatch" style={{ background: getIndustryConfig(company.industry).color }} aria-hidden="true" />
                        <span className="kanban-card-industry">{company.industry || '業界未設定'}</span>
                        {selectionLabel && <span className="selection-card-title">{selectionLabel}</span>}
                      </button>
                      <span className="selection-card-actions">
                        <Stars count={company.interest || 0} />
                        {/* Without a URL an empty slot of the same width keeps
                            the pips in one place on every card. */}
                        {url ? (
                          <a className="kanban-card-jump" href={url} target="_blank" rel="noopener noreferrer" draggable={false} aria-label={`${company.name}のマイページを開く（新しいタブ）`} title="マイページを開く（新しいタブ）">
                            <Icon name="external" size="sm" />
                          </a>
                        ) : <span className="kanban-card-jump-slot" aria-hidden="true" />}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
