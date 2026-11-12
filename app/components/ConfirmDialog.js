'use client';

import ModalFrame from './ModalFrame';

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = '実行',
  cancelLabel = 'キャンセル',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  return (
    <ModalFrame
      title={title}
      onClose={onCancel}
      className="confirm-dialog"
      maxWidth={420}
      footer={(
        <>
          <button className="btn" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            type="button"
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      {typeof message === 'string'
        ? <p className="confirm-message">{message}</p>
        : <div className="confirm-message">{message}</div>}
    </ModalFrame>
  );
}
