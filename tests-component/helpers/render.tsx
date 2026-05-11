import { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/app/providers/AuthProvider/AuthContext';
import i18n from '@/shared/i18n/config';

// Anonymous auth stub. Component tests that need authenticated state can
// override `authValue` in renderWithProviders options. AuthProvider itself
// is too heavy for jsdom — it dynamically imports supabase client at mount,
// which makes timing non-deterministic. Providing the context directly is
// faster and gives tests precise control over role/profile.
const anonymousAuth: AuthContextValue = {
  user: null,
  session: null,
  profile: null,
  role: null,
  loading: false,
  signIn: async () => {},
  signOut: async () => {},
};

// Component renderer with the minimum provider envelope used by widgets in
// the polybet feed (router for <Link>, i18n for t(), TanStack Query for
// hooks). We intentionally exclude AuthProvider/ThemeProvider/RTLProvider —
// each test opts in when it needs them. Keeping the default small means
// errors from missing context surface as targeted failures, not a wall of
// noise from unrelated providers.
//
// retry: false — we want network mocks to either match or fail, never to
// be retried into eventual success.
export function renderWithProviders(
  ui: ReactElement,
  options: {
    initialRoute?: string;
    queryClient?: QueryClient;
    authValue?: AuthContextValue;
  } & RenderOptions = {}
) {
  const { initialRoute = '/', queryClient, authValue = anonymousAuth, ...rest } = options;
  const client =
    queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={authValue}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
        </I18nextProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
    rest
  );
}
