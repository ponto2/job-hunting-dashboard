'use client';

import { parseFirstNumber, parseYenAmount } from '@/lib/numbers';
export { STATUSES, STATUS_ALIASES, normalizeStatus } from '@/lib/status';

// --- Constants ---
// Industry swatches: small sector marks on the board, never large fills.
export const INDUSTRY_CONFIG = {
  '半導体':   { color: '#A898E8' },
  '自動車':   { color: '#5DBE95' },
  '不動産':   { color: '#D9A55A' },
  'IT':       { color: '#6FA8E8' },
  'Web':      { color: '#6FA8E8' },
  'コンサル': { color: '#D58AB4' },
  '金融':     { color: '#D98F5C' },
  '化学':     { color: '#4FB8AE' },
  '電機':     { color: '#8C95E0' },
  'メーカー': { color: '#9AA0AA' },
};

// Selection status inks, matching the tokens in styles/base.css. Open stages
// read in figure tones and the interview stage in the accent; arrival is
// green, and a selection that left the route (辞退, 不合格) is quiet grey.
export const STATUS_CONFIG = {
  '未応募':   { color: '#868D99', bg: 'rgba(134,141,153,0.12)' },
  '興味あり': { color: '#AEB4BE', bg: 'rgba(174,180,190,0.12)' },
  'ES準備中': { color: '#E7E9EC', bg: 'rgba(231,233,236,0.10)' },
  'ES提出済': { color: '#E7E9EC', bg: 'rgba(231,233,236,0.10)' },
  '面接中':   { color: '#86AEE3', bg: 'rgba(134,174,227,0.14)' },
  '合格':     { color: '#5DC08C', bg: 'rgba(93,192,140,0.14)' },
  '辞退':     { color: '#868D99', bg: 'rgba(134,141,153,0.10)' },
  '不合格':   { color: '#868D99', bg: 'rgba(134,141,153,0.10)' },
};

// Event inks. Red belongs to deadlines alone; an internship is green as the
// arrival it follows from (参加決定).
export const EVENT_TYPE_CONFIG = {
  deadline: { label: '締切・期限', short: '締切', color: '#F36B61', bg: 'rgba(243,107,97,0.14)' },
  interview: { label: '面接・選考', short: '面接', color: '#86AEE3', bg: 'rgba(134,174,227,0.14)' },
  internship: { label: 'インターン', short: 'インターン', color: '#5DC08C', bg: 'rgba(93,192,140,0.14)' },
  other: { label: 'その他', short: '予定', color: '#AEB4BE', bg: 'rgba(174,180,190,0.12)' },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_CONFIG);

export function getIndustryConfig(industry) {
  return INDUSTRY_CONFIG[industry] || { color: '#9AA0AA' };
}

// Average salary in yen, with 万円 and 円 notations on one scale; null if unknown.
export function parseSalary(c) {
  return parseYenAmount(c?.salary_average);
}

// First number in a metric such as overtime hours; null if unknown.
export function parseNum(str) {
  return parseFirstNumber(str);
}

// --- Shared small components ---
// Interest (志望度) as five pips; the label carries the value for screen readers.
export function Stars({ count }) {
  const value = Math.max(0, Math.min(5, Number(count) || 0));
  return (
    <span className="interest-pips" role="img" aria-label={`志望度 ${value} / 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= value ? 'pip pip--on' : 'pip'} />
      ))}
    </span>
  );
}

export function IndustryTag({ industry }) {
  const { color } = getIndustryConfig(industry);
  return (
    <span className="industry-tag" title={industry}>
      <span className="industry-swatch" style={{ background: color }} aria-hidden="true" />
      <span className="industry-tag-name">{industry || '業界未設定'}</span>
    </span>
  );
}
