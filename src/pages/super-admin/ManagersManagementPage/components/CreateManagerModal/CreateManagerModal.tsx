import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { useCreateManager } from '@/features/admin/managers';
import { CredentialCard } from '@/pages/manager/UsersManagementPage/components/CredentialCard';

interface CreateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateManagerModal = ({ isOpen, onClose, onSuccess }: CreateManagerModalProps) => {
  const { t } = useTranslation();

  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [margin, setMargin] = useState('');

  // Field-level validation errors
  const [fullNameError, setFullNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [marginError, setMarginError] = useState('');

  const mutation = useCreateManager();

  const resetForm = () => {
    setFullName('');
    setUsername('');
    setPassword('');
    setMargin('');
    setFullNameError('');
    setUsernameError('');
    setPasswordError('');
    setMarginError('');
    mutation.reset();
  };

  const handleClose = () => {
    setCredentials(null);
    resetForm();
    onClose();
  };

  const handleCredentialDone = () => {
    setCredentials(null);
    resetForm();
    onSuccess();
    onClose();
  };

  const validate = (): boolean => {
    let valid = true;

    if (!fullName.trim()) {
      setFullNameError(t('common.required'));
      valid = false;
    } else {
      setFullNameError('');
    }

    if (!username.trim()) {
      setUsernameError(t('common.required'));
      valid = false;
    } else {
      setUsernameError('');
    }

    if (!password.trim()) {
      setPasswordError(t('common.required'));
      valid = false;
    } else {
      setPasswordError('');
    }

    const marginValue = parseFloat(margin);
    if (margin.trim() === '' || isNaN(marginValue) || marginValue < 0 || marginValue > 100) {
      setMarginError(t('managers.marginError'));
      valid = false;
    } else {
      setMarginError('');
    }

    return valid;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validate()) return;

    // Clear previous username_taken error before new attempt
    if (mutation.error?.message === 'username_taken') {
      mutation.reset();
    }

    mutation.mutate(
      {
        fullName: fullName.trim(),
        username: username.trim(),
        password: password.trim(),
        margin: parseFloat(margin),
      },
      {
        onSuccess: (data) => {
          resetForm();
          setCredentials({ username: data.username, password: data.generatedPassword });
        },
      }
    );
  };

  // Derive inline username error: mutation username_taken takes priority over field validation
  const usernameMutationError =
    mutation.error?.message === 'username_taken' ? t('managers.usernameTaken') : '';
  const usernameFieldError = usernameMutationError || usernameError;

  // Generic error: anything that is not username_taken
  const genericError =
    mutation.error && mutation.error.message !== 'username_taken'
      ? mutation.error.message || t('common.unknownError')
      : null;

  const isSubmitting = mutation.isPending;

  if (credentials) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title={t('managers.credentialCard')}>
        <CredentialCard
          username={credentials.username}
          password={credentials.password}
          onDone={handleCredentialDone}
        />
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('managers.createManagerTitle')}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-4">
          <Input
            label={t('managers.fullName')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isSubmitting}
            error={fullNameError}
          />

          <Input
            label={t('managers.username')}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              // Clear mutation error when user edits username
              if (mutation.error?.message === 'username_taken') {
                mutation.reset();
              }
            }}
            disabled={isSubmitting}
            error={usernameFieldError}
          />

          <Input
            label={t('managers.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
            error={passwordError}
          />

          <Input
            label={t('managers.margin')}
            type="number"
            min={0}
            max={100}
            step="any"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            disabled={isSubmitting}
            error={marginError}
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
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('common.saving') : t('managers.createManager')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
