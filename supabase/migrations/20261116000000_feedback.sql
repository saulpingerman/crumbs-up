-- Feedback: bug reports and ideas sent from the app's "Send feedback" page.
--
-- Anyone can send one, signed in or not. Nobody can read them back through
-- the app, not even the person who sent one: they are read in the Supabase
-- dashboard (Table Editor → feedback).
--
-- Safe to run again.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  kind text not null check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  -- An email address to reply to, if they gave one.
  contact text check (contact is null or char_length(contact) <= 200),
  -- Who sent it, when they were signed in.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- What they were using: app version, screen and browser, to reproduce a bug.
  app_version text check (app_version is null or char_length(app_version) <= 40),
  screen text check (screen is null or char_length(screen) <= 200),
  device text check (device is null or char_length(device) <= 400)
);

comment on table public.feedback is 'Bug reports and ideas sent from the app. Read here; never served back to anyone.';

create index if not exists feedback_newest on public.feedback (sent_at desc);

alter table public.feedback enable row level security;

revoke all on table public.feedback from anon, authenticated;
grant insert on table public.feedback to anon, authenticated;

drop policy if exists "Anyone can send feedback" on public.feedback;
create policy "Anyone can send feedback"
on public.feedback for insert to anon, authenticated
-- Signed in, it can only be sent as yourself; signed out, as nobody.
with check (user_id is not distinct from auth.uid());
