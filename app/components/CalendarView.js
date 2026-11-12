'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api-client';
import { EVENT_TYPE_CONFIG } from '../lib/constants';
import Icon from './Icon';
import { daysUntil, formatDateInput, formatShortDate, parseLocalDate } from '@/lib/date';
import { isEventDone } from '@/lib/events';
import EventModal from './EventModal';
import { readStorage, writeStorage } from '../lib/storage';
import { useToday } from '../lib/use-today';

function eventTimeLabel(event) {
  const start = event.start_time?.slice(0, 5);
  const end = event.end_time?.slice(0, 5);
  if (!start) return '';
  const endDay = event.end_date && event.end_date !== event.start_date ? `${formatShortDate(event.end_date)} ` : '';
  return end ? `${start}–${endDay}${end}` : start;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getDateKey(date) {
  return formatDateInput(date);
}

function diffDays(a, b) {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function clampDate(date, min, max) {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized.length === 3
    ? normalized.split('').map(ch => ch + ch).join('')
    : normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getEventTypeColor(event) {
  const cfg = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.other;
  return cfg.color;
}


// How an event reads on the calendar: done, over (its last day is before
// today and it was never marked done), or still ahead.
function getEventState(event, today) {
  if (isEventDone(event)) return 'done';
  const daysToEnd = daysUntil(event.end_date || event.start_date, today);
  return daysToEnd !== null && daysToEnd < 0 ? 'past' : 'upcoming';
}

function isUrgentDeadline(event, today) {
  if (event.event_type !== 'deadline' || isEventDone(event)) return false;
  const daysLeft = daysUntil(event.start_date, today);
  return daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
}

function getEventDateRange(event) {
  const start = parseLocalDate(event.start_date);
  if (!start) return null;
  const end = event.end_date ? parseLocalDate(event.end_date) : start;
  return { start, end: end && end >= start ? end : start };
}

function buildWeekEventSegments(cells, events) {
  const weeks = Array.from({ length: cells.length / 7 }, (_, weekIndex) => {
    const weekCells = cells.slice(weekIndex * 7, weekIndex * 7 + 7);
    return {
      dates: weekCells,
      segments: [],
      laneCount: 0,
    };
  });

  weeks.forEach((week, weekIndex) => {
    const weekStart = week.dates[0];
    const weekEnd = week.dates[6];
    const candidates = events
      .map(event => {
        const range = getEventDateRange(event);
        if (!range || range.start > weekEnd || range.end < weekStart) return null;
        const visibleStart = clampDate(range.start, weekStart, weekEnd);
        const visibleEnd = clampDate(range.end, weekStart, weekEnd);
        return {
          event,
          range,
          startCol: diffDays(weekStart, visibleStart),
          endCol: diffDays(weekStart, visibleEnd),
          isStart: isSameDay(range.start, visibleStart),
          isEnd: isSameDay(range.end, visibleEnd),
        };
      })
      .filter(Boolean)
      .sort((a, b) => (
        a.startCol - b.startCol ||
        b.endCol - a.endCol ||
        String(a.event.start_time || '').localeCompare(String(b.event.start_time || '')) ||
        String(a.event.title || '').localeCompare(String(b.event.title || ''))
      ));

    const laneEnds = [];
    week.segments = candidates.map(segment => {
      let lane = laneEnds.findIndex(endCol => endCol < segment.startCol);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = segment.endCol;
      return {
        ...segment,
        id: `${segment.event.id}-${weekIndex}`,
        span: segment.endCol - segment.startCol + 1,
        lane,
      };
    });
    week.laneCount = laneEnds.length;
  });

  return weeks;
}

// Shows the events the dashboard has already loaded (all of them), so moving
// between months needs no request and the calendar always matches the rest
// of the dashboard. After a change, onEventsChanged reloads them.
export default function CalendarView({
  companies,
  events = [],
  loading = false,
  onShowToast,
  onEventsChanged,
  onToggleEventDone,
  openRequest,
  onOpenRequestDone,
}) {
  const today = parseLocalDate(useToday());

  // localStorage から前回見ていた年月を復元（なければ今月）
  const [currentYear, setCurrentYear] = useState(() => {
    const n = parseInt(readStorage('calendarYear') ?? '', 10);
    return isNaN(n) ? today.getFullYear() : n;
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = parseInt(readStorage('calendarMonth') ?? '', 10);
    return isNaN(n) || n < 1 || n > 12 ? today.getMonth() + 1 : n;
  });

  const [modalState, setModalState] = useState(null); // null | { mode: 'add', date } | { mode: 'edit', event }
  // モバイル用：選択中の日付（タップで日別パネルを表示）
  const [selectedDate, setSelectedDate] = useState(null);
  // Events whose done state is being saved from the day panel.
  const [togglingIds, setTogglingIds] = useState(() => new Set());

  const calendarRef = useRef(null);
  // ホイール月移動のクールダウン（タッチパッドの連続イベント対策）
  const wheelCooldownRef = useRef(false);

  // マウスホイールで月移動（モーダル非表示時のみ）
  // クールダウン付き：タッチパッドの連続イベントで月が飛びすぎないよう
  // 1回のナビゲーション後 600ms は追加ナビゲーションを無視する
  useEffect(() => {
    const el = calendarRef.current;
    if (!el) return;
    const COOLDOWN_MS = 600;
    const handleWheel = (e) => {
      if (modalState) return;
      // クールダウン中は無視
      if (wheelCooldownRef.current) return;

      const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);

      if (isHorizontal) {
        // ── 横スクロールで月移動 ──
        // ページ自体が横スクロール可能な場合はページスクロールを優先
        const pageHScrollable = document.documentElement.scrollWidth > window.innerWidth;
        if (pageHScrollable) return;
        e.preventDefault();
        if (e.deltaX > 0) {
          wheelCooldownRef.current = true;
          setTimeout(() => { wheelCooldownRef.current = false; }, COOLDOWN_MS);
          nextMonth();
        } else if (e.deltaX < 0) {
          wheelCooldownRef.current = true;
          setTimeout(() => { wheelCooldownRef.current = false; }, COOLDOWN_MS);
          prevMonth();
        }
      } else {
        // ── 縦スクロールで月移動 ──
        // ページ全体が縦スクロール可能な状態（画面が狭い）のときはページスクロールを優先
        const pageVScrollable = document.documentElement.scrollHeight > window.innerHeight;
        if (pageVScrollable) return;
        e.preventDefault();
        if (e.deltaY > 0) {
          wheelCooldownRef.current = true;
          setTimeout(() => { wheelCooldownRef.current = false; }, COOLDOWN_MS);
          nextMonth();
        } else if (e.deltaY < 0) {
          wheelCooldownRef.current = true;
          setTimeout(() => { wheelCooldownRef.current = false; }, COOLDOWN_MS);
          prevMonth();
        }
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalState, currentYear, currentMonth]);

  // 日本語表示用フォーマット（例: 5月11日(日)）
  const fmtDisplayDate = (d) => {
    const weekLabel = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日(${weekLabel})`;
  };

  // Opens an event another tab asked for (e.g. from the 要確認 list). This
  // responds to a one-off request from the parent, which clears it through
  // onOpenRequestDone, so updating state here is intended.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!openRequest?.eventId) return;
    const target = openRequest.event || events.find(ev => String(ev.id) === String(openRequest.eventId));
    if (!target) {
      if (!loading) {
        onShowToast?.('対象のイベントが見つかりませんでした。削除された可能性があります', { tone: 'error' });
        onOpenRequestDone?.();
      }
      return;
    }

    const targetDate = parseLocalDate(target.start_date);
    if (targetDate) goToMonth(targetDate.getFullYear(), targetDate.getMonth() + 1);
    setModalState({ mode: 'edit', event: target });
    onOpenRequestDone?.();
  }, [events, loading, onOpenRequestDone, onShowToast, openRequest]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 月移動（表示中の年月は localStorage にも保存）
  function goToMonth(year, month) {
    setSelectedDate(null);
    setCurrentYear(year);
    setCurrentMonth(month);
    writeStorage('calendarYear', year);
    writeStorage('calendarMonth', month);
  }
  const prevMonth = () => (currentMonth === 1
    ? goToMonth(currentYear - 1, 12)
    : goToMonth(currentYear, currentMonth - 1));
  const nextMonth = () => (currentMonth === 12
    ? goToMonth(currentYear + 1, 1)
    : goToMonth(currentYear, currentMonth + 1));
  const goToday = () => goToMonth(today.getFullYear(), today.getMonth() + 1);

  // カレンダーグリッド構築（前月末・次月初の日付も含める）
  const firstDay = new Date(currentYear, currentMonth - 1, 1);
  const lastDay = new Date(currentYear, currentMonth, 0);
  const startPad = firstDay.getDay(); // 0=日
  const totalCells = Math.ceil((startPad + lastDay.getDate()) / 7) * 7;
  // dayNum が範囲外でも JavaScript の Date が自動調整するため前月末・次月初が得られる
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startPad + 1;
    return new Date(currentYear, currentMonth - 1, dayNum);
  });

  // その日のイベントを取得
  const getEventsForDay = (date) => {
    if (!date) return [];
    return events.filter(ev => {
      const start = parseLocalDate(ev.start_date);
      if (!start) return false;
      const end = ev.end_date ? parseLocalDate(ev.end_date) : start;
      return date >= start && date <= end;
    }).sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
  };

  // 選択中の日のイベント
  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : [];
  const calendarWeeks = buildWeekEventSegments(cells, events);

  // セルクリック：モバイルは日付選択、デスクトップはモーダル
  const handleCellClick = (date) => {
    if (window.innerWidth < 768) {
      setSelectedDate(prev => prev && isSameDay(prev, date) ? null : date);
    } else {
      setModalState({ mode: 'add', date: formatDateInput(date) });
    }
  };

  // イベント保存
  const handleSave = async (formData) => {
    const savingModal = modalState;
    try {
      const method = formData.id ? 'PUT' : 'POST';
      await apiFetch('/api/events', { method, body: formData });
      onShowToast(formData.id ? 'イベントを更新しました' : 'イベントを追加しました');
      setModalState(current => current === savingModal ? null : current);
      onEventsChanged?.();
    } catch (e) {
      onShowToast(`イベントを保存できませんでした。${e.message}`, { tone: 'error' });
    }
  };

  // イベント削除
  const handleDelete = async (id) => {
    const deletingModal = modalState;
    try {
      await apiFetch(`/api/events?id=${id}`, { method: 'DELETE' });
      onShowToast('イベントを削除しました');
      setModalState(current => current === deletingModal ? null : current);
      onEventsChanged?.();
    } catch (e) {
      onShowToast(`イベントを削除できませんでした。${e.message}`, { tone: 'error' });
    }
  };

  // 完了にする／未完了に戻す（モバイルの日別パネル）。保存とトーストはページ側。
  const handleToggleDone = async (event) => {
    if (togglingIds.has(event.id) || !onToggleEventDone) return;
    setTogglingIds(prev => new Set(prev).add(event.id));
    try {
      await onToggleEventDone(event, !isEventDone(event));
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(event.id);
        return next;
      });
    }
  };

  const monthLabel = `${currentYear}年${currentMonth}月`;

  return (
    <div className="calendar-view">
      {/* ナビゲーション */}
      <div className="calendar-nav">
        <div className="calendar-nav-left">
          <button type="button" className="btn btn-sm" onClick={prevMonth} aria-label="前の月"><Icon name="chevronLeft" size="sm" />前月</button>
          <button type="button" className="btn btn-sm" onClick={goToday}>今日</button>
          <button type="button" className="btn btn-sm" onClick={nextMonth} aria-label="次の月">次月<Icon name="chevronRight" size="sm" /></button>
        </div>
        <h2 className="calendar-month-label">{monthLabel}</h2>
        <div className="calendar-nav-right">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModalState({ mode: 'add', date: formatDateInput() })}
          >
            <Icon name="plus" /> イベントを追加
          </button>
        </div>
      </div>

      {/* 凡例 */}
      <div className="calendar-legend">
        {Object.entries(EVENT_TYPE_CONFIG).map(([type, cfg]) => (
          <span key={type} className="legend-item">
            <span className="legend-dot" style={{ background: cfg.color }} />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* カレンダーグリッド（常に表示してスクロール位置を維持） */}
      <div style={{ position: 'relative' }}>
        {loading && (
          <div className="calendar-loading-overlay">
            <div className="spinner" /> 読み込み中...
          </div>
        )}
        <div className="calendar-grid-wrapper" ref={calendarRef} style={{ opacity: loading ? 0.4 : 1, transition: 'opacity 0.2s' }}>
          <div className="calendar-grid">
            {/* 曜日ヘッダー */}
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`calendar-weekday${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>
              {w}
            </div>
          ))}

          {/* 日付セル（前月末・次月初も含む） */}
          {calendarWeeks.map((week, weekIndex) => (
            <div
              key={`week-${weekIndex}`}
              className="calendar-week-row"
              style={{ '--calendar-lane-count': Math.max(week.laneCount, 1) }}
            >
              {week.dates.map((date) => {
                const isCurrentMonth = date.getMonth() === currentMonth - 1 && date.getFullYear() === currentYear;
                const dayEvents = getEventsForDay(date);
                const isToday = isSameDay(date, today);
                const isSun = date.getDay() === 0;
                const isSat = date.getDay() === 6;
                const isSelected = selectedDate && isSameDay(date, selectedDate);

                return (
                  <button
                    key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                    type="button"
                    className={`calendar-cell${isToday ? ' today' : ''}${isSun ? ' sun' : ''}${isSat ? ' sat' : ''}${!isCurrentMonth ? ' other-month' : ''}${isSelected ? ' selected' : ''}`}
                    onClick={() => handleCellClick(date)}
                    aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日、予定${dayEvents.length}件`}
                  >
                    <span className={`calendar-day-num${isToday ? ' today-num' : ''}`}>
                      {date.getDate()}
                    </span>

                    {/* モバイル：カラードット */}
                    <div className="calendar-event-dots">
                      {dayEvents.slice(0, 3).map(ev => (
                        <span
                          key={ev.id}
                          className="event-dot"
                          style={{ background: getEventTypeColor(ev) }}
                        />
                      ))}
                      {dayEvents.length > 3 && <span className="event-dot-more">+</span>}
                    </div>
                  </button>
                );
              })}

              <div className="calendar-week-event-layer" aria-hidden={false}>
                {week.segments
                  .map(segment => {
                    const { event } = segment;
                    const typeColor = getEventTypeColor(event);
                    const state = getEventState(event, today);
                    const isUrgent = isUrgentDeadline(event, today);
                    const name = `${event.companies ? `${event.companies.name} · ` : ''}${event.title}`;
                    const stateLabel = state === 'done' ? '（完了）' : state === 'past' ? '（終了）' : '';
                    return (
                      <button
                        key={segment.id}
                        type="button"
                        className={`calendar-event-chip calendar-event-chip--bar calendar-event-chip--${state}${isUrgent ? ' urgent' : ''}${segment.isStart ? ' segment-start' : ' segment-continues-left'}${segment.isEnd ? ' segment-end' : ' segment-continues-right'}`}
                        style={{
                          gridColumn: `${segment.startCol + 1} / span ${segment.span}`,
                          gridRow: segment.lane + 1,
                          '--event-color': typeColor,
                          '--event-bg': hexToRgba(typeColor, 0.14),
                          '--event-border': hexToRgba(typeColor, 0.45),
                        }}
                        onClick={e => { e.stopPropagation(); setModalState({ mode: 'edit', event }); }}
                        title={`${name}${eventTimeLabel(event) ? ` ${eventTimeLabel(event)}（日本時間）` : ''}${stateLabel}`}
                        aria-label={`${name}${eventTimeLabel(event) ? ` ${eventTimeLabel(event)}` : ''}${stateLabel}を編集`}
                      >
                        {state === 'done' && <Icon name="check" size="sm" className="calendar-event-chip-check" />}
                        <span className="calendar-event-chip-text">
                          {event.start_time && <span className="calendar-event-time">{event.start_time.slice(0, 5)} </span>}
                          {event.companies && <span className="chip-company">{event.companies.name} · </span>}
                          {event.title}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>

      {/* モバイル：日別イベントパネル */}
      {selectedDate && (
        <div className="calendar-day-panel">
          <div className="day-panel-header">
            <span className="day-panel-title">{fmtDisplayDate(selectedDate)}</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setModalState({ mode: 'add', date: formatDateInput(selectedDate) })}
            >
              <Icon name="plus" size="sm" /> 追加
            </button>
          </div>
          {selectedDayEvents.length === 0 ? (
            <div className="day-panel-empty">この日のイベントはありません</div>
          ) : (
            <div className="day-panel-events">
              {selectedDayEvents.map(ev => {
                const cfg = EVENT_TYPE_CONFIG[ev.event_type] || EVENT_TYPE_CONFIG.other;
                const daysLeft = daysUntil(ev.start_date, today);
                const isUrgent = isUrgentDeadline(ev, today);
                const state = getEventState(ev, today);
                const done = state === 'done';
                return (
                  <div key={ev.id} className={`day-panel-event-row day-panel-event-row--${state}${isUrgent ? ' urgent' : ''}`}>
                    <button
                      type="button"
                      className="day-panel-event-item"
                      onClick={() => setModalState({ mode: 'edit', event: ev })}
                      aria-label={`${ev.title}${done ? '（完了）' : ''}を編集`}
                    >
                      <span className="day-panel-event-type" style={{ color: cfg.color }}><span className="legend-dot" style={{ background: cfg.color }} aria-hidden="true" />{cfg.label}</span>
                      <div className="day-panel-event-title">{ev.title}</div>
                      {eventTimeLabel(ev) && <div className="day-panel-event-time">{eventTimeLabel(ev)}（日本時間）</div>}
                      {ev.companies && (
                        <div className="day-panel-event-company">{ev.companies.name}</div>
                      )}
                      {done && <span className="day-panel-event-state">完了</span>}
                      {isUrgent && <span className="urgent-badge">あと{daysLeft}日</span>}
                    </button>
                    <button
                      type="button"
                      className="day-panel-event-toggle"
                      aria-label={done ? `「${ev.title}」を未完了に戻す` : `「${ev.title}」を完了にする`}
                      title={done ? '未完了に戻す' : '完了にする'}
                      disabled={togglingIds.has(ev.id)}
                      onClick={() => handleToggleDone(ev)}
                    >
                      <Icon name="check" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* イベントモーダル */}
      {modalState && (
        <EventModal
          key={modalState.mode === 'edit' ? modalState.event.id : `add-${modalState.date}`}
          event={modalState.mode === 'edit' ? modalState.event : null}
          defaultDate={modalState.mode === 'add' ? modalState.date : undefined}
          companies={companies}
          onClose={() => setModalState(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
