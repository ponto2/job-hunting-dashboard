import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { jsonError, requireAuth, supabaseError, withApi } from '@/lib/api-response';
import { isUuid, validateEsEntryInput } from '@/lib/validation';

export const PUT = withApi(async request => {
  const authError = await requireAuth(request);
  if (authError) return authError;
  const body = await request.json();
  if (!body || !Array.isArray(body.entry_ids) || !body.entry_ids.length || body.entry_ids.length > 20000 || !body.entry_ids.every(isUuid)) return jsonError('回答の指定が正しくありません', 400);
  const input = validateEsEntryInput({ question: body.question, category: body.category, char_limit: body.char_limit });
  if (input.error) return jsonError(input.error, 400);
  const { data, error } = await getSupabase().rpc('update_es_question', {
    entry_ids: [...new Set(body.entry_ids)], question: input.data.question,
    category: input.data.category || 'その他', char_limit: input.data.char_limit ?? null,
  });
  if (error?.code === 'PGRST202') return jsonError('設問の一括編集には最新のデータベース更新が必要です', 503);
  if (error) return ['22023', 'P0002'].includes(error.code) ? jsonError(error.message, 400) : supabaseError(error);
  return NextResponse.json(data);
});
