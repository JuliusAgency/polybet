import { useMutation } from '@tanstack/react-query';
import { invokeSupabaseFunction } from '@/shared/api/supabase';

export type AdminReportType = 'managers_log' | 'bets_log' | 'system_dashboard';

export interface AdminReportFilters {
  started_at?: string;
  ended_at?:   string;
}

interface ExportPayload {
  report_type: AdminReportType;
  filters?:    AdminReportFilters;
  locale?:     string;
}

function normalizePdfBytes(data: unknown): Blob {
  if (data instanceof Blob)        return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: 'application/pdf' });
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy.buffer], { type: 'application/pdf' });
  }
  throw new Error('Unexpected PDF response payload');
}

function triggerDownload(blob: Blob, fileName: string) {
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function useExportAdminReport() {
  return useMutation({
    mutationFn: async ({ report_type, filters, locale }: ExportPayload) => {
      const { data, error } = await invokeSupabaseFunction<unknown>('export-admin-report', {
        method: 'POST',
        body: { report_type, filters: filters ?? {}, locale: locale ?? 'en' },
      });

      if (error) {
        const functionError = error as { message?: string };
        throw new Error(functionError.message ?? 'Failed to export report');
      }

      const fileName = `${report_type}-${new Date().toISOString().slice(0, 10)}.pdf`;
      triggerDownload(normalizePdfBytes(data), fileName);
    },
  });
}
