import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { jsonError, requireAuth, supabaseError, withApi } from '@/lib/api-response';
import { isUuid, validateInterviewMemoInput } from '@/lib/validation';

async function readMemoInput(request, options) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: '面接メモの入力形式が正しくありません' };
  }
  return validateInterviewMemoInput(body, options);
}


async function resolveEventCompany(supabase, data) {
  if (!data.event_id) return null;
  const result = await supabase.from('events').select('company_id').eq('id', data.event_id).maybeSingle();
  if (result.error) return supabaseError(result.error);
  if (!result.data) return jsonError('面接予定が見つかりません', 400);
  if (data.company_id && data.company_id !== result.data.company_id) return jsonError('面接予定と企業が一致しません', 400);
  data.company_id = result.data.company_id;
  return null;
}

function selectClause() {
  return `
    *,
    companies (id, name, industry),
    events!interview_memos_event_id_fkey (
      id,
      title,
      event_type,
      start_date,
      end_date,
      company_id,
      companies (id, name, industry)
    )
  `;
}

async function handleGet(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event_id');
  const companyId = searchParams.get('company_id');
  if ((eventId !== null && !isUuid(eventId)) || (companyId !== null && !isUuid(companyId))) {
    return jsonError('絞り込み条件のIDが正しくありません', 400);
  }

  const supabase = getSupabase();
  let query = supabase
    .from('interview_memos')
    .select(selectClause())
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (eventId) query = query.eq('event_id', eventId);
  if (companyId) query = query.eq('company_id', companyId);

  const { data, error } = await query;

  if (error) {
    return supabaseError(error);
  }

  return NextResponse.json(data);
}

async function handlePost(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readMemoInput(request);
  if (input.error) return jsonError(input.error, 400);

  const supabase = getSupabase();
  const linkError = await resolveEventCompany(supabase, input.data);
  if (linkError) return linkError;
  const { data, error } = await supabase
    .from('interview_memos')
    .insert([input.data])
    .select(selectClause())
    .single();

  if (error) {
    return supabaseError(error);
  }

  return NextResponse.json(data, { status: 201 });
}

async function handlePut(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readMemoInput(request, { update: true });
  if (input.error) return jsonError(input.error, 400);

  const supabase = getSupabase();
  const linkError = await resolveEventCompany(supabase, input.data);
  if (linkError) return linkError;
  const { data, error } = await supabase
    .from('interview_memos')
    .update(input.data)
    .eq('id', input.id)
    .select(selectClause())
    .maybeSingle();

  if (error) {
    return supabaseError(error);
  }
  if (!data) return jsonError('面接メモが見つかりません', 404);

  return NextResponse.json(data);
}

async function handleDelete(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!isUuid(id)) {
    return jsonError('面接メモIDが正しくありません', 400);
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('interview_memos')
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
