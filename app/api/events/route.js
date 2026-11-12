import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { jsonError, requireAuth, supabaseError, withApi } from '@/lib/api-response';
import { addDays } from '@/lib/date';
import { SELECTIONS_MIGRATION_MESSAGE, isSelectionTableMissing } from '@/lib/selections';
import { isUuid, validateEventInput, validateEventRange } from '@/lib/validation';

const EVENT_SELECT = `
  *,
  companies (id, name, industry)
`;

const EVENT_LINK_MIGRATION_MESSAGE = '予定の完了と選考の紐づけには、データベースの更新が必要です。時刻の保存にも最新の更新が必要です。READMEの「既存環境を更新する場合」に従って、未実行のマイグレーションを実行してください。';

async function readEventInput(request, options) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: '予定の入力形式が正しくありません' };
  }
  return validateEventInput(body, options);
}

// events.done and events.selection_id come from a later migration. Until it
// runs, PostgREST rejects writes that name them.
function isMissingEventLinkColumnError(error) {
  const code = error?.code || '';
  const msg = error?.message || '';
  return (code === 'PGRST204' || code === '42703') && /\b(done|selection_id|start_time|end_time)\b/.test(msg);
}

// Writing without the new columns loses nothing only when they hold their
// defaults.
function canSkipEventLinkFields(data) {
  return !data.start_time && !data.end_time && data.done !== true && (data.selection_id === null || data.selection_id === undefined);
}

function stripEventLinkFields(data) {
  const { done, selection_id, start_time, end_time, ...rest } = data;
  return rest;
}

// A linked selection must exist and belong to the event's company; an event
// with only a selection takes that selection's company. Returns an error
// response, or null when the input is consistent.
async function resolveSelectionLink(supabase, data) {
  if (!data.selection_id) return null;
  const { data: selection, error } = await supabase
    .from('selections')
    .select('id, company_id')
    .eq('id', data.selection_id)
    .maybeSingle();
  if (error) {
    return isSelectionTableMissing(error) ? jsonError(SELECTIONS_MIGRATION_MESSAGE, 503) : supabaseError(error);
  }
  if (!selection) return jsonError('選考が見つかりません', 400);
  if (!data.company_id) {
    data.company_id = selection.company_id;
  } else if (String(data.company_id).toLowerCase() !== String(selection.company_id).toLowerCase()) {
    return jsonError('選考と企業が一致しません', 400);
  }
  return null;
}

// Runs a write, retrying once without done/selection_id on a database that
// lacks them when that drops nothing the user asked for.
async function writeEvent(data, write) {
  let result = await write(data);
  if (result.error && isMissingEventLinkColumnError(result.error)) {
    if (!canSkipEventLinkFields(data)) return { response: jsonError(EVENT_LINK_MIGRATION_MESSAGE, 503) };
    result = await write(stripEventLinkFields(data));
  }
  return result;
}

// GET: イベント一覧を取得（クエリパラメータで期間・月フィルタ対応）
async function handleGet(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  // The values below end up inside a PostgREST filter string, so they are
  // validated as exact dates before use.
  const filter = validateEventRange({
    startDate: searchParams.get('startDate'), // グリッド表示開始日 (YYYY-MM-DD)
    endDate: searchParams.get('endDate'), // グリッド表示終了日 (YYYY-MM-DD)
    // 後方互換: year/month パラメータも引き続きサポート
    year: searchParams.get('year'),
    month: searchParams.get('month'),
  });
  if (filter.error) return jsonError(filter.error, 400);

  let query = getSupabase()
    .from('events')
    .select(EVENT_SELECT)
    .order('start_date', { ascending: true });

  let rangeStart;
  let rangeEndExclusive;
  if (filter.range) {
    rangeStart = filter.range.startDate;
    rangeEndExclusive = addDays(filter.range.endDate, 1);
  } else if (filter.month) {
    const { year, month } = filter.month;
    rangeStart = `${year}-${String(month).padStart(2, '0')}-01`;
    rangeEndExclusive = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  }

  if (rangeStart) {
    // 「予定の期間が範囲と重なる」イベントを取得
    // 条件: start_date < 範囲の翌日 かつ (end_date >= 開始日 OR (end_date IS NULL AND start_date >= 開始日))
    query = query
      .lt('start_date', rangeEndExclusive)
      .or(`end_date.gte.${rangeStart},and(end_date.is.null,start_date.gte.${rangeStart})`);
  }

  const { data, error } = await query;
  if (error) return supabaseError(error);
  return NextResponse.json(data);
}

// POST: イベントを追加
async function handlePost(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readEventInput(request);
  if (input.error) return jsonError(input.error, 400);

  const supabase = getSupabase();
  const linkError = await resolveSelectionLink(supabase, input.data);
  if (linkError) return linkError;

  const { data, error, response } = await writeEvent(input.data, row => supabase
    .from('events')
    .insert([row])
    .select(EVENT_SELECT)
    .single());

  if (response) return response;
  if (error) return supabaseError(error);
  return NextResponse.json(data, { status: 201 });
}

// PUT: イベントを更新
async function handlePut(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readEventInput(request, { update: true });
  if (input.error) return jsonError(input.error, 400);

  const supabase = getSupabase();
  if (!Object.hasOwn(input.data, 'selection_id')) {
    const current = await supabase.from('events').select('*').eq('id', input.id).maybeSingle();
    if (current.error) return supabaseError(current.error);
    if (!current.data) return jsonError('予定が見つかりません', 404);
    if (current.data.selection_id) input.data.selection_id = current.data.selection_id;
  }
  const linkError = await resolveSelectionLink(supabase, input.data);
  if (linkError) return linkError;

  const { data, error, response } = await writeEvent(input.data, row => supabase
    .from('events')
    .update(row)
    .eq('id', input.id)
    .select(EVENT_SELECT)
    .maybeSingle());

  if (response) return response;
  if (error) return supabaseError(error);
  if (!data) return jsonError('予定が見つかりません', 404);
  return NextResponse.json(data);
}

// DELETE: イベントを削除
async function handleDelete(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const id = new URL(request.url).searchParams.get('id');
  if (!isUuid(id)) return jsonError('予定IDが正しくありません', 400);

  const { error } = await getSupabase()
    .from('events')
    .delete()
    .eq('id', id);

  if (error) return supabaseError(error);
  return NextResponse.json({ success: true });
}

export const GET = withApi(handleGet);
export const POST = withApi(handlePost);
export const PUT = withApi(handlePut);
export const DELETE = withApi(handleDelete);
