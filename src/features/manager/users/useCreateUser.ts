import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

interface CreateUserInput {
  fullName: string;
  username: string;
  password: string;
  phone?: string;
  notes?: string;
}

interface CreateUserResult {
  id: string;
  username: string;
  generatedPassword: string;
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: CreateUserInput): Promise<CreateUserResult> => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          role: 'user',
          fullName: vars.fullName,
          username: vars.username,
          password: vars.password,
          phone: vars.phone,
          notes: vars.notes,
        },
      });

      if (error) {
        // FunctionsHttpError carries the HTTP status; check for 409 username conflict
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

      // Validate expected fields are present before returning
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
      queryClient.invalidateQueries({ queryKey: ['manager', 'users'] });
    },
  });
}
