import test from 'node:test';
import assert from 'node:assert/strict';
import { getBestCompanyIds } from '../lib/compare.js';
import { formatFullDate } from '../lib/date.js';

const companies = values => values.map((value, index) => ({ id: index + 1, value }));
const byValue = company => company.value;

test('getBestCompanyIds marks the highest or lowest value', () => {
  assert.deepEqual([...getBestCompanyIds(companies([3, 5, 4]), byValue, 'max')], ['2']);
  assert.deepEqual([...getBestCompanyIds(companies([30, 20, 25]), byValue, 'min')], ['2']);
  // Ties for best share the mark as long as someone is worse.
  assert.deepEqual([...getBestCompanyIds(companies([5, 5, 4]), byValue, 'max')].sort(), ['1', '2']);
});

test('getBestCompanyIds marks nothing when every company has the same value', () => {
  assert.equal(getBestCompanyIds(companies([4, 4, 4]), byValue, 'max').size, 0);
  assert.equal(getBestCompanyIds(companies([20, 20]), byValue, 'min').size, 0);
  // Companies without a value do not count toward the comparison.
  assert.equal(getBestCompanyIds(companies([4, null, 4]), byValue, 'max').size, 0);
});

test('getBestCompanyIds needs at least two companies with a value', () => {
  assert.equal(getBestCompanyIds(companies([5]), byValue, 'max').size, 0);
  assert.equal(getBestCompanyIds(companies([5, null, Number.NaN]), byValue, 'max').size, 0);
  assert.equal(getBestCompanyIds([], byValue, 'max').size, 0);
});

test('formatFullDate gives YYYY/M/D for a real date and nothing otherwise', () => {
  assert.equal(formatFullDate('2026-01-05'), '2026/1/5');
  assert.equal(formatFullDate('2026-11-12'), '2026/11/12');
  for (const value of ['', null, undefined, '2026/01/05', '2026-02-30', 'not a date']) {
    assert.equal(formatFullDate(value), '', String(value));
  }
});
