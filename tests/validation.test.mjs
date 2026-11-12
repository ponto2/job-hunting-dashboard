import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDateString, isHttpUrl, validateCompanyInput, validateEsEntryInput, validateEventInput,
  validateEventRange, validateInterviewMemoInput,
} from '../lib/validation.js';

const uuid = '48229372-685c-4e1c-8cce-03478666cabd';

test('dates must be real calendar days in YYYY-MM-DD form', () => {
  assert.equal(isDateString('2026-02-28'), true);
  assert.equal(isDateString('2028-02-29'), true);
  for (const value of ['2026-02-29', '2026-13-01', '2026-1-01', '2026-01-01T00:00', '', null, 20260101]) {
    assert.equal(isDateString(value), false, String(value));
  }
});

test('only http and https URLs are accepted', () => {
  assert.equal(isHttpUrl('https://example.com/recruit'), true);
  assert.equal(isHttpUrl('http://example.com'), true);
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'example.com', 'ftp://example.com', '', null]) {
    assert.equal(isHttpUrl(value), false, String(value));
  }
});

test('new companies need a name and industry; updates may be partial', () => {
  assert.match(validateCompanyInput({ name: 'A社' }).error, /必須/);
  assert.match(validateCompanyInput({ name: '  ', industry: 'IT' }).error, /企業名/);
  assert.deepEqual(validateCompanyInput({ id: uuid, memo: 'メモ' }, { update: true }), { data: { memo: 'メモ' }, id: uuid });
  assert.match(validateCompanyInput({ id: 'x', memo: 'メモ' }, { update: true }).error, /企業ID/);
  assert.match(validateCompanyInput({ id: uuid, industry: '' }, { update: true }).error, /業界/);
});

test('company fields are type-checked and normalized; progress lives in selections, not a company status', () => {
  const { data } = validateCompanyInput({
    name: 'A社', industry: 'IT', interest: 4, status: '内定', research_date: '', intern_url: ' https://a.example/intern ',
  });
  assert.deepEqual(data, {
    name: 'A社', industry: 'IT', intern_url: 'https://a.example/intern', interest: 4, research_date: null,
  });
  assert.match(validateCompanyInput({ name: 'A社', industry: 'IT', interest: 6 }).error, /志望度/);
  assert.match(validateCompanyInput({ name: 'A社', industry: 'IT', employees: 100 }).error, /従業員数/);
  assert.match(validateCompanyInput({ name: 'A社', industry: 'IT', research_date: '2026/01/01' }).error, /リサーチ日/);
});

test('events validate type, dates, and company link', () => {
  const base = { title: ' ES締切 ', event_type: 'deadline', start_date: '2026-03-01' };
  assert.deepEqual(validateEventInput(base).data, {
    title: 'ES締切', event_type: 'deadline', start_date: '2026-03-01', end_date: null, company_id: null, memo: null,
  });
  assert.match(validateEventInput({ ...base, event_type: 'party' }).error, /イベントタイプ/);
  assert.match(validateEventInput({ ...base, end_date: '2026-02-28' }).error, /開始日以降/);
  assert.match(validateEventInput({ ...base, company_id: 'abc' }).error, /企業/);
  assert.match(validateEventInput({ ...base }, { update: true }).error, /予定ID/);
  assert.equal(validateEventInput({ ...base, id: uuid, companies: { id: uuid } }, { update: true }).id, uuid);
});

test('event done state and selection link are written only when sent', () => {
  const base = { title: 'ES締切', event_type: 'deadline', start_date: '2026-03-01' };
  const omitted = validateEventInput({ ...base, id: uuid }, { update: true }).data;
  assert.equal(Object.hasOwn(omitted, 'done'), false);
  assert.equal(Object.hasOwn(omitted, 'selection_id'), false);

  assert.equal(validateEventInput({ ...base, done: true }).data.done, true);
  assert.equal(validateEventInput({ ...base, done: false }).data.done, false);
  assert.equal(validateEventInput({ ...base, selection_id: uuid }).data.selection_id, uuid);
  assert.equal(validateEventInput({ ...base, selection_id: '' }).data.selection_id, null);
  assert.equal(validateEventInput({ ...base, selection_id: null }).data.selection_id, null);

  for (const done of ['true', 1, null]) {
    assert.equal(validateEventInput({ ...base, done }).error, '完了状態の形式が正しくありません', String(done));
  }
  for (const selectionId of ['abc', 42]) {
    assert.equal(validateEventInput({ ...base, selection_id: selectionId }).error, '選考が正しくありません', String(selectionId));
  }
});

test('event range filters accept only exact dates or a valid year and month', () => {
  assert.deepEqual(validateEventRange({ startDate: null, endDate: null, year: null, month: null }), {});
  assert.deepEqual(validateEventRange({ startDate: '2026-03-01', endDate: '2026-04-04', year: null, month: null }).range,
    { startDate: '2026-03-01', endDate: '2026-04-04' });
  assert.deepEqual(validateEventRange({ startDate: null, endDate: null, year: '2026', month: '3' }).month, { year: 2026, month: 3 });
  assert.ok(validateEventRange({ startDate: '2026-03-01', endDate: null, year: null, month: null }).error);
  assert.ok(validateEventRange({ startDate: null, endDate: null, year: '26', month: '3' }).error);
});

test('ES entries keep only real columns and validate company links', () => {
  const { data } = validateEsEntryInput({
    question: ' 志望動機 ', answer: '', company_ids: [uuid, uuid], company_id: uuid,
    company_names: 'A社', companies: { id: uuid }, char_limit: null, is_template: false,
  });
  assert.deepEqual(data, {
    question: '志望動機', answer: '', is_template: false, char_limit: null, company_ids: [uuid],
  });
  assert.match(validateEsEntryInput({ question: '' }).error, /質問文/);
  assert.match(validateEsEntryInput({ question: 'Q', company_ids: ['bad'] }).error, /企業/);
  assert.match(validateEsEntryInput({ question: 'Q', char_limit: '400' }).error, /文字数/);
  assert.deepEqual(validateEsEntryInput({ id: uuid, answer: '回答' }, { update: true }), { data: { answer: '回答' }, id: uuid });
});

test('interview memos require content and valid links', () => {
  assert.deepEqual(validateInterviewMemoInput({ content: ' 準備 ', topic: '', event_id: '' }).data, {
    event_id: null, company_id: null, memo_type: 'prep', topic: null, content: '準備', sort_order: 0,
  });
  assert.match(validateInterviewMemoInput({ content: '' }).error, /メモ本文/);
  assert.match(validateInterviewMemoInput({ content: 'x', memo_type: 'gossip' }).error, /種類/);
  assert.match(validateInterviewMemoInput({ content: 'x', event_id: 'nope' }).error, /面接予定/);
});


test('event times are optional, bounded and ordered on the same day', () => {
  const base={title:'面接',event_type:'interview',start_date:'2026-11-12'};
  assert.equal(validateEventInput({...base,start_time:'13:30',end_time:'14:00'}).data.start_time,'13:30');
  assert.ok(validateEventInput({...base,start_time:'24:00'}).error);
  assert.ok(validateEventInput({...base,end_time:'14:00'}).error);
  assert.ok(validateEventInput({...base,start_time:'14:00',end_time:'13:00'}).error);
  assert.equal(validateEventInput({...base,start_time:'23:00',end_time:'01:00',end_date:'2026-11-13'}).error,undefined);
});
