import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AllowedCategoryTag } from '@/features/bet';
import { TagFilter } from '@/widgets/MarketTagFilter';
import { renderWithProviders } from '../helpers/render';

const TAGS: AllowedCategoryTag[] = [
  { slug: 'trending', label: 'Trending', mode: 'featured' },
  { slug: 'world-cup', label: 'World Cup', mode: 'tag' },
  { slug: 'politics', label: 'Politics', mode: 'tag' },
  { slug: 'crypto', label: 'Crypto', mode: 'tag' },
];

describe('TagFilter', () => {
  it('renders the "All categories" link plus the signature + plain category links', () => {
    renderWithProviders(<TagFilter value={null} onChange={() => {}} tags={TAGS} />);
    expect(screen.getByRole('button', { name: 'All categories' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trending/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /World Cup/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Politics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crypto' })).toBeInTheDocument();
  });

  it('marks the active plain category with aria-pressed and leaves the others false', () => {
    renderWithProviders(<TagFilter value="politics" onChange={() => {}} tags={TAGS} />);
    expect(screen.getByRole('button', { name: 'Politics' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Crypto' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('marks the "All categories" link active when value is null', () => {
    renderWithProviders(<TagFilter value={null} onChange={() => {}} tags={TAGS} />);
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('does not mark any chip active when suppressActiveChip is set', () => {
    renderWithProviders(
      <TagFilter value={null} onChange={() => {}} tags={TAGS} suppressActiveChip />
    );
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Politics' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('renders the active category as flat text — no pill background/border in the style', () => {
    renderWithProviders(<TagFilter value="crypto" onChange={() => {}} tags={TAGS} />);
    const active = screen.getByRole('button', { name: 'Crypto' });
    // Flat text link: no inline background-color or border (the old pill chrome).
    expect(active.style.backgroundColor).toBe('');
    expect(active.style.border).toBe('');
    // Active weight reads bold.
    expect(active.style.fontWeight).toBe('700');
  });

  it('fires onChange with the slug when a plain category is clicked', async () => {
    const onChange = vi.fn();
    renderWithProviders(<TagFilter value={null} onChange={onChange} tags={TAGS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Politics' }));
    expect(onChange).toHaveBeenCalledWith('politics');
  });

  it('renders nothing when there are no tags', () => {
    const { container } = renderWithProviders(
      <TagFilter value={null} onChange={() => {}} tags={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
