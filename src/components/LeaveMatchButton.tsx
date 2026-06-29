import { useState } from 'react';
import './LeaveMatchButton.css';

interface LeaveMatchButtonProps {
  onConfirmLeave: () => void;
  disabled?: boolean;
}

export function LeaveMatchButton({ onConfirmLeave, disabled }: LeaveMatchButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirm = () => {
    setConfirmOpen(false);
    onConfirmLeave();
  };

  return (
    <>
      <button
        type="button"
        className="leave-match-btn"
        onClick={() => setConfirmOpen(true)}
        disabled={disabled}
      >
        Leave Match
      </button>

      {confirmOpen && (
        <div className="leave-match-dialog-backdrop" role="presentation">
          <div
            className="leave-match-dialog"
            role="alertdialog"
            aria-labelledby="leave-match-title"
            aria-describedby="leave-match-desc"
          >
            <h2 id="leave-match-title" className="leave-match-dialog__title">
              Leave match?
            </h2>
            <p id="leave-match-desc" className="leave-match-dialog__desc">
              If you leave, you forfeit the match and return to the main menu.
            </p>
            <div className="leave-match-dialog__actions">
              <button
                type="button"
                className="leave-match-dialog__btn leave-match-dialog__btn--ghost"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="leave-match-dialog__btn leave-match-dialog__btn--danger"
                onClick={handleConfirm}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
