import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal } from '@/shared/ui';
import { useManagerAdjustBalance } from '../../useManagerAdjustBalance';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  type: 'deposit' | 'withdrawal';
}

export const AdjustBalanceModal = ({
  isOpen,
  onClose,
  userId,
  username,
  type,
}: AdjustBalanceModalProps) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState('');
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

    setAmountError('');
    return true;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) return;

    mutation.mutate(
      {
        targetUserId: userId,
        amount: Number.parseFloat(amount),
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
      },
    );
  };

  const title =
    type === 'deposit'
      ? t('treasury.depositTitle', { username })
      : t('treasury.withdrawalTitle', { username });

  const genericError =
    mutation.error && !showSuccess
      ? mutation.error.message || t('common.unknownError')
      : null;

  const isSubmitting = mutation.isPending;
  const handleClose = isSubmitting ? () => {} : onClose;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      {showSuccess ? (
        <p
          className="py-4 text-center text-sm font-medium"
          style={{ color: 'var(--color-win)' }}
        >
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

            <Input
              label={t('treasury.note')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={isSubmitting}
            />

            {genericError && (
              <p
                role="alert"
                className="text-sm"
                style={{ color: 'var(--color-loss)' }}
              >
                {genericError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
              >
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
