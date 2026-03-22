import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';

interface CredentialCardProps {
  username: string;
  password: string;
  onDone: () => void;
}

interface CopyState {
  username: boolean;
  password: boolean;
}

export const CredentialCard = ({ username, password, onDone }: CredentialCardProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<CopyState>({ username: false, password: false });
  const [copyError, setCopyError] = useState<keyof CopyState | null>(null);
  // Track timer IDs so they can be cleared on unmount
  const timersRef = useRef<Record<keyof CopyState, ReturnType<typeof setTimeout> | null>>({
    username: null,
    password: null,
  });

  useEffect(() => {
    return () => {
      // Clear all pending timers when the component unmounts
      if (timersRef.current.username) clearTimeout(timersRef.current.username);
      if (timersRef.current.password) clearTimeout(timersRef.current.password);
    };
  }, []);

  const handleCopy = (field: keyof CopyState, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      if (timersRef.current[field]) clearTimeout(timersRef.current[field]!);
      setCopyError(null);
      setCopied((prev) => ({ ...prev, [field]: true }));
      timersRef.current[field] = setTimeout(() => {
        setCopied((prev) => ({ ...prev, [field]: false }));
        timersRef.current[field] = null;
      }, 1500);
    }).catch(() => {
      setCopyError(field);
      timersRef.current[field] = setTimeout(() => {
        setCopyError(null);
        timersRef.current[field] = null;
      }, 3000);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Username row */}
      <div
        className="flex items-center justify-between rounded-lg border px-4 py-3 gap-3"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <span
          className="font-mono text-sm break-all"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {username}
        </span>
        <Button
          variant="secondary"
          type="button"
          onClick={() => handleCopy('username', username)}
          style={copyError === 'username' ? { color: 'var(--color-loss)' } : undefined}
        >
          {copyError === 'username'
            ? t('users.copyFailed')
            : copied.username
              ? t('users.copied')
              : t('users.copyUsername')}
        </Button>
      </div>

      {/* Password row */}
      <div
        className="flex items-center justify-between rounded-lg border px-4 py-3 gap-3"
        style={{
          backgroundColor: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        <span
          className="font-mono text-sm break-all"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {password}
        </span>
        <Button
          variant="secondary"
          type="button"
          onClick={() => handleCopy('password', password)}
          style={copyError === 'password' ? { color: 'var(--color-loss)' } : undefined}
        >
          {copyError === 'password'
            ? t('users.copyFailed')
            : copied.password
              ? t('users.copied')
              : t('users.copyPassword')}
        </Button>
      </div>

      {/* Password warning */}
      <p
        className="text-sm"
        style={{ color: 'var(--color-warning)' }}
      >
        {t('users.passwordWarning')}
      </p>

      {/* Done button */}
      <div className="flex justify-end pt-2">
        <Button variant="primary" type="button" onClick={onDone}>
          {t('common.done')}
        </Button>
      </div>
    </div>
  );
};
