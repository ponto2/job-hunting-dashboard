const LIMITS = { title: 200, field: 100, year: 40, scope: 200 };
export function sanitizeResearchSources(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap(source => {
    if (!source || typeof source.url !== 'string' || source.url.length > 2000) return [];
    try { if (!['http:', 'https:'].includes(new URL(source.url).protocol)) return []; } catch { return []; }
    return [{ url: source.url, ...Object.fromEntries(Object.entries(LIMITS).map(([key, max]) => [key, typeof source[key] === 'string' ? source[key].trim().slice(0, max) : null])) }];
  });
}
export function validResearchSources(value) {
  return Array.isArray(value) && value.length <= 20 && value.every(source => {
    if (!source || typeof source !== 'object') return false;
    if (sanitizeResearchSources([source]).length !== 1) return false;
    return Object.entries(LIMITS).every(([key, max]) => source[key] == null || (typeof source[key] === 'string' && source[key].length <= max));
  });
}
