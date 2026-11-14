-- Crumbs Up: the cloud copy of each person's cookie journal.
--
-- The app stays local-first. Each device keeps its own copy and syncs through
-- this table, so the rules here do two jobs: keep every person's journal
-- private to them, and settle which copy wins when two devices disagree.

-- ---------------------------------------------------------------------------
-- Cookies
-- ---------------------------------------------------------------------------

create table public.cookies (
  -- Chosen by the device that rated the cookie, so it is the same on all of
  -- that person's devices. Unique per person, not globally: two accounts can
  -- hold the same cookie (a journal moved from one account to another), and
  -- nobody can block or probe someone else's ids.
  id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The cookie exactly as the app stores it on the device.
  data jsonb not null default '{}'::jsonb,
  -- When it was last edited, by the editing device's clock (ms since 1970).
  -- The newest edit wins.
  edited_at bigint not null,
  -- Deleted cookies stay as a marker so other devices learn to delete them too.
  deleted boolean not null default false,
  -- When this row last changed here. Devices ask "anything since …?" against it.
  changed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  constraint cookies_data_is_small check (pg_column_size(data) < 200000)
);

comment on table public.cookies is 'One row per rated cookie, private to the person who rated it.';

create index cookies_owner_changed on public.cookies (user_id, changed_at);

-- Newest edit wins, whoever writes last. An older copy arriving late (a phone
-- that was offline, say) is quietly dropped instead of undoing newer work.
create function public.cookies_keep_newest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.edited_at < old.edited_at then
      return null;
    end if;
    -- A row can never be handed to someone else.
    new.user_id := old.user_id;
  end if;
  new.changed_at := clock_timestamp();
  return new;
end;
$$;

create trigger cookies_keep_newest
before insert or update on public.cookies
for each row execute function public.cookies_keep_newest();

-- Privacy: a signed-in person sees and changes only their own rows.
-- Visitors who are not signed in get nothing at all.
alter table public.cookies enable row level security;

revoke all on table public.cookies from anon, authenticated;
grant select, insert, update, delete on table public.cookies to authenticated;

create policy "People read their own cookies"
on public.cookies for select to authenticated
using ((select auth.uid()) = user_id);

create policy "People add their own cookies"
on public.cookies for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "People change their own cookies"
on public.cookies for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "People remove their own cookies"
on public.cookies for delete to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

-- A private bucket. Each person's photos live under a folder named with their
-- user id:  <user id>/<cookie id>/full.jpg  (and original.jpg for cut-outs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "People read their own photos"
on storage.objects for select to authenticated
using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "People add their own photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "People replace their own photos"
on storage.objects for update to authenticated
using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "People remove their own photos"
on storage.objects for delete to authenticated
using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
