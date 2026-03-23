import { supabase } from './client.ts';
import { invokeAuthedFunction } from './invokeAuthedFunction.ts';

interface InvokeSupabaseFunctionOptions {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  region?: string;
  signal?: AbortSignal;
}

export async function invokeSupabaseFunction<TData = unknown>(
  functionName: string,
  options: InvokeSupabaseFunctionOptions = {}
) {
  return invokeAuthedFunction<TData>(supabase, functionName, options);
}
