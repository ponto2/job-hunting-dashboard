-- 就活ダッシュボード: データベース定義（新規セットアップ用）
--
-- 空のSupabaseプロジェクトのSQL Editorに、このファイルの全文を貼り付けて
-- 1回実行すると、アプリが必要とするテーブル・制約・関数がすべて作られます。
-- 途中で失敗した場合は何も作られません（全体が1つのトランザクションです）。
--
-- すでに使っている環境には実行しないでください。その場合は
-- supabase/migrations/ にある、まだ実行していないファイルだけを実行します。
--
-- 開発者向け: このファイルは常に「全マイグレーション適用後」の状態を表します。
-- スキーマを変えるときは supabase/migrations/ に差分を追加し、同じ変更を
-- このファイルにも反映します（tests/db/run.sh が両者の一致を検証します）。

begin;

do $$
begin
  if to_regclass('public.companies') is not null then
    raise exception 'すでにテーブルがあります。このファイルは新規セットアップ専用です。既存環境は supabase/migrations/ の未実行ファイルを実行してください。';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

-- 企業
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text not null,
  headquarters text,
  employees text,
  founded text,
  revenue text,
  business text,
  products text,
  salary_master_start text,
  salary_average text,
  overtime_hours text,
  paid_leave_rate text,
  turnover_rate text,
  benefits text,
  intern_period text,
  intern_duration text,
  intern_content text,
  intern_selection text,
  intern_url text,
  interest integer default 3,
  notes text,
  memo text,
  research_date date default current_date,
  -- AIリサーチの出典。この列ができる前のバックアップも復元できるようnull可。
  research_sources jsonb default '[]'::jsonb,
  official_url text,
  recruit_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint companies_interest_range check (interest is null or interest between 1 and 5),
  constraint companies_research_sources_array check (
    research_sources is null
    or (jsonb_typeof(research_sources) = 'array' and jsonb_array_length(research_sources) <= 20)
  )
);

-- 選考（1社に夏インターン・本選考などを複数登録できる）
create table public.selections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('internship', 'fulltime', 'unclassified')),
  title text not null default '' check (char_length(title) <= 120),
  status text not null default '未応募' check (
    status in ('未応募', '興味あり', 'ES準備中', 'ES提出済', '面接中', '合格', '辞退', '不合格')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index selections_company_id_idx on public.selections (company_id);
create index selections_kind_idx on public.selections (kind);
-- events の複合外部キー（選考と企業の組み合わせの保証）が参照する。
create unique index selections_id_company on public.selections (id, company_id);

-- 予定（締切・面接・インターンなど）
create table public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  selection_id uuid references public.selections(id) on delete set null,
  title text not null,
  event_type text not null default 'other',
  start_date date not null,
  end_date date,
  -- 日本時間の時刻。空なら日付だけの予定。
  start_time time(0),
  end_time time(0),
  done boolean not null default false,
  memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint events_valid_schedule check (
    event_type in ('deadline', 'interview', 'internship', 'other')
    and (end_date is null or end_date >= start_date)
    and (end_time is null or start_time is not null)
    and (end_time is null or coalesce(end_date, start_date) > start_date or end_time >= start_time)
  ),
  -- 予定の選考は、予定と同じ企業のものに限る。選考を消すと紐づけだけ外れる。
  constraint events_selection_company foreign key (selection_id, company_id)
    references public.selections (id, company_id) on delete set null (selection_id)
);
create index events_selection_id_idx on public.events (selection_id);
-- interview_memos の複合外部キーが参照する。
create unique index events_id_company on public.events (id, company_id);

-- ES設問（同じ設問への回答を企業をまたいでまとめる）
create table public.es_question_threads (
  id uuid primary key default gen_random_uuid(),
  question_key text not null unique,
  question_text text not null,
  category text default 'その他',
  char_limit integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ES回答
create table public.es_entries (
  id uuid primary key default gen_random_uuid(),
  -- 配列なので外部キーは張れない。企業の削除時はトリガーで取り除く。
  company_ids uuid[] not null default '{}',
  thread_id uuid references public.es_question_threads(id) on delete set null,
  question text not null,
  answer text,
  category text default 'その他',
  is_template boolean default false,
  char_limit integer,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint es_entries_valid_limit check (char_limit is null or char_limit between 0 and 100000)
);

-- 面接メモ
create table public.interview_memos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  memo_type text not null default 'prep' check (
    memo_type in ('prep', 'asked', 'answer', 'reverse_question', 'reflection', 'follow_up', 'other')
  ),
  topic text,
  content text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- メモの企業は、紐づく面接予定の企業と一致させる。
  constraint memos_event_company foreign key (event_id, company_id)
    references public.events (id, company_id) on update cascade on delete set null (event_id)
);
create index interview_memos_event_id_idx on public.interview_memos (event_id);
create index interview_memos_company_id_idx on public.interview_memos (company_id);
create index interview_memos_memo_type_idx on public.interview_memos (memo_type);
create index interview_memos_created_at_idx on public.interview_memos (created_at);

-- ログイン失敗の記録（接続元はハッシュ値で保存する）
create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_client_key_attempted_at_idx
  on public.login_attempts (client_key, attempted_at);

-- 適用済みのスキーマ変更。`select * from public.schema_migrations;` で確認できる。
create table public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 更新日時
-- ---------------------------------------------------------------------------

create function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_updated_at before update on public.companies
  for each row execute function public.update_updated_at();
create trigger selections_updated_at before update on public.selections
  for each row execute function public.update_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function public.update_updated_at();
create trigger es_question_threads_updated_at before update on public.es_question_threads
  for each row execute function public.update_updated_at();
create trigger es_entries_updated_at before update on public.es_entries
  for each row execute function public.update_updated_at();
create trigger interview_memos_updated_at before update on public.interview_memos
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 紐づけの整合性
-- ---------------------------------------------------------------------------

-- 企業を削除したら、ES回答の company_ids からも取り除く。
create function public.remove_deleted_company_from_es_entries()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.es_entries
  set company_ids = array_remove(company_ids, old.id)
  where old.id = any(company_ids);
  return old;
end;
$$;

create trigger companies_remove_from_es_entries before delete on public.companies
  for each row execute function public.remove_deleted_company_from_es_entries();

-- 予定に選考を紐づけるとき、企業が未指定なら選考の企業を入れ、違えば拒否する。
create function public.check_event_selection_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare linked_company uuid;
begin
  if new.selection_id is not null then
    select company_id into linked_company from public.selections where id=new.selection_id for key share;
    if not found then raise exception '選考が見つかりません' using errcode='23503'; end if;
    if new.company_id is null then new.company_id=linked_company;
    elsif new.company_id<>linked_company then raise exception '選考と企業が一致しません' using errcode='23514'; end if;
  end if;
  return new;
end $$;

create trigger events_check_selection before insert or update on public.events
  for each row execute function public.check_event_selection_company();

-- 面接メモを予定に紐づけるとき、企業が未指定なら予定の企業を入れ、違えば拒否する。
create function public.check_memo_event_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare linked_company uuid;
begin
  if new.event_id is not null then
    select company_id into linked_company from public.events where id=new.event_id for key share;
    if not found then
      -- Company deletion can clear this FK before the event's SET NULL action.
      if tg_op='UPDATE' and pg_trigger_depth()>1 and new.company_id is null and new.event_id=old.event_id then
        new.event_id=null;
        return new;
      end if;
      raise exception '面接予定が見つかりません' using errcode='23503';
    end if;
    if new.company_id is null then new.company_id=linked_company;
    elsif new.company_id is distinct from linked_company then raise exception '面接予定と企業が一致しません' using errcode='23514'; end if;
  end if;
  return new;
end $$;

create trigger memos_check_event before insert or update on public.interview_memos
  for each row execute function public.check_memo_event_company();

-- 予定の企業を付け外ししたら、その予定の面接メモの企業も合わせる。
-- （複合外部キーのカスケードはNULLを含むキーに働かないため）
create function public.sync_event_memo_company()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.interview_memos set company_id=new.company_id
    where event_id=new.id and company_id is distinct from new.company_id;
  return new;
end $$;

create trigger events_sync_memo_company after update of company_id on public.events
  for each row execute function public.sync_event_memo_company();

-- ---------------------------------------------------------------------------
-- アプリのAPIから呼ぶ関数
-- ---------------------------------------------------------------------------

-- バックアップの復元。1つのトランザクションで実行され、エラーなら何も追加
-- されない。IDを保つので紐づけは残り、同じIDの行は上書きしない（同じ
-- ファイルを2回復元しても増えない）。
create function public.restore_backup(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  summary jsonb := '{}'::jsonb;
  inserted integer;
  input jsonb;
begin
  input := coalesce(payload->'companies', '[]'::jsonb);
  insert into public.companies
    select * from jsonb_populate_recordset(null::public.companies, input)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('companies', jsonb_build_object('total', jsonb_array_length(input), 'inserted', inserted));

  input := coalesce(payload->'selections', '[]'::jsonb);
  insert into public.selections
    select * from jsonb_populate_recordset(null::public.selections, input)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('selections', jsonb_build_object('total', jsonb_array_length(input), 'inserted', inserted));

  input := coalesce(payload->'events', '[]'::jsonb);
  insert into public.events
    select * from jsonb_populate_recordset(null::public.events, input)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('events', jsonb_build_object('total', jsonb_array_length(input), 'inserted', inserted));

  input := coalesce(payload->'es_question_threads', '[]'::jsonb);
  insert into public.es_question_threads
    select * from jsonb_populate_recordset(null::public.es_question_threads, input)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('es_question_threads', jsonb_build_object('total', jsonb_array_length(input), 'inserted', inserted));

  input := coalesce(payload->'es_entries', '[]'::jsonb);
  insert into public.es_entries
    select r.*
    from jsonb_array_elements(input) as e
    cross join lateral jsonb_populate_record(
      null::public.es_entries,
      e || jsonb_build_object(
        'thread_id', (
          select t.id
          from public.es_question_threads t
          where t.id = (e->>'thread_id')::uuid
             or t.question_key = (
               select pt->>'question_key'
               from jsonb_array_elements(coalesce(payload->'es_question_threads', '[]'::jsonb)) as pt
               where pt->>'id' = e->>'thread_id'
               limit 1
             )
          order by t.id = (e->>'thread_id')::uuid desc
          limit 1
        ),
        'company_ids', case
          when jsonb_typeof(e->'company_ids') = 'array' and jsonb_array_length(e->'company_ids') > 0 then e->'company_ids'
          when jsonb_typeof(e->'company_id') = 'string' then jsonb_build_array(e->'company_id')
          else '[]'::jsonb
        end
      )
    ) as r
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('es_entries', jsonb_build_object('total', jsonb_array_length(input), 'inserted', inserted));

  input := coalesce(payload->'interview_memos', '[]'::jsonb);
  insert into public.interview_memos
    select * from jsonb_populate_recordset(null::public.interview_memos, input)
  on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('interview_memos', jsonb_build_object('total', jsonb_array_length(input), 'inserted', inserted));

  return summary;
end;
$$;

-- 同じ設問を持つ回答の、設問文・分類・文字数制限をまとめて書き換える。
create function public.update_es_question(entry_ids uuid[], question text, category text, char_limit integer)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  q text := btrim(question);
  cat text := coalesce(category,'その他');
  lim integer := char_limit;
  ids uuid[] := entry_ids;
  target_id uuid;
  row_count integer;
  result jsonb;
begin
  if coalesce(cardinality(ids),0)=0 or cardinality(ids)>20000 or q is null or length(q)=0 or length(q)>2000
    or length(cat)>50 or (lim is not null and (lim<0 or lim>100000)) then
    raise exception '設問の入力形式が正しくありません' using errcode='22023';
  end if;
  perform id from public.es_entries where id=any(ids) order by id for update;
  get diagnostics row_count=row_count;
  if row_count <> (select count(distinct x) from unnest(ids) x) then
    raise exception '回答が削除されています。再読み込みしてください' using errcode='P0002';
  end if;
  insert into public.es_question_threads(question_key,question_text,category,char_limit)
    values(lower(regexp_replace(q,'\s+',' ','g')),q,cat,lim)
    on conflict(question_key) do update set question_text=excluded.question_text
    returning id into target_id;
  update public.es_entries e set question=q,category=cat,char_limit=lim,thread_id=target_id where e.id=any(ids);
  select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('company_names',(
    select string_agg(c.name,' / ' order by links.ord)
    from unnest(e.company_ids) with ordinality links(id,ord) join public.companies c on c.id=links.id
  )) order by e.created_at,e.id),'[]'::jsonb) into result from public.es_entries e where e.id=any(ids);
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- アクセス権
-- ---------------------------------------------------------------------------
-- データベースに接続するのはアプリのAPI（サーバー側、service_role）だけ。
-- RLSを有効にしてポリシーを置かず、権限も外すことで、公開用のanonキーからの
-- 読み書きと関数の実行をすべて拒否する。

do $$
declare
  t text;
  f regprocedure;
begin
  foreach t in array array[
    'companies', 'selections', 'events', 'es_question_threads', 'es_entries',
    'interview_memos', 'login_attempts', 'schema_migrations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;

  foreach f in array array[
    'public.update_updated_at()',
    'public.remove_deleted_company_from_es_entries()',
    'public.check_event_selection_company()',
    'public.check_memo_event_company()',
    'public.sync_event_memo_company()',
    'public.restore_backup(jsonb)',
    'public.update_es_question(uuid[],text,text,integer)'
  ]::regprocedure[] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

grant execute on function public.restore_backup(jsonb) to service_role;
grant execute on function public.update_es_question(uuid[],text,text,integer) to service_role;

-- ---------------------------------------------------------------------------
-- このファイルに含まれているスキーマ変更
-- ---------------------------------------------------------------------------
insert into public.schema_migrations (version) values
  ('20261113000000_baseline');

notify pgrst, 'reload schema';
commit;
