import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { AdminShell } from '@/app/layouts/AdminShell';
import { renderWithProviders } from '../helpers/render';

// AdminShell is the responsive chrome shared by ManagerLayout + SuperAdminLayout.
// Below lg the sidebar collapses into a hamburger-triggered drawer. jsdom cannot
// evaluate the `lg:` media query, so both the always-mounted sidebar nav and the
// (conditionally mounted) drawer nav live in the DOM; we assert on mount/unmount
// of the drawer copy rather than on CSS visibility.
const renderShell = () =>
  renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <AdminShell
            renderNav={(onNavigate) => (
              <nav>
                <NavLink to="/alpha" onClick={onNavigate}>
                  Alpha
                </NavLink>
              </nav>
            )}
            footer={<div>FOOTER_REGION</div>}
          />
        }
      >
        <Route index element={<div>OUTLET_CONTENT</div>} />
        <Route path="alpha" element={<div>ALPHA_CONTENT</div>} />
      </Route>
    </Routes>,
    { initialRoute: '/' }
  );

describe('AdminShell', () => {
  it('renders the nav, footer, and routed outlet content', () => {
    renderShell();

    expect(screen.getAllByRole('link', { name: /Alpha/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('FOOTER_REGION').length).toBeGreaterThan(0);
    expect(screen.getByText('OUTLET_CONTENT')).toBeInTheDocument();
  });

  it('mounts the hamburger collapsed by default', () => {
    renderShell();

    const hamburger = screen.getByRole('button', { name: /menu/i });
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    // Drawer not open → no close button yet.
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('opens the drawer from the hamburger and mounts a second nav copy', () => {
    renderShell();

    const before = screen.getAllByRole('link', { name: /Alpha/i }).length;
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));

    expect(screen.getByRole('button', { name: /menu/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: /Alpha/i }).length).toBe(before + 1);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('closes the drawer on Escape', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(screen.getByRole('button', { name: /menu/i })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /menu/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates and auto-closes the drawer when a drawer link is selected', () => {
    renderShell();

    // Open the drawer, then click its copy of the nav link. The drawer copy is
    // the one wired with onNavigate (the always-mounted desktop sidebar copy is
    // not), and it is rendered last in the DOM.
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    const drawerLink = screen.getAllByRole('link', { name: /Alpha/i }).at(-1)!;
    fireEvent.click(drawerLink);

    // It routed to /alpha …
    expect(screen.getByText('ALPHA_CONTENT')).toBeInTheDocument();
    // … and the drawer auto-closed (onNavigate → closeDrawer): the hamburger
    // reads collapsed and the drawer-only close button is unmounted.
    expect(screen.getByRole('button', { name: /menu/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });
});
