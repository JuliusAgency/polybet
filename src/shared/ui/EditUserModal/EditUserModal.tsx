import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/shared/ui/Modal';
import { Input } from '@/shared/ui/Input';
import { Button } from '@/shared/ui/Button';

export interface EditUserValues {
  firstName: string;
  lastName: string;
  phone: string;
}

export interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialValues: EditUserValues;
  isPending: boolean;
  errorMsg?: string;
  onSubmit: (values: EditUserValues) => void;
}

/**
 * Presentational user-edit modal (first name, last name, phone).
 * Role-agnostic: the caller supplies the mutation via onSubmit and surfaces
 * pending/error state. Lives in shared/ui so both super-admin and manager
 * pages reuse a single implementation (no duplication).
 *
 * Mount this conditionally (e.g. `{target && <EditUserModal .../>}`) so it
 * remounts per target — state is seeded once from initialValues on mount,
 * avoiding a setState-in-effect re-seed.
 */
export const EditUserModal = ({
  isOpen,
  onClose,
  title,
  initialValues,
  isPending,
  errorMsg,
  onSubmit,
}: EditUserModalProps) => {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState(initialValues.firstName);
  const [lastName, setLastName] = useState(initialValues.lastName);
  const [phone, setPhone] = useState(initialValues.phone);
  const [localError, setLocalError] = useState('');

  const handleSubmit = () => {
    setLocalError('');
    if (!firstName.trim()) {
      setLocalError(t('editUser.firstNameRequired'));
      return;
    }
    onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} closeDisabled={isPending}>
      <div className="flex flex-col gap-4">
        <Input
          label={t('editUser.firstName')}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder={t('editUser.firstNamePh')}
        />
        <Input
          label={t('editUser.lastName')}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder={t('editUser.lastNamePh')}
        />
        <Input
          label={t('editUser.phone')}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('editUser.phonePh')}
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
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
