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
  'メーカー': { color: '#9A968C' },
};

// Selection status inks. Open stages read in figure tones; only interview,
// success, and rejection carry a state colour.
export const STATUS_CONFIG = {
  '未応募':   { color: '#8E8A80', bg: 'rgba(142,138,128,0.12)' },
  '興味あり': { color: '#B4B0A6', bg: 'rgba(180,176,166,0.12)' },
  'ES準備中': { color: '#ECE9E1', bg: 'rgba(236,233,225,0.10)' },
  'ES提出済': { color: '#ECE9E1', bg: 'rgba(236,233,225,0.10)' },
  '面接中':   { color: '#E2A84B', bg: 'rgba(226,168,75,0.14)' },
  '合格':     { color: '#FF5D4F', bg: 'rgba(255,93,79,0.14)' },
  '辞退':     { color: '#8E8A80', bg: 'rgba(142,138,128,0.10)' },
  '不合格':   { color: '#6F9BFF', bg: 'rgba(111,155,255,0.14)' },
};

export const EVENT_TYPE_CONFIG = {
  deadline: { label: '締切・期限', short: '締切', color: '#FF5D4F', bg: 'rgba(255,93,79,0.14)' },
  interview: { label: '面接・選考', short: '面接', color: '#E2A84B', bg: 'rgba(226,168,75,0.14)' },
  internship: { label: 'インターン', short: 'インターン', color: '#56C08D', bg: 'rgba(86,192,141,0.14)' },
  other: { label: 'その他', short: '予定', color: '#B4B0A6', bg: 'rgba(180,176,166,0.12)' },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_CONFIG);

export function getIndustryConfig(industry) {
  return INDUSTRY_CONFIG[industry] || { color: '#9A968C' };
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
