import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceHistoryWindowToggle } from '@/shared/ui/PriceHistoryChart';
import { PRICE_HISTORY_WINDOWS } from '@/shared/types/priceHistory';
import { renderWithProviders } from '../../helpers/render';

// Phase-6 E3: the timeframe toggle moved from filled-accent pills to flat text
// tabs — the active window is accent-coloured and bold, the rest are muted with
// no fill/border. These assert the structure (6 radios, active styling) rather
// than pixel geometry, which jsdom doesn't lay out.
describe('PriceHistoryWindowToggle — flat text tabs (E3)', () => {
  it('renders all six windows as radios, none with a pill fill', () => {
    renderWithProviders(<PriceHistoryWindowToggle value="1D" onChange={() => {}} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(PRICE_HISTORY_WINDOWS.length);

    for (const r of radios) {
      // Flat: no pill rounding / border / accent background on any button.
      expect(r.className).not.toContain('rounded-full');
      expect(r.getAttribute('style') ?? '').not.toContain('background-color: var(--color-accent)');
    }
  });

  it('marks the active window bold + accent-coloured; idle ones muted', () => {
    renderWithProviders(<PriceHistoryWindowToggle value="1D" onChange={() => {}} />);

    const active = screen.getByRole('radio', { name: '1D' });
    expect(active.getAttribute('aria-checked')).toBe('true');
    const activeStyle = active.getAttribute('style') ?? '';
    expect(activeStyle).toContain('color: var(--color-accent)');
    expect(activeStyle).toContain('font-weight: 700');

    const idle = screen.getByRole('radio', { name: 'ALL' });
    expect(idle.getAttribute('aria-checked')).toBe('false');
    const idleStyle = idle.getAttribute('style') ?? '';
    expect(idleStyle).toContain('color: var(--color-text-secondary)');
  });

  it('fires onChange with the clicked window', async () => {
    const onChange = vi.fn();
    renderWithProviders(<PriceHistoryWindowToggle value="1D" onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: '1W' }));
    expect(onChange).toHaveBeenCalledWith('1W');
  });

  it('dims and keeps every window disabled when disabled', () => {
    renderWithProviders(<PriceHistoryWindowToggle value="1D" onChange={() => {}} disabled />);
    for (const r of screen.getAllByRole('radio')) {
      expect(r).toBeDisabled();
      expect(r.className).toContain('disabled:opacity-40');
    }
  });
});
