import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaveQueue } from '../lib/autosave-queue.js';

// Manual timers and manual save replies, so each ordering is explicit.
function setup() {
  const timers = new Map();
  let nextTimer = 1;
  const calls = [];
  const statuses = [];
  const cleaned = [];
  const saved = [];
  const queue = createAutosaveQueue({
    delay: 1000,
    setTimer: fn => { const handle = nextTimer++; timers.set(handle, fn); return handle; },
    clearTimer: handle => timers.delete(handle),
    getSave: () => (id, answer) => new Promise((resolve, reject) => {
      calls.push({ id, answer, resolve: () => resolve({ id, answer }), reject: message => reject(new Error(message)) });
    }),
    onSaved: entry => saved.push(entry),
    onStatus: (id, status) => statuses.push(status),
    onClean: id => cleaned.push(id),
  });
  const fireTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach(fn => fn());
  };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return { queue, timers, calls, statuses, cleaned, saved, fireTimers, tick };
}

test('typing saves once after the pause with the latest text', async () => {
  const t = setup();
  t.queue.change('a', 'こ', '');
  t.queue.change('a', 'こん', '');
  t.queue.change('a', 'こんにちは', '');
  assert.equal(t.calls.length, 0);
  assert.equal(t.timers.size, 1);
  t.fireTimers();
  assert.deepEqual(t.calls.map(call => call.answer), ['こんにちは']);
  t.calls[0].resolve();
  await t.tick();
  assert.equal(t.statuses.at(-1), 'saved');
  assert.deepEqual(t.cleaned, ['a']);
  assert.equal(t.queue.hasPending(), false);
});

test('text typed while a save is in flight is sent after it, and the old reply does not clean the draft', async () => {
  const t = setup();
  t.queue.change('a', '一', '');
  t.fireTimers();
  t.queue.change('a', '一二', '');
  // Leaving the question flushes now, while the first save is still out.
  const flushed = t.queue.flush('a');
  assert.equal(t.calls.length, 1);
  t.calls[0].resolve();
  await t.tick();
  assert.deepEqual(t.cleaned, [], 'the first reply is older than the text on screen');
  assert.deepEqual(t.calls.map(call => call.answer), ['一', '一二']);
  t.calls[1].resolve();
  assert.equal(await flushed, true);
  assert.deepEqual(t.cleaned, ['a']);
  assert.deepEqual(t.saved.map(entry => entry.answer), ['一', '一二']);
});

test('a failed save keeps the text, reports an error, and a retry sends it again', async () => {
  const t = setup();
  t.queue.change('a', '回答', '');
  t.fireTimers();
  t.calls[0].reject('保存エラー');
  await t.tick();
  assert.equal(t.statuses.at(-1), 'error');
  assert.equal(t.queue.getError('a').message, '保存エラー');
  assert.equal(t.queue.hasPending(), true);
  assert.deepEqual(t.cleaned, []);
  const retried = t.queue.flush('a');
  assert.equal(t.calls[1].answer, '回答');
  t.calls[1].resolve();
  assert.equal(await retried, true);
  assert.equal(t.statuses.at(-1), 'saved');
  assert.equal(t.queue.getError('a'), null);
});

test('flushAll sends every waiting entry and skips clean ones', async () => {
  const t = setup();
  t.queue.change('a', 'A', '');
  t.queue.change('b', 'B', '');
  t.queue.change('c', '同じ', '同じ');
  const all = t.queue.flushAll();
  assert.deepEqual(t.calls.map(call => call.id).sort(), ['a', 'b']);
  assert.equal(t.timers.size, 1, 'only the clean entry keeps its timer, which sends nothing');
  t.calls.forEach(call => call.resolve());
  assert.equal(await all, true);
});

test('a reply that arrives after a reset is dropped', async () => {
  const t = setup();
  t.queue.change('a', '古い', '');
  t.fireTimers();
  t.queue.reset('a');
  t.calls[0].resolve();
  await t.tick();
  assert.deepEqual(t.saved, []);
  assert.deepEqual(t.cleaned, []);
});

test('a clean entry starts from the latest server text', async () => {
  const t = setup();
  t.queue.change('a', 'x', '');
  t.fireTimers();
  t.calls[0].resolve();
  await t.tick();
  // The entry changed elsewhere (e.g. the modal) and is typed into again.
  t.queue.change('a', '別の場所で更新', '別の場所で更新');
  assert.equal(t.queue.hasPending(), false);
  t.fireTimers();
  assert.equal(t.calls.length, 1, 'nothing new to send');
  assert.equal(t.statuses.at(-1), 'saved');
});

test('typing and undoing back to the saved text sends nothing', () => {
  const t = setup();
  t.queue.change('a', '回答。', '回答');
  t.queue.change('a', '回答', '回答');
  t.fireTimers();
  assert.equal(t.calls.length, 0);
  assert.equal(t.statuses.at(-1), 'saved');
});
