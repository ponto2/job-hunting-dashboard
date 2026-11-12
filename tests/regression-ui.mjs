import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const baseURL = process.env.KANBAN_TEST_URL || 'http://localhost:3000';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
  const context = await browser.newContext({ viewport: { width:1440, height:1000 }, timezoneId:'Asia/Tokyo' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const companies=[{id:uuid(1),name:'対象企業',industry:'IT',interest:3,selections:[]},{id:uuid(2),name:'別企業',industry:'IT',interest:3,selections:[]}];
  const entries=['Aの設問','Bの設問'].map((question,i)=>({id:uuid(301+i),question,answer:'',category:'その他',char_limit:400,company_ids:[uuid(i+1)],company_names:companies[i].name,created_at:'2026-11-01T00:00:00Z'}));
  let failAnswer=false, logoutCount=0, releaseEvent, savedEvent, addedCompany;
  let eventGate;
  await context.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,method=req.method();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/auth/check')return reply({authenticated:true});
    if(path==='/api/auth/logout'){logoutCount++;return reply({success:true});}
    if(method==='GET')return reply(path==='/api/es-entries'?entries:path==='/api/companies'?companies:[]);
    if(path==='/api/es-entries'&&method==='PUT'){
      if(failAnswer)return reply({error:'テスト用の通信失敗'},500);
      const body=req.postDataJSON(),entry=entries.find(e=>e.id===body.id);Object.assign(entry,body);return reply(entry);
    }
    if(path==='/api/es-question-threads'&&method==='PUT'){const {entry_ids,...fields}=req.postDataJSON();const updated=entries.filter(entry=>entry_ids.includes(entry.id));updated.forEach(entry=>Object.assign(entry,fields));return reply(updated);}
    if(path==='/api/events'&&method==='POST'){savedEvent=req.postDataJSON();await eventGate;return reply({id:uuid(50),...savedEvent},201);}
    if(path==='/api/research')return reply({name:'調査会社',industry:null,research_sources:[{url:'https://example.com/report',title:'有価証券報告書',year:'2025',scope:'単体'}]});
    if(path==='/api/companies'&&method==='POST'){addedCompany=req.postDataJSON();return reply({id:uuid(60),...addedCompany},201);}
    return reply({error:'unexpected request'},500);
  });
  await page.goto(baseURL);
  const tab=name=>page.getByRole('navigation',{name:'表示切り替え'}).getByRole('button',{name:new RegExp('^'+name)});
  await tab('ESメモ').click();
  const answer=page.locator('.es-answer-input').first();
  await answer.fill('回答を書き続ける');
  await page.getByText('保存済み',{exact:true}).waitFor();
  assert.equal(await page.locator('.es-memo-view .split-detail-title').textContent(),'Aの設問');
  assert.equal(await answer.inputValue(),'回答を書き続ける');
  console.log('PASS initial ES selection stays anchored after autosave');
  failAnswer=true;
  await answer.fill('まだ保存できていない本文');
  await page.getByText('保存できませんでした',{exact:true}).waitFor();
  await page.getByLabel('データとアカウントのメニュー').click();
  await page.getByRole('button',{name:'ログアウト',exact:true}).click();
  await page.getByText('未保存のES回答があります。保存を再試行してからログアウトしてください。',{exact:true}).waitFor();
  assert.equal(logoutCount,0);
  assert.equal(await answer.inputValue(),'まだ保存できていない本文');
  failAnswer=false;
  await page.getByRole('button',{name:'再試行',exact:true}).click();
  await page.getByText('保存済み',{exact:true}).waitFor();
  console.log('PASS failed autosave blocks logout and retains recoverable text');
  await page.getByRole('button',{name:'設問を編集',exact:true}).click();
  const question=page.getByRole('dialog',{name:'設問を編集',exact:true});
  await question.getByLabel('設問 *',{exact:true}).fill('一括更新した設問');
  await question.getByRole('button',{name:'保存',exact:true}).click();
  await question.waitFor({state:'hidden'});
  assert.equal(await page.locator('.es-memo-view .split-detail-title').textContent(),'一括更新した設問');
  assert.equal(entries[0].answer,'まだ保存できていない本文');
  console.log('PASS question editing uses atomic endpoint while preserving the answer');
  await tab('カレンダー').click();
  await page.getByRole('button',{name:'イベントを追加',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'イベントを追加',exact:true});
  await dialog.getByLabel('タイトル *',{exact:true}).fill('時刻付きの面接');
  await dialog.getByLabel('開始・締切時刻（任意）',{exact:true}).fill('13:30');
  await dialog.getByLabel('終了時刻（任意）',{exact:true}).fill('14:00');
  eventGate=new Promise(resolve=>{releaseEvent=resolve;});
  await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByRole('button',{name:'保存中...',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'キャンセル',exact:true}).isDisabled(),true);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.count(),1);
  assert.equal(await dialog.getByLabel('タイトル *',{exact:true}).isDisabled(),true);
  releaseEvent();
  await dialog.waitFor({state:'hidden'});
  assert.equal(savedEvent.start_time,'13:30');assert.equal(savedEvent.end_time,'14:00');
  console.log('PASS saving event cannot be discarded and time fields persist');
  await tab('企業一覧').click();
  await page.getByRole('button',{name:'AIリサーチ',exact:true}).click();
  await page.getByLabel('リサーチする企業名').fill('調査会社');
  await page.getByRole('button',{name:'リサーチ',exact:true}).click();
  const research=page.getByRole('dialog',{name:'リサーチ結果を確認・編集'});
  await research.waitFor();
  await research.getByRole('button',{name:'保存',exact:true}).click();
  await research.getByText('企業名と業界は必須です').waitFor();
  await research.getByLabel('業界 *',{exact:true}).fill('IT');
  await research.getByRole('button',{name:'保存',exact:true}).click();
  await research.waitFor({state:'hidden'});
  assert.equal(addedCompany.industry,'IT');assert.equal(addedCompany.research_sources[0].year,'2025');
  console.log('PASS incomplete AI result can be edited and saved with source metadata');
  await page.getByRole('button',{name:'対象企業の詳細を開く',exact:true}).click();
  await page.getByRole('button',{name:'関連ESを見る',exact:true}).click();
  await page.locator('.es-memo-view:visible').waitFor();
  assert.equal(await page.locator('.es-memo-view .split-list-items li').count(),1);
  assert.equal(await page.locator('.es-memo-view .split-detail-title').textContent(),'一括更新した設問');
  console.log('PASS related ES navigation filters to the selected company');
  assert.deepEqual(errors,[]);
  await context.close();

  const clockContext=await browser.newContext({timezoneId:'Asia/Tokyo'});
  const clockPage=await clockContext.newPage();
  await clockPage.clock.install({time:new Date('2026-11-12T14:59:00Z')});
  await clockContext.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const body=path==='/api/auth/check'?{authenticated:true}:path==='/api/events'?[{id:uuid(80),title:'日付更新',event_type:'deadline',start_date:'2026-11-13'}]:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await clockPage.goto(baseURL);
  await clockPage.locator('.attention-strip').getByText('あと1日',{exact:true}).waitFor();
  await clockPage.clock.fastForward(120000);
  await clockPage.locator('.attention-strip').getByText('今日',{exact:true}).waitFor();
  console.log('PASS deadline changes to today across Japanese midnight without reload');
  await clockContext.close();
} finally { await browser.close(); }
