-- Lane 2: bind update_display_name and submit_flag to the account the page is showing (audit #741, the pattern of
-- delete_my_account(expected_user_id) in 20261114151643_delete_my_account_identity_and_mfa.sql).
--
-- Both functions write as auth.uid(), so a request sent after another tab switched accounts lands on the new
-- account. The browser now passes the account id it is showing, and the database refuses (and saves nothing) unless
-- it equals auth.uid(): a name typed on A's account page, or a report typed while signed in as A, never reaches B.
--
-- The bodies are the current definitions from 20261104170500_enforce_opt_in_mfa.sql, unchanged apart from the new
-- argument and its check, which runs right after the signed-in check and before anything else. The old signatures
-- are dropped, so every caller must name the account. The browser callers change in the same pull request. Apply
-- this migration and deploy the site together: until both are live, a name change or a report is refused.
--
-- Order: independent of lane 1's check_answer/record_study_events migration (different functions), so either may be
-- applied first.

drop function if exists public.update_display_name(text);
drop function if exists public.submit_flag(text, uuid, uuid, text, text);

create function public.update_display_name(new_name text, expected_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_name text;
  window_start timestamptz;
  changes integer;
  hourly_limit constant integer := 10;
begin
  if uid is null then
    raise exception 'sign in to change your display name' using errcode = '28000';
  end if;

  -- The caller names the account it is showing; any other signed-in account is refused and nothing is saved.
  if update_display_name.expected_user_id is distinct from uid then
    raise exception 'the account signed in on this device changed; nothing was saved' using errcode = '28000';
  end if;

  -- A verified second factor makes an aal1 bearer token insufficient, even for this RPC.
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  -- Leading and trailing spaces are not part of the name (the browser's checkDisplayName trims them the same way).
  -- Apply the same server-side Task 302 rule as sign-up and direct updates.
  clean_name := btrim(update_display_name.new_name, ' ');
  if not public.display_name_ok(clean_name) then
    raise exception 'a display name is 1 to 50 characters of plain text' using errcode = '22023';
  end if;

  -- The limit, per person. The lock keeps two quick calls from both slipping under it.
  perform pg_advisory_xact_lock(hashtextextended('display-name:' || uid::text, 0));
  select p.name_change_window_start, p.name_changes_in_window into window_start, changes
    from public.profiles p where p.id = uid;
  if not found then
    raise exception 'your profile was not found' using errcode = 'P0002';
  end if;

  if window_start is null or window_start <= now() - interval '1 hour' then
    -- No changes in the last hour: this one starts a new window.
    window_start := now();
    changes := 1;
  elsif changes >= hourly_limit then
    raise exception 'that is a lot of name changes; please try again later' using errcode = '54000';
  else
    changes := changes + 1;
  end if;

  update public.profiles p
    set display_name = clean_name, name_change_window_start = window_start, name_changes_in_window = changes
    where p.id = uid;
  return clean_name;
end;
$$;

comment on function public.update_display_name(text, uuid) is
  'Changes the signed-in student''s own display name, after checking and limiting it; the id passed must equal auth.uid() (Task 59, lane 2).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.update_display_name(text, uuid) from public, anon, authenticated;
grant execute on function public.update_display_name(text, uuid) to authenticated;

create function public.submit_flag(
  page text,
  item_id uuid,
  item_version_id uuid,
  reason text,
  comment text,
  expected_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_comment text;
  new_id uuid;
  hourly_limit constant integer := 5;
  daily_limit constant integer := 20;
begin
  if uid is null then
    raise exception 'sign in to send a report' using errcode = '28000';
  end if;

  -- The caller names the account it is showing; any other signed-in account is refused and nothing is saved.
  if submit_flag.expected_user_id is distinct from uid then
    raise exception 'the account signed in on this device changed; nothing was sent' using errcode = '28000';
  end if;

  -- Retain Task 169's confirmed, non-anonymous account restriction from merged PR #235.
  -- MFA alone must never authorize a throwaway or unconfirmed account.
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  -- A verified second factor makes an aal1 bearer token insufficient, even for this RPC.
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if submit_flag.page is null or char_length(submit_flag.page) not between 1 and 200
     or submit_flag.page !~ '^/[A-Za-z0-9._~/%:@!$&''()*+,;=-]*$' or submit_flag.page ~ '^//' then
    raise exception 'the page must be an address on this site' using errcode = '22023';
  end if;

  if submit_flag.reason is null
     or submit_flag.reason <> all (array['wrong-fact', 'typo', 'confusing', 'broken', 'other']) then
    raise exception 'pick what is wrong from the list' using errcode = '22023';
  end if;

  -- An empty comment is no comment. Trailing and leading spaces are not part of it.
  clean_comment := nullif(btrim(submit_flag.comment), '');
  if clean_comment is not null and (char_length(clean_comment) > 1000 or clean_comment ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then
    raise exception 'the comment is up to 1,000 characters of plain text' using errcode = '22023';
  end if;

  -- The item and its version come together, and the version must belong to the item. Every way of getting this wrong
  -- gives the same answer, so a report can't be used to find out which ids exist.
  if (submit_flag.item_id is null) <> (submit_flag.item_version_id is null) then
    raise exception 'that question was not found' using errcode = '22023';
  end if;
  if submit_flag.item_id is not null and not exists (
    select 1 from public.item_versions v
    where v.id = submit_flag.item_version_id and v.item_id = submit_flag.item_id
  ) then
    raise exception 'that question was not found' using errcode = '22023';
  end if;

  -- The limits, per person. The lock keeps two quick calls from both slipping under them.
  perform pg_advisory_xact_lock(hashtextextended('flag:' || uid::text, 0));
  if (select count(*) from public.flags f where f.user_id = uid and f.created_at > now() - interval '1 hour') >= hourly_limit
     or (select count(*) from public.flags f where f.user_id = uid and f.created_at > now() - interval '1 day') >= daily_limit then
    raise exception 'that is a lot of reports; please try again later' using errcode = '54000';
  end if;

  insert into public.flags (user_id, page, item_id, item_version_id, reason, comment)
    values (uid, submit_flag.page, submit_flag.item_id, submit_flag.item_version_id, submit_flag.reason, clean_comment)
    returning id into new_id;
  return new_id;
end;
$$;

comment on function public.submit_flag(text, uuid, uuid, text, text, uuid) is
  'Sends a "Flag or comment" report for a signed-in student, after checking and limiting it; the id passed must equal auth.uid() (D-88, lane 2).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.submit_flag(text, uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_flag(text, uuid, uuid, text, text, uuid) to authenticated;
