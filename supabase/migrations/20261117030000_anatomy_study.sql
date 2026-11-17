-- Anatomy Lab study tools, part C: the database (Task 178; awaiting Christian's explicit approval).
--
-- Two tables, both the signed-in student's own study progress (CLAUDE.md rule 2), and six functions:
--
-- anatomy_review_queue: which structures a student missed in the "Find it" quiz, how many times, when first and last,
--   and when they cleared it from their review list. One row per student, system and structure. No answer data: a
--   BodyParts3D structure id (FMA7204) is a public catalog id, not a nursing fact.
-- anatomy_saved_views: views a student chooses to save in the 3D lab: a name, the camera (a small JSON object), which
--   structures were hidden or faded, and which was selected. Up to 50 per student.
--
-- A student reads their own rows (export-my-data) and never writes, changes or deletes a row directly: the functions
-- do, as the database owner, after checking every input and limiting how much one person can write. Deleting an
-- account deletes both (the foreign keys cascade). Signed-out visitors, unconfirmed and anonymous accounts get nothing
-- (Task 169): anonymous play records nothing. A verified second factor needs an aal2 token (Task 301).
--
-- Grants, row-level security and the policies are all in this file, together (D-73).

-- ---------------------------------------------------------------- anatomy_review_queue

create table public.anatomy_review_queue (
  id uuid primary key default gen_random_uuid(),
  -- Whose row it is; deleting an account deletes its queue (delete-my-account).
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The lab system (content/visuals/anatomy-<system_key>.json), such as heart or skeleton-limbs.
  system_key text not null constraint anatomy_review_queue_system_key check (system_key ~ '^[a-z0-9-]{1,40}$'),
  -- The structure's id in the model: a BodyParts3D FMA id, or a test fixture (FIX001 in the browser tests, fixture-… in labeled samples).
  structure_id text not null
    constraint anatomy_review_queue_structure_id
    check (char_length(structure_id) <= 60 and structure_id ~ '^(FMA[0-9]+|FIX[0-9]+|fixture-[a-z0-9-]+)$'),
  missed_count integer not null default 1 constraint anatomy_review_queue_missed_count check (missed_count >= 1),
  first_missed_at timestamptz not null default now(),
  last_missed_at timestamptz not null default now(),
  -- Set when the student clears it from their review list; a later miss puts it back (clears this).
  cleared_at timestamptz,
  constraint anatomy_review_queue_order check (last_missed_at >= first_missed_at),
  -- One row per student, system and structure; record_anatomy_misses updates it in place.
  constraint anatomy_review_queue_once unique (user_id, system_key, structure_id)
);

-- The hourly limit counts a student's rows by last_missed_at, the database's own clock.
create index anatomy_review_queue_user_last_missed_idx on public.anatomy_review_queue (user_id, last_missed_at desc);

comment on table public.anatomy_review_queue is
  'Which anatomy structures a signed-in student missed in the lab quiz and how often (Task 178). Each student reads only their own; record_anatomy_misses and clear_anatomy_miss are the only writers.';

grant select on table public.anatomy_review_queue to authenticated;
grant select, insert, update, delete on table public.anatomy_review_queue to service_role;

alter table public.anatomy_review_queue enable row level security;

create policy "students read their own anatomy review queue"
  on public.anatomy_review_queue
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Restrictive, so it can never widen the per-student policy above (Task 301).
create policy "opt-in MFA required for anatomy_review_queue" on public.anatomy_review_queue
  as restrictive for all to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

-- ---------------------------------------------------------------- anatomy_saved_views

create table public.anatomy_saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  system_key text not null constraint anatomy_saved_views_system_key check (system_key ~ '^[a-z0-9-]{1,40}$'),
  -- The student's own name for the view, 1 to 60 characters; save_anatomy_view trims it and refuses control characters.
  name text not null constraint anatomy_saved_views_name check (char_length(name) between 1 and 60),
  -- The camera, as the lab saves it: a small JSON object (position, target and up), never more than 2 KB.
  camera jsonb not null
    constraint anatomy_saved_views_camera check (jsonb_typeof(camera) = 'object' and pg_column_size(camera) < 2048),
  -- Structure ids hidden or faded in the view. The current full catalog has 1,255 source labels,
  -- so a normal whole-body view can hide 1,254. Keep the bounded maximum at 2,000 per list.
  hidden text[] not null default '{}' constraint anatomy_saved_views_hidden check (cardinality(hidden) <= 2000),
  faded text[] not null default '{}' constraint anatomy_saved_views_faded check (cardinality(faded) <= 2000),
  selected text
    constraint anatomy_saved_views_selected
    check (selected is null or (char_length(selected) <= 60 and selected ~ '^(FMA[0-9]+|FIX[0-9]+|fixture-[a-z0-9-]+)$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Saving again under the same name in the same system replaces that view.
  constraint anatomy_saved_views_once unique (user_id, system_key, name)
);

comment on table public.anatomy_saved_views is
  'Anatomy lab views a signed-in student chose to save: a name, camera and which structures were hidden, faded or selected (Task 178). Each student reads only their own; save_anatomy_view and delete_anatomy_view are the only writers.';

grant select on table public.anatomy_saved_views to authenticated;
grant select, insert, update, delete on table public.anatomy_saved_views to service_role;

alter table public.anatomy_saved_views enable row level security;

create policy "students read their own anatomy saved views"
  on public.anatomy_saved_views
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "opt-in MFA required for anatomy_saved_views" on public.anatomy_saved_views
  as restrictive for all to authenticated
  using ((select app_private.mfa_access_allowed()))
  with check ((select app_private.mfa_access_allowed()));

-- ---------------------------------------------------------------- record_anatomy_misses

-- security definer with an empty search_path and schema-qualified names, as Supabase's "Database Functions" docs
-- require. Confirmed, signed-in students only. `structure_ids` is 1 to 50 ids the student just missed in `system_key`;
-- the same id twice in one call counts once. A structure already in the queue gets missed_count + 1 and a new
-- last_missed_at, and comes back onto the list if it had been cleared. Returns how many structures were recorded.
--
-- The limit: a student can put at most 600 structures an hour into their queue, counted as rows whose last_missed_at
-- is within the hour. Missing a structure again inside that hour does not count twice, so the queue never grows by
-- more than 600 rows an hour for one person, and the whole call is refused if it would.
create function public.record_anatomy_misses(system_key text, structure_ids text[], expected_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ids text[];
  n_ids integer;
  n_new integer;
  hourly_limit constant integer := 600;
  -- A student's whole review history (cleared rows included) stays under this, so export-my-data, which reads at most
  -- 10,000 rows, can always return all of it. A real history is a few thousand structures at most.
  lifetime_limit constant integer := 5000;
  n_brand_new integer;
begin
  if uid is null then
    raise exception 'sign in to record what you missed' using errcode = '28000';
  end if;

  -- The UI passes the user id captured when the action began. Recheck it in the
  -- SECURITY DEFINER function so a cross-tab session change cannot redirect a write.
  if record_anatomy_misses.expected_user_id is null or record_anatomy_misses.expected_user_id <> uid then
    raise exception 'study account changed; reload before continuing' using errcode = '28000';
  end if;

  -- Task 169: only a confirmed, permanent account. A script could otherwise make throwaway unconfirmed or anonymous
  -- accounts and multiply the per-person limit below. Supabase's user object docs: email_confirmed_at is null until
  -- the email is confirmed. Its anonymous sign-ins docs: an anonymous user also has the authenticated role, and is
  -- told apart by the is_anonymous claim in auth.jwt(). The is_anonymous column is checked too.
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  -- A verified second factor makes an aal1 bearer token insufficient, even for this RPC (Task 301).
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if record_anatomy_misses.system_key is null or record_anatomy_misses.system_key !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'that anatomy system was not found' using errcode = '22023';
  end if;

  -- Bad input is refused before anything is written. One wrong id refuses the whole call.
  if record_anatomy_misses.structure_ids is null then
    raise exception 'send between 1 and 50 structures' using errcode = '22023';
  end if;
  n_ids := cardinality(record_anatomy_misses.structure_ids);
  if n_ids < 1 or n_ids > 50 then
    raise exception 'send between 1 and 50 structures' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(record_anatomy_misses.structure_ids) i
    where i is null or char_length(i) > 60 or i !~ '^(FMA[0-9]+|FIX[0-9]+|fixture-[a-z0-9-]+)$'
  ) then
    raise exception 'a structure id has the wrong shape' using errcode = '22023';
  end if;
  select array_agg(distinct i) into ids from unnest(record_anatomy_misses.structure_ids) i;

  -- The limit, per person, counted from the table itself by the database's clock. The lock keeps two quick calls
  -- from both slipping under it, and nothing else writes this person's queue while it is held.
  perform pg_advisory_xact_lock(hashtextextended('anatomy_misses:' || uid::text, 0));
  select count(*) into n_new
  from unnest(ids) i
  where not exists (
    select 1 from public.anatomy_review_queue q
    where q.user_id = uid and q.system_key = record_anatomy_misses.system_key and q.structure_id = i
      and q.last_missed_at > now() - interval '1 hour'
  );
  if n_new > 0 and (select count(*) from public.anatomy_review_queue q
                    where q.user_id = uid and q.last_missed_at > now() - interval '1 hour') + n_new > hourly_limit then
    raise exception 'too many misses recorded recently; try again later' using errcode = '54000';
  end if;

  -- Structures this student has never missed would add rows; missing one already in the history adds none.
  select count(*) into n_brand_new
  from unnest(ids) i
  where not exists (
    select 1 from public.anatomy_review_queue q
    where q.user_id = uid and q.system_key = record_anatomy_misses.system_key and q.structure_id = i
  );
  if n_brand_new > 0 and (select count(*) from public.anatomy_review_queue q where q.user_id = uid) + n_brand_new > lifetime_limit then
    raise exception 'your review history is full' using errcode = '54000';
  end if;

  insert into public.anatomy_review_queue (user_id, system_key, structure_id)
    select uid, record_anatomy_misses.system_key, i from unnest(ids) i
    -- By constraint name: `system_key` is also this function's argument, so a column list would be ambiguous in plpgsql.
    on conflict on constraint anatomy_review_queue_once do update
      set missed_count = public.anatomy_review_queue.missed_count + 1,
          last_missed_at = now(),
          cleared_at = null;
  return cardinality(ids);
end;
$$;

comment on function public.record_anatomy_misses(text, text[], uuid) is
  'Records 1 to 50 structures a signed-in student missed in the anatomy lab quiz, within the limit; returns how many were recorded (Task 178).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.record_anatomy_misses(text, text[], uuid) from public, anon, authenticated;
grant execute on function public.record_anatomy_misses(text, text[], uuid) to authenticated;

-- ---------------------------------------------------------------- clear_anatomy_miss

-- Takes one structure off the caller's review list (sets cleared_at). The row stays, so a later miss shows the whole
-- history. Returns true when a row was cleared, false when there was nothing of the caller's to clear.
create function public.clear_anatomy_miss(system_key text, structure_id text, expected_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n_cleared integer;
begin
  if uid is null then
    raise exception 'sign in to change your review list' using errcode = '28000';
  end if;

  -- The UI passes the user id captured when the action began. Recheck it in the
  -- SECURITY DEFINER function so a cross-tab session change cannot redirect a write.
  if clear_anatomy_miss.expected_user_id is null or clear_anatomy_miss.expected_user_id <> uid then
    raise exception 'study account changed; reload before continuing' using errcode = '28000';
  end if;
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if clear_anatomy_miss.system_key is null or clear_anatomy_miss.system_key !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'that anatomy system was not found' using errcode = '22023';
  end if;
  if clear_anatomy_miss.structure_id is null or char_length(clear_anatomy_miss.structure_id) > 60
     or clear_anatomy_miss.structure_id !~ '^(FMA[0-9]+|FIX[0-9]+|fixture-[a-z0-9-]+)$' then
    raise exception 'a structure id has the wrong shape' using errcode = '22023';
  end if;

  update public.anatomy_review_queue q
    set cleared_at = now()
    where q.user_id = uid and q.system_key = clear_anatomy_miss.system_key
      and q.structure_id = clear_anatomy_miss.structure_id and q.cleared_at is null;
  get diagnostics n_cleared = row_count;
  return n_cleared > 0;
end;
$$;

comment on function public.clear_anatomy_miss(text, text, uuid) is
  'Takes one structure off a signed-in student''s anatomy review list; true when a row was cleared (Task 178).';

revoke execute on function public.clear_anatomy_miss(text, text, uuid) from public, anon, authenticated;
grant execute on function public.clear_anatomy_miss(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------- my_anatomy_review_queue

-- The caller's own uncleared rows, most recently missed first. Rows of the table's own type, so the export and the
-- lab read the same columns the table has.
create function public.my_anatomy_review_queue(expected_user_id uuid)
returns setof public.anatomy_review_queue
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sign in to see your review list' using errcode = '28000';
  end if;
  -- Refuse a read executed under B when the browser began it under A.
  if my_anatomy_review_queue.expected_user_id is null or my_anatomy_review_queue.expected_user_id <> uid then
    raise exception 'study account changed; reload before continuing' using errcode = '28000';
  end if;
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  return query
    select q.* from public.anatomy_review_queue q
    where q.user_id = uid and q.cleared_at is null
    -- Stable tie breakers prevent overlapping offset pages when misses share a timestamp.
    order by q.last_missed_at desc, q.structure_id, q.system_key, q.id;
end;
$$;

comment on function public.my_anatomy_review_queue(uuid) is
  'A signed-in student''s own uncleared anatomy review rows, most recently missed first (Task 178).';

revoke execute on function public.my_anatomy_review_queue(uuid) from public, anon, authenticated;
grant execute on function public.my_anatomy_review_queue(uuid) to authenticated;

-- ---------------------------------------------------------------- save_anatomy_view

-- Saves a view, or replaces the caller's view of the same name in the same system. `camera` is exactly
--   { position: [x, y, z], target: [x, y, z], up?: [x, y, z] }
-- with finite numbers; any other key is refused. `hidden` and `faded` are structure ids (each up to 2,000, no
-- duplicates stored), `selected` a structure id or null. A student keeps at most 50 views; the 51st is refused with
-- SQLSTATE 54000 and a plain message, and replacing an existing view always fits. Returns the view's id.
create function public.save_anatomy_view(
  system_key text,
  name text,
  camera jsonb,
  hidden text[],
  faded text[],
  selected text,
  expected_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_name text;
  clean_hidden text[];
  clean_faded text[];
  key text;
  vector jsonb;
  view_id uuid;
  id_shape constant text := '^(FMA[0-9]+|FIX[0-9]+|fixture-[a-z0-9-]+)$';
  max_views constant integer := 50;
begin
  if uid is null then
    raise exception 'sign in to save a view' using errcode = '28000';
  end if;

  -- The UI passes the user id captured when the action began. Recheck it in the
  -- SECURITY DEFINER function so a cross-tab session change cannot redirect a write.
  if save_anatomy_view.expected_user_id is null or save_anatomy_view.expected_user_id <> uid then
    raise exception 'study account changed; reload before continuing' using errcode = '28000';
  end if;
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if save_anatomy_view.system_key is null or save_anatomy_view.system_key !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'that anatomy system was not found' using errcode = '22023';
  end if;

  -- The name: trimmed, 1 to 60 characters, no control characters.
  clean_name := btrim(save_anatomy_view.name);
  if clean_name is null or char_length(clean_name) not between 1 and 60 or clean_name ~ '[\x01-\x1f\x7f]' then
    raise exception 'a view name is 1 to 60 characters of plain text' using errcode = '22023';
  end if;

  -- The camera: an object with position and target, and up if the lab sends it, each three finite numbers.
  if save_anatomy_view.camera is null or jsonb_typeof(save_anatomy_view.camera) <> 'object'
     or pg_column_size(save_anatomy_view.camera) >= 2048
     or save_anatomy_view.camera -> 'position' is null or save_anatomy_view.camera -> 'target' is null then
    raise exception 'the camera has the wrong shape' using errcode = '22023';
  end if;
  for key, vector in select * from jsonb_each(save_anatomy_view.camera) loop
    if key <> all (array['position', 'target', 'up'])
       or jsonb_typeof(vector) <> 'array' or jsonb_array_length(vector) <> 3
       or exists (
         select 1 from jsonb_array_elements(vector) v
         where jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^-?[0-9]+([.][0-9]+)?([eE][-+]?[0-9]{1,4})?$'
            -- Within what a browser reads as a finite number (1e309 reads as Infinity and would break the lab and the export).
            or abs((v #>> '{}')::numeric) > 1e300
       ) then
      raise exception 'the camera has the wrong shape' using errcode = '22023';
    end if;
  end loop;

  -- The structure lists and the selection.
  if save_anatomy_view.hidden is null or save_anatomy_view.faded is null
     or cardinality(save_anatomy_view.hidden) > 2000 or cardinality(save_anatomy_view.faded) > 2000
     or exists (
       select 1 from unnest(save_anatomy_view.hidden || save_anatomy_view.faded) i
       where i is null or char_length(i) > 60 or i !~ id_shape
     ) then
    raise exception 'a structure id has the wrong shape' using errcode = '22023';
  end if;
  if save_anatomy_view.selected is not null
     and (char_length(save_anatomy_view.selected) > 60 or save_anatomy_view.selected !~ id_shape) then
    raise exception 'a structure id has the wrong shape' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct i), '{}') into clean_hidden from unnest(save_anatomy_view.hidden) i;
  select coalesce(array_agg(distinct i), '{}') into clean_faded from unnest(save_anatomy_view.faded) i;

  -- The cap, per person. The lock keeps two quick saves from both slipping under it.
  perform pg_advisory_xact_lock(hashtextextended('anatomy_views:' || uid::text, 0));
  if not exists (
       select 1 from public.anatomy_saved_views v
       where v.user_id = uid and v.system_key = save_anatomy_view.system_key and v.name = clean_name
     )
     and (select count(*) from public.anatomy_saved_views v where v.user_id = uid) >= max_views then
    raise exception 'you can keep up to 50 saved views; delete one first' using errcode = '54000';
  end if;

  insert into public.anatomy_saved_views (user_id, system_key, name, camera, hidden, faded, selected)
    values (uid, save_anatomy_view.system_key, clean_name, save_anatomy_view.camera, clean_hidden, clean_faded,
            save_anatomy_view.selected)
    on conflict on constraint anatomy_saved_views_once do update
      set camera = excluded.camera,
          hidden = excluded.hidden,
          faded = excluded.faded,
          selected = excluded.selected,
          updated_at = now()
    returning id into view_id;
  return view_id;
end;
$$;

comment on function public.save_anatomy_view(text, text, jsonb, text[], text[], text, uuid) is
  'Saves or replaces one of a signed-in student''s anatomy lab views (up to 50), after checking it; returns the view id (Task 178).';

revoke execute on function public.save_anatomy_view(text, text, jsonb, text[], text[], text, uuid) from public, anon, authenticated;
grant execute on function public.save_anatomy_view(text, text, jsonb, text[], text[], text, uuid) to authenticated;

-- ---------------------------------------------------------------- delete_anatomy_view

-- Deletes one of the caller's own views. Returns true when a row was deleted, false when there was none of theirs
-- with that id, so an id can't be used to find out whether another student's view exists.
create function public.delete_anatomy_view(id uuid, expected_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n_deleted integer;
begin
  if uid is null then
    raise exception 'sign in to delete a view' using errcode = '28000';
  end if;

  -- The UI passes the user id captured when the action began. Recheck it in the
  -- SECURITY DEFINER function so a cross-tab session change cannot redirect a write.
  if delete_anatomy_view.expected_user_id is null or delete_anatomy_view.expected_user_id <> uid then
    raise exception 'study account changed; reload before continuing' using errcode = '28000';
  end if;
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if delete_anatomy_view.id is null then
    raise exception 'that view was not found' using errcode = '22023';
  end if;

  delete from public.anatomy_saved_views v where v.user_id = uid and v.id = delete_anatomy_view.id;
  get diagnostics n_deleted = row_count;
  return n_deleted > 0;
end;
$$;

comment on function public.delete_anatomy_view(uuid, uuid) is
  'Deletes one of a signed-in student''s own anatomy lab views; true when a row was deleted (Task 178).';

revoke execute on function public.delete_anatomy_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_anatomy_view(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- my_anatomy_views

-- The caller's own saved views for one system, by name. Rows of the table's own type.
create function public.my_anatomy_views(system_key text, expected_user_id uuid)
returns setof public.anatomy_saved_views
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sign in to see your saved views' using errcode = '28000';
  end if;
  if my_anatomy_views.expected_user_id is null or my_anatomy_views.expected_user_id <> uid then
    raise exception 'study account changed; reload before continuing' using errcode = '28000';
  end if;
  if not exists (
       select 1 from auth.users u
       where u.id = uid and u.email_confirmed_at is not null and u.is_anonymous is not true
     ) or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'confirm your email to use this' using errcode = '28000';
  end if;
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  if my_anatomy_views.system_key is null or my_anatomy_views.system_key !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'that anatomy system was not found' using errcode = '22023';
  end if;

  return query
    select v.* from public.anatomy_saved_views v
    where v.user_id = uid and v.system_key = my_anatomy_views.system_key
    order by v.name, v.id;
end;
$$;

comment on function public.my_anatomy_views(text, uuid) is
  'A signed-in student''s own saved anatomy lab views for one system, by name (Task 178).';

revoke execute on function public.my_anatomy_views(text, uuid) from public, anon, authenticated;
grant execute on function public.my_anatomy_views(text, uuid) to authenticated;
