-- Top rated: what everyone on Crumbs Up has scored, added up.
--
-- A journal stays private: nobody can read anyone else's rows, and that does
-- not change here. What this adds is one function that hands back totals —
-- for each cookie at each bakery, how many people rated it and what they
-- scored it on average. It gives out no names, no account ids, no notes, no
-- photos and no dates, only the cookie, the bakery, the town and the scores.
--
-- Anyone can leave: a row in community_optouts takes that person's ratings
-- out of every total.
--
-- Safe to run again.

create table if not exists public.community_optouts (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  since timestamptz not null default now()
);

comment on table public.community_optouts is
  'People whose ratings are left out of the Top rated totals.';

alter table public.community_optouts enable row level security;

revoke all on table public.community_optouts from anon, authenticated;
grant select, insert, delete on table public.community_optouts to authenticated;

drop policy if exists "People see their own choice" on public.community_optouts;
create policy "People see their own choice"
on public.community_optouts for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "People leave for themselves" on public.community_optouts;
create policy "People leave for themselves"
on public.community_optouts for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "People come back for themselves" on public.community_optouts;
create policy "People come back for themselves"
on public.community_optouts for delete to authenticated
using ((select auth.uid()) = user_id);

-- The totals. One row per cookie-at-a-bakery-in-a-town.
--
-- Names are matched without regard to capitals or stray spaces, and shown the
-- way most people typed them. Someone who rated the same cookie three times
-- counts once, at their own average, so nobody can stack the list.
create or replace function public.community_cookies(how_many integer default 500)
returns table (
  cookie_type text,
  bakery text,
  city text,
  state text,
  raters integer,
  taste numeric,
  texture numeric,
  appearance numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with rated as (
    select
      c.user_id,
      btrim(c.data ->> 'cookieType') as cookie_type,
      btrim(c.data ->> 'bakery') as bakery,
      btrim(coalesce(c.data ->> 'city', '')) as city,
      c.data ->> 'state' as state,
      (c.data -> 'scores' ->> 'taste')::numeric as taste,
      (c.data -> 'scores' ->> 'texture')::numeric as texture,
      (c.data -> 'scores' ->> 'appearance')::numeric as appearance
    from public.cookies c
    where not c.deleted
      and not exists (select 1 from public.community_optouts o where o.user_id = c.user_id)
      and coalesce(btrim(c.data ->> 'cookieType'), '') <> ''
      and coalesce(btrim(c.data ->> 'bakery'), '') <> ''
      and jsonb_typeof(c.data -> 'scores' -> 'taste') = 'number'
      and jsonb_typeof(c.data -> 'scores' -> 'texture') = 'number'
      and jsonb_typeof(c.data -> 'scores' -> 'appearance') = 'number'
  ),
  per_person as (
    select
      user_id,
      lower(cookie_type) as type_key,
      lower(bakery) as bakery_key,
      lower(city) as city_key,
      state,
      -- Under the plain "C" ordering capitals come first, so of two spellings
      -- the capitalised one is kept: "Portland" over "portland".
      min(cookie_type collate "C") as cookie_type,
      min(bakery collate "C") as bakery,
      min(city collate "C") as city,
      avg(taste) as taste,
      avg(texture) as texture,
      avg(appearance) as appearance
    from rated
    group by user_id, lower(cookie_type), lower(bakery), lower(city), state
  )
  select
    mode() within group (order by p.cookie_type collate "C") as cookie_type,
    mode() within group (order by p.bakery collate "C") as bakery,
    mode() within group (order by p.city collate "C") as city,
    p.state,
    count(*)::integer as raters,
    round(avg(p.taste), 2) as taste,
    round(avg(p.texture), 2) as texture,
    round(avg(p.appearance), 2) as appearance
  from per_person p
  group by p.type_key, p.bakery_key, p.city_key, p.state
  order by count(*) desc, avg(p.taste + p.texture + p.appearance) desc
  limit greatest(1, least(coalesce(how_many, 500), 2000));
$$;

comment on function public.community_cookies(integer) is
  'Everyone''s ratings added up per cookie. Totals only: no people, notes, photos or dates.';

-- The totals are for everyone, signed in or not.
revoke all on function public.community_cookies(integer) from public;
grant execute on function public.community_cookies(integer) to anon, authenticated;
