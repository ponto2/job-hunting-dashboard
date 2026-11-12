import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as selectionHelpers from '../lib/selections.js';
import * as statusHelpers from '../lib/status.js';
import * as dateHelpers from '../lib/date.js';
import * as validationHelpers from '../lib/validation.js';
import * as backupHelpers from '../lib/backup.js';
import * as esEntryHelpers from '../lib/es-entries.js';

const companyId = '48229372-685c-4e1c-8cce-03478666cabd';
const selectionId = '974f7929-c35a-4e11-b9e6-25449bf8a153';
const company = { id: companyId, name: 'A社', status: '面接中' };
const selection = { id: selectionId, company_id: companyId, kind: 'internship', title: '夏', status: '面接中' };
const missingTable = { code: 'PGRST205', message: "Could not find the table 'public.selections' in the schema cache" };

async function loadModule(path, context, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const mod = new SourceTextModule(source, { context });
  await mod.link((specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected import: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await mod.evaluate();
  return mod.namespace;
}

// Isolate the route's auth and database boundary while executing its real
// request parsing, validation, response handling, and persistence decisions.
async function loadRoute(name, results = {}, { authenticated = true, getSupabase } = {}) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, operations: [] };
      calls.push(call);
      const query = {};
      for (const operation of ['select', 'insert', 'update', 'delete', 'order', 'eq', 'lt', 'or', 'in', 'contains', 'range', 'limit', 'single', 'maybeSingle']) {
        query[operation] = (...args) => {
          call.operations.push({ operation, args });
          return query;
        };
      }
      query.then = (resolve, reject) => Promise.resolve(results[table]?.shift() || { data: null, error: null }).then(resolve, reject);
      return query;
    },
    rpc(fn, args) {
      calls.push({ rpc: fn, args });
      return Promise.resolve(results[`rpc:${fn}`]?.shift() || { data: null, error: null });
    },
  };
  const loggedErrors = [];
  const context = createContext({ URL, console: { error: (...args) => loggedErrors.push(args) } });
  const nextServer = { NextResponse: { json: (data, init) => Response.json(data, init) } };
  const apiResponse = await loadModule('../lib/api-response.js', context, {
    'next/server': nextServer,
    '@/lib/auth': { isAuthenticated: async () => authenticated },
  });
  const route = await loadModule(`../app/api/${name}/route.js`, context, {
    '@/lib/supabase': { getSupabase: getSupabase ? () => getSupabase(apiResponse) : () => client },
    'next/server': nextServer,
    '@/lib/api-response': apiResponse,
    '@/lib/selections': selectionHelpers,
    '@/lib/status': statusHelpers,
    '@/lib/date': dateHelpers,
    '@/lib/validation': validationHelpers,
    '@/lib/backup': backupHelpers,
    '@/lib/es-entries': esEntryHelpers,
  });
  return { route, calls, loggedErrors };
}

function request(method, body, query = '') {
  return new Request(`http://localhost/api/selections${query}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

test('a missing server key is reported as JSON with an actionable message', async () => {
  const message = 'サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が設定されていません';
  for (const name of ['companies', 'events', 'es-entries', 'interview-memos', 'selections']) {
    const { route } = await loadRoute(name, {}, {
      getSupabase: ({ configError }) => { throw configError(message); },
    });
    const response = await route.GET(request('GET'));
    assert.equal(response.status, 500, name);
    assert.deepEqual(await response.json(), { error: message }, name);
  }
});

test('unexpected server errors stay JSON without exposing internal details', async () => {
  const { route, loggedErrors } = await loadRoute('events', {}, {
    getSupabase: () => { throw new Error('internal connection detail'); },
  });
  const response = await route.GET(request('GET'));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'サーバーでエラーが発生しました' });
  assert.equal(loggedErrors.length, 1);
});

test('a malformed JSON body is a client error, not a server crash', async () => {
  const { route, calls } = await loadRoute('events');
  const response = await route.POST(new Request('http://localhost/api/events', {
    method: 'POST',
    body: '{not json',
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /入力形式が正しくありません/);
  assert.equal(calls.length, 0);
});

test('all selection operations reject unauthenticated calls before touching the database', async () => {
  const { route, calls } = await loadRoute('selections', {}, { authenticated: false });
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    assert.equal((await route[method](request(method))).status, 401);
  }
  assert.equal(calls.length, 0);
});

test('company listing reports a missing selections table as a required migration', async () => {
  const { route } = await loadRoute('companies', {
    companies: [{ data: [company], error: null }],
    selections: [{ data: null, error: missingTable }],
  });
  const response = await route.GET(request('GET'));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /データベース更新/);
});

test('company listing does not disguise database permission errors as an empty board', async () => {
  const { route } = await loadRoute('companies', {
    companies: [{ data: [company], error: null }],
    selections: [{ data: null, error: { code: '42501', message: 'permission denied for table selections' } }],
  });
  const response = await route.GET(request('GET'));
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /permission denied/);
});

test('new companies do not automatically receive a selection or write nested client selections', async () => {
  const { route, calls } = await loadRoute('companies', {
    companies: [{ data: company, error: null }],
  });
  const response = await route.POST(request('POST', { name: 'A社', industry: 'IT', selections: [selection] }));
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).selections, []);
  const write = calls.flatMap((call) => call.operations).find((op) => op.operation === 'insert');
  assert.deepEqual(JSON.parse(JSON.stringify(write.args[0])), [{ name: 'A社', industry: 'IT' }]);
  assert.equal(calls.filter((call) => call.table === 'selections').length, 0);
});

test('company updates never write a company-level status, so selection progress stays independent', async () => {
  const { route, calls } = await loadRoute('companies', {
    selections: [{ data: [selection], error: null }],
    companies: [{ data: { ...company, name: 'A社更新' }, error: null }],
  });
  const response = await route.PUT(request('PUT', { id: companyId, name: 'A社更新', status: '不合格', selections: [] }));
  const write = calls.flatMap((call) => call.operations).find((op) => op.operation === 'update');
  assert.deepEqual(JSON.parse(JSON.stringify(write.args[0])), { name: 'A社更新' });
  assert.deepEqual((await response.json()).selections, [selection]);
});

test('selection status patches update just the requested selection', async () => {
  const { route, calls } = await loadRoute('selections', {
    selections: [{ data: { ...selection, status: '合格' }, error: null }],
  });
  const response = await route.PUT(request('PUT', { id: selectionId, status: '内定' }));
  assert.equal(response.status, 200);
  const ops = calls[0].operations;
  assert.deepEqual(JSON.parse(JSON.stringify(ops.find((op) => op.operation === 'update').args[0])), { status: '合格' });
  assert.deepEqual(ops.find((op) => op.operation === 'eq').args, ['id', selectionId]);
});

test('invalid selection input is rejected before database calls', async () => {
  const { route, calls } = await loadRoute('selections');
  assert.equal((await route.POST(request('POST', { company_id: companyId, kind: 'other' }))).status, 400);
  assert.equal((await route.PUT(request('PUT', { id: selectionId, company_id: companyId, title: '移動' }))).status, 400);
  assert.equal((await route.DELETE(request('DELETE', undefined, '?id=legacy%3Abad'))).status, 400);
  assert.equal(calls.length, 0);
});

test('missing migration and missing selection return distinguishable errors', async () => {
  const missing = await loadRoute('selections', { selections: [{ data: null, error: missingTable }] });
  assert.equal((await missing.route.POST(request('POST', { company_id: companyId, kind: 'fulltime' }))).status, 503);
  const deleted = await loadRoute('selections', { selections: [{ data: null, error: null }] });
  assert.equal((await deleted.route.DELETE(request('DELETE', undefined, `?id=${selectionId}`))).status, 404);
});

test('company fetch normalizes legacy success values in nested selections', async () => {
  const { route } = await loadRoute('companies', {
    companies: [{ data: [company], error: null }],
    selections: [{ data: [{ ...selection, status: '内定' }], error: null }],
  });
  const [result] = await (await route.GET(request('GET'))).json();
  assert.equal(result.selections[0].status, '合格');
  assert.equal(result.selections[0].id, selectionId);
});

test('ES entries are filtered by company through company_ids only', async () => {
  const { route, calls } = await loadRoute('es-entries', { es_entries: [{ data: [], error: null }] });
  assert.equal((await route.GET(new Request(`http://localhost/api/es-entries?company_id=${companyId}`))).status, 200);
  const ops = calls[0].operations;
  assert.deepEqual(JSON.parse(JSON.stringify(ops.find(op => op.operation === 'contains').args)), ['company_ids', [companyId]]);
  assert.equal(ops.some(op => op.operation === 'or'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(ops.find(op => op.operation === 'select').args)), ['*']);
});

test('an old status constraint gives an actionable migration error', async () => {
  const { route } = await loadRoute('selections', { selections: [{ data: null, error: {
    code: '23514', message: 'new row violates check constraint "selections_status_check"',
  } }] });
  const response = await route.PUT(request('PUT', { id: selectionId, status: '合格' }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /データベース更新/);
});

test('backup export reads every table in pages and tolerates tables an old install lacks', async () => {
  const page = Array.from({ length: 1000 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  const { route, calls } = await loadRoute('backup', {
    companies: [{ data: page, error: null }, { data: [{ id: companyId }], error: null }],
    selections: [{ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.selections'" } }],
    events: [{ data: [], error: null }],
    es_question_threads: [{ data: [], error: null }],
    es_entries: [{ data: [], error: null }],
    interview_memos: [{ data: [], error: null }],
  });
  const response = await route.GET(request('GET'));
  assert.equal(response.status, 200);
  const backup = await response.json();
  assert.equal(backup.format, 'job-hunting-dashboard-backup');
  assert.equal(backup.version, 2);
  assert.equal(backup.data.companies.length, 1001);
  assert.deepEqual(backup.data.selections, []);
  const companyRanges = calls.filter(call => call.table === 'companies')
    .map(call => call.operations.find(op => op.operation === 'range').args);
  assert.deepEqual(companyRanges, [[0, 999], [1000, 1999]]);
});

test('backup restore validates the file and explains a missing migration', async () => {
  const valid = { format: 'job-hunting-dashboard-backup', version: 2, data: { companies: [{ id: companyId, name: 'A社', industry: 'IT' }] } };

  const bad = await loadRoute('backup');
  assert.equal((await bad.route.POST(request('POST', [company]))).status, 400);
  assert.equal((await bad.route.POST(request('POST', { ...valid, data: { companies: [{ name: 'IDなし' }] } }))).status, 400);
  assert.equal(bad.calls.length, 0);

  const missing = await loadRoute('backup', { 'rpc:restore_backup': [{ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }] });
  const notReady = await missing.route.POST(request('POST', valid));
  assert.equal(notReady.status, 503);
  assert.match((await notReady.json()).error, /データベース更新/);

  const ok = await loadRoute('backup', { 'rpc:restore_backup': [{ data: { companies: { total: 1, inserted: 1 } }, error: null }] });
  const restored = await ok.route.POST(request('POST', valid));
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).summary, '企業1件');
  assert.equal(ok.calls[0].rpc, 'restore_backup');
  assert.deepEqual(Object.keys(ok.calls[0].args.payload), ['companies', 'selections', 'events', 'es_question_threads', 'es_entries', 'interview_memos']);
});

async function loadLoginRoute({ getSupabase = () => ({ client: true }), blocked = () => false } = {}) {
  const events = [];
  const context = createContext({
    URL, Response, process: { env: { AUTH_PASSWORD: 'pw' } }, console: { error() {}, warn() {} },
  });
  const nextServer = { NextResponse: { json: (data, init) => Response.json(data, init) } };
  const apiResponse = await loadModule('../lib/api-response.js', context, {
    'next/server': nextServer,
    '@/lib/auth': { isAuthenticated: async () => true },
  });
  const route = await loadModule('../app/api/auth/login/route.js', context, {
    '@/lib/auth': {
      verifyPassword: async password => password === 'pw',
      buildSetCookieHeader: async () => 'session=token; HttpOnly',
      hmacHex: async value => `hash(${value})`,
    },
    '@/lib/api-response': apiResponse,
    '@/lib/supabase': { getSupabase },
    '@/lib/login-rate-limit': {
      WINDOW_MINUTES: 15,
      getClientAddress: () => '203.0.113.5',
      isLoginBlocked: async (supabase, key) => { events.push(['check', supabase, key]); return blocked(); },
      recordFailedLogin: async (supabase, key) => events.push(['fail', supabase, key]),
      clearFailedLogins: async (supabase, key) => events.push(['clear', supabase, key]),
    },
  });
  const login = body => route.POST(new Request('http://localhost/api/auth/login', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
  return { login, events };
}

test('login records failures, clears them on success, and refuses blocked clients', async () => {
  let blocked = false;
  const { login, events } = await loadLoginRoute({ blocked: () => blocked });
  const key = 'hash(login:203.0.113.5)';
  assert.equal((await login({ password: 'wrong' })).status, 401);
  const ok = await login({ password: 'pw' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /^session=token/);
  assert.deepEqual(events.map(([action, , k]) => [action, k]), [
    ['check', key], ['fail', key], ['check', key], ['clear', key],
  ]);

  blocked = true;
  const refused = await login({ password: 'pw' });
  assert.equal(refused.status, 429);
  assert.match((await refused.json()).error, /一時的にログインを制限/);
  assert.equal(refused.headers.get('set-cookie'), null);
});

test('login keeps working without a database connection', async () => {
  const { login, events } = await loadLoginRoute({ getSupabase: () => { throw new Error('no key'); } });
  assert.equal((await login({ password: 'pw' })).status, 200);
  assert.equal(events.every(([, supabase]) => supabase === null), true);
  assert.equal((await login('{bad json')).status, 400);
  assert.equal((await login({ password: 42 })).status, 400);
});

test('filter parameters that reach PostgREST filter strings are validated first', async () => {
  const events = await loadRoute('events');
  for (const query of [
    '?startDate=2026-01-01),or(id.neq.0&endDate=2026-01-31',
    '?startDate=2026-02-30&endDate=2026-03-01',
    '?startDate=2026-03-31&endDate=2026-03-01',
    '?year=2026&month=13',
  ]) {
    assert.equal((await events.route.GET(new Request(`http://localhost/api/events${query}`))).status, 400, query);
  }
  assert.equal(events.calls.length, 0);

  const es = await loadRoute('es-entries');
  const injected = encodeURIComponent(`${companyId},id.neq.0`);
  assert.equal((await es.route.GET(new Request(`http://localhost/api/es-entries?company_id=${injected}`))).status, 400);
  assert.equal(es.calls.length, 0);
});

test('a valid calendar range builds the overlap filter from validated dates', async () => {
  const { route, calls } = await loadRoute('events', { events: [{ data: [], error: null }] });
  const response = await route.GET(new Request('http://localhost/api/events?startDate=2026-03-01&endDate=2026-04-04'));
  assert.equal(response.status, 200);
  const ops = calls[0].operations;
  assert.deepEqual(ops.find(op => op.operation === 'lt').args, ['start_date', '2026-04-05']);
  assert.deepEqual(ops.find(op => op.operation === 'or').args,
    ['end_date.gte.2026-03-01,and(end_date.is.null,start_date.gte.2026-03-01)']);
});

test('company writes keep only known columns and reject unsafe URLs', async () => {
  const unsafe = await loadRoute('companies');
  const rejected = await unsafe.route.POST(request('POST', { name: 'A社', industry: 'IT', recruit_url: 'javascript:alert(1)' }));
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /採用ページURL/);
  assert.equal(unsafe.calls.length, 0);

  const { route, calls } = await loadRoute('companies', {
    companies: [{ data: { ...company, name: 'A社' }, error: null }],
    selections: [{ data: [], error: null }],
  });
  const response = await route.POST(request('POST', {
    id: selectionId, name: ' A社 ', industry: 'IT', created_at: 'x', unknown_column: 1, official_url: '',
  }));
  assert.equal(response.status, 201);
  const write = calls.flatMap(call => call.operations).find(op => op.operation === 'insert');
  assert.deepEqual(JSON.parse(JSON.stringify(write.args[0])), [{ name: 'A社', industry: 'IT', official_url: null }]);
});
