const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatDateInput(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(dateStr, fromDate = new Date()) {
  const target = parseLocalDate(dateStr);
  if (!target) return null;
  return Math.ceil((target - startOfDay(fromDate)) / MS_PER_DAY);
}

export function addDays(dateStr, days) {
  const date = parseLocalDate(dateStr);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// '2026-11-12' → '11/12(木)'; a date outside the current year keeps its year,
// '2027/1/5(火)'. Anything that is not a real YYYY-MM-DD date gives ''.
export function formatShortDate(dateStr, today = new Date()) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const prefix = year === today.getFullYear() ? '' : `${year}/`;
  return `${prefix}${month}/${day}(${weekday})`;
}

// '2026-01-05' → '2026/1/5', for record dates such as a research date where
// the year matters more than the weekday. Anything else gives ''.
export function formatFullDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}/${month}/${day}`;
}

// Relative due label for a day count from daysUntil: 'N日超過', '今日', 'あとN日'.
export function formatDueLabel(days) {
  if (typeof days !== 'number' || !Number.isFinite(days)) return '';
  if (days < 0) return `${-days}日超過`;
  if (days === 0) return '今日';
  return `あと${days}日`;
}
