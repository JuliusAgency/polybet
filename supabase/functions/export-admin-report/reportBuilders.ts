export const SUPPORTED_REPORT_TYPES = [
  'system_summary',
  'managers_performance',
  'manager_detailed',
  'user_statement',
  'audit_actions',
] as const;

export type SupportedReportType = (typeof SUPPORTED_REPORT_TYPES)[number];

export interface ExportFilters {
  started_at: string | null;
  ended_at: string | null;
  manager_id: string | null;
  user_id: string | null;
}

export interface ExportRequestPayload {
  report_type: SupportedReportType;
  filters?: Partial<ExportFilters> | null;
}

export interface ReportDataset {
  report_type: string;
  generated_at?: string | null;
  filters?: Partial<ExportFilters> | null;
  data?: unknown;
}

export interface BuiltReportDocument {
  title: string;
  filename: string;
  lines: string[];
}

const REPORT_TITLES: Record<SupportedReportType, string> = {
  system_summary: 'System Summary Report',
  managers_performance: 'Managers Performance Report',
  manager_detailed: 'Manager Detailed Report',
  user_statement: 'User Statement Report',
  audit_actions: 'Audit Actions Report',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error('filters must use string values');
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoDate(value: unknown, fieldName: 'started_at' | 'ended_at'): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO-8601 datetime`);
  }

  return parsed.toISOString();
}

function normalizeUuid(value: unknown, fieldName: 'manager_id' | 'user_id'): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }

  return normalized;
}

function formatDisplayTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'n/a';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
}

function formatScalar(value: unknown): string {
  if (value == null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (value == null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(', ')}]`;
  }

  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}: ${stableStringify(value[key])}`);

    return `{${entries.join(', ')}}`;
  }

  return JSON.stringify(String(value));
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'report';
}

function wrapLine(value: string, width = 92): string[] {
  if (value.length <= width) {
    return [value];
  }

  const lines: string[] = [];
  let remaining = value;

  while (remaining.length > width) {
    let splitAt = remaining.lastIndexOf(' ', width);
    if (splitAt <= 0) {
      splitAt = width;
    }

    lines.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    lines.push(remaining);
  }

  return lines;
}

function pushWrapped(lines: string[], value: string, width = 92) {
  for (const line of wrapLine(value, width)) {
    lines.push(line);
  }
}

function appendSection(lines: string[], label: string, value: unknown, depth = 0) {
  const indent = '  '.repeat(depth);

  if (Array.isArray(value)) {
    lines.push(`${indent}${label}:`);

    if (value.length === 0) {
      lines.push(`${indent}  (empty)`);
      return;
    }

    value.forEach((entry, index) => {
      if (isRecord(entry) || Array.isArray(entry)) {
        appendSection(lines, `Item ${index + 1}`, entry, depth + 1);
        return;
      }

      pushWrapped(lines, `${indent}  - ${formatScalar(entry)}`);
    });
    return;
  }

  if (isRecord(value)) {
    lines.push(`${indent}${label}:`);
    const keys = Object.keys(value).sort();

    if (keys.length === 0) {
      lines.push(`${indent}  (empty)`);
      return;
    }

    for (const key of keys) {
      appendSection(lines, key, value[key], depth + 1);
    }
    return;
  }

  pushWrapped(lines, `${indent}${label}: ${formatScalar(value)}`);
}

export function validateExportRequest(body: unknown): {
  report_type: SupportedReportType;
  filters: ExportFilters;
} {
  if (!isRecord(body)) {
    throw new Error('Request body must be a JSON object');
  }

  if (!SUPPORTED_REPORT_TYPES.includes(body.report_type as SupportedReportType)) {
    throw new Error(`report_type must be one of: ${SUPPORTED_REPORT_TYPES.join(', ')}`);
  }

  const rawFilters = body.filters;
  if (rawFilters != null && !isRecord(rawFilters)) {
    throw new Error('filters must be an object when provided');
  }

  const filters: ExportFilters = {
    started_at: normalizeIsoDate(rawFilters?.started_at, 'started_at'),
    ended_at: normalizeIsoDate(rawFilters?.ended_at, 'ended_at'),
    manager_id: normalizeUuid(rawFilters?.manager_id, 'manager_id'),
    user_id: normalizeUuid(rawFilters?.user_id, 'user_id'),
  };

  if (
    filters.started_at &&
    filters.ended_at &&
    new Date(filters.started_at).getTime() > new Date(filters.ended_at).getTime()
  ) {
    throw new Error('started_at must be before or equal to ended_at');
  }

  if (body.report_type === 'manager_detailed' && !filters.manager_id) {
    throw new Error('filters.manager_id is required for manager_detailed');
  }

  if (body.report_type === 'user_statement' && !filters.user_id) {
    throw new Error('filters.user_id is required for user_statement');
  }

  return {
    report_type: body.report_type as SupportedReportType,
    filters,
  };
}

export function buildReportDocument(dataset: ReportDataset): BuiltReportDocument {
  const normalizedReportType = SUPPORTED_REPORT_TYPES.includes(dataset.report_type as SupportedReportType)
    ? (dataset.report_type as SupportedReportType)
    : 'system_summary';
  const title = REPORT_TITLES[normalizedReportType];
  const generatedAt = formatDisplayTimestamp(dataset.generated_at ?? null);
  const filters = dataset.filters ?? {};
  const timestampSegment = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines: string[] = [
    title,
    '',
    `Report Type: ${dataset.report_type}`,
    `Generated At: ${generatedAt}`,
    '',
    'Filters:',
    `  started_at: ${formatDisplayTimestamp(filters.started_at ?? null)}`,
    `  ended_at: ${formatDisplayTimestamp(filters.ended_at ?? null)}`,
    `  manager_id: ${filters.manager_id ?? 'n/a'}`,
    `  user_id: ${filters.user_id ?? 'n/a'}`,
    '',
    'Dataset:',
  ];

  appendSection(lines, 'data', dataset.data ?? null, 1);

  return {
    title,
    filename: `${sanitizeFilenameSegment(dataset.report_type)}-${sanitizeFilenameSegment(timestampSegment)}.pdf`,
    lines,
  };
}
