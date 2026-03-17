import '@/i18n';
import { AuthProvider } from '@/contexts/AuthContext';
import { Bootstrap } from '@/pages/Bootstrap';

const App = () => {
  return (
    <AuthProvider>
      <Bootstrap />
    </AuthProvider>
  );
};

export default App;
