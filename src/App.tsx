import { Toaster } from 'sonner';
import { AppProviders } from '@/app/providers';
import { Router } from '@/app/router';
import '@/shared/i18n/config';

function App() {
  return (
    <AppProviders>
      <Router />
      <Toaster theme="dark" position="top-right" richColors />
    </AppProviders>
  );
}

export default App;
