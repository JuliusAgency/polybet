import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';

export const systemSettingsQueryKey = (key: string) => ['admin', 'system-settings', key] as const;

async function fetchSystemSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data.value as T;
}

async function upsertSystemSetting<T>(key: string, value: T): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value }, { onConflict: 'key' });

  if (error) throw new Error(error.message);
}

export function useSystemSetting<T>(key: string) {
  return useQuery({
    queryKey: systemSettingsQueryKey(key),
    queryFn: () => fetchSystemSetting<T>(key),
  });
}

export function useUpdateSystemSetting<T>(key: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (value: T) => upsertSystemSetting<T>(key, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: systemSettingsQueryKey(key) });
    },
  });
}
