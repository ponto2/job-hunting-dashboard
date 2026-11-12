-- スキーマの指紋: 列・制約・索引・トリガー・関数・権限・適用済みバージョンを
-- 1行ずつ並べます。2つのデータベースの出力が一致すれば、定義は同じです。
select line from (
select 'col '||c.table_name||'.'||c.column_name||' '||c.data_type||coalesce('('||c.datetime_precision||')','')||' null='||c.is_nullable||' def='||coalesce(c.column_default,'-') as line
 from information_schema.columns c join information_schema.tables t using(table_schema,table_name) where c.table_schema='public' and t.table_type='BASE TABLE'
union all
select 'con '||conrelid::regclass||' '||conname||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace and contype<>'n'
union all
select 'idx '||indexdef from pg_indexes where schemaname='public'
union all
select 'trg '||tgrelid::regclass||' '||pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
union all
select 'fn '||p.oid::regprocedure||' cfg='||coalesce(array_to_string(proconfig,','),'-')||' secdef='||prosecdef||' src='||md5(regexp_replace(prosrc,'\s+','','g')) from pg_proc p left join pg_depend d on d.objid=p.oid and d.deptype='e' where pronamespace='public'::regnamespace and d.objid is null
union all
select 'rls '||relname||' '||relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'
union all
select 'pol '||tablename||' '||policyname from pg_policies where schemaname='public'
union all
select 'tpriv '||table_name||' '||grantee||' '||string_agg(privilege_type,',' order by privilege_type) from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated','service_role','PUBLIC') group by table_name,grantee
union all
select 'fpriv '||p.oid::regprocedure||' '||r.rolname||' '||has_function_privilege(r.rolname,p.oid,'execute') from pg_proc p cross join (select rolname from pg_roles where rolname in ('anon','authenticated','service_role')) r left join pg_depend d on d.objid=p.oid and d.deptype='e' where pronamespace='public'::regnamespace and d.objid is null
union all
select 'ver '||version from public.schema_migrations
) x order by 1;
