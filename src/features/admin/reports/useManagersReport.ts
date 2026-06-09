import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { AdminReportFilters } from './useExportAdminReport';

export interface ManagerReportRow {
  manager_id: string;
  manager_username: string;
  manager_full_name: string | null;
  deposits: number;
  withdrawals: number;
  profit: number;
}

export interface ManagerReportTotals {
  deposits: number;
  withdrawals: number;
  profit: number;
}

export interface ManagersReportResult {
  rows: ManagerReportRow[];
  totals: ManagerReportTotals;
  isLoading: boolean;
  error: Error | null;
}

interface ReportDatasetEnvelope {
  data: {
    rows: ManagerReportRow[];
    totals: ManagerReportTotals;
  };
}

const EMPTY_TOTALS: ManagerReportTotals = { deposits: 0, withdrawals: 0, profit: 0 };

const fetchManagersReport = async (
  filters: AdminReportFilters
): Promise<{ rows: ManagerReportRow[]; totals: ManagerReportTotals }> => {
  const { data, error } = await supabase.rpc('admin_get_report_dataset', {
    p_report_type: 'managers_report',
    p_started_at: filters.started_at ?? null,
    p_ended_at: filters.ended_at ?? null,
  });

  if (error) throw new Error(error.message);

  const dataset = (data as ReportDatasetEnvelope | null)?.data;
  const rows = (dataset?.rows ?? []).map((row) => ({
    ...row,
    deposits: Number(row.deposits),
    withdrawals: Number(row.withdrawals),
    profit: Number(row.profit),
  }));
  const totals = dataset?.totals
    ? {
        deposits: Number(dataset.totals.deposits),
        withdrawals: Number(dataset.totals.withdrawals),
        profit: Number(dataset.totals.profit),
      }
    : EMPTY_TOTALS;

  return { rows, totals };
};

export function useManagersReport(filters: AdminReportFilters): ManagersReportResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'managers-report', filters.started_at ?? null, filters.ended_at ?? null],
    queryFn: () => fetchManagersReport(filters),
  });

  return {
    rows: data?.rows ?? [],
    totals: data?.totals ?? EMPTY_TOTALS,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
