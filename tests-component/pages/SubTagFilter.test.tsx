import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategorySubtag } from '@/features/bet';
import { SubTagFilter } from '@/widgets/MarketSubTagFilter';
import { renderWithProviders } from '../helpers/render';

const SUBTAGS: CategorySubtag[] = [
  { slug: 'trump', label: 'Trump' },
  { slug: 'iran', label: 'Iran' },
  { slug: 'uk-labour-leadership', label: 'UK Labour Leadership' },
];

describe('SubTagFilter', () => {
  it('renders an "All" chip plus one chip per sub-tag', () => {
    renderWithProviders(<SubTagFilter subtags={SUBTAGS} value={null} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trump' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iran' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'UK Labour Leadership' })).toBeInTheDocument();
  });

  it('renders nothing when there are no sub-tags', () => {
    const { container } = renderWithProviders(
      <SubTagFilter subtags={[]} value={null} onChange={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('fires onChange with the slug when a sub-tag is clicked', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SubTagFilter subtags={SUBTAGS} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Iran' }));
    expect(onChange).toHaveBeenCalledWith('iran');
  });

  it('fires onChange with null when "All" is clicked', async () => {
    const onChange = vi.fn();
    renderWithProviders(<SubTagFilter subtags={SUBTAGS} value="iran" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('marks the active sub-tag with aria-pressed', () => {
    renderWithProviders(<SubTagFilter subtags={SUBTAGS} value="trump" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Trump' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Iran' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });
});
