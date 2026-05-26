import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { EditUserModal } from '@/shared/ui/EditUserModal';

const baseProps = {
  isOpen: true as const,
  onClose: () => {},
  title: 'Edit User',
  initialValues: { firstName: 'Alice', lastName: 'Cooper', phone: '+15551234' },
  isPending: false,
};

describe('EditUserModal', () => {
  it('seeds the fields from initialValues', () => {
    renderWithProviders(<EditUserModal {...baseProps} onSubmit={() => {}} />);
    expect(screen.getByDisplayValue('Alice')).toBeTruthy();
    expect(screen.getByDisplayValue('Cooper')).toBeTruthy();
    expect(screen.getByDisplayValue('+15551234')).toBeTruthy();
  });

  it('blocks submit and shows an error when first name is empty', () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <EditUserModal
        {...baseProps}
        initialValues={{ firstName: '', lastName: 'Cooper', phone: '' }}
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('First name is required')).toBeTruthy();
  });

  it('submits trimmed values', () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <EditUserModal
        {...baseProps}
        initialValues={{ firstName: '  Bob  ', lastName: '  Dylan  ', phone: '  +1  ' }}
        onSubmit={onSubmit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ firstName: 'Bob', lastName: 'Dylan', phone: '+1' });
  });

  it('surfaces a server error message', () => {
    renderWithProviders(
      <EditUserModal {...baseProps} errorMsg="Access denied" onSubmit={() => {}} />
    );
    expect(screen.getByText('Access denied')).toBeTruthy();
  });
});
