import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { renderWithProviders } from '../../helpers/render';

// Bug 3 regression guard: the admin/manager read-only Markets surface passes
// appearance="inactive" so disabled outcome pills read as switched off (muted,
// cursor-not-allowed, NO win/loss tint). The user feed leaves appearance at the
// default so closed/resolved markets keep their colored odds — that contrast is
// the whole point, so both are asserted here.

const binary: OutcomeButton[] = [
  { id: 'yes', name: 'Yes', price: 0.5, effectiveOdds: 2 },
  { id: 'no', name: 'No', price: 0.5, effectiveOdds: 2 },
];

function pillFor(name: string): HTMLElement {
  const el = screen.getByText(name).closest('div.rounded-lg');
  if (!(el instanceof HTMLElement)) throw new Error(`pill for ${name} not found`);
  return el;
}

describe('OutcomeButtons appearance', () => {
  it('renders inactive pills as non-bettable: no buttons, muted, cursor-not-allowed', () => {
    renderWithProviders(<OutcomeButtons outcomes={binary} disabled appearance="inactive" />);

    // Non-bettable: rendered as static divs, never <button>.
    expect(screen.queryByRole('button')).toBeNull();

    const yes = pillFor('Yes');
    const no = pillFor('No');

    // Muted neutral colour, NOT the win/loss tint.
    expect(yes.getAttribute('style')).toContain('--color-text-muted');
    expect(no.getAttribute('style')).toContain('--color-text-muted');
    expect(yes.getAttribute('style')).not.toContain('--color-win');
    expect(no.getAttribute('style')).not.toContain('--color-loss');

    // Unmistakably switched off.
    expect(yes.className).toContain('cursor-not-allowed');
    expect(no.className).toContain('cursor-not-allowed');
    expect(yes.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the win/loss colour on default disabled pills (user-feed closed markets)', () => {
    renderWithProviders(<OutcomeButtons outcomes={binary} disabled />);

    const yes = pillFor('Yes');
    const no = pillFor('No');

    // Default disabled retains the coloured tint and is NOT marked inactive.
    expect(yes.getAttribute('style')).toContain('--color-win');
    expect(no.getAttribute('style')).toContain('--color-loss');
    expect(yes.className).not.toContain('cursor-not-allowed');
    expect(no.className).not.toContain('cursor-not-allowed');
  });

  it('keeps the winner tint even when appearance is inactive', () => {
    const withWinner: OutcomeButton[] = [
      { id: 'yes', name: 'Yes', price: 0.5, effectiveOdds: 2 },
      { id: 'no', name: 'No', price: 0.5, effectiveOdds: 2, isWinner: true },
    ];
    renderWithProviders(<OutcomeButtons outcomes={withWinner} disabled appearance="inactive" />);

    const no = pillFor('No');
    // Winner pill stays legible (coloured), not muted, and not flagged inactive.
    expect(no.getAttribute('style')).not.toContain('--color-text-muted');
    expect(no.className).not.toContain('cursor-not-allowed');
  });
});
