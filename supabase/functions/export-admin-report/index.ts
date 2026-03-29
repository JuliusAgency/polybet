import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors, withCorsHeaders } from '../_shared/cors.ts';
import { buildReportDocument, type ReportDataset, validateExportRequest } from './reportBuilders.ts';
import { renderTextPdf } from './pdfRenderer.ts';

interface SupabaseError {
  message: string;
}

interface SupabaseAdminClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: SupabaseError | null }>;
  from(table: 'admin_action_logs'): {
    insert(values: Record<string, string>): Promise<{ error: SupabaseError | null }>;
  };
}

function buildPdfResponse(pdfBytes: Uint8Array, filename: string) {
  return new Response(pdfBytes, {
    status: 200,
    headers: withCorsHeaders({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="admin-report-${filename}"`,
      'Cache-Control': 'no-store',
    }),
  });
}

function mapRpcErrorToStatus(error: SupabaseError): number {
  const message = error.message.toLowerCase();

  if (
    message.includes('unsupported report_type') ||
    message.includes('invalid report range') ||
    message.includes('required') ||
    message.includes('not found')
  ) {
    return 400;
  }

  return 500;
}

async function fetchReportDataset(
  adminClient: SupabaseAdminClient,
  payload: ReturnType<typeof validateExportRequest>,
): Promise<ReportDataset> {
  const { data, error } = await adminClient.rpc('admin_get_report_dataset', {
    p_report_type: payload.report_type,
    p_started_at: payload.filters.started_at,
    p_ended_at: payload.filters.ended_at,
    p_manager_id: payload.filters.manager_id,
    p_user_id: payload.filters.user_id,
  });

  if (error) {
    throw Object.assign(new Error(error.message), { status: mapRpcErrorToStatus(error) });
  }

  return data as ReportDataset;
}

async function logAdminReportExport(
  adminClient: SupabaseAdminClient,
  callerId: string,
  reportType: string,
) {
  const { error } = await adminClient
    .from('admin_action_logs')
    .insert({
      action: `export_admin_report:${reportType}`,
      target_id: callerId,
      initiated_by: callerId,
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function handleExportAdminReportRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return buildCorsPreflightResponse('POST, OPTIONS');
  }

  if (req.method !== 'POST') {
    return jsonWithCors({ error: 'Method not allowed. Use POST.' }, 405);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonWithCors({ error: 'Invalid JSON body' }, 400);
  }

  let payload: ReturnType<typeof validateExportRequest>;
  try {
    payload = validateExportRequest(rawBody);
  } catch (error) {
    return jsonWithCors(
      { error: 'invalid_request', details: error instanceof Error ? error.message : String(error) },
      400,
    );
  }

  const authResult = await authorizeEdgeCall(req, {
    allowedRoles: ['super_admin'],
  });

  if (!authResult.ok) {
    return jsonWithCors(authResult.body, authResult.status);
  }

  if (!authResult.callerId) {
    return jsonWithCors({ error: 'Unauthorized' }, 401);
  }

  let dataset: ReportDataset;
  try {
    dataset = await fetchReportDataset(authResult.adminClient, payload);
  } catch (error) {
    return jsonWithCors(
      {
        error: 'report_fetch_failed',
        details: error instanceof Error ? error.message : String(error),
      },
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status: number }).status)
        : 500,
    );
  }

  const document = buildReportDocument(dataset);
  const pdfBytes = renderTextPdf(document.lines);

  try {
    await logAdminReportExport(authResult.adminClient, authResult.callerId, payload.report_type);
  } catch (error) {
    return jsonWithCors(
      {
        error: 'audit_log_failed',
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }

  return buildPdfResponse(pdfBytes, document.filename);
}

Deno.serve(handleExportAdminReportRequest);
