import { researchCompany } from '@/lib/gemini';
import { NextResponse } from 'next/server';
import { jsonError, requireAuth } from '@/lib/api-response';
import { sanitizeResearchResult } from '@/lib/research';

export async function POST(request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  let body;
  try { body = await request.json(); } catch { return jsonError('リクエストの形式が正しくありません', 400); }
  try {
    const companyName = body?.companyName;

    if (typeof companyName !== 'string' || companyName.trim().length === 0) {
      return jsonError('企業名を入力してください', 400);
    }
    if (companyName.trim().length > 100) {
      return jsonError('企業名は100文字以内で入力してください', 400);
    }

    const result = await researchCompany(companyName.trim());

    return NextResponse.json(sanitizeResearchResult(result, companyName.trim()));
  } catch (error) {
    console.error('Research error:', error);
    return jsonError('リサーチに失敗しました。API設定や利用上限を確認し、時間をおいて再試行してください。', 502);
  }
}
