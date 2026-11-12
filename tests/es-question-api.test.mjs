import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as validation from '../lib/validation.js';

async function route({authenticated=true,result={data:[]}}={}) {
  const calls=[];
  const dependencies={
    'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},
    '@/lib/supabase':{getSupabase:()=>({rpc:async(name,args)=>{calls.push({name,args});return result;}})},
    '@/lib/api-response':{
      jsonError:(error,status)=>Response.json({error},{status}),
      requireAuth:async()=>authenticated?null:Response.json({error:'認証が必要です'},{status:401}),
      supabaseError:error=>Response.json({error:error.message},{status:500}),
      withApi:handler=>handler,
    },
    '@/lib/validation':validation,
  };
  const context=createContext({});
  const mod=new SourceTextModule(await readFile(new URL('../app/api/es-question-threads/route.js',import.meta.url),'utf8'),{context});
  await mod.link(name=>new SyntheticModule(Object.keys(dependencies[name]),function(){for(const [key,value] of Object.entries(dependencies[name]))this.setExport(key,value);},{context}));
  await mod.evaluate();
  return {put:body=>mod.namespace.PUT(new Request('http://localhost/api/es-question-threads',{method:'PUT',body:JSON.stringify(body)})),calls};
}
const id='00000000-0000-4000-8000-000000000001';
const body={entry_ids:[id],question:'新しい設問',category:'その他',char_limit:400};
test('question edit requires authentication and validates all fields before RPC',async()=>{
  const unauth=await route({authenticated:false});assert.equal((await unauth.put(body)).status,401);assert.equal(unauth.calls.length,0);
  const invalid=await route();assert.equal((await invalid.put({...body,char_limit:-1})).status,400);assert.equal(invalid.calls.length,0);
});
test('question edit is one RPC and returns its complete result',async()=>{
  const r=await route({result:{data:[{id,question:'新しい設問',answer:'保持'}]}});
  const response=await r.put(body);assert.equal(response.status,200);assert.equal((await response.json())[0].answer,'保持');
  assert.equal(r.calls.length,1);assert.equal(r.calls[0].name,'update_es_question');
});
test('missing atomic migration is explicit; no sequential update fallback',async()=>{
  const r=await route({result:{error:{code:'PGRST202'}}});assert.equal((await r.put(body)).status,503);assert.equal(r.calls.length,1);
});
