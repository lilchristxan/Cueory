-- Anatomy lab study tools (Task 178): the review queue and saved views. Only a confirmed, signed-in student can use the
-- six functions, every input is checked before anything is written, each student reads only their own rows and writes
-- none directly, a miss recorded again counts up, the hourly limit and the 50-view cap hold, and deleting an account
-- deletes both tables' rows. Run by `supabase test db` on a throwaway local database; the students and rows below exist
-- only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(143);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  -- One and two: confirmed students.
  ('00000000-0000-4000-8000-000000000001', 'one@example.com', now(), false),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com', now(), false),
  -- Three: signed up but has not confirmed the email yet.
  ('00000000-0000-4000-8000-000000000003', 'three@example.com', null, false),
  -- Four: marked anonymous in auth.users.
  ('00000000-0000-4000-8000-000000000004', 'four@example.com', now(), true),
  -- Five: confirmed, with a verified second factor (Task 301).
  ('00000000-0000-4000-8000-000000000005', 'five@example.com', now(), false);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-000000000005', 'fake verified', 'totp', 'verified',
   now(), now());
-- Student five already has one miss, so the restrictive MFA policy has a row to hide.
insert into public.anatomy_review_queue (user_id, system_key, structure_id)
  values ('00000000-0000-4000-8000-000000000005', 'heart', 'FMA500');

-- A camera as the lab saves it. The setting lasts only until the transaction ends.
do $$
begin
  perform set_config('t.camera', '{"position": [0, 0, 3], "target": [0, 0, 0], "up": [0, 1, 0]}', true);
end
$$;

-- ---- Who may do what.
select table_privs_are('public', 'anatomy_review_queue', 'anon', array[]::text[], 'visitors have no access to the review queue');
select table_privs_are('public', 'anatomy_review_queue', 'authenticated', array['SELECT'], 'students can only read the review queue');
select table_privs_are('public', 'anatomy_saved_views', 'anon', array[]::text[], 'visitors have no access to saved views');
select table_privs_are('public', 'anatomy_saved_views', 'authenticated', array['SELECT'], 'students can only read saved views');
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.anatomy_review_queue'::regclass, 'public.anatomy_saved_views'::regclass)),
  'both tables have row-level security'
);
select ok(
  (select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
   from unnest(array['public.record_anatomy_misses(text, text[], uuid)', 'public.clear_anatomy_miss(text, text, uuid)',
                     'public.my_anatomy_review_queue(uuid)', 'public.save_anatomy_view(text, text, jsonb, text[], text[], text, uuid)',
                     'public.delete_anatomy_view(uuid, uuid)', 'public.my_anatomy_views(text, uuid)']) f),
  'signed-in students can run all six functions and signed-out visitors cannot'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in ('public.record_anatomy_misses(text, text[], uuid)'::regprocedure, 'public.clear_anatomy_miss(text, text, uuid)'::regprocedure,
                   'public.my_anatomy_review_queue(uuid)'::regprocedure,
                   'public.save_anatomy_view(text, text, jsonb, text[], text[], text, uuid)'::regprocedure,
                   'public.delete_anatomy_view(uuid, uuid)'::regprocedure, 'public.my_anatomy_views(text, uuid)'::regprocedure)),
  'all six are security definer with an empty search_path'
);
select results_eq(
  $$ select count(*)::int from pg_policies
     where schemaname = 'public' and tablename in ('anatomy_review_queue', 'anatomy_saved_views')
       and permissive = 'RESTRICTIVE' and policyname like 'opt-in MFA required%' $$,
  $$ values (2) $$, 'both tables have the restrictive opt-in MFA policy'
);

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.record_anatomy_misses('heart', array['FMA1'], (select auth.uid())) $$, '42501', null,
  'a signed-out visitor cannot record a miss'
);
select throws_ok($$ select id from public.anatomy_review_queue $$, '42501', null, 'a signed-out visitor cannot read the review queue');
select throws_ok($$ select id from public.anatomy_saved_views $$, '42501', null, 'a signed-out visitor cannot read saved views');
select throws_ok($$ select * from public.my_anatomy_review_queue((select auth.uid())) $$, '42501', null, 'a signed-out visitor cannot list a review queue');

-- ---- The authenticated role with no student in the request (no sub).
set local role authenticated;
set local "request.jwt.claims" to '{"role": "authenticated"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.record_anatomy_misses('heart', array['FMA1'], (select auth.uid())) $$, '28000', 'sign in to record what you missed',
  'with no one signed in, recording a miss asks to sign in'
);
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '28000', 'sign in to save a view', 'with no one signed in, saving a view asks to sign in'
);

-- ---- Student three: email not confirmed. Every function refuses before checking its input.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';
select throws_ok($$ select public.record_anatomy_misses(null, null, (select auth.uid())) $$, '28000', 'confirm your email to use this',
  'an unconfirmed student cannot record a miss');
select throws_ok($$ select public.clear_anatomy_miss(null, null, (select auth.uid())) $$, '28000', 'confirm your email to use this',
  'an unconfirmed student cannot clear a miss');
select throws_ok($$ select * from public.my_anatomy_review_queue((select auth.uid())) $$, '28000', 'confirm your email to use this',
  'an unconfirmed student cannot list their review queue');
select throws_ok($$ select public.save_anatomy_view(null, null, null, null, null, null, (select auth.uid())) $$, '28000', 'confirm your email to use this',
  'an unconfirmed student cannot save a view');
select throws_ok($$ select public.delete_anatomy_view(null, (select auth.uid())) $$, '28000', 'confirm your email to use this',
  'an unconfirmed student cannot delete a view');
select throws_ok($$ select * from public.my_anatomy_views(null, (select auth.uid())) $$, '28000', 'confirm your email to use this',
  'an unconfirmed student cannot list their views');

-- ---- Student four: marked anonymous in auth.users.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000004", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000004';
select throws_ok($$ select public.record_anatomy_misses('heart', array['FMA1'], (select auth.uid())) $$, '28000', 'confirm your email to use this',
  'an account marked anonymous in auth.users cannot record a miss');
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '28000', 'confirm your email to use this', 'an account marked anonymous in auth.users cannot save a view'
);

-- ---- Student one with a JWT that says anonymous.
set local "request.jwt.claims" to
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated", "is_anonymous": true}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select throws_ok($$ select public.record_anatomy_misses('heart', array['FMA1'], (select auth.uid())) $$, '28000', 'confirm your email to use this',
  'a JWT with is_anonymous cannot record a miss');

-- ---- Student five: a verified second factor needs an aal2 token (Task 301).
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal1"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000005';
select throws_ok($$ select public.record_anatomy_misses('heart', array['FMA1'], (select auth.uid())) $$, '28000', 'complete two-factor sign-in to continue',
  'a verified-factor student at aal1 cannot record a miss');
select results_eq($$ select count(*)::int from public.anatomy_review_queue $$, $$ values (0) $$,
  'a verified-factor student at aal1 sees none of their own rows');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000005", "role": "authenticated", "aal": "aal2"}';
select results_eq($$ select public.record_anatomy_misses('heart', array['FMA500'], (select auth.uid())) $$, $$ values (1) $$,
  'the same student at aal2 can record a miss');
select results_eq($$ select missed_count from public.anatomy_review_queue $$, $$ values (2) $$,
  'and reads their own row, counted up');

-- ---- Student one: the review queue.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
-- A tab may switch to another confirmed account after the client preflight. Every mutating
-- SECURITY DEFINER function compares the action-bound id to auth.uid() before writing.
select throws_ok(
  $$ select public.record_anatomy_misses('heart', array['FMA701'], '00000000-0000-4000-8000-000000000002'::uuid) $$,
  '28000', 'study account changed; reload before continuing', 'recording misses refuses a different action-bound account'
);
select throws_ok(
  $$ select public.clear_anatomy_miss('heart', 'FMA1', '00000000-0000-4000-8000-000000000002'::uuid) $$,
  '28000', 'study account changed; reload before continuing', 'clearing a miss refuses a different action-bound account'
);
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'wrong account', current_setting('t.camera')::jsonb, '{}', '{}', null,
       '00000000-0000-4000-8000-000000000002'::uuid) $$,
  '28000', 'study account changed; reload before continuing', 'saving a view refuses a different action-bound account'
);
select throws_ok(
  $$ select public.delete_anatomy_view('00000000-0000-4000-8000-000000000001'::uuid,
       '00000000-0000-4000-8000-000000000002'::uuid) $$,
  '28000', 'study account changed; reload before continuing', 'deleting a view refuses a different action-bound account'
);

select results_eq(
  $$ select public.record_anatomy_misses('heart', array['FMA1', 'FMA2', 'FMA1'], (select auth.uid())) $$, $$ values (2) $$,
  'a student records two misses; the same id twice in one call counts once'
);
select results_eq(
  $$ select public.record_anatomy_misses('heart', array['FMA1'], (select auth.uid())) $$, $$ values (1) $$,
  'missing a structure again is recorded'
);
select results_eq(
  $$ select structure_id, missed_count, cleared_at is null from public.my_anatomy_review_queue((select auth.uid())) order by structure_id $$,
  $$ values ('FMA1', 2, true), ('FMA2', 1, true) $$,
  'the queue lists both, with FMA1 missed twice'
);
select results_eq(
  $$ select bool_and(first_missed_at <= last_missed_at and system_key = 'heart') from public.my_anatomy_review_queue((select auth.uid())) $$,
  $$ values (true) $$, 'each row keeps its system and its first and last miss times'
);
select results_eq($$ select public.clear_anatomy_miss('heart', 'FMA2', (select auth.uid())) $$, $$ values (true) $$, 'a student clears a miss');
select results_eq($$ select public.clear_anatomy_miss('heart', 'FMA2', (select auth.uid())) $$, $$ values (false) $$, 'clearing it again changes nothing');
select results_eq($$ select public.clear_anatomy_miss('lungs', 'FMA1', (select auth.uid())) $$, $$ values (false) $$,
  'clearing a structure in another system changes nothing');
select results_eq(
  $$ select structure_id from public.my_anatomy_review_queue((select auth.uid())) $$, $$ values ('FMA1') $$,
  'the cleared structure leaves the list'
);
select results_eq(
  $$ select count(*)::int, count(cleared_at)::int from public.anatomy_review_queue $$, $$ values (2, 1) $$,
  'the student still reads both of their rows from the table, one of them cleared'
);
select results_eq(
  $$ select public.record_anatomy_misses('heart', array['FMA2'], (select auth.uid())) $$, $$ values (1) $$,
  'missing a cleared structure again'
);
select results_eq(
  $$ select structure_id, missed_count from public.my_anatomy_review_queue((select auth.uid())) order by structure_id $$,
  $$ values ('FMA1', 2), ('FMA2', 2) $$,
  'puts it back on the list with its count carried on'
);
-- The table stays read-only for students.
select throws_ok(
  $$ insert into public.anatomy_review_queue (user_id, system_key, structure_id)
     values ('00000000-0000-4000-8000-000000000001', 'heart', 'FMA9') $$,
  '42501', null, 'a student cannot write a review row directly'
);
select throws_ok($$ update public.anatomy_review_queue set missed_count = 99 $$, '42501', null, 'a student cannot change a review row');
select throws_ok($$ delete from public.anatomy_review_queue $$, '42501', null, 'a student cannot delete a review row');

-- A read RPC is bound to the initiating identity just like the four write RPCs.
select throws_ok(
  $$ select * from public.my_anatomy_review_queue(null) $$,
  '28000', 'study account changed; reload before continuing', 'review queue refuses a missing initiating id'
);
select throws_ok(
  $$ select * from public.my_anatomy_views('heart', null) $$,
  '28000', 'study account changed; reload before continuing', 'saved views refuse a missing initiating id'
);
select throws_ok(
  $$ select * from public.my_anatomy_review_queue('00000000-0000-4000-8000-000000000002') $$,
  '28000', 'study account changed; reload before continuing', 'review queue refuses a B identity under A session'
);
select throws_ok(
  $$ select * from public.my_anatomy_views('heart', '00000000-0000-4000-8000-000000000002') $$,
  '28000', 'study account changed; reload before continuing', 'saved views refuse a B identity under A session'
);

-- ---- Student two sees none of it.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select results_eq($$ select count(*)::int from public.anatomy_review_queue $$, $$ values (0) $$,
  'another student reads none of those rows');
select is_empty($$ select * from public.my_anatomy_review_queue((select auth.uid())) $$, 'and their own list is empty');
-- A began this read, but another tab changed the authenticated request to B before execution.
select throws_ok(
  $$ select * from public.my_anatomy_review_queue('00000000-0000-4000-8000-000000000001') $$,
  '28000', 'study account changed; reload before continuing', 'delayed queue read captured under A cannot read under B'
);
select throws_ok(
  $$ select * from public.my_anatomy_views('heart', '00000000-0000-4000-8000-000000000001') $$,
  '28000', 'study account changed; reload before continuing', 'delayed saved-view read captured under A cannot read under B'
);
select results_eq($$ select public.clear_anatomy_miss('heart', 'FMA1', (select auth.uid())) $$, $$ values (false) $$,
  'and cannot clear another student''s miss');

-- ---- Refused before anything is written (student one).
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select throws_ok($$ select public.record_anatomy_misses(null, array['FMA1'], (select auth.uid())) $$, '22023', 'that anatomy system was not found',
  'no system is refused');
select throws_ok($$ select public.record_anatomy_misses('Heart!', array['FMA1'], (select auth.uid())) $$, '22023', 'that anatomy system was not found',
  'a system key that is not lowercase letters, digits and dashes is refused');
select throws_ok($$ select public.record_anatomy_misses(repeat('a', 41), array['FMA1'], (select auth.uid())) $$, '22023', 'that anatomy system was not found',
  'a system key over 40 characters is refused');
select throws_ok($$ select public.record_anatomy_misses('heart', null, (select auth.uid())) $$, '22023', 'send between 1 and 50 structures',
  'no structures is refused');
select throws_ok($$ select public.record_anatomy_misses('heart', '{}', (select auth.uid())) $$, '22023', 'send between 1 and 50 structures',
  'an empty list is refused');
select throws_ok(
  $$ select public.record_anatomy_misses('heart', (select array_agg('FMA' || n) from generate_series(1, 51) n), (select auth.uid())) $$,
  '22023', 'send between 1 and 50 structures', 'more than 50 structures at once is refused'
);
select throws_ok($$ select public.record_anatomy_misses('heart', array['BAD001'], (select auth.uid())) $$, '22023', 'a structure id has the wrong shape',
  'an id that is not an FMA or fixture id is refused');
select throws_ok($$ select public.record_anatomy_misses('heart', array['FMA1', null], (select auth.uid())) $$, '22023', 'a structure id has the wrong shape',
  'a null id refuses the whole call');
select throws_ok($$ select public.record_anatomy_misses('heart', array['FMA' || repeat('1', 58)], (select auth.uid())) $$, '22023', 'a structure id has the wrong shape',
  'an id over 60 characters is refused');
select throws_ok($$ select public.clear_anatomy_miss('heart', 'fma1', (select auth.uid())) $$, '22023', 'a structure id has the wrong shape',
  'clearing with a lowercase id is refused');
select throws_ok($$ select * from public.my_anatomy_views('Heart', (select auth.uid())) $$, '22023', 'that anatomy system was not found',
  'listing views needs a valid system key');
select results_eq($$ select public.record_anatomy_misses('heart', array['fixture-cube-a'], (select auth.uid())) $$, $$ values (1) $$,
  'a labeled test fixture id is accepted');
select results_eq($$ select public.record_anatomy_misses('heart', array['FIX001'], (select auth.uid())) $$, $$ values (1) $$,
  'the browser tests'' fixture id (FIX001) is accepted');
reset role;
select results_eq(
  $$ select count(*)::int from public.anatomy_review_queue where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (4) $$, 'refused calls wrote nothing'
);

-- ---- The hourly limit (600 structures a person), counted by last_missed_at. Student two has 590 from 10 minutes ago.
insert into public.anatomy_review_queue (user_id, system_key, structure_id, first_missed_at, last_missed_at)
  select '00000000-0000-4000-8000-000000000002', 'vessels', 'FMA' || n, now() - interval '10 minutes', now() - interval '10 minutes'
  from generate_series(1, 590) n;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select public.record_anatomy_misses('vessels', (select array_agg('FMA' || n) from generate_series(591, 601) n), (select auth.uid())) $$,
  '54000', 'too many misses recorded recently; try again later', 'a call that would pass 600 in an hour is refused whole'
);
select results_eq(
  $$ select public.record_anatomy_misses('vessels', (select array_agg('FMA' || n) from generate_series(591, 600) n), (select auth.uid())) $$,
  $$ values (10) $$, 'a call that reaches exactly 600 in an hour is allowed'
);
select throws_ok(
  $$ select public.record_anatomy_misses('vessels', array['FMA601'], (select auth.uid())) $$,
  '54000', 'too many misses recorded recently; try again later', 'the 601st structure in an hour is refused'
);
select throws_ok(
  $$ select public.record_anatomy_misses('heart', array['FMA1'], (select auth.uid())) $$,
  '54000', 'too many misses recorded recently; try again later', 'the limit counts every system together'
);
select results_eq(
  $$ select public.record_anatomy_misses('vessels', array['FMA1', 'FMA600'], (select auth.uid())) $$, $$ values (2) $$,
  'at the limit, missing structures already recorded this hour again is allowed: it adds no rows'
);
select results_eq($$ select count(*)::int from public.anatomy_review_queue $$, $$ values (600) $$,
  'student two reads only their own 600 rows, none of student one''s');
-- Another student is not affected.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select results_eq($$ select public.record_anatomy_misses('heart', array['FMA3'], (select auth.uid())) $$, $$ values (1) $$,
  'one student being at the limit does not stop another');
-- Rows last missed more than an hour ago stop counting.
reset role;
update public.anatomy_review_queue set first_missed_at = now() - interval '2 hours', last_missed_at = now() - interval '2 hours'
  where user_id = '00000000-0000-4000-8000-000000000002' and structure_id in ('FMA1', 'FMA2');
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select results_eq($$ select public.record_anatomy_misses('vessels', array['FMA601'], (select auth.uid())) $$, $$ values (1) $$,
  'structures last missed more than an hour ago do not count toward the hourly limit');
select throws_ok(
  $$ select public.record_anatomy_misses('vessels', array['FMA1', 'FMA602'], (select auth.uid())) $$,
  '54000', 'too many misses recorded recently; try again later',
  'missing one of those old structures again counts as new, and with another new one passes the limit'
);

-- ---- The lifetime cap: 5,000 rows of review history a person (cleared ones count), so export-my-data can return all of it.
reset role;
insert into auth.users (id, email, email_confirmed_at, is_anonymous)
  values ('00000000-0000-4000-8000-000000000006', 'six@example.com', now(), false);
insert into public.anatomy_review_queue (user_id, system_key, structure_id, first_missed_at, last_missed_at, cleared_at)
  select '00000000-0000-4000-8000-000000000006', 'bulk', 'FMA' || n, now() - interval '3 hours', now() - interval '3 hours', now() - interval '2 hours'
  from generate_series(1, 4999) n;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000006", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000006';
select results_eq(
  $$ select public.record_anatomy_misses('bulk', array['FMA90001'], (select auth.uid())) $$, $$ values (1) $$,
  'the 5,000th row of history is recorded'
);
select throws_ok(
  $$ select public.record_anatomy_misses('bulk', array['FMA90002'], (select auth.uid())) $$,
  '54000', 'your review history is full', 'a 5,001st structure is refused'
);
select throws_ok(
  $$ select public.record_anatomy_misses('bulk', array['FMA1', 'FMA90003'], (select auth.uid())) $$,
  '54000', 'your review history is full', 'a call that would add a row past the cap is refused whole'
);
select results_eq(
  $$ select public.record_anatomy_misses('bulk', array['FMA1', 'FMA2'], (select auth.uid())) $$, $$ values (2) $$,
  'missing structures already in the history (cleared ones too) adds no row and is still recorded'
);
select results_eq($$ select count(*)::int from public.anatomy_review_queue $$, $$ values (5000) $$, 'and the history stays at 5,000');

-- ---- Student one: saved views.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select isnt(
  public.save_anatomy_view('heart', '  front view ', current_setting('t.camera')::jsonb, array['FMA1', 'FMA1'], array['FMA3'], 'FMA2', (select auth.uid())),
  null, 'a student saves a view and gets its id'
);
select results_eq(
  $$ select name, hidden, faded, selected, camera from public.my_anatomy_views('heart', (select auth.uid())) $$,
  $$ values ('front view', array['FMA1'], array['FMA3'], 'FMA2', current_setting('t.camera')::jsonb) $$,
  'the view is stored with its name trimmed, each hidden id once, and the camera as sent'
);
-- With one skin structure among 1,255 source labels, the normal whole-body view hides 1,254.
select isnt(
  public.save_anatomy_view('whole-body', 'skin-only', current_setting('t.camera')::jsonb,
    (select array_agg('FMA' || n) from generate_series(1, 1254) n), '{}', null, (select auth.uid())),
  null, 'a default whole-body view accepts all 1,254 hidden structure IDs'
);
select results_eq(
  $$ select cardinality(hidden)::int from public.my_anatomy_views('whole-body', (select auth.uid())) where name = 'skin-only' $$,
  $$ values (1254) $$, 'the full set of hidden structure IDs is read back unchanged'
);
select is(
  public.delete_anatomy_view((select id from public.my_anatomy_views('whole-body', (select auth.uid())) where name = 'skin-only'), (select auth.uid())),
  true, 'the test whole-body view is removed before the 50-view cap checks'
);
select results_eq(
  $$ select public.save_anatomy_view('heart', 'front view', '{"position": [1, 2, 3], "target": [0, 0, 0]}', '{}', '{}', null, (select auth.uid()))
       = (select id from public.my_anatomy_views('heart', (select auth.uid()))) $$,
  $$ values (true) $$, 'saving under the same name replaces that view and keeps its id'
);
select results_eq(
  $$ select count(*)::int, min((camera -> 'position')::text), min(cardinality(hidden))::int, bool_and(selected is null),
            bool_and(updated_at >= created_at)
     from public.my_anatomy_views('heart', (select auth.uid())) $$,
  $$ values (1, '[1, 2, 3]', 0, true, true) $$, 'with the new camera, lists and selection'
);
select isnt(
  public.save_anatomy_view('lungs', 'front view', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())),
  null, 'the same name in another system is another view'
);
select results_eq($$ select system_key from public.my_anatomy_views('lungs', (select auth.uid())) $$, $$ values ('lungs') $$,
  'listing a system shows only that system''s views');
select results_eq($$ select count(*)::int from public.anatomy_saved_views $$, $$ values (2) $$,
  'the student reads both of their views from the table');
select throws_ok(
  $$ insert into public.anatomy_saved_views (user_id, system_key, name, camera)
     values ('00000000-0000-4000-8000-000000000001', 'heart', 'direct', current_setting('t.camera')::jsonb) $$,
  '42501', null, 'a student cannot write a view directly'
);
select throws_ok($$ update public.anatomy_saved_views set name = 'renamed' $$, '42501', null, 'a student cannot change a view directly');
select throws_ok($$ delete from public.anatomy_saved_views $$, '42501', null, 'a student cannot delete a view directly');
do $$
begin
  perform set_config('t.view_one', (select id::text from public.my_anatomy_views('heart', (select auth.uid()))), true);
end
$$;

-- ---- Student two cannot see or delete them.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select is_empty($$ select * from public.my_anatomy_views('heart', (select auth.uid())) $$, 'another student lists none of those views');
select results_eq($$ select count(*)::int from public.anatomy_saved_views $$, $$ values (0) $$, 'and reads none from the table');
select results_eq($$ select public.delete_anatomy_view(current_setting('t.view_one')::uuid, (select auth.uid())) $$, $$ values (false) $$,
  'and cannot delete one, and is told only that nothing of theirs was deleted');

-- ---- Student one deletes.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select results_eq($$ select count(*)::int from public.my_anatomy_views('heart', (select auth.uid())) $$, $$ values (1) $$, 'the view is still there');
select results_eq($$ select public.delete_anatomy_view(current_setting('t.view_one')::uuid, (select auth.uid())) $$, $$ values (true) $$,
  'the owner deletes it');
select results_eq($$ select public.delete_anatomy_view(current_setting('t.view_one')::uuid, (select auth.uid())) $$, $$ values (false) $$,
  'deleting it again changes nothing');
select is_empty($$ select * from public.my_anatomy_views('heart', (select auth.uid())) $$, 'and it is gone');

-- ---- Refused before anything is written (views).
select throws_ok($$ select public.save_anatomy_view('heart', '', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'a view name is 1 to 60 characters of plain text', 'an empty name is refused');
select throws_ok($$ select public.save_anatomy_view('heart', '   ', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'a view name is 1 to 60 characters of plain text', 'a name of spaces is refused');
select throws_ok($$ select public.save_anatomy_view('heart', null, current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'a view name is 1 to 60 characters of plain text', 'no name is refused');
select throws_ok($$ select public.save_anatomy_view('heart', repeat('n', 61), current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'a view name is 1 to 60 characters of plain text', 'a name over 60 characters is refused');
select throws_ok($$ select public.save_anatomy_view('heart', E'front\tview', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'a view name is 1 to 60 characters of plain text', 'a name with a control character is refused');
select throws_ok($$ select public.save_anatomy_view('heart', 'front', null, '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'no camera is refused');
select throws_ok($$ select public.save_anatomy_view('heart', 'front', '[0, 0, 3]', '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'a camera that is not an object is refused');
select throws_ok($$ select public.save_anatomy_view('heart', 'front', '{"position": [0, 0, 3]}', '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'a camera without its target is refused');
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', '{"position": [0, 0, 3], "target": [0, 0, 0], "zoom": 2}', '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'a camera with a key that is not part of the shape is refused'
);
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', '{"position": [0, 3], "target": [0, 0, 0]}', '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'a position with two numbers is refused'
);
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', '{"position": [0, 0, "3"], "target": [0, 0, 0]}', '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'a position with text in it is refused'
);
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', '{"position": {"x": 0}, "target": [0, 0, 0]}', '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'a position that is not a list is refused'
);
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front',
       jsonb_build_object('position', jsonb_build_array(repeat('1', 1500)::numeric, repeat('2', 1500)::numeric, repeat('3', 1500)::numeric),
                          'target', '[0, 0, 0]'::jsonb), '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'a camera over 2 KB is refused'
);
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', '{"position": [1e309, 0, 3], "target": [0, 0, 0]}', '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'a camera number a browser reads as Infinity (1e309) is refused'
);
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', '{"position": [0, 0, 1e12345], "target": [0, 0, 0]}', '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'the camera has the wrong shape', 'an absurd exponent is refused with the same plain message'
);
select throws_ok($$ select public.save_anatomy_view('heart', 'front', current_setting('t.camera')::jsonb, array['BAD001'], '{}', null, (select auth.uid())) $$,
  '22023', 'a structure id has the wrong shape', 'a hidden id with the wrong shape is refused');
select throws_ok($$ select public.save_anatomy_view('heart', 'front', current_setting('t.camera')::jsonb, '{}', null, null, (select auth.uid())) $$,
  '22023', 'a structure id has the wrong shape', 'a null faded list is refused');
select throws_ok($$ select public.save_anatomy_view('heart', 'front', current_setting('t.camera')::jsonb, '{}', array['FMA1', null], null, (select auth.uid())) $$,
  '22023', 'a structure id has the wrong shape', 'a null faded id is refused');
select throws_ok($$ select public.save_anatomy_view('heart', 'front', current_setting('t.camera')::jsonb, '{}', '{}', 'fma1', (select auth.uid())) $$,
  '22023', 'a structure id has the wrong shape', 'a selected id with the wrong shape is refused');
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'front', current_setting('t.camera')::jsonb,
       (select array_agg('FMA' || n) from generate_series(1, 2001) n), '{}', null, (select auth.uid())) $$,
  '22023', 'a structure id has the wrong shape', 'more than 2,000 hidden ids is refused'
);
select throws_ok($$ select public.save_anatomy_view('Heart', 'front', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '22023', 'that anatomy system was not found', 'a bad system key is refused');
select throws_ok($$ select public.delete_anatomy_view(null, (select auth.uid())) $$, '22023', 'that view was not found', 'deleting with no id is refused');
reset role;
select results_eq(
  $$ select count(*)::int from public.anatomy_saved_views where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (1) $$, 'refused saves wrote nothing'
);

-- ---- The cap: 50 views a person. Student two has 50.
insert into public.anatomy_saved_views (user_id, system_key, name, camera)
  select '00000000-0000-4000-8000-000000000002', 'heart', 'view ' || n, current_setting('t.camera')::jsonb
  from generate_series(1, 50) n;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select public.save_anatomy_view('heart', 'view 51', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '54000', 'you can keep up to 50 saved views; delete one first', 'the 51st view is refused'
);
select throws_ok(
  $$ select public.save_anatomy_view('lungs', 'view 1', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())) $$,
  '54000', 'you can keep up to 50 saved views; delete one first', 'the cap counts every system together'
);
select isnt(
  public.save_anatomy_view('heart', 'view 1', '{"position": [1, 1, 1], "target": [0, 0, 0]}', '{}', '{}', null, (select auth.uid())),
  null, 'replacing one of the 50 always fits'
);
select results_eq($$ select count(*)::int from public.my_anatomy_views('heart', (select auth.uid())) $$, $$ values (50) $$, 'and the count stays 50');
select results_eq(
  $$ select public.delete_anatomy_view((select id from public.my_anatomy_views('heart', (select auth.uid())) where name = 'view 50'), (select auth.uid())) $$,
  $$ values (true) $$, 'deleting one'
);
select isnt(
  public.save_anatomy_view('heart', 'view 51', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())),
  null, 'makes room for a new one'
);
-- Student one is not affected by student two's cap.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select isnt(
  public.save_anatomy_view('heart', 'side view', current_setting('t.camera')::jsonb, '{}', '{}', null, (select auth.uid())),
  null, 'one student being at the cap does not stop another'
);

-- ---- The tables' own checks, for any writer (as the owner).
reset role;
select throws_ok(
  $$ insert into public.anatomy_review_queue (user_id, system_key, structure_id, missed_count)
     values ('00000000-0000-4000-8000-000000000001', 'heart', 'FMA77', 0) $$,
  '23514', null, 'the table refuses a count below one'
);
select throws_ok(
  $$ insert into public.anatomy_review_queue (user_id, system_key, structure_id)
     values ('00000000-0000-4000-8000-000000000001', 'heart', 'BAD001') $$,
  '23514', null, 'the table refuses a structure id with the wrong shape'
);
select throws_ok(
  $$ insert into public.anatomy_review_queue (user_id, system_key, structure_id)
     values ('00000000-0000-4000-8000-000000000001', 'Heart', 'FMA77') $$,
  '23514', null, 'the table refuses a system key with the wrong shape'
);
select throws_ok(
  $$ insert into public.anatomy_review_queue (user_id, system_key, structure_id)
     values ('00000000-0000-4000-8000-000000000001', 'heart', 'FMA1') $$,
  '23505', null, 'the table keeps one row per student, system and structure'
);
select throws_ok(
  $$ insert into public.anatomy_saved_views (user_id, system_key, name, camera)
     values ('00000000-0000-4000-8000-000000000001', 'heart', repeat('n', 61), current_setting('t.camera')::jsonb) $$,
  '23514', null, 'the table refuses a name over 60 characters'
);
select throws_ok(
  $$ insert into public.anatomy_saved_views (user_id, system_key, name, camera)
     values ('00000000-0000-4000-8000-000000000001', 'heart', 'bad camera', '[1, 2, 3]') $$,
  '23514', null, 'the table refuses a camera that is not an object'
);
select throws_ok(
  $$ insert into public.anatomy_saved_views (user_id, system_key, name, camera, selected)
     values ('00000000-0000-4000-8000-000000000001', 'heart', 'bad selection', current_setting('t.camera')::jsonb, 'BAD001') $$,
  '23514', null, 'the table refuses a selected id with the wrong shape'
);
select throws_ok(
  $$ insert into public.anatomy_saved_views (user_id, system_key, name, camera)
     values ('00000000-0000-4000-8000-000000000001', 'heart', 'side view', current_setting('t.camera')::jsonb) $$,
  '23505', null, 'the table keeps one view per student, system and name'
);

-- ---- Deleting the account deletes both tables' rows (delete_my_account deletes the auth.users row).
delete from auth.users where id = '00000000-0000-4000-8000-000000000001';
select is_empty(
  $$ select 1 from public.anatomy_review_queue where user_id = '00000000-0000-4000-8000-000000000001' $$,
  'the deleted account''s review queue is gone'
);
select is_empty(
  $$ select 1 from public.anatomy_saved_views where user_id = '00000000-0000-4000-8000-000000000001' $$,
  'and its saved views'
);
select results_eq(
  $$ select (select count(*) from public.anatomy_review_queue where user_id = '00000000-0000-4000-8000-000000000002')::int,
            (select count(*) from public.anatomy_saved_views where user_id = '00000000-0000-4000-8000-000000000002')::int $$,
  $$ values (601, 50) $$, 'another student''s rows stay'
);

select * from finish();
rollback;
