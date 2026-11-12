import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { jsonError, requireAuth, supabaseError, withApi } from '@/lib/api-response';
import { SELECTIONS_MIGRATION_MESSAGE, isSelectionTableMissing, isUuid, validateSelectionInput } from '@/lib/selections';
import { normalizeStatus } from '@/lib/status';

function selectionError(error) {
  if (isSelectionTableMissing(error) || (error.code === '23514' && error.message?.includes('selections_status_check'))) {
    return jsonError(SELECTIONS_MIGRATION_MESSAGE, 503);
  }
  if (error.code === '23503') return jsonError('企業が見つかりません。企業一覧を更新してください。', 404);
  return supabaseError(error);
}

async function readInput(request, options) {
  try {
    return validateSelectionInput(await request.json(), options);
  } catch {
    return { error: 'JSONの入力形式が正しくありません' };
  }
}

async function handleGet(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const companyId = new URL(request.url).searchParams.get('company_id');
  if (companyId !== null && !isUuid(companyId)) return jsonError('企業IDが正しくありません', 400);

  let query = getSupabase().from('selections').select('*').order('created_at', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) return selectionError(error);
  return NextResponse.json(data.map(selection => ({ ...selection, status: normalizeStatus(selection.status) })));
}

async function handlePost(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readInput(request);
  if (input.error) return jsonError(input.error, 400);
  const { data, error } = await getSupabase()
    .from('selections').insert(input.data).select().single();
  if (error) return selectionError(error);
  return NextResponse.json(data, { status: 201 });
}

async function handlePut(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('JSONの入力形式が正しくありません', 400);
  }
  const input = validateSelectionInput(body, { update: true });
  if (input.error) return jsonError(input.error, 400);
  const { data, error } = await getSupabase()
    .from('selections').update(input.data).eq('id', body.id).select().maybeSingle();
  if (error) return selectionError(error);
  if (!data) return jsonError('選考が見つかりません', 404);
  return NextResponse.json(data);
}

async function handleDelete(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const id = new URL(request.url).searchParams.get('id');
  if (!isUuid(id)) return jsonError('選考IDが正しくありません', 400);
  const { data, error } = await getSupabase()
    .from('selections').delete().eq('id', id).select('id').maybeSingle();
  if (error) return selectionError(error);
  if (!data) return jsonError('選考が見つかりません', 404);
  return NextResponse.json({ success: true });
}

export const GET = withApi(handleGet);
export const POST = withApi(handlePost);
export const PUT = withApi(handlePut);
export const DELETE = withApi(handleDelete);
