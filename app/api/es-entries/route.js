import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { jsonError, requireAuth, supabaseError, withApi } from '@/lib/api-response';
import { isUuid, validateEsEntryInput } from '@/lib/validation';
import { getEntryCompanyIds } from '@/lib/es-entries';

// Only real columns are kept; relations and virtual fields such as
// company_names are dropped by the validator.
async function readEsInput(request, options) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: 'ESメモの入力形式が正しくありません' };
  }
  return validateEsEntryInput(body, options);
}

function withDefaults(entry) {
  if (!entry) return entry;
  return {
    category: 'その他',
    is_template: false,
    ...entry,
  };
}

async function enrichEntries(supabase, entries) {
  const list = entries || [];
  const allCompanyIds = new Set();
  list.forEach(entry => {
    getEntryCompanyIds(entry).forEach(id => allCompanyIds.add(id));
  });

  const companiesMap = {};
  if (allCompanyIds.size > 0) {
    const { data: companiesData } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', [...allCompanyIds]);

    (companiesData || []).forEach(c => { companiesMap[c.id] = c.name; });
  }

  return list.map(entry => {
    const names = getEntryCompanyIds(entry).map(id => companiesMap[id]).filter(Boolean);
    return {
      ...withDefaults(entry),
      company_names: names.length > 0 ? names.join(' / ') : null,
    };
  });
}

async function enrichEntry(supabase, entry) {
  const [enriched] = await enrichEntries(supabase, [entry]);
  return enriched;
}

function stripOptionalReuseFields(body) {
  const { category, is_template, thread_id, ...rest } = body;
  return rest;
}

function isMissingOptionalColumnError(error) {
  const msg = error?.message || '';
  return msg.includes('category') || msg.includes('is_template') || msg.includes('thread_id');
}

function normalizeQuestionKey(question) {
  return (question || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isThreadStorageUnavailable(error) {
  const msg = error?.message || '';
  const code = error?.code || '';
  return (
    code === '42P01' ||
    code === '42703' ||
    msg.includes('es_question_threads') ||
    msg.includes('thread_id') ||
    msg.includes('Could not find')
  );
}

async function findOrCreateThread(supabase, entry) {
  const question = entry?.question?.trim();
  const questionKey = normalizeQuestionKey(question);
  if (!questionKey) return null;

  const { data: existing, error: selectError } = await supabase
    .from('es_question_threads')
    .select('id')
    .eq('question_key', questionKey)
    .maybeSingle();

  if (selectError) {
    if (isThreadStorageUnavailable(selectError)) return null;
    throw selectError;
  }
  if (existing?.id) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from('es_question_threads')
    .insert([{
      question_key: questionKey,
      question_text: question,
      category: entry.category || 'その他',
      char_limit: entry.char_limit || null,
    }])
    .select('id')
    .single();

  if (insertError) {
    if (isThreadStorageUnavailable(insertError)) return null;
    if (insertError.code === '23505') {
      const { data: raced, error: racedError } = await supabase
        .from('es_question_threads')
        .select('id')
        .eq('question_key', questionKey)
        .maybeSingle();
      if (!racedError && raced?.id) return raced.id;
    }
    throw insertError;
  }

  return created?.id || null;
}

// GET: ESエントリー一覧を取得
async function handleGet(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('company_id');
  if (companyId !== null && !isUuid(companyId)) return jsonError('企業IDが正しくありません', 400);

  const supabase = getSupabase();
  let query = supabase
    .from('es_entries')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (companyId) {
    query = query.contains('company_ids', [companyId]);
  }

  const { data, error } = await query;

  if (error) {
    return supabaseError(error);
  }

  let enriched;
  try {
    enriched = await enrichEntries(supabase, data);
  } catch (error) {
    return supabaseError(error);
  }

  return NextResponse.json(enriched);
}

// POST: ESエントリーを追加
async function handlePost(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readEsInput(request);
  if (input.error) return jsonError(input.error, 400);
  const cleanBody = input.data;
  const supabase = getSupabase();
  if (!cleanBody.thread_id) {
    try {
      const threadId = await findOrCreateThread(supabase, cleanBody);
      if (threadId) cleanBody.thread_id = threadId;
    } catch (error) {
      return supabaseError(error);
    }
  }

  let { data, error } = await supabase
    .from('es_entries')
    .insert([cleanBody])
    .select()
    .single();

  if (error && isMissingOptionalColumnError(error)) {
    const retry = await supabase
      .from('es_entries')
      .insert([stripOptionalReuseFields(cleanBody)])
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return supabaseError(error);
  }

  try {
    const enriched = await enrichEntry(supabase, data);
    return NextResponse.json(enriched, { status: 201 });
  } catch (error) {
    return supabaseError(error);
  }
}

// PUT: ESエントリーを更新
async function handlePut(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const input = await readEsInput(request, { update: true });
  if (input.error) return jsonError(input.error, 400);
  const { id, data: updateData } = input;

  const supabase = getSupabase();
  if (!updateData.thread_id && updateData.question) {
    try {
      const threadId = await findOrCreateThread(supabase, updateData);
      if (threadId) updateData.thread_id = threadId;
    } catch (error) {
      return supabaseError(error);
    }
  }

  let { data, error } = await supabase
    .from('es_entries')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error && isMissingOptionalColumnError(error)) {
    const retry = await supabase
      .from('es_entries')
      .update(stripOptionalReuseFields(updateData))
      .eq('id', id)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    return supabaseError(error);
  }

  try {
    const enriched = await enrichEntry(supabase, data);
    return NextResponse.json(enriched);
  } catch (error) {
    return supabaseError(error);
  }
}

// DELETE: ESエントリーを削除
async function handleDelete(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!isUuid(id)) {
    return jsonError('ESメモIDが正しくありません', 400);
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('es_entries')
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
