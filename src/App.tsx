import { Toaster } from 'sonner';
import { useTranslation } from 'react-i18next';
import { AppProviders } from '@/app/providers';
import { Router } from '@/app/router';
import { useTheme } from '@/shared/hooks/useTheme';
import '@/shared/i18n/config';

function AppToaster() {
  const { i18n } = useTranslation();
  const { theme } = useTheme();
  const dir = i18n.language === 'he' ? 'rtl' : 'ltr';
  return <Toaster theme={theme} position="top-right" richColors closeButton dir={dir} />;
}

function App() {
  return (
    <AppProviders>
      <Router />
      <AppToaster />
    </AppProviders>
  );
}

export default App;
