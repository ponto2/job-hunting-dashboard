import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, verifyPassword, verifySessionToken } from '../lib/auth.js';
import {
  MAX_FAILED_ATTEMPTS, clearFailedLogins, getClientAddress, isLoginBlocked, recordFailedLogin,
} from '../lib/login-rate-limit.js';

function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  return Promise.resolve(fn()).finally(() => {
    Object.entries(saved).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
}

test('password check accepts only the exact password, whatever the input length', () => withEnv(
  { AUTH_PASSWORD: 'correct horse battery' },
  async () => {
    assert.equal(await verifyPassword('correct horse battery'), true);
    for (const guess of ['', 'correct horse batter', 'correct horse battery!', 'x'.repeat(1000), null, 123]) {
      assert.equal(await verifyPassword(guess), false, String(guess));
    }
  },
));

test('sessions signed before AUTH_SECRET existed stay valid while it is unset', () => withEnv(
  { AUTH_PASSWORD: 'pw', AUTH_SECRET: undefined },
  async () => {
    const token = await createSessionToken();
    assert.equal(await verifySessionToken(token), true);
  },
));

test('rotating AUTH_SECRET revokes every issued session', async () => {
  let token;
  await withEnv({ AUTH_PASSWORD: 'pw', AUTH_SECRET: 'secret-one' }, async () => {
    token = await createSessionToken();
    assert.equal(await verifySessionToken(token), true);
  });
  await withEnv({ AUTH_PASSWORD: 'pw', AUTH_SECRET: 'secret-two' }, async () => {
    assert.equal(await verifySessionToken(token), false);
  });
});

test('tampered, malformed, and expired tokens are rejected', () => withEnv(
  { AUTH_PASSWORD: 'pw', AUTH_SECRET: 's' },
  async () => {
    const token = await createSessionToken();
    const [expiry, sig] = token.split('.');
    assert.equal(await verifySessionToken(`${Number(expiry) + 1}.${sig}`), false);
    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    assert.equal(await verifySessionToken(`${expiry}.${flipped}`), false);
    assert.equal(await verifySessionToken(`${expiry}.zz`), false);
    assert.equal(await verifySessionToken('1e20.' + sig), false);
    assert.equal(await verifySessionToken(`1000.${sig}`), false);
  },
));

test('the client address comes from the proxy headers', () => {
  const request = headers => new Request('http://localhost/api/auth/login', { headers });
  assert.equal(getClientAddress(request({ 'x-real-ip': '203.0.113.5', 'x-forwarded-for': '198.51.100.1' })), '203.0.113.5');
  assert.equal(getClientAddress(request({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '198.51.100.1');
  assert.equal(getClientAddress(request({})), 'unknown');
});

function fakeClient(result) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, operations: [] };
      calls.push(call);
      const query = {};
      for (const operation of ['select', 'insert', 'delete', 'eq', 'gte', 'lt']) {
        query[operation] = (...args) => { call.operations.push({ operation, args }); return query; };
      }
      query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return query;
    },
  };
}

test('logins are blocked once failures in the window reach the limit', async () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const atLimit = fakeClient({ count: MAX_FAILED_ATTEMPTS, error: null });
  assert.equal(await isLoginBlocked(atLimit, 'key', now), true);
  const ops = atLimit.calls[0].operations;
  assert.deepEqual(ops.find(op => op.operation === 'eq').args, ['client_key', 'key']);
  assert.deepEqual(ops.find(op => op.operation === 'gte').args, ['attempted_at', '2026-11-05T11:45:00.000Z']);
  assert.equal(await isLoginBlocked(fakeClient({ count: MAX_FAILED_ATTEMPTS - 1, error: null }), 'key', now), false);
});

test('the limiter fails open when its table or database is unavailable', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const missing = { code: 'PGRST205', message: "Could not find the table 'public.login_attempts'" };
    assert.equal(await isLoginBlocked(fakeClient({ count: null, error: missing }), 'key'), false);
    assert.equal(await isLoginBlocked(null, 'key'), false);
    await recordFailedLogin(fakeClient({ error: missing }), 'key');
    await clearFailedLogins(fakeClient({ error: missing }), 'key');
    const throwing = { from() { throw new Error('network down'); } };
    assert.equal(await isLoginBlocked(throwing, 'key'), false);
    await recordFailedLogin(throwing, 'key');
  } finally {
    console.warn = originalWarn;
  }
});

test('a failure is recorded and old attempts are pruned; success clears the client', async () => {
  const client = fakeClient({ error: null });
  await recordFailedLogin(client, 'key', new Date('2026-11-05T12:00:00Z'));
  assert.deepEqual(client.calls[0].operations[0], { operation: 'insert', args: [{ client_key: 'key' }] });
  assert.deepEqual(client.calls[1].operations.find(op => op.operation === 'lt').args, ['attempted_at', '2026-11-04T12:00:00.000Z']);
  const clearing = fakeClient({ error: null });
  await clearFailedLogins(clearing, 'key');
  assert.deepEqual(clearing.calls[0].operations.find(op => op.operation === 'eq').args, ['client_key', 'key']);
});
