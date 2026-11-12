import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as validation from '../lib/validation.js';

const id = '48229372-685c-4e1c-8cce-03478666cabd';

for (const method of ['GET', 'POST', 'PUT']) {
  test(`interview memo ${method} resolves the event relationship after the composite FK migration`, async () => {
    const context = createContext({ URL });
    let selected = false;
    const memo = { id, content: '面接準備', events: null };
    const client = {
      from(table) {
        assert.equal(table, 'interview_memos');
        const query = {};
        for (const op of ['insert', 'update', 'eq', 'order', 'single', 'maybeSingle']) {
          query[op] = () => query;
        }
        query.select = (clause) => {
          // Both the original FK and memos_event_company exist after migration.
          // PostgREST requires a relationship hint, including on write responses.
          assert.match(clause, /events!interview_memos_event_id_fkey\s*\(/);
          selected = true;
          return query;
        };
        query.then = (resolve, reject) => Promise.resolve({
          data: method === 'GET' ? [memo] : memo, error: null,
        }).then(resolve, reject);
        return query;
      },
    };
    const dependencies = {
      '@/lib/supabase': { getSupabase: () => client },
      'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
      '@/lib/validation': validation,
      '@/lib/api-response': {
        requireAuth: async () => null,
        withApi: handler => handler,
        jsonError: (error, status) => Response.json({ error }, { status }),
        supabaseError: error => Response.json(error, { status: 500 }),
      },
    };
    const source = await readFile(new URL('../app/api/interview-memos/route.js', import.meta.url), 'utf8');
    const mod = new SourceTextModule(source, { context });
    await mod.link(specifier => {
      const exports = dependencies[specifier];
      assert.ok(exports);
      return new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    await mod.evaluate();
    const request = new Request('http://localhost/api/interview-memos', {
      method,
      ...(method === 'GET' ? {} : { body: JSON.stringify({ id, content: memo.content, memo_type: 'prep' }) }),
    });
    const response = await mod.namespace[method](request);
    assert.equal(response.status, method === 'POST' ? 201 : 200);
    assert.equal(selected, true);
    assert.deepEqual(await response.json(), method === 'GET' ? [memo] : memo);
  });
}
