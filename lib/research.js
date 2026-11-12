// Shapes the AI research JSON into company fields the API accepts. The model
// output is untrusted: it may add keys, return numbers or lists, exceed field
// limits, or propose links that are not web URLs.
import { sanitizeResearchSources } from './research-sources.js';
import { COMPANY_TEXT_LIMITS, COMPANY_URL_FIELDS, isHttpUrl } from './validation.js';

function toText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string' || typeof item === 'number').join('、').trim();
  }
  return '';
}

export function sanitizeResearchResult(raw, companyName) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const result = {};

  for (const [key, max] of Object.entries(COMPANY_TEXT_LIMITS)) {
    if (key === 'memo') continue; // the personal memo is the user's, never the AI's
    const text = toText(source[key]);
    result[key] = text ? text.slice(0, max) : null;
  }
  result.name = result.name || toText(companyName).slice(0, COMPANY_TEXT_LIMITS.name) || null;

  for (const key of Object.keys(COMPANY_URL_FIELDS)) {
    const url = toText(source[key]);
    result[key] = isHttpUrl(url) && url.length <= 2000 ? url : null;
  }

  result.research_sources = sanitizeResearchSources(source.research_sources);
  return result;
}
