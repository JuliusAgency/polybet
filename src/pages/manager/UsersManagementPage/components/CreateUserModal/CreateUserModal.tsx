import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';
import { useCreateUser } from '@/features/manager/users';
import { SESSION_EXPIRED_ERROR } from '@/shared/api/supabase';
import { CredentialCard } from '../CredentialCard';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'form' | 'credentials';

interface Credentials {
  username: string;
  generatedPassword: string;
}

export const CreateUserModal = ({ isOpen, onClose }: CreateUserModalProps) => {
  const { t } = useTranslation();

  const [phase, setPhase] = useState<Phase>('form');
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  // Form field state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Field-level validation errors
  const [fullNameError, setFullNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const mutation = useCreateUser();

  const resetForm = () => {
    setFullName('');
    setUsername('');
    setPassword('');
    setPhone('');
    setNotes('');
    setFullNameError('');
    setUsernameError('');
    setPasswordError('');
    mutation.reset();
  };

  const resetAll = () => {
    resetForm();
    setPhase('form');
    setCredentials(null);
  };

  const handleClose = () => {
    if (phase === 'form') {
      resetForm();
    } else {
      resetAll();
    }
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

    return valid;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validate()) return;

    // Clear username_taken mutation error before new attempt
    if (mutation.error?.message === 'username_taken') {
      mutation.reset();
    }

    mutation.mutate(
      {
        fullName: fullName.trim(),
        username: username.trim(),
        password: password.trim(),
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          setCredentials({
            username: result.username,
            generatedPassword: result.generatedPassword,
          });
          setPhase('credentials');
        },
      }
    );
  };

  const handleDone = () => {
    resetAll();
    onClose();
  };

  // Derive inline username error: mutation username_taken takes priority over field validation
  const usernameMutationError =
    mutation.error?.message === 'username_taken' ? t('users.usernameTaken') : '';
  const usernameFieldError = usernameMutationError || usernameError;

  // Generic error: anything that is not username_taken
  const genericError =
    mutation.error && mutation.error.message !== 'username_taken'
      ? mutation.error.message === SESSION_EXPIRED_ERROR
        ? t('auth.sessionExpired')
        : mutation.error.message || t('common.unknownError')
      : null;

  const isSubmitting = mutation.isPending;

  const modalTitle = phase === 'form' ? t('users.newUserTitle') : t('users.credentialCard');

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={modalTitle}>
      {phase === 'form' && (
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
              label={t('users.phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
            />

            {/* Notes textarea — styled like Input, not the Input component */}
            <div className="flex flex-col gap-1">
              <label
                className="text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {t('users.notes')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSubmitting}
                rows={3}
                className="w-full resize-none rounded-lg border px-3 py-2 text-sm transition-colors"
                style={{
                  backgroundColor: 'var(--color-bg-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
            </div>

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
              <Button variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('common.saving') : t('users.createUser')}
              </Button>
            </div>
          </div>
        </form>
      )}

      {phase === 'credentials' && credentials && (
        <CredentialCard
          username={credentials.username}
          password={credentials.generatedPassword}
          onDone={handleDone}
        />
      )}
    </Modal>
  );
};
