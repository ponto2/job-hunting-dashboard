import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as selectionHelpers from '../lib/selections.js';
import * as dateHelpers from '../lib/date.js';
import * as validationHelpers from '../lib/validation.js';

const companyId = '48229372-685c-4e1c-8cce-03478666cabd';
const otherCompanyId = '5d0c7a9e-9f43-4a51-b7a4-0d9b6a3e2c11';
const selectionId = '974f7929-c35a-4e11-b9e6-25449bf8a153';
const eventId = 'c2a8f1d0-3b7e-4f6a-9c5d-1e2f3a4b5c6d';
const base = { title: 'ES締切', event_type: 'deadline', start_date: '2026-11-12' };
const missingDone = { code: 'PGRST204', message: "Could not find the 'done' column of 'events' in the schema cache" };
const missingSelectionId = { code: '42703', message: 'column "selection_id" of relation "events" does not exist' };
const migrationMessage = /予定の完了と選考の紐づけには、データベースの更新が必要です/;

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

// Same isolation as tests/selections-api.test.mjs: the route's own parsing,
// validation, and persistence decisions run against a recorded fake client.
async function loadRoute(results = {}) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, operations: [] };
      calls.push(call);
      const query = {};
      for (const operation of ['select', 'insert', 'update', 'delete', 'order', 'eq', 'lt', 'or', 'single', 'maybeSingle']) {
        query[operation] = (...args) => {
          call.operations.push({ operation, args });
          return query;
        };
      }
      query.then = (resolve, reject) => Promise.resolve(results[table]?.shift() || { data: null, error: null }).then(resolve, reject);
      return query;
    },
  };
  const context = createContext({ URL, console: { error() {} } });
  const nextServer = { NextResponse: { json: (data, init) => Response.json(data, init) } };
  const apiResponse = await loadModule('../lib/api-response.js', context, {
    'next/server': nextServer,
    '@/lib/auth': { isAuthenticated: async () => true },
  });
  const route = await loadModule('../app/api/events/route.js', context, {
    '@/lib/supabase': { getSupabase: () => client },
    'next/server': nextServer,
    '@/lib/api-response': apiResponse,
    '@/lib/selections': selectionHelpers,
    '@/lib/date': dateHelpers,
    '@/lib/validation': validationHelpers,
  });
  return { route, calls };
}

const request = (method, body) => new Request('http://localhost/api/events', {
  method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
});
const plain = value => JSON.parse(JSON.stringify(value));
const writesTo = (calls, operation) => calls
  .filter(call => call.table === 'events')
  .map(call => call.operations.find(op => op.operation === operation))
  .filter(Boolean)
  .map(op => plain(op.args[0]));

test('a linked selection must exist before the event is written', async () => {
  const { route, calls } = await loadRoute({ selections: [{ data: null, error: null }] });
  const response = await route.POST(request('POST', { ...base, company_id: companyId, selection_id: selectionId }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, '選考が見つかりません');
  const lookup = calls[0].operations;
  assert.equal(calls[0].table, 'selections');
  assert.deepEqual(lookup.find(op => op.operation === 'select').args, ['id, company_id']);
  assert.deepEqual(lookup.find(op => op.operation === 'eq').args, ['id', selectionId]);
  assert.equal(calls.some(call => call.table === 'events'), false);
});

test('an event with only a selection takes that selection\'s company', async () => {
  const { route, calls } = await loadRoute({
    selections: [{ data: { id: selectionId, company_id: companyId }, error: null }],
    events: [{ data: { id: eventId }, error: null }],
  });
  const response = await route.POST(request('POST', { ...base, selection_id: selectionId, done: false }));
  assert.equal(response.status, 201);
  assert.deepEqual(writesTo(calls, 'insert'), [[{
    ...base, end_date: null, company_id: companyId, memo: null, done: false, selection_id: selectionId,
  }]]);
});

test('a selection from another company is rejected on create and update', async () => {
  for (const [method, body] of [
    ['POST', { ...base, company_id: otherCompanyId, selection_id: selectionId }],
    ['PUT', { ...base, id: eventId, company_id: otherCompanyId, selection_id: selectionId }],
  ]) {
    const { route, calls } = await loadRoute({ selections: [{ data: { id: selectionId, company_id: companyId }, error: null }] });
    const response = await route[method](request(method, body));
    assert.equal(response.status, 400, method);
    assert.equal((await response.json()).error, '選考と企業が一致しません', method);
    assert.equal(calls.some(call => call.table === 'events'), false, method);
  }
});

test('a matching company and selection update the event in place', async () => {
  const { route, calls } = await loadRoute({
    selections: [{ data: { id: selectionId, company_id: companyId }, error: null }],
    events: [{ data: { id: eventId, done: true }, error: null }],
  });
  const response = await route.PUT(request('PUT', { ...base, id: eventId, company_id: companyId, selection_id: selectionId, done: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(writesTo(calls, 'update'), [{
    ...base, end_date: null, company_id: companyId, memo: null, done: true, selection_id: selectionId,
  }]);
});

test('without the new columns, a plain event is retried once without them', async () => {
  const create = await loadRoute({ events: [{ data: null, error: missingDone }, { data: { id: eventId }, error: null }] });
  const created = await create.route.POST(request('POST', { ...base, done: false, selection_id: '' }));
  assert.equal(created.status, 201);
  const inserts = writesTo(create.calls, 'insert');
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts[0], [{ ...base, end_date: null, company_id: null, memo: null, done: false, selection_id: null }]);
  assert.deepEqual(inserts[1], [{ ...base, end_date: null, company_id: null, memo: null }]);
  assert.equal(create.calls.some(call => call.table === 'selections'), false);

  const update = await loadRoute({ events: [{ data: null, error: missingSelectionId }, { data: { id: eventId }, error: null }] });
  const updated = await update.route.PUT(request('PUT', { ...base, id: eventId, done: false, selection_id: null }));
  assert.equal(updated.status, 200);
  assert.deepEqual(writesTo(update.calls, 'update'), [
    { ...base, end_date: null, company_id: null, memo: null, done: false, selection_id: null },
    { ...base, end_date: null, company_id: null, memo: null },
  ]);
});

test('without the new columns, saving done or a link asks for the migration', async () => {
  const done = await loadRoute({ events: [{ data: null, error: missingDone }] });
  const doneResponse = await done.route.PUT(request('PUT', { ...base, id: eventId, done: true, selection_id: null }));
  assert.equal(doneResponse.status, 503);
  assert.match((await doneResponse.json()).error, migrationMessage);
  assert.equal(writesTo(done.calls, 'update').length, 1);

  const linked = await loadRoute({
    selections: [{ data: { id: selectionId, company_id: companyId }, error: null }],
    events: [{ data: null, error: missingSelectionId }],
  });
  const linkedResponse = await linked.route.POST(request('POST', { ...base, selection_id: selectionId, done: false }));
  assert.equal(linkedResponse.status, 503);
  assert.match((await linkedResponse.json()).error, migrationMessage);
  assert.equal(writesTo(linked.calls, 'insert').length, 1);
});

test('other write errors are not mistaken for a missing column', async () => {
  const { route, calls } = await loadRoute({ events: [{ data: null, error: { code: '23503', message: 'insert violates foreign key constraint "events_company_id_fkey"' } }] });
  const response = await route.POST(request('POST', { ...base, done: false }));
  assert.equal(response.status, 500);
  assert.equal(writesTo(calls, 'insert').length, 1);
});

test('older clients that send neither key never touch the new columns', async () => {
  const { route, calls } = await loadRoute({ events: [{ data: { id: eventId }, error: null }, { data: { id: eventId }, error: null }] });
  const response = await route.PUT(request('PUT', { ...base, id: eventId }));
  assert.equal(response.status, 200);
  assert.deepEqual(writesTo(calls, 'update'), [{ ...base, end_date: null, company_id: null, memo: null }]);
});

test('a missing selections table is reported as a required migration', async () => {
  const { route } = await loadRoute({ selections: [{ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.selections' in the schema cache" } }] });
  const response = await route.POST(request('POST', { ...base, selection_id: selectionId }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /データベース更新/);
});

test('omitting a stored selection cannot move its event to another company', async () => {
  const {route,calls}=await loadRoute({events:[{data:{id:eventId,selection_id:selectionId}}],selections:[{data:{id:selectionId,company_id:companyId}}]});
  const response=await route.PUT(request('PUT',{...base,id:eventId,company_id:otherCompanyId}));
  assert.equal(response.status,400);
  assert.equal(writesTo(calls,'update').length,0);
});
