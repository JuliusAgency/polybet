import { AppProviders } from '@/app/providers';
import { Router } from '@/app/router';
import '@/shared/i18n/config';

function App() {
  return (
    <AppProviders>
      <Router />
    </AppProviders>
  );
}

export default App;
