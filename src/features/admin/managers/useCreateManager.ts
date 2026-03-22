import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

interface CreateManagerInput {
  fullName: string;
  username: string;
  password: string;
  margin: number;
}

interface CreateManagerResult {
  id: string;
  username: string;
  generatedPassword: string;
}

export function useCreateManager() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: CreateManagerInput): Promise<CreateManagerResult> => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          role: 'manager',
          fullName: vars.fullName,
          username: vars.username,
          password: vars.password,
          margin: vars.margin,
        },
      });

      if (error) {
        // FunctionsHttpError carries the HTTP status; check the response body for 409
        const httpError = error as { context?: Response; message?: string };
        if (httpError.context instanceof Response && httpError.context.status === 409) {
          throw new Error('username_taken');
        }
        throw new Error(error.message);
      }

      if (data?.error === 'username_taken') {
        throw new Error('username_taken');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Validate expected fields before casting (same guard as useCreateUser)
      if (!data?.id || !data?.username || !data?.generatedPassword) {
        throw new Error('Unexpected response from create-user function');
      }

      return {
        id: data.id as string,
        username: data.username as string,
        generatedPassword: data.generatedPassword as string,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'managers'] });
    },
  });
}
