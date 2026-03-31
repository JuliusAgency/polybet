import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeEdgeCall } from '../_shared/edgeAuth.ts';
import { buildCorsPreflightResponse, jsonWithCors, withCorsHeaders } from '../_shared/cors.ts';
import { buildReportDocument, type ReportDataset, validateExportRequest } from './reportBuilders.ts';
import { renderTablePdf } from './pdfRenderer.ts';

interface SupabaseError { message: string }

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
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    }),
  });
}

function mapRpcErrorToStatus(error: SupabaseError): number {
  const msg = error.message.toLowerCase();
  if (
    msg.includes('unsupported report_type') ||
    msg.includes('invalid report range') ||
    msg.includes('required') ||
    msg.includes('not found')
  ) return 400;
  return 500;
}

// Uses caller's JWT so auth.uid() works correctly inside SECURITY DEFINER SQL functions.
// adminClient (service role) sets auth.uid() = NULL, breaking is_super_admin() checks.
function createCallerRpcClient(authHeader: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
}

async function fetchReportDataset(
  authHeader: string,
  payload: ReturnType<typeof validateExportRequest>,
): Promise<ReportDataset> {
  const callerClient = createCallerRpcClient(authHeader);
  const { data, error } = await callerClient.rpc('admin_get_report_dataset', {
    p_report_type: payload.report_type,
    p_started_at:  payload.filters.started_at,
    p_ended_at:    payload.filters.ended_at,
    p_manager_id:  null,
    p_user_id:     null,
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
  const { error } = await adminClient.from('admin_action_logs').insert({
    action:       `export_admin_report:${reportType}`,
    target_id:    callerId,
    initiated_by: callerId,
  });
  if (error) throw new Error(error.message);
}

export async function handleExportAdminReportRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return buildCorsPreflightResponse('POST, OPTIONS');
  if (req.method !== 'POST')    return jsonWithCors({ error: 'Method not allowed. Use POST.' }, 405);

  let rawBody: unknown;
  try { rawBody = await req.json(); }
  catch { return jsonWithCors({ error: 'Invalid JSON body' }, 400); }

  let payload: ReturnType<typeof validateExportRequest>;
  try { payload = validateExportRequest(rawBody); }
  catch (error) {
    return jsonWithCors(
      { error: 'invalid_request', details: error instanceof Error ? error.message : String(error) },
      400,
    );
  }

  const authResult = await authorizeEdgeCall(req, { allowedRoles: ['super_admin'] });
  if (!authResult.ok)       return jsonWithCors(authResult.body, authResult.status);
  if (!authResult.callerId) return jsonWithCors({ error: 'Unauthorized' }, 401);

  const authHeader = req.headers.get('Authorization') ?? '';

  let dataset: ReportDataset;
  try {
    dataset = await fetchReportDataset(authHeader, payload);
  } catch (error) {
    return jsonWithCors(
      { error: 'report_fetch_failed', details: error instanceof Error ? error.message : String(error) },
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status: number }).status)
        : 500,
    );
  }

  try {
    const document = buildReportDocument(dataset);
    const pdfBytes = await renderTablePdf(document);

    try {
      await logAdminReportExport(authResult.adminClient, authResult.callerId, payload.report_type);
    } catch {
      // Non-critical: audit log failure must not block the export response
    }

    return buildPdfResponse(pdfBytes, document.filename);
  } catch (error) {
    return jsonWithCors(
      { error: 'pdf_render_failed', details: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

Deno.serve(handleExportAdminReportRequest);
