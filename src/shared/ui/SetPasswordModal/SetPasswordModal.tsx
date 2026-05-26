import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';

export interface SetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  isPending: boolean;
  errorMsg?: string;
  onSubmit: (newPassword: string) => void;
}

const MIN_PASSWORD_LENGTH = 6;

/**
 * Presentational "set a new password" modal. Role-agnostic: the caller wires
 * the mutation via onSubmit. Mirrors the min-6 rule enforced server-side by
 * admin_reset_password / manager_reset_password.
 *
 * Mount this conditionally so it remounts (and clears its field) per target.
 */
export const SetPasswordModal = ({
  isOpen,
  onClose,
  title,
  isPending,
  errorMsg,
  onSubmit,
}: SetPasswordModalProps) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = () => {
    setLocalError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(t('managerProfile.passwordError'));
      return;
    }
    onSubmit(password);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} closeDisabled={isPending}>
      <div className="flex flex-col gap-4">
        <Input
          label={t('managerProfile.newPassword')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('managerProfile.passwordPh')}
        />
        {(localError || errorMsg) && (
          <p className="text-sm" style={{ color: 'var(--color-loss)' }}>
            {localError || errorMsg}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isPending ? t('common.saving') : t('managerProfile.reset')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
