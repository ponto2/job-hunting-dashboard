'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { formatShortDate } from '@/lib/date';
import { GRADUATION_LABEL } from '@/lib/graduation';
import { isHttpUrl } from '@/lib/validation';
import Icon from './Icon';

const KIND_LABELS = { deadline: '締切', interview: '面接', es: 'ES' };

function itemLabel(item) {
  return `${KIND_LABELS[item.kind] || '確認'} ${item.title} ${item.meta}`;
}

// One line under the app bar: what is due, in date order. Whatever does not
// fit is counted on the list button at the right end, and the list shows
// every item with a done button for each event.
export default function AttentionStrip({ items, companies, onOpen, onToggleDone }) {
  const [open, setOpen] = useState(false);
  const [firstHidden, setFirstHidden] = useState(items.length);
  const itemsRef = useRef(null);
  const buttonRef = useRef(null);
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const focusIndexRef = useRef(null);
  const popoverId = useId();
  const headingId = useId();
  const hiddenCount = Math.max(0, items.length - firstHidden);

  // The first item whose right edge passes the strip, or that is not shown at
  // all (phones show only the first item); it and everything after it are
  // counted as hidden.
  const measure = useCallback(() => {
    const container = itemsRef.current;
    if (!container) return;
    const limit = container.getBoundingClientRect().right + 0.5;
    const children = Array.from(container.children);
    let index = children.findIndex(child => (
      child.getClientRects().length === 0 || child.getBoundingClientRect().right > limit
    ));
    if (index === -1) index = children.length;
    setFirstHidden(index);
  }, []);

  useLayoutEffect(() => {
    measure();
    const container = itemsRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    Array.from(container.children).forEach(child => observer.observe(child));
    return () => observer.disconnect();
  }, [items, measure]);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // The list closes on Escape, on a click outside, and when it empties. It
  // responds to the item count changing, so updating state here is intended.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open && items.length === 0) setOpen(false);
  }, [open, items.length]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (!wrapRef.current?.contains(event.target)) close(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  // Focus the first row on opening, and after a row is marked done, the row
  // that took its place.
  useEffect(() => {
    if (!open) return;
    const rows = popoverRef.current?.querySelectorAll('.attention-row-main');
    if (!rows?.length) return;
    const index = focusIndexRef.current ?? 0;
    focusIndexRef.current = null;
    if (index === 0 || !popoverRef.current.contains(document.activeElement)) {
      rows[Math.min(index, rows.length - 1)].focus();
    }
  }, [open, items]);

  const companyUrls = new Map((companies || []).map(company => [String(company.id), company.recruit_url]));
  const recruitUrl = item => {
    const url = item.companyId ? companyUrls.get(String(item.companyId)) : null;
    return isHttpUrl(url) ? url : null;
  };

  const openItem = item => {
    if (open) close(true);
    onOpen(item);
  };

  const markDone = (item, index) => {
    focusIndexRef.current = index;
    onToggleDone(item.event, true);
  };

  const onListKeyDown = event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = Array.from(popoverRef.current?.querySelectorAll('.attention-row-main') || []);
    const current = rows.findIndex(row => row.parentElement.contains(document.activeElement));
    if (current === -1) return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? Math.min(rows.length - 1, current + 1) : Math.max(0, current - 1);
    rows[next].focus();
  };

  return (
    <section className="attention-strip" aria-label="要確認">
      <h2 className="attention-label">
        要確認 <span className="attention-count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <div className="attention-items">
          <span className="attention-empty">期限が近い予定や未回答のESはありません</span>
        </div>
      ) : (
        <div className={`attention-items${hiddenCount > 0 ? ' attention-items--clipped' : ''}`} ref={itemsRef}>
          {items.map((item, index) => {
            const hidden = index >= firstHidden;
            return (
              <button
                key={item.id}
                type="button"
                className={`attention-item${item.hot ? ' attention-item--hot' : ''}`}
                onClick={() => openItem(item)}
                tabIndex={hidden ? -1 : undefined}
                aria-hidden={hidden || undefined}
                aria-label={itemLabel(item)}
              >
                <span className={`attention-kind attention-kind--${item.kind}`}>{KIND_LABELS[item.kind] || '確認'}</span>
                <span className="attention-title">{item.title}</span>
                <span className="attention-meta">{item.meta}</span>
              </button>
            );
          })}
        </div>
      )}
      {items.length > 0 && (
        <div className="attention-more" ref={wrapRef}>
          <button
            ref={buttonRef}
            type="button"
            className="attention-more-button"
            aria-expanded={open}
            aria-controls={popoverId}
            aria-label={`要確認の一覧を開く（全${items.length}件）`}
            onClick={() => (open ? close(true) : setOpen(true))}
          >
            {hiddenCount > 0 ? `+${hiddenCount}件` : '一覧'}
            <Icon name="chevronDown" size="sm" />
          </button>
          {open && (
            <div
              ref={popoverRef}
              id={popoverId}
              className="attention-popover"
              role="dialog"
              aria-labelledby={headingId}
              onKeyDown={onListKeyDown}
            >
              <h3 className="attention-popover-head" id={headingId}>
                要確認 <span className="attention-count">{items.length}</span>件
              </h3>
              <ul className="attention-list">
                {items.map((item, index) => {
                  const url = item.event ? recruitUrl(item) : null;
                  return (
                    <li key={item.id} className={`attention-row${item.hot ? ' attention-item--hot' : ''}`}>
                      <button type="button" className="attention-row-main" onClick={() => openItem(item)} aria-label={`${itemLabel(item)}${item.date ? `（${formatShortDate(item.date)}）` : ''}`}>
                        <span className={`attention-kind attention-kind--${item.kind}`}>{KIND_LABELS[item.kind] || '確認'}</span>
                        <span className="attention-title">{item.title}</span>
                        <span className="attention-row-date">{item.date ? formatShortDate(item.date) : ''}</span>
                        <span className="attention-meta">{item.meta}</span>
                      </button>
                      <span className="attention-row-actions">
                        {item.event && !url && <span className="attention-row-jump-slot" aria-hidden="true" />}
                        {url && (
                          <a
                            className="kanban-card-jump"
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${item.event.companies?.name || '企業'}の${GRADUATION_LABEL}マイページを開く（新しいタブ）`}
                            title={`${GRADUATION_LABEL}マイページを開く（新しいタブ）`}
                          >
                            {GRADUATION_LABEL}
                            <Icon name="external" size="sm" />
                          </a>
                        )}
                        {item.event && (
                          <button
                            type="button"
                            className="attention-row-done"
                            aria-label={`「${item.title}」を完了にする`}
                            title="完了にする"
                            onClick={() => markDone(item, index)}
                          >
                            <Icon name="check" size="sm" />
                            <span className="attention-row-done-label">完了</span>
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
