import { GoogleGenAI } from '@google/genai';
import { GRADUATION_FULL_YEAR, GRADUATION_LABEL } from './graduation.js';

// 新SDK: @google/genai（Grounding with Google Search対応）
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません');
  }

  return new GoogleGenAI({ apiKey });
}

const RESEARCH_PROMPT = `あなたは就活リサーチアシスタントです。指定された企業について、Google検索を使って最新の正確な情報を調べ、以下のJSON形式で返してください。
数値データは最新の公開情報（企業の有価証券報告書、公式サイト、就職四季報等）に基づいてください。不明な場合は「非公開」や「不明」と記入してください。

【重要なルール】
1. industryフィールドは必ず一単語で記入してください（例：「半導体」「自動車」「不動産」「IT」「コンサル」「金融」「化学」「電機」「通信」等）。
   - 細かく分類しないでください。例えば「自動車部品」は「自動車」、「半導体設計」「半導体製造装置」は「半導体」としてください。
   - 複数事業にまたがる場合も、最も主要な事業一つに絞ってください。
2. 数値データ（残業時間、離職率、有休消化率、初任給、平均年収など）は数字のみで記入してください。
   - NG例: 「約22h/月（2025年度実績）」→ OK例: 「約22時間」
   - NG例: 「276,000円/月（月額）」→ OK例: 「276,000円」
   - 数値の年度・出典・対象範囲（単体/連結、職種、学歴）は research_sources に分けて必ず残してください。不明なら null にしてください。
   - research_sources は [{url, title, field, year, scope}] の配列です。field は salary_average など対応するJSONキー。URLは実際の出典のみ、yearは対象年度、scopeは対象範囲です。
3. salary_master_startには、技術職・大学院修士卒の初任給を調べてください。
   - 技術職・院卒の情報が見つかった場合は金額のみを記入してください（例: 「276,000円」）。
   - 技術職・院卒のデータが見つからず、他の職種や学歴の初任給を記入する場合のみ、カッコでその旨を補足してください（例: 「250,000円（総合職・大卒）」）。
4. recruit_urlには、「${GRADUATION_LABEL}」向けの就職採用マイページURL（本選考エントリーページ）を慎重に調べてください。
   - 必ずGoogle検索で実在を確認した上で記入してください。推測・類推でURLを生成することは絶対に禁止です。
   - 「${GRADUATION_LABEL}」「${GRADUATION_FULL_YEAR}年卒」「${GRADUATION_FULL_YEAR}年度採用」向けのマイページ・エントリーページを優先してください。
   - 「インターンシップ」専用ページではなく、本選考・就職採用向けのURLを記入してください。
   - マイナビ・リクナビ・企業独自採用サイト等、どこのURLでも構いません。実在し${GRADUATION_LABEL}向けであることを確認した場合のみ記入してください。
   - ${GRADUATION_LABEL}向けページが見つからない、またはURLの正確性に自信がない場合は、必ず null にしてください（不確かなURLを入れないこと）。

必ず以下のJSON形式のみで回答してください。JSONの前後に説明文やマークダウンは付けないでください。

{
  "name": "企業名（"株式会社"などは除外）",
  "industry": "業界（必ず一単語。例：半導体、自動車、不動産、IT、コンサル等）",
  "headquarters": "本社所在地（都道府県+市区町村）",
  "employees": "従業員数（例：約10,000名）",
  "founded": "設立年",
  "revenue": "売上高/売上収益",
  "business": "事業概要（100〜200文字程度）",
  "products": "主要プロダクト・サービス",
  "salary_master_start": "初任給（技術職・院卒優先。数字のみ）",
  "salary_average": "平均年収（数字のみ）",
  "overtime_hours": "月平均残業時間（数字のみ）",
  "paid_leave_rate": "有給休暇消化率（数字のみ）",
  "turnover_rate": "離職率（数字のみ）",
  "benefits": "主な福利厚生（100〜200文字程度）",
  "intern_period": "インターンシップ募集時期",
  "intern_duration": "インターンシップ期間",
  "intern_content": "インターンシップ内容概要",
  "intern_selection": "インターンシップ選考フロー",
  "intern_url": "インターンシップ/採用ページURL",
  "official_url": "公式サイトURL",
  "recruit_url": "${GRADUATION_LABEL}マイページURL（本選考エントリーページ）。実在が確認できた場合のみ記入。不明・不確かな場合は null",
  "notes": "就活生向けの特記事項（魅力、注意点など。100〜200文字程度）"
}`;

export async function researchCompany(companyName) {
  const response = await getGenAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [{ text: `${RESEARCH_PROMPT}\n\n調査対象企業: ${companyName}` }],
      },
    ],
    config: {
      // Grounding with Google Search を有効化
      // これにより、モデルがリアルタイムでWeb検索を行い最新情報を取得する
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      httpOptions: { timeout: 60000 },
    },
  });

  const text = (response.text || '').trim();
  const grounding = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || []).flatMap(chunk => chunk.web?.uri ? [{ url: chunk.web.uri, title: chunk.web.title }] : []);
  const withSources = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('調査結果の形式が正しくありません');
    return { ...value, research_sources: [...(Array.isArray(value.research_sources) ? value.research_sources : []), ...grounding] };
  };

  // JSONを抽出（マークダウンのコードブロックで囲まれている場合に対応）
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return withSources(JSON.parse(jsonStr));
  } catch (e) {
    // JSON直接パース失敗時、テキストから{}部分を抽出
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return withSources(JSON.parse(braceMatch[0]));
    }
    throw new Error('AIレスポンスの解析に失敗しました: ' + text.slice(0, 200));
  }
}
