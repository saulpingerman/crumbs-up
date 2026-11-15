-- Top rated counts everyone who is signed in.
--
-- There was a switch that took a person's ratings out of the totals, and a
-- table of who had used it. Both are gone: the totals are what everyone has
-- scored, with no exceptions. What they give away is unchanged: no names,
-- no account ids, no notes, no photos and no dates.
--
-- Safe to run again.

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

drop table if exists public.community_optouts;
