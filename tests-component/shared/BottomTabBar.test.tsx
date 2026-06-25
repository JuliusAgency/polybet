import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { BottomTabBar } from '@/shared/ui/BottomTabBar';
import { renderWithProviders } from '../helpers/render';

describe('BottomTabBar', () => {
  it('renders the four existing primary destinations as links', () => {
    renderWithProviders(<BottomTabBar />, { initialRoute: '/markets' });

    expect(screen.getByRole('link', { name: /All markets/i })).toHaveAttribute('href', '/markets');
    expect(screen.getByRole('link', { name: /Portfolio/i })).toHaveAttribute('href', '/my-bets');
    expect(screen.getByRole('link', { name: /Wallet/i })).toHaveAttribute('href', '/wallet');
    expect(screen.getByRole('link', { name: /Stats/i })).toHaveAttribute('href', '/stats');
  });

  it('marks the active tab via aria-current based on the route', () => {
    renderWithProviders(<BottomTabBar />, { initialRoute: '/wallet' });

    expect(screen.getByRole('link', { name: /Wallet/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Stats/i })).not.toHaveAttribute('aria-current');
  });

  it('keeps the Markets tab active on event-detail routes', () => {
    renderWithProviders(<BottomTabBar />, { initialRoute: '/events/abc-123' });

    expect(screen.getByRole('link', { name: /All markets/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
