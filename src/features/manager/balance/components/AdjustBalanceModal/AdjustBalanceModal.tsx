import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { Modal } from '@/shared/ui/Modal';
import { MIN_ADJUST_AMOUNT, MAX_NOTE_LENGTH } from '@/shared/config/validation';
import { mapBalanceErrorMessage } from '@/shared/utils';
import { useManagerAdjustBalance } from '../../useManagerAdjustBalance';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  type: 'deposit' | 'withdrawal';
  /** Current available balance; enables the Max button + over-max validation
   *  for withdrawals when provided. */
  available?: number;
}

// The backend clamp (migration 20260611170133) treats a withdrawal within one
// cent above the true balance as "withdraw everything", so the client allows
// the same tolerance: the displayed available is round(x, 2) and can sit up to
// a cent above the exact numeric balance.
const FULL_WITHDRAW_TOLERANCE = 0.01;

export const AdjustBalanceModal = ({
  isOpen,
  onClose,
  userId,
  username,
  type,
  available,
}: AdjustBalanceModalProps) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState('');
  const [noteError, setNoteError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutation = useManagerAdjustBalance();

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  // Reset local form state only when modal visibility changes.
  // Depending on the whole mutation object can cause a render loop.
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setNote('');
      setAmountError('');
      setNoteError('');
      setShowSuccess(false);
      mutation.reset();
      if (successTimerRef.current !== null) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const validate = () => {
    const parsed = Number.parseFloat(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setAmountError(t('treasury.amountError'));
      return false;
    }
    if (parsed < MIN_ADJUST_AMOUNT) {
      setAmountError(t('treasury.minAmountError', { amount: MIN_ADJUST_AMOUNT }));
      return false;
    }
    // Compare in whole cents: float64 addition (1200 + 0.01) can land a hair
    // below parseFloat('1200.01') and misjudge the exact tolerance boundary.
    if (
      type === 'withdrawal' &&
      available !== undefined &&
      Math.round(parsed * 100) > Math.round(available * 100) + FULL_WITHDRAW_TOLERANCE * 100
    ) {
      setAmountError(t('treasury.exceedsAvailable', { amount: available.toFixed(2) }));
      return false;
    }
    if (note.trim().length > MAX_NOTE_LENGTH) {
      setNoteError(t('treasury.noteTooLong', { max: MAX_NOTE_LENGTH }));
      return false;
    }

    setAmountError('');
    setNoteError('');
    return true;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;

    mutation.mutate(
      {
        targetUserId: userId,
        amount: Math.round(Number.parseFloat(amount) * 100) / 100,
        type,
        note: note.trim(),
      },
      {
        onSuccess: () => {
          setShowSuccess(true);
          successTimerRef.current = setTimeout(() => {
            successTimerRef.current = null;
            onClose();
          }, 2000);
        },
      }
    );
  };

  const title =
    type === 'deposit'
      ? t('treasury.depositTitle', { username })
      : t('treasury.withdrawalTitle', { username });

  const genericError =
    mutation.error && !showSuccess
      ? mapBalanceErrorMessage(mutation.error.message, t) || t('common.unknownError')
      : null;

  const isSubmitting = mutation.isPending;
  const handleClose = isSubmitting ? () => {} : onClose;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      {showSuccess ? (
        <p className="py-4 text-center text-sm font-medium" style={{ color: 'var(--color-win)' }}>
          {t('treasury.success')}
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-4">
            <Input
              label={t('treasury.amount')}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                if (amountError) setAmountError('');
              }}
              disabled={isSubmitting}
              error={amountError}
            />

            {type === 'withdrawal' && available !== undefined && (
              <div className="flex items-center justify-between gap-2 -mt-2">
                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('treasury.availableHint', { amount: available.toFixed(2) })}
                </span>
                <Button
                  variant="secondary"
                  type="button"
                  className="text-xs px-3 py-1"
                  disabled={isSubmitting}
                  onClick={() => {
                    // toFixed(2) ROUNDS (1199.9999987 -> "1200.00") on purpose:
                    // it matches what the manager sees in the users table, and
                    // the RPC clamp absorbs the <= 0.01 overshoot.
                    setAmount(available.toFixed(2));
                    setAmountError('');
                  }}
                >
                  {t('treasury.maxButton')}
                </Button>
              </div>
            )}

            <Input
              label={t('treasury.note')}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                if (noteError) setNoteError('');
              }}
              disabled={isSubmitting}
              maxLength={MAX_NOTE_LENGTH}
              error={noteError}
            />

            {genericError && (
              <p role="alert" className="text-sm" style={{ color: 'var(--color-loss)' }}>
                {genericError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? t('common.saving')
                  : type === 'deposit'
                    ? t('treasury.deposit')
                    : t('treasury.withdraw')}
              </Button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
};
