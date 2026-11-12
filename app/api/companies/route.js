import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { jsonError, requireAuth, supabaseError, withApi } from '@/lib/api-response';
import { SELECTIONS_MIGRATION_MESSAGE, isSelectionTableMissing, isUuid } from '@/lib/selections';
import { normalizeStatus } from '@/lib/status';
import { validateCompanyInput } from '@/lib/validation';

async function loadSelections(supabase, companyId) {
  let query = supabase.from('selections').select('*').order('created_at', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  return { data: data?.map(selection => ({ ...selection, status: normalizeStatus(selection.status) })), error };
}

function selectionsLoadError(error) {
  return isSelectionTableMissing(error) ? jsonError(SELECTIONS_MIGRATION_MESSAGE, 503) : supabaseError(error);
}

// selections are managed through their own API and are never written here.
async function readCompanyInput(request, options) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: '企業の入力形式が正しくありません' };
  }
  return validateCompanyInput(body, options);
}

// GET: 全企業を取得
async function handleGet(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const supabase = getSupabase();
  const [companiesResult, selectionsResult] = await Promise.all([
    supabase.from('companies').select('*').order('interest', { ascending: false }),
    loadSelections(supabase),
  ]);
  const { data, error } = companiesResult;

  if (error) {
    return supabaseError(error);
  }

  if (selectionsResult.error) return selectionsLoadError(selectionsResult.error);
  const byCompany = new Map();
  for (const selection of selectionsResult.data || []) {
    if (!byCompany.has(selection.company_id)) byCompany.set(selection.company_id, []);
    byCompany.get(selection.company_id).push(selection);
  }
  return NextResponse.json(data.map((company) => ({
    ...company,
    selections: byCompany.get(company.id) || [],
  })));
}

// POST: 企業を追加
async function handlePost(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readCompanyInput(request);
  if (input.error) return jsonError(input.error, 400);
  const { data, error } = await getSupabase()
    .from('companies')
    .insert([input.data])
    .select()
    .single();

  if (error) {
    return supabaseError(error);
  }

  // A new company starts without selections; they are added separately.
  return NextResponse.json({ ...data, selections: [] }, { status: 201 });
}

// PUT: 企業を更新
async function handlePut(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readCompanyInput(request, { update: true });
  if (input.error) return jsonError(input.error, 400);
  const { id, data: updateData } = input;
  const supabase = getSupabase();

  const selectionsResult = await loadSelections(supabase, id);
  if (selectionsResult.error) return selectionsLoadError(selectionsResult.error);

  const query = Object.keys(updateData).length
    ? supabase.from('companies').update(updateData).eq('id', id).select()
    : supabase.from('companies').select('*').eq('id', id);
  const { data, error } = await query.single();

  if (error) {
    return supabaseError(error);
  }

  return NextResponse.json({ ...data, selections: selectionsResult.data });
}

// DELETE: 企業を削除
async function handleDelete(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!isUuid(id)) {
    return jsonError('企業IDが正しくありません', 400);
  }

  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id);

  if (error) {
    return supabaseError(error);
  }

  return NextResponse.json({ success: true });
}

export const GET = withApi(handleGet);
export const POST = withApi(handlePost);
export const PUT = withApi(handlePut);
export const DELETE = withApi(handleDelete);
