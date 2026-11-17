-- Task 725: server-signed AMR timestamps, rather than renewed JWT iat, gate irreversible deletion.
-- All users and credentials are synthetic. This test always rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-a@example.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'sample-b@example.test');

create function pg_temp.authenticate(p_uid uuid, p_method text, p_age integer, p_aal text default 'aal1')
returns void
language plpgsql
as $f$
declare
  claims jsonb := jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'aal', p_aal, 'iat', extract(epoch from now())::bigint
  );
begin
  if p_method is not null then
    claims := claims || jsonb_build_object('amr', jsonb_build_array(
      jsonb_build_object('method', p_method, 'timestamp', extract(epoch from now())::bigint - p_age)));
  end if;
  perform set_config('request.jwt.claims', claims::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end;
$f$;

select ok(
  has_function_privilege('authenticated', 'public.delete_my_account(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.delete_my_account(uuid)', 'execute'),
  'only authenticated callers may request account deletion'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
     from pg_proc where oid = 'public.delete_my_account(uuid)'::regprocedure),
  'the destructive function uses a fixed empty search path'
);

select pg_temp.authenticate('00000000-0000-4000-8000-0000000000a1', null, 0);
set local role authenticated;
select throws_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a1') $$,
  '28R01', 'please sign in again to delete your account', 'a fresh iat with no AMR is refused');
reset role;

select pg_temp.authenticate('00000000-0000-4000-8000-0000000000a1', 'password', 601);
set local role authenticated;
select throws_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a1') $$,
  '28R01', 'please sign in again to delete your account', 'a refreshed token cannot extend an old password event');
reset role;

select pg_temp.authenticate('00000000-0000-4000-8000-0000000000a1', 'token_refresh', 0);
set local role authenticated;
select throws_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a1') $$,
  '28R01', 'please sign in again to delete your account', 'token_refresh is not reauthentication');
reset role;

select pg_temp.authenticate('00000000-0000-4000-8000-0000000000a1', 'password', 0);
select set_config('request.jwt.claims',
  jsonb_set(current_setting('request.jwt.claims')::jsonb, '{amr,0,timestamp}', '"not-a-time"'::jsonb)::text, true);
set local role authenticated;
select throws_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a1') $$,
  '28R01', 'please sign in again to delete your account', 'a malformed authentication timestamp fails closed');
reset role;

select pg_temp.authenticate('00000000-0000-4000-8000-0000000000a1', 'password', -31);
set local role authenticated;
select throws_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a1') $$,
  '28R01', 'please sign in again to delete your account', 'future authentication timestamps are refused');
reset role;

select pg_temp.authenticate('00000000-0000-4000-8000-0000000000a1', 'totp', 0, 'aal1');
set local role authenticated;
select throws_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a1') $$,
  '28R01', 'please sign in again to delete your account', 'TOTP requires an aal2 proof');
reset role;

select pg_temp.authenticate('00000000-0000-4000-8000-0000000000a1', 'oauth', 0);
set local role authenticated;
select throws_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a2') $$,
  '28000', 'the account signed in on this device changed; nothing was deleted',
  'a recent authenticated user cannot delete another account');
reset role;

set local role authenticated;
select lives_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a1') $$,
  'recent verified OAuth permits deletion of that same account');
reset role;
select results_eq(
  $$ select count(*)::int from auth.users where id = '00000000-0000-4000-8000-0000000000a2' $$,
  $$ values (1) $$, 'the other account is not deleted'
);

select pg_temp.authenticate('00000000-0000-4000-8000-0000000000a2', 'password', 0);
set local role authenticated;
select lives_ok($$ select public.delete_my_account('00000000-0000-4000-8000-0000000000a2') $$,
  'recent password re-entry permits deleting the second account');
reset role;

select results_eq(
  $$ select count(*)::int from auth.users where id in
       ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2') $$,
  $$ values (0) $$, 'both synthetic accounts are gone'
);

select * from finish();
rollback;
