import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeResearchResult } from '../lib/research.js';
import { validateCompanyInput } from '../lib/validation.js';

test('AI results keep only company fields, as text', () => {
  const result = sanitizeResearchResult({
    name: ' キーエンス ', industry: '電機', employees: 12000, products: ['センサー', '計測器', { x: 1 }],
    founded: null, source: 'https://example.com', memo: 'AIが書いた個人メモ', revenue: { value: 1 },
  }, 'キーエンス');
  assert.equal(result.name, 'キーエンス');
  assert.equal(result.employees, '12000');
  assert.equal(result.products, 'センサー、計測器');
  assert.equal(result.founded, null);
  assert.equal(result.revenue, null);
  assert.equal(Object.hasOwn(result, 'source'), false);
  assert.equal(Object.hasOwn(result, 'memo'), false);
});

test('AI links that are not web URLs are dropped', () => {
  const result = sanitizeResearchResult({
    official_url: 'https://www.keyence.co.jp/', recruit_url: 'javascript:alert(1)', intern_url: 'null',
  }, 'A社');
  assert.equal(result.official_url, 'https://www.keyence.co.jp/');
  assert.equal(result.recruit_url, null);
  assert.equal(result.intern_url, null);
});

test('a missing name falls back to the searched name, and long text is cut to the API limit', () => {
  const result = sanitizeResearchResult({ industry: 'IT', business: 'あ'.repeat(30000) }, '検索した会社');
  assert.equal(result.name, '検索した会社');
  assert.equal(result.business.length, 20000);
  assert.equal(validateCompanyInput({ ...result, status: '未応募', interest: 3 }).error, undefined);
});

test('incomplete research can be corrected before saving', () => {
  const result = sanitizeResearchResult('not json', 'A社');
  assert.equal(result.name, 'A社');
  assert.equal(result.industry, null);
});


test('research sources retain year and scope and reject non-web URLs', () => {
  const result=sanitizeResearchResult({industry:'IT',research_sources:[{url:'https://example.com/report',title:'有報',year:'2025',scope:'単体',field:'salary_average'},{url:'javascript:alert(1)'}]},'A社');
  assert.equal(result.research_sources.length,1);
  assert.equal(result.research_sources[0].year,'2025');
  assert.equal(validateCompanyInput(result).error,undefined);
  const incomplete=sanitizeResearchResult({},'A社');
  assert.ok(validateCompanyInput(incomplete).error);
  assert.equal(validateCompanyInput({...incomplete,industry:'IT'}).error,undefined);
});
