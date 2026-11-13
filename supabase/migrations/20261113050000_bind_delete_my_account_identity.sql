-- Bind permanent deletion to the account that completed the browser confirmation.
-- Founder-held: this changes an authentication-sensitive SECURITY DEFINER RPC and is not applied by this merge request.

drop function public.delete_my_account();

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

  -- The confirmation belongs to one account. A token/session swap must not redirect it to another account.
  if expected_user_id is distinct from uid then
    raise exception 'the signed-in account changed; reload and try again' using errcode = '28000';
  end if;

  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if jsonb_typeof(claims -> 'iat') is distinct from 'number'
     or (claims ->> 'iat')::numeric < extract(epoch from now()) - max_age_seconds then
    raise exception 'please sign in again to delete your account' using errcode = '28R01';
  end if;

  delete from auth.users u where u.id = expected_user_id;
end;
$$;

comment on function public.delete_my_account(uuid) is
  'Permanently deletes the signed-in account only when it matches the account that completed confirmation.';

revoke execute on function public.delete_my_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_account(uuid) to authenticated;
