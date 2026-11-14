-- Task 206: delete_my_account hardening, applied after 20261112020000_restate_delete_my_account_mfa.sql.
--
-- 1. Drift repair. 20261104170500_enforce_opt_in_mfa.sql is recorded as applied on hosted staging, but the live
--    public.delete_my_account() there has no app_private.mfa_access_allowed() call. This migration redefines the
--    function with the gate, so a verified second factor makes an aal1 bearer token insufficient to delete an account.
-- 2. Identity binding. The browser now passes the account id it is showing, and the database refuses (and deletes
--    nothing) unless it equals auth.uid(). A session switched in another tab between the page's check and the call
--    can therefore never delete a different account than the one on screen.
--
-- The zero-argument function is dropped, so it cannot be called any more. The ten-minute token check (Task 302) stays;
-- how fresh the sign-in is stays based on the token's iat claim (a server-recorded proof is a later task).

drop function if exists public.delete_my_account();

create function public.delete_my_account(expected_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  max_age_seconds constant integer := 600;
begin
  if uid is null then
    raise exception 'sign in to delete your account' using errcode = '28000';
  end if;

  -- The caller names the account it is showing; any other signed-in account is refused and nothing is deleted.
  if expected_user_id is distinct from uid then
    raise exception 'the account signed in on this device changed; nothing was deleted' using errcode = '28000';
  end if;

  -- A verified second factor makes an aal1 bearer token insufficient, even for this RPC.
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  -- Keep Task 302's short-lived-token check after the MFA authorization gate.
  if jsonb_typeof(claims -> 'iat') is distinct from 'number'
     or (claims ->> 'iat')::numeric < extract(epoch from now()) - max_age_seconds then
    raise exception 'please sign in again to delete your account' using errcode = '28R01';
  end if;

  -- The cascade removes the student's rows in every table that references auth.users, in this one statement.
  delete from auth.users u where u.id = uid;
end;
$$;

comment on function public.delete_my_account(uuid) is
  'Deletes the signed-in student''s own account and every row Cueory keeps about them; the id passed must equal auth.uid(), the session must pass the two-factor gate, and the token must be from the last 10 minutes (Tasks 60, 301, 302, 206).';

revoke execute on function public.delete_my_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_account(uuid) to authenticated;
