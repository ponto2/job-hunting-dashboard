// Input validation for the API routes. Each validator returns either
// { data } with exactly the columns that may be written, or { error } with a
// message for the user. Relative imports keep this usable from plain Node tests.
import { validResearchSources } from './research-sources.js';
import { isUuid } from './selections.js';

export { isUuid };

// Keep in sync with EVENT_TYPE_CONFIG in app/lib/constants.js.
export const EVENT_TYPES = Object.freeze(['deadline', 'interview', 'internship', 'other']);

const LONG_TEXT = 20000;

export function isDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const isBlank = value => value === null || value === undefined || value === '';

// Only the columns listed in each validator are ever written. Clients send
// whole records back (including server-owned fields such as created_at, and
// possibly columns added to the database by hand), so other keys are ignored
// rather than rejected.

function checkText(value, label, max, { required = false } = {}) {
  if (isBlank(value)) return required ? `${label}を入力してください` : null;
  if (typeof value !== 'string') return `${label}の形式が正しくありません`;
  if (required && !value.trim()) return `${label}を入力してください`;
  if (value.length > max) return `${label}は${max}文字以内で入力してください`;
  return null;
}

function checkOptionalUuid(value, label) {
  return isBlank(value) || isUuid(value) ? null : `${label}が正しくありません`;
}

function firstError(...errors) {
  return errors.find(Boolean) || null;
}

// --- companies ---

export const COMPANY_TEXT_LIMITS = Object.freeze({
  name: 200,
  industry: 100,
  headquarters: 500,
  employees: 200,
  founded: 200,
  revenue: 200,
  business: LONG_TEXT,
  products: LONG_TEXT,
  salary_master_start: 200,
  salary_average: 200,
  overtime_hours: 200,
  paid_leave_rate: 200,
  turnover_rate: 200,
  benefits: LONG_TEXT,
  intern_period: 500,
  intern_duration: 500,
  intern_content: LONG_TEXT,
  intern_selection: LONG_TEXT,
  notes: LONG_TEXT,
  memo: LONG_TEXT,
});
const COMPANY_TEXT_LABELS = {
  name: '企業名', industry: '業界', headquarters: '本社所在地', employees: '従業員数', founded: '設立年',
  revenue: '売上高', business: '事業概要', products: '主要プロダクト', salary_master_start: '初任給',
  salary_average: '平均年収', overtime_hours: '月平均残業時間', paid_leave_rate: '有休消化率',
  turnover_rate: '離職率', benefits: '福利厚生', intern_period: 'インターン募集時期',
  intern_duration: 'インターン期間', intern_content: 'インターン内容', intern_selection: 'インターン選考フロー',
  notes: 'AIリサーチメモ', memo: '個人メモ',
};
export const COMPANY_URL_FIELDS = Object.freeze({ intern_url: '募集ページURL', official_url: '公式サイトURL', recruit_url: '採用ページURL' });

export function validateCompanyInput(body, { update = false } = {}) {
  if (!isPlainObject(body)) return { error: '企業の入力形式が正しくありません' };
  if (update && !isUuid(body.id)) return { error: '企業IDが正しくありません' };

  const data = {};
  for (const [key, max] of Object.entries(COMPANY_TEXT_LIMITS)) {
    if (!Object.hasOwn(body, key)) continue;
    const required = (key === 'name' || key === 'industry') && (!update || Object.hasOwn(body, key));
    const error = checkText(body[key], COMPANY_TEXT_LABELS[key], max, { required });
    if (error) return { error };
    data[key] = required ? body[key].trim() : body[key];
  }
  if (!update && (!data.name || !data.industry)) return { error: '企業名と業界は必須です' };

  for (const [key, label] of Object.entries(COMPANY_URL_FIELDS)) {
    if (!Object.hasOwn(body, key)) continue;
    const value = typeof body[key] === 'string' ? body[key].trim() : body[key];
    if (isBlank(value)) { data[key] = null; continue; }
    if (!isHttpUrl(value) || value.length > 2000) {
      return { error: `${label}は http:// または https:// で始まるURLを入力してください` };
    }
    data[key] = value;
  }

  if (Object.hasOwn(body, 'research_sources')) {
    if (body.research_sources !== null && !validResearchSources(body.research_sources)) return { error: '出典情報の形式が正しくありません' };
    data.research_sources = body.research_sources || [];
  }

  if (Object.hasOwn(body, 'interest')) {
    if (!isBlank(body.interest) && (!Number.isInteger(body.interest) || body.interest < 1 || body.interest > 5)) {
      return { error: '志望度は1〜5で指定してください' };
    }
    data.interest = isBlank(body.interest) ? null : body.interest;
  }
  if (Object.hasOwn(body, 'research_date')) {
    if (!isBlank(body.research_date) && !isDateString(body.research_date)) return { error: 'リサーチ日の形式が正しくありません' };
    data.research_date = isBlank(body.research_date) ? null : body.research_date;
  }

  return { data, id: update ? body.id : undefined };
}

// --- events ---

// Updates replace the whole event, matching the calendar form, which always
// sends every field. `done` and `selection_id` are the exception: they are
// written only when sent, so an older client (or a database without those
// columns) never clears them by omission.
export function validateEventInput(body, { update = false } = {}) {
  if (!isPlainObject(body)) return { error: '予定の入力形式が正しくありません' };
  if (update && !isUuid(body.id)) return { error: '予定IDが正しくありません' };

  const has = key => Object.hasOwn(body, key);
  const error = firstError(
    checkText(body.title, 'タイトル', 200, { required: true }),
    EVENT_TYPES.includes(body.event_type) ? null : 'イベントタイプが正しくありません',
    isDateString(body.start_date) ? null : '開始日を正しく入力してください',
    isBlank(body.end_date) || isDateString(body.end_date) ? null : '終了日の形式が正しくありません',
    !isBlank(body.end_date) && isDateString(body.start_date) && body.end_date < body.start_date
      ? '終了日は開始日以降にしてください' : null,
    checkOptionalUuid(body.company_id, '企業'),
    checkText(body.memo, 'メモ', LONG_TEXT),
    has('done') && typeof body.done !== 'boolean' ? '完了状態の形式が正しくありません' : null,
    has('selection_id') ? checkOptionalUuid(body.selection_id, '選考') : null,
  );
  if (error) return { error };

  const data = {
    title: body.title.trim(),
    event_type: body.event_type,
    start_date: body.start_date,
    end_date: isBlank(body.end_date) ? null : body.end_date,
    company_id: isBlank(body.company_id) ? null : body.company_id,
    memo: isBlank(body.memo) ? null : body.memo,
  };
  for (const key of ['start_time', 'end_time']) {
    if (!has(key)) continue;
    if (!isBlank(body[key]) && (typeof body[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(body[key]))) return { error: '時刻はHH:mm形式で入力してください' };
    data[key] = isBlank(body[key]) ? null : body[key].slice(0, 5);
  }
  if (data.end_time && !data.start_time) return { error: '開始・締切時刻を入力してください' };
  if (data.start_time && data.end_time && (!data.end_date || data.end_date === data.start_date) && data.end_time < data.start_time) return { error: '終了時刻は開始時刻以降にしてください' };
  if (has('done')) data.done = body.done;
  if (has('selection_id')) data.selection_id = isBlank(body.selection_id) ? null : body.selection_id;
  return { id: update ? body.id : undefined, data };
}

// Query parameters are interpolated into PostgREST filter strings, so only
// exact dates and numbers may pass.
export function validateEventRange({ startDate, endDate, year, month }) {
  if (startDate !== null || endDate !== null) {
    if (!isDateString(startDate) || !isDateString(endDate) || endDate < startDate) {
      return { error: '期間の指定が正しくありません' };
    }
    return { range: { startDate, endDate } };
  }
  if (year !== null || month !== null) {
    const y = Number(year);
    const m = Number(month);
    if (!/^\d{4}$/.test(year || '') || !/^\d{1,2}$/.test(month || '') || m < 1 || m > 12) {
      return { error: '年月の指定が正しくありません' };
    }
    return { month: { year: y, month: m } };
  }
  return {};
}

// --- ES entries ---

const ES_FIELDS = ['question', 'answer', 'category', 'is_template', 'char_limit', 'sort_order', 'company_ids', 'thread_id'];

export function validateEsEntryInput(body, { update = false } = {}) {
  if (!isPlainObject(body)) return { error: 'ESメモの入力形式が正しくありません' };
  if (update && !isUuid(body.id)) return { error: 'ESメモIDが正しくありません' };

  const has = key => Object.hasOwn(body, key);
  const error = firstError(
    !update || has('question') ? checkText(body.question, '質問文', 2000, { required: true }) : null,
    checkText(body.answer, '回答', LONG_TEXT),
    checkText(body.category, 'カテゴリ', 50),
    has('is_template') && typeof body.is_template !== 'boolean' ? 'テンプレート指定の形式が正しくありません' : null,
    has('char_limit') && !isBlank(body.char_limit)
      && (!Number.isInteger(body.char_limit) || body.char_limit < 0 || body.char_limit > 100000)
      ? '文字数制限は0以上の整数で入力してください' : null,
    has('sort_order') && !isBlank(body.sort_order) && !Number.isInteger(body.sort_order) ? '並び順の形式が正しくありません' : null,
    has('company_ids') && (!Array.isArray(body.company_ids) || body.company_ids.length > 200 || !body.company_ids.every(isUuid))
      ? '企業の指定が正しくありません' : null,
    checkOptionalUuid(body.thread_id, '設問'),
  );
  if (error) return { error };

  const data = {};
  for (const key of ES_FIELDS) {
    if (!has(key)) continue;
    if (key === 'question') data.question = body.question.trim();
    else if (key === 'company_ids') data.company_ids = [...new Set(body.company_ids)];
    else if (key === 'sort_order') data.sort_order = isBlank(body.sort_order) ? 0 : body.sort_order;
    else data[key] = isBlank(body[key]) && key !== 'answer' ? null : body[key];
  }
  return { data, id: update ? body.id : undefined };
}

// --- interview memos ---

export const INTERVIEW_MEMO_TYPES = Object.freeze([
  'prep', 'asked', 'answer', 'reverse_question', 'reflection', 'follow_up', 'other',
]);

// Updates replace the whole memo, matching the memo form.
export function validateInterviewMemoInput(body, { update = false } = {}) {
  if (!isPlainObject(body)) return { error: '面接メモの入力形式が正しくありません' };
  if (update && !isUuid(body.id)) return { error: '面接メモIDが正しくありません' };

  const error = firstError(
    checkOptionalUuid(body.event_id, '面接予定'),
    checkOptionalUuid(body.company_id, '企業'),
    isBlank(body.memo_type) || INTERVIEW_MEMO_TYPES.includes(body.memo_type) ? null : 'メモの種類が正しくありません',
    checkText(body.topic, 'トピック', 200),
    checkText(body.content, 'メモ本文', LONG_TEXT, { required: true }),
    !isBlank(body.sort_order) && !Number.isInteger(body.sort_order) ? '並び順の形式が正しくありません' : null,
  );
  if (error) return { error };

  return {
    id: update ? body.id : undefined,
    data: {
      event_id: isBlank(body.event_id) ? null : body.event_id,
      company_id: isBlank(body.company_id) ? null : body.company_id,
      memo_type: isBlank(body.memo_type) ? 'prep' : body.memo_type,
      topic: body.topic?.trim() || null,
      content: body.content.trim(),
      sort_order: isBlank(body.sort_order) ? 0 : body.sort_order,
    },
  };
}
