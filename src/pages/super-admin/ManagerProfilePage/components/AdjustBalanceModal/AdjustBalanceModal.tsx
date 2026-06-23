import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { MIN_ADJUST_AMOUNT, MAX_NOTE_LENGTH } from '@/shared/config/validation';
import { useAdjustBalance, useAdjustManagerBalance } from '@/features/admin/adjust-balance';
import type { DbProfile } from '@/shared/types/database';
import { mapBalanceErrorMessage } from '@/shared/utils';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'deposit' | 'withdrawal';
  targetUser: DbProfile;
  onSuccess: () => void;
}

export const AdjustBalanceModal = ({
  isOpen,
  onClose,
  type,
  targetUser,
  onSuccess,
}: AdjustBalanceModalProps) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const adjustBalance = useAdjustBalance();
  const adjustManagerBalance = useAdjustManagerBalance();

  const isManager = targetUser.role === 'manager';
  const isPending = isManager ? adjustManagerBalance.isPending : adjustBalance.isPending;

  const handleSubmit = async () => {
    setErrorMsg('');
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setErrorMsg(t('managerProfile.amountError'));
      return;
    }
    if (parsed < MIN_ADJUST_AMOUNT) {
      setErrorMsg(t('managerProfile.minAmountError', { amount: MIN_ADJUST_AMOUNT }));
      return;
    }
    if (note.trim().length > MAX_NOTE_LENGTH) {
      setErrorMsg(t('managerProfile.noteTooLong', { max: MAX_NOTE_LENGTH }));
      return;
    }
    const roundedAmount = Math.round(parsed * 100) / 100;

    try {
      if (isManager) {
        await adjustManagerBalance.mutateAsync({
          managerId: targetUser.id,
          amount: roundedAmount,
          type,
          note,
        });
      } else {
        await adjustBalance.mutateAsync({
          targetUserId: targetUser.id,
          amount: roundedAmount,
          type,
          note,
        });
      }

      onSuccess();
      setAmount('');
      setNote('');
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? mapBalanceErrorMessage(err.message, t) : t('common.unknownError')
      );
    }
  };

  const title = type === 'deposit' ? t('managerProfile.deposit') : t('managerProfile.withdraw');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${title} - ${targetUser.username}`}>
      <div className="flex flex-col gap-4">
        <Input
          label={t('managerProfile.amountLabel')}
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        <Input
          label={t('managerProfile.noteLabelOpt')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('managerProfile.notePlaceholder')}
          maxLength={MAX_NOTE_LENGTH}
        />
        {errorMsg && (
          <p className="text-sm" style={{ color: 'var(--color-loss)' }}>
            {errorMsg}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isPending ? t('common.processing') : title}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
