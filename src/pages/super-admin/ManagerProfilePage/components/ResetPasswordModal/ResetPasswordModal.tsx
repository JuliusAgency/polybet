import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { useResetPassword } from '@/features/admin/manage-user';
import type { DbProfile } from '@/shared/types/database';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: DbProfile;
  onSuccess: () => void;
}

export const ResetPasswordModal = ({
  isOpen,
  onClose,
  targetUser,
  onSuccess,
}: ResetPasswordModalProps) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const resetPassword = useResetPassword();

  const handleSubmit = async () => {
    setErrorMsg('');
    if (password.length < 6) {
      setErrorMsg(t('managerProfile.passwordError'));
      return;
    }

    try {
      await resetPassword.mutateAsync({
        targetUserId: targetUser.id,
        newPassword: password,
      });
      setPassword('');
      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('common.unknownError'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('managerProfile.resetPwd')} - ${targetUser.username}`}
    >
      <div className="flex flex-col gap-4">
        <Input
          label={t('managerProfile.newPassword')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('managerProfile.passwordPh')}
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
          <Button variant="primary" onClick={handleSubmit} disabled={resetPassword.isPending}>
            {resetPassword.isPending ? t('common.saving') : t('managerProfile.reset')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
