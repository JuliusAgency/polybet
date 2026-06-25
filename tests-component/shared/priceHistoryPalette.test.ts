import { afterEach, describe, expect, it } from 'vitest';
import { pickOutcomeColor } from '@/shared/ui/PriceHistoryChart/priceHistoryPalette';

// The recharts palette literal is order-sensitive (index 0 = first line, etc.) and
// branches on the live <html data-theme> attribute, because recharts paints SVG stroke
// literals that cannot read CSS vars. These tests pin the order + the theme branch.

const DARK_PALETTE = [
  'oklch(70% 0.15 230)',
  'oklch(72% 0.17 150)',
  'oklch(66% 0.2 25)',
  'oklch(76% 0.16 70)',
  'oklch(72% 0.14 290)',
  'oklch(68% 0.14 180)',
  'oklch(72% 0.14 340)',
  'oklch(74% 0.13 110)',
];

const LIGHT_PALETTE = [
  'oklch(56% 0.19 250)',
  'oklch(50% 0.17 155)',
  'oklch(55% 0.22 28)',
  'oklch(62% 0.16 70)',
  'oklch(52% 0.17 290)',
  'oklch(54% 0.14 180)',
  'oklch(58% 0.16 340)',
  'oklch(60% 0.14 110)',
];

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('pickOutcomeColor', () => {
  it('returns the dark palette in order when no data-theme is set (default)', () => {
    document.documentElement.removeAttribute('data-theme');
    DARK_PALETTE.forEach((color, index) => {
      expect(pickOutcomeColor(index)).toBe(color);
    });
  });

  it('returns the light palette in the SAME order when data-theme="light"', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    LIGHT_PALETTE.forEach((color, index) => {
      expect(pickOutcomeColor(index)).toBe(color);
    });
    // Index 0 must align with the retuned light --color-accent.
    expect(pickOutcomeColor(0)).toBe('oklch(56% 0.19 250)');
  });

  it('falls back to the dark palette when data-theme is anything but "light"', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(pickOutcomeColor(0)).toBe(DARK_PALETTE[0]);
  });

  it('wraps indices modulo the palette length without throwing', () => {
    document.documentElement.removeAttribute('data-theme');
    expect(pickOutcomeColor(8)).toBe(DARK_PALETTE[0]);
    expect(pickOutcomeColor(9)).toBe(DARK_PALETTE[1]);
    document.documentElement.setAttribute('data-theme', 'light');
    expect(pickOutcomeColor(8)).toBe(LIGHT_PALETTE[0]);
  });
});
