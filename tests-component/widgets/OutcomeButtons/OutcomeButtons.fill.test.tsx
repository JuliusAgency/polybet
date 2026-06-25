import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { OutcomeButtons, type OutcomeButton } from '@/shared/ui/OutcomeButtons';
import { renderWithProviders } from '../../helpers/render';

// F2 contract: the feed/event cards pass appearance="fill" so an OPEN binary
// market reads as Polymarket's filled inline pills — BOTH sides solid-tinted
// (green Yes / red No), regardless of which side (if any) is the resolved
// winner. This differs from appearance="solid" (BetSlip), which fills ONLY the
// winner/selected side and leaves the other a flat neutral grey. The fill tint
// is independent of the disabled flag, so we render disabled static pills (so
// pillFor can match the <div>) and assert on the inline style token strings —
// renderWithProviders has no ThemeProvider, so computed colours are unavailable.

const binary: OutcomeButton[] = [
  { id: 'yes', name: 'Yes', price: 0.49, effectiveOdds: 2 },
  { id: 'no', name: 'No', price: 0.51, effectiveOdds: 2 },
];

function pillFor(name: string): HTMLElement {
  const el = screen.getByText(name).closest('div.rounded-lg');
  if (!(el instanceof HTMLElement)) throw new Error(`pill for ${name} not found`);
  return el;
}

describe('OutcomeButtons appearance="fill"', () => {
  it('tints BOTH sides — green Yes, red No — on an open binary market', () => {
    renderWithProviders(<OutcomeButtons outcomes={binary} disabled appearance="fill" />);

    const yes = pillFor('Yes');
    const no = pillFor('No');

    // Index 0 (Yes) → win tint; index 1 (No) → loss tint. Both sides carry a
    // colour-mix against the win/loss token — neither is left neutral.
    expect(yes.getAttribute('style')).toContain('--color-win');
    expect(no.getAttribute('style')).toContain('--color-loss');
  });

  it('does not grey the No side the way appearance="solid" does', () => {
    // Open market (no winner): 'solid' fills neither side and renders the
    // No-pill as neutral --color-bg-base grey with no loss tint. 'fill' must
    // instead keep the loss tint on the No side.
    const { unmount } = renderWithProviders(
      <OutcomeButtons outcomes={binary} disabled appearance="solid" />
    );
    const solidNo = pillFor('No');
    // 'solid' non-winner = flat neutral grey, no loss colour.
    expect(solidNo.getAttribute('style')).not.toContain('--color-loss');
    unmount();

    renderWithProviders(<OutcomeButtons outcomes={binary} disabled appearance="fill" />);
    const fillNo = pillFor('No');
    // 'fill' non-winner = loss-tinted, unmistakably coloured.
    expect(fillNo.getAttribute('style')).toContain('--color-loss');
  });

  it('keeps the prices in the sans number font (.num), not font-mono', () => {
    renderWithProviders(
      <OutcomeButtons outcomes={binary} disabled appearance="fill" showPercentage />
    );

    // The price/odds run uses the .num utility (sans + tabular-nums), never the
    // old font-mono. The percentage text node lives in a span carrying `num`.
    const pct = screen.getByText('49%');
    expect(pct.className).toContain('num');
    expect(pct.className).not.toContain('font-mono');
  });
});
