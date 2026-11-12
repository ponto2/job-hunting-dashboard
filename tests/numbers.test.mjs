import test from 'node:test';
import assert from 'node:assert/strict';
import { compareNullableNumbers, parseFirstNumber, parseYenAmount } from '../lib/numbers.js';

test('salaries in 万円 and 円 land on the same yen scale', () => {
  assert.equal(parseYenAmount('約800万円'), 8000000);
  assert.equal(parseYenAmount('8,000,000円'), 8000000);
  assert.equal(parseYenAmount('800'), 8000000);
  assert.equal(parseYenAmount('276,000円'), 276000);
  assert.equal(parseYenAmount('1,234.5万円'), 12345000);
  assert.equal(parseYenAmount('８００万円'), 8000000);
  assert.equal(parseYenAmount('1億円'), 100000000);
});

test('a year next to the amount is not mistaken for it', () => {
  assert.equal(parseYenAmount('2024年度 平均年収 850万円'), 8500000);
});

test('unknown amounts are null rather than zero', () => {
  for (const value of ['非公開', '不明', '', null, undefined]) assert.equal(parseYenAmount(value), null, String(value));
});

test('metrics keep decimals and report missing values as null', () => {
  assert.equal(parseFirstNumber('約22.5時間'), 22.5);
  assert.equal(parseFirstNumber('18時間'), 18);
  assert.equal(parseFirstNumber('非公開'), null);
  assert.equal(parseFirstNumber(null), null);
});

test('sorting puts companies without a value last in either direction', () => {
  const values = [null, 300, 100, null, 200];
  assert.deepEqual([...values].sort((a, b) => compareNullableNumbers(a, b, 'asc')), [100, 200, 300, null, null]);
  assert.deepEqual([...values].sort((a, b) => compareNullableNumbers(a, b, 'desc')), [300, 200, 100, null, null]);
});
