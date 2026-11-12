'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';

// Open modals, oldest first. Only the topmost one reacts to Escape and Tab, so
// closing a nested confirmation does not also close the dialog beneath it.
const modalStack = [];

export default function ModalFrame({
  title,
  onClose,
  children,
  footer,
  className = '',
  bodyClassName = '',
  maxWidth,
  isDirty = false,
  discardMessage = '編集中の内容は保存されていません。',
}) {
  const titleId = useId();
  const modalRef = useRef(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Every close path (Escape, backdrop, ×, cancel buttons) goes through here,
  // so unsaved input is never discarded without asking.
  const requestClose = () => {
    if (isDirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose?.();
  };

  // Parents usually pass a new onClose on every render. The keyboard handler
  // reads the latest callbacks from a ref so the mount effect below never
  // re-runs, which used to move focus back to the first field whenever the
  // page re-rendered (e.g. when a toast disappeared).
  const latestRef = useRef({ requestClose, confirmingDiscard });
  useEffect(() => {
    latestRef.current = { requestClose, confirmingDiscard };
  });

  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event) => {
      if (modalStack[modalStack.length - 1] !== token) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        if (latestRef.current.confirmingDiscard) setConfirmingDiscard(false);
        else latestRef.current.requestClose();
        return;
      }

      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusables = modalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const autofocus = modalRef.current?.querySelector('[autofocus], input, select, textarea, button');
    // Never steal focus from a field the user has already moved into (the
    // frame can be delayed, e.g. while the tab is in the background).
    const frame = requestAnimationFrame(() => {
      if (!modalRef.current?.contains(document.activeElement)) autofocus?.focus?.();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(frame);
      const index = modalStack.indexOf(token);
      if (index !== -1) modalStack.splice(index, 1);
      trigger?.focus?.();
    };
  }, []);

  const footerContent = typeof footer === 'function' ? footer({ requestClose }) : footer;

  return (
    <div
      className="modal-overlay active"
      onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <div
        ref={modalRef}
        className={`modal${className ? ` ${className}` : ''}`}
        style={maxWidth ? { maxWidth } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h2 className="modal-title" id={titleId}>{title}</h2>
          <button className="modal-close" type="button" onClick={requestClose} aria-label="閉じる"><Icon name="x" /></button>
        </div>
        <div className={`modal-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>
          {children}
        </div>
        {confirmingDiscard ? (
          <div className="modal-footer modal-discard-bar" role="alert">
            <p className="modal-discard-message">{discardMessage}破棄して閉じますか？</p>
            <div className="modal-discard-actions">
              <button className="btn" type="button" onClick={() => setConfirmingDiscard(false)} autoFocus>編集に戻る</button>
              <button className="btn btn-danger" type="button" onClick={() => onClose?.()}>破棄して閉じる</button>
            </div>
          </div>
        ) : (
          footerContent && <div className="modal-footer">{footerContent}</div>
        )}
      </div>
    </div>
  );
}
