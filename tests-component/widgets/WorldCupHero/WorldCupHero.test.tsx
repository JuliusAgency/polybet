import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../helpers/render';
import { WorldCupHero } from '@/widgets/WorldCupHero';
import { WORLD_CUP_FLAGS, PLACEHOLDER_PERCENT } from '@/widgets/WorldCupHero/const';

describe('WorldCupHero', () => {
  it('renders the title and subtitle', () => {
    renderWithProviders(<WorldCupHero />);
    expect(screen.getByRole('heading', { name: 'World Cup' })).toBeInTheDocument();
    expect(screen.getByText('Live world cup predictions & odds')).toBeInTheDocument();
  });

  it('renders one flag per nation with the placeholder percentage', () => {
    const { container } = renderWithProviders(<WorldCupHero />);

    // One flag-icons span per configured nation.
    const flags = container.querySelectorAll('.wc-flag__card .fi');
    expect(flags).toHaveLength(WORLD_CUP_FLAGS.length);

    // Each nation maps to its flag-icons class (e.g. fi-fr, fi-gb-eng).
    for (const flag of WORLD_CUP_FLAGS) {
      expect(container.querySelector(`.fi-${flag.iso2}`)).not.toBeNull();
    }

    // Every flag shows the placeholder percentage until real odds are wired.
    const pcts = screen.getAllByText(PLACEHOLDER_PERCENT);
    expect(pcts).toHaveLength(WORLD_CUP_FLAGS.length);
  });
});
