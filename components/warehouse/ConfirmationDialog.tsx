"use client";

export function ConfirmationDialog({ title, message, confirmLabel = "Confirm", destructive = true, busy, onCancel, onConfirm }: {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <span className={`confirmation-symbol ${destructive ? "confirmation-symbol--danger" : ""}`} aria-hidden="true">!</span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="confirmation-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={destructive ? "danger-button" : "primary-button"} type="button" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
