import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/shared/hooks/useAuth';
import { ROUTES } from '@/app/router/routes';

interface UseSignOutResult {
  signOut: () => Promise<void>;
  isPending: boolean;
}

export const useSignOut = (): UseSignOutResult => {
  const { signOut: authSignOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const signOut = async (): Promise<void> => {
    setIsPending(true);
    try {
      await authSignOut();
      queryClient.removeQueries({ queryKey: ['user'] });
      queryClient.removeQueries({ queryKey: ['markets-by-ids'] });
      navigate(ROUTES.SIGN_IN, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      toast.error(message);
      navigate(ROUTES.SIGN_IN, { replace: true });
    } finally {
      setIsPending(false);
    }
  };

  return { signOut, isPending };
};
