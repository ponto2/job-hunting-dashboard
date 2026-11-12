'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// One toast. A timed toast fades out after its duration; pointing at it or
// moving focus into it holds the timer, so an undo button can be reached.
// An error toast (duration null) stays until the user closes it.
function Toast({ toast, onDismiss }) {
  const { message, tone, action, duration } = toast;
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; });

  const stopTimer = () => clearTimeout(timerRef.current);
  const startTimer = () => {
    stopTimer();
    if (duration) timerRef.current = setTimeout(() => setLeaving(true), duration);
  };

  useEffect(() => {
    if (duration) timerRef.current = setTimeout(() => setLeaving(true), duration);
    return () => clearTimeout(timerRef.current);
  }, [duration]);

  const isError = tone === 'error';
  return (
    <div
      className={`toast${isError ? ' toast--error' : ''}${leaving ? ' toast--leaving' : ''}`}
      role={isError ? 'alert' : 'status'}
      onPointerEnter={stopTimer}
      onPointerLeave={() => { if (!leaving) startTimer(); }}
      onFocus={stopTimer}
      onBlur={event => { if (!leaving && !event.currentTarget.contains(event.relatedTarget)) startTimer(); }}
      onAnimationEnd={event => { if (event.animationName === 'toastOut') dismissRef.current(); }}
    >
      {isError && <Icon name="alert" className="toast-icon" />}
      <span className="toast-message">{message}</span>
      {action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => { action.onClick(); dismissRef.current(); }}
        >
          {action.label}
        </button>
      )}
      {isError && (
        <button type="button" className="toast-close" aria-label="通知を閉じる" title="閉じる" onClick={() => dismissRef.current()}>
          <Icon name="x" size="sm" />
        </button>
      )}
    </div>
  );
}

export default function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}
