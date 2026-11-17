-- Task 725: use Supabase Auth's server-signed authentication-method timestamps for destructive reauthentication.
-- The access token iat is renewed by a routine token refresh and cannot prove a password, OAuth, OTP or MFA re-entry.
-- Supabase's signed JWT amr entries record the method and timestamp at the real sign-in/MFA event:
-- https://supabase.com/docs/guides/auth/auth-mfa#frequently-asked-questions
-- https://supabase.com/docs/guides/auth/jwt-fields
-- Keep #660's expected_user_id binding and existing verified-factor MFA gate.
-- New migration only: never edit applied migrations or execute hosted SQL without founder approval.

create or replace function public.delete_my_account(expected_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  max_age_seconds constant integer := 600;
  current_epoch numeric := extract(epoch from clock_timestamp());
  recent_auth_epoch numeric;
begin
  if uid is null then
    raise exception 'sign in to delete your account' using errcode = '28000';
  end if;

  if expected_user_id is distinct from uid then
    raise exception 'the account signed in on this device changed; nothing was deleted' using errcode = '28000';
  end if;

  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  -- AMR is signed by Supabase Auth. Token refresh cannot manufacture a recent password/OAuth/OTP/TOTP event.
  -- TOTP alone is accepted only from aal2 (and the existing MFA gate has already passed).
  select max(
    case when jsonb_typeof(a.entry -> 'timestamp') = 'number'
      then (a.entry ->> 'timestamp')::numeric
      else null end
  ) into recent_auth_epoch
  from jsonb_array_elements(
    case when jsonb_typeof(claims -> 'amr') = 'array' then claims -> 'amr' else '[]'::jsonb end
  ) as a(entry)
  where a.entry ->> 'method' in ('password', 'oauth', 'otp', 'magiclink')
    or (a.entry ->> 'method' = 'totp' and claims ->> 'aal' = 'aal2');

  if recent_auth_epoch is null
     or recent_auth_epoch < current_epoch - max_age_seconds
     or recent_auth_epoch > current_epoch + 30 then
    raise exception 'please sign in again to delete your account' using errcode = '28R01';
  end if;

  -- Cascades remove the account's rows in this same transaction.
  delete from auth.users u where u.id = uid;
end;
$$;

comment on function public.delete_my_account(uuid) is
  'Deletes only the authenticated expected_user_id, with MFA when enabled and a server-signed password, OAuth, OTP or verified TOTP AMR event within ten minutes; JWT iat/refresh alone does not count (Task 725).';

revoke execute on function public.delete_my_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_account(uuid) to authenticated;
