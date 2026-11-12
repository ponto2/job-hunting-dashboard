import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { jsonError, requireAuth, withApi } from '@/lib/api-response';
import { BACKUP_TABLES, buildBackup, summarizeRestore, validateBackup } from '@/lib/backup';

// Supabase returns at most 1000 rows per request, so tables are read in pages.
const PAGE_SIZE = 1000;
const MISSING_TABLE_CODES = ['42P01', 'PGRST205'];
const MISSING_FUNCTION_CODES = ['42883', 'PGRST202'];

async function fetchAll(supabase, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    // Older installations may not have every table yet.
    if (error) return MISSING_TABLE_CODES.includes(error.code) ? { data: [] } : { error };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { data: rows };
  }
}

// GET: すべてのデータをバックアップとして書き出す
async function handleGet(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const supabase = getSupabase();
  const data = {};
  for (const table of BACKUP_TABLES) {
    const result = await fetchAll(supabase, table);
    if (result.error) return jsonError(`バックアップの作成に失敗しました: ${result.error.message}`, 500);
    data[table] = result.data;
  }
  return NextResponse.json(buildBackup(data));
}

// POST: バックアップを復元する（1トランザクション。失敗時は何も変更しない）
async function handlePost(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('バックアップファイルを読み取れませんでした', 400);
  }
  const backup = validateBackup(body);
  if (backup.error) return jsonError(backup.error, 400);

  const { data, error } = await getSupabase().rpc('restore_backup', { payload: backup.data });
  if (error) {
    if (MISSING_FUNCTION_CODES.includes(error.code)) {
      return jsonError('バックアップ復元のデータベース更新が必要です。READMEの「既存環境を更新する場合」に従って、未実行のマイグレーションを実行してください。', 503);
    }
    return jsonError(`復元に失敗しました（データは変更されていません）: ${error.message}`, 500);
  }
  return NextResponse.json({ result: data, summary: summarizeRestore(data) });
}

export const GET = withApi(handleGet);
export const POST = withApi(handlePost);
