import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESS_STOPS, STATUSES, getStatusProgress } from '../lib/status.js';

test('open statuses advance one stop each along the route', () => {
  assert.deepEqual(
    ['未応募', '興味あり', 'ES準備中', 'ES提出済', '面接中'].map(status => getStatusProgress(status)),
    [0, 1, 2, 3, 4].map(step => ({ step, state: 'open' })),
  );
});

test('success arrives at the last stop, including the legacy 内定', () => {
  assert.deepEqual(getStatusProgress('合格'), { step: PROGRESS_STOPS, state: 'done' });
  assert.deepEqual(getStatusProgress('内定'), { step: PROGRESS_STOPS, state: 'done' });
});

test('withdrawn and rejected selections leave the route without a step', () => {
  assert.deepEqual(getStatusProgress('辞退'), { step: 0, state: 'ended' });
  assert.deepEqual(getStatusProgress('不合格'), { step: 0, state: 'ended' });
});

test('a missing or unknown status reads as not started', () => {
  assert.deepEqual(getStatusProgress(''), { step: 0, state: 'open' });
  assert.deepEqual(getStatusProgress(undefined), { step: 0, state: 'open' });
  assert.deepEqual(getStatusProgress('保留'), { step: 0, state: 'open' });
  assert.deepEqual(getStatusProgress('constructor'), { step: 0, state: 'open' });
});

test('every status has a progress reading within the rail', () => {
  STATUSES.forEach(status => {
    const { step } = getStatusProgress(status);
    assert.ok(step >= 0 && step <= PROGRESS_STOPS, status);
  });
});
