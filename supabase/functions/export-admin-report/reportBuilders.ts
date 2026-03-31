export const SUPPORTED_REPORT_TYPES = [
  'managers_log',
  'bets_log',
  'system_dashboard',
] as const;

export type SupportedReportType = (typeof SUPPORTED_REPORT_TYPES)[number];

export interface ExportFilters {
  started_at: string | null;
  ended_at:   string | null;
}

export interface ExportRequestPayload {
  report_type: SupportedReportType;
  filters?: Partial<ExportFilters> | null;
}

export interface KpiRow {
  label: string;
  value: string;
}

export interface TableSection {
  columns: string[];
  rows:    string[][];
}

export interface ReportDocument {
  title:    string;
  filename: string;
  period:   string;
  type:     SupportedReportType;
  kpis?:    KpiRow[];
  table?:   TableSection;
}

export interface ReportDataset {
  report_type:   string;
  generated_at?: string | null;
  filters?:      Partial<ExportFilters> | null;
  data?:         unknown;
}

const REPORT_TITLES: Record<SupportedReportType, string> = {
  managers_log:     'יומן פעולות',
  bets_log:         'יומן כללי',
  system_dashboard: 'לוח קכרה',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('filters must use string values');
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoDate(value: unknown, fieldName: 'started_at' | 'ended_at'): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO-8601 datetime`);
  }
  return parsed.toISOString();
}

export function validateExportRequest(body: unknown): {
  report_type: SupportedReportType;
  filters: ExportFilters;
} {
  if (!isRecord(body)) throw new Error('Request body must be a JSON object');

  if (!SUPPORTED_REPORT_TYPES.includes(body.report_type as SupportedReportType)) {
    throw new Error(`report_type must be one of: ${SUPPORTED_REPORT_TYPES.join(', ')}`);
  }

  const rawFilters = body.filters;
  if (rawFilters != null && !isRecord(rawFilters)) {
    throw new Error('filters must be an object when provided');
  }

  const filters: ExportFilters = {
    started_at: normalizeIsoDate(rawFilters?.started_at, 'started_at'),
    ended_at:   normalizeIsoDate(rawFilters?.ended_at,   'ended_at'),
  };

  if (
    filters.started_at &&
    filters.ended_at &&
    new Date(filters.started_at).getTime() > new Date(filters.ended_at).getTime()
  ) {
    throw new Error('started_at must be before or equal to ended_at');
  }

  return { report_type: body.report_type as SupportedReportType, filters };
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatNum(value: unknown): string {
  if (typeof value === 'number') return value.toFixed(2);
  if (typeof value === 'string') return value;
  return String(value ?? '—');
}

function safePeriod(filters: Partial<ExportFilters> | null | undefined): string {
  const start = filters?.started_at ? formatDate(filters.started_at) : null;
  const end   = filters?.ended_at   ? formatDate(filters.ended_at)   : null;
  if (start && end) return `${start} – ${end}`;
  if (start) return `from ${start}`;
  if (end)   return `to ${end}`;
  return 'All time';
}

function buildManagersLogDocument(dataset: ReportDataset): ReportDocument {
  const data    = isRecord(dataset.data) ? dataset.data : {};
  const rawRows = Array.isArray(data['rows']) ? data['rows'] : [];

  const rows: string[][] = rawRows.map((row) => {
    if (!isRecord(row)) return ['', '', '', '', ''];
    return [
      row['created_at'] ? formatDate(String(row['created_at'])) : '—',
      String(row['action']          ?? '—'),
      String(row['target_username'] ?? '—'),
      String(row['actor_username']  ?? '—'),
      String(row['actor_role']      ?? '—'),
    ];
  });

  return {
    title:    REPORT_TITLES.managers_log,
    type:     'managers_log',
    period:   safePeriod(dataset.filters),
    filename: `managers-log-${new Date().toISOString().slice(0, 10)}.pdf`,
    table: {
      columns: ['Date', 'Action', 'Target', 'Actor', 'Role'],
      rows,
    },
  };
}

function buildBetsLogDocument(dataset: ReportDataset): ReportDocument {
  const data    = isRecord(dataset.data) ? dataset.data : {};
  const rawRows = Array.isArray(data['rows']) ? data['rows'] : [];

  const rows: string[][] = rawRows.map((row) => {
    if (!isRecord(row)) return ['', '', '', '', '', '', '', ''];
    const market = String(row['market_description'] ?? '—');
    return [
      row['placed_at'] ? formatDate(String(row['placed_at'])) : '—',
      String(row['user_username']    ?? '—'),
      String(row['manager_username'] ?? '—'),
      market.length > 35 ? `${market.slice(0, 35)}…` : market,
      formatNum(row['stake']),
      formatNum(row['locked_odds']),
      formatNum(row['potential_payout']),
      String(row['status'] ?? '—'),
    ];
  });

  return {
    title:    REPORT_TITLES.bets_log,
    type:     'bets_log',
    period:   safePeriod(dataset.filters),
    filename: `bets-log-${new Date().toISOString().slice(0, 10)}.pdf`,
    table: {
      columns: ['Date', 'User', 'Manager', 'Market', 'Stake', 'Odds', 'Payout', 'Status'],
      rows,
    },
  };
}

function buildSystemDashboardDocument(dataset: ReportDataset): ReportDocument {
  const data   = isRecord(dataset.data) ? dataset.data : {};
  const kpis   = isRecord(data['kpis'])   ? data['kpis']   : {};
  const counts = isRecord(data['counts']) ? data['counts'] : {};

  return {
    title:    REPORT_TITLES.system_dashboard,
    type:     'system_dashboard',
    period:   safePeriod(dataset.filters),
    filename: `system-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`,
    kpis: [
      { label: 'סך נקודות במערכת', value: formatNum(kpis['total_system_points']) },
      { label: 'חשיפה פתוחה',      value: formatNum(kpis['open_exposure'])       },
      { label: 'רווח מערכת',        value: formatNum(kpis['system_profit'])       },
    ],
    table: {
      columns: ['Category', 'Count'],
      rows: [
        ['Users',    String(counts['users']    ?? '0')],
        ['Managers', String(counts['managers'] ?? '0')],
        ['Markets',  String(counts['markets']  ?? '0')],
      ],
    },
  };
}

export function buildReportDocument(dataset: ReportDataset): ReportDocument {
  switch (dataset.report_type) {
    case 'managers_log':     return buildManagersLogDocument(dataset);
    case 'bets_log':         return buildBetsLogDocument(dataset);
    case 'system_dashboard': return buildSystemDashboardDocument(dataset);
    default:
      throw new Error(`Unsupported report_type: ${dataset.report_type}`);
  }
}
