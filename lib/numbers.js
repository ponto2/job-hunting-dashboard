// Company metrics are free text (often from AI research), so values arrive in
// mixed forms: "約800万円", "8,000,000円", "800", "22.5時間". These helpers
// turn them into comparable numbers, or null when there is nothing to compare.

function normalizeDigits(text) {
  return String(text)
    .replace(/[０-９．]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[,，]/g, '');
}

function toText(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value : '';
}

// Amounts in yen. Prefers a number written with a unit (億/万/円) so that a
// stray year such as "2024年度" is not read as the amount. A bare number below
// 10,000 is taken as 万円, the usual way salaries are written.
export function parseYenAmount(value) {
  const text = normalizeDigits(toText(value));
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(億|万|円)?/g)];
  const match = matches.find(m => m[2]) || matches[0];
  if (!match) return null;
  let amount = parseFloat(match[1]);
  if (match[2] === '億') amount *= 100000000;
  else if (match[2] === '万' || (match[2] !== '円' && amount < 10000)) amount *= 10000;
  return Math.round(amount);
}

// The first number in the text, keeping decimals ("22.5時間" -> 22.5).
export function parseFirstNumber(value) {
  const match = normalizeDigits(toText(value)).match(/\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

// Sort comparator that always puts missing values last.
export function compareNullableNumbers(a, b, direction = 'asc') {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}
