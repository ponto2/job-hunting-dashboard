-- Entire script runs against the disposable database created by run.sh.
DO $$
DECLARE c uuid:='00000000-0000-4000-8000-000000000001';
 s uuid:='00000000-0000-4000-8000-000000000002';
 e uuid:='00000000-0000-4000-8000-000000000003';
 a uuid:='00000000-0000-4000-8000-000000000004';
 b uuid:='00000000-0000-4000-8000-000000000005';
 other_c uuid:='00000000-0000-4000-8000-000000000006';
 payload jsonb; result jsonb;
BEGIN
  payload=jsonb_build_object('companies',jsonb_build_array(jsonb_build_object('id',c,'name','A社','industry','IT','interest',3)));
  result=public.restore_backup(payload);
  IF (result->'companies'->>'inserted')::int<>1 THEN RAISE EXCEPTION 'first restore'; END IF;
  result=public.restore_backup(payload);
  IF (result->'companies'->>'inserted')::int<>0 THEN RAISE EXCEPTION 'duplicate restore'; END IF;
  BEGIN
    PERFORM public.restore_backup(jsonb_build_object('companies',jsonb_build_array(jsonb_build_object('id',other_c,'name','B社','industry','IT')), 'events',jsonb_build_array(jsonb_build_object('id',e,'title','bad','start_date','2026-11-12','event_type','invalid','done',false))));
    RAISE EXCEPTION 'invalid restore unexpectedly passed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS(SELECT FROM public.companies WHERE id=other_c) THEN RAISE EXCEPTION 'restore was not rolled back'; END IF;
  INSERT INTO public.companies(id,name,industry) VALUES(other_c,'B社','IT');
  INSERT INTO public.selections(id,company_id,kind,title,status) VALUES(s,c,'fulltime','本選考','未応募');
  INSERT INTO public.events(id,company_id,selection_id,title,event_type,start_date,start_time,end_time) VALUES(e,c,s,'面接','interview','2026-11-12','13:00','14:00');
  BEGIN
    UPDATE public.events SET company_id=other_c WHERE id=e;
    RAISE EXCEPTION 'mismatched selection accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.interview_memos(event_id,company_id,content) VALUES(e,other_c,'bad');
    RAISE EXCEPTION 'mismatched memo accepted';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL;
  END;
  INSERT INTO public.interview_memos(event_id,company_id,content) VALUES(e,c,'keep memo after event deletion');
  INSERT INTO public.es_entries(id,question,answer,company_ids) VALUES(a,'旧設問','回答A',ARRAY[c]),(b,'旧設問','回答B',ARRAY[c]);
  result=public.update_es_question(ARRAY[a,b],'新設問','その他',400);
  IF jsonb_array_length(result)<>2 OR (SELECT count(*) FROM public.es_entries WHERE question='新設問')<>2 THEN RAISE EXCEPTION 'atomic update failed'; END IF;
  IF result->0->>'company_names'<>'A社' THEN RAISE EXCEPTION 'missing company names'; END IF;
  BEGIN
    PERFORM public.update_es_question(ARRAY[a,gen_random_uuid()],'失敗','その他',400);
    RAISE EXCEPTION 'missing entry accepted';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  IF (SELECT question FROM public.es_entries WHERE id=a)<>'新設問' THEN RAISE EXCEPTION 'partial question update'; END IF;
  DELETE FROM public.companies WHERE id=c;
  IF EXISTS(SELECT FROM public.events WHERE id=e) OR EXISTS(SELECT FROM public.selections WHERE id=s) THEN RAISE EXCEPTION 'cascade failed'; END IF;
  IF EXISTS(SELECT FROM public.interview_memos WHERE event_id=e OR company_id=c) THEN RAISE EXCEPTION 'memo links not cleared'; END IF;
  IF (SELECT cardinality(company_ids) FROM public.es_entries WHERE id=a)<>0 THEN RAISE EXCEPTION 'ES link cleanup failed'; END IF;
END $$;
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.companies;
    RAISE EXCEPTION 'anon can read private data';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.restore_backup('{}');
    RAISE EXCEPTION 'anon can restore';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
-- The app's API connects as service_role. It must work with only the grants
-- in schema.sql, without relying on Supabase's default privileges.
SET ROLE service_role;
DO $$
DECLARE c uuid; s uuid; e uuid; a uuid;
BEGIN
  INSERT INTO public.companies(name,industry) VALUES('C社','IT') RETURNING id INTO c;
  INSERT INTO public.selections(company_id,kind) VALUES(c,'internship') RETURNING id INTO s;
  INSERT INTO public.events(selection_id,title,start_date) VALUES(s,'締切','2026-11-12') RETURNING id INTO e;
  IF (SELECT company_id FROM public.events WHERE id=e) IS DISTINCT FROM c THEN RAISE EXCEPTION 'event company not filled from selection'; END IF;
  INSERT INTO public.interview_memos(event_id,content) VALUES(e,'memo');
  INSERT INTO public.es_entries(question,company_ids) VALUES('設問',ARRAY[c]) RETURNING id INTO a;
  PERFORM public.update_es_question(ARRAY[a],'設問2','その他',NULL);
  PERFORM public.restore_backup('{}');
  -- Fires the updated_at trigger, whose function service_role cannot call directly.
  UPDATE public.companies SET memo='x' WHERE id=c;
  INSERT INTO public.login_attempts(client_key) VALUES('k');
  DELETE FROM public.login_attempts WHERE client_key='k';
  IF NOT EXISTS(SELECT FROM public.schema_migrations) THEN RAISE EXCEPTION 'no schema version recorded'; END IF;
  DELETE FROM public.companies WHERE id=c;
  DELETE FROM public.es_entries WHERE id=a;
END $$;
RESET ROLE;
SELECT 'PASS schema, service_role access, restore idempotency/rollback, links, atomic questions, cascade, anon denial' AS result;
