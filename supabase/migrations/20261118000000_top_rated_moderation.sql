-- Top rated: taking things out of it.
--
-- Its names were typed by people, so someone can type something offensive.
-- In the app, anyone can report an entry (it arrives in the feedback table,
-- and by email if that is set up) and hide it from their own list. This
-- adds the owner's side:
--
--   community_removed        rows added here leave Top rated for everyone.
--                            Give the bakery; add the cookie, town or state
--                            to narrow it (left empty, they match anything).
--   community_blocked_words  names containing one of these words, as a whole
--                            word, never show. Add or remove words freely.
--
-- Both are edited in the Supabase dashboard (Table Editor); the app can't
-- read or change them.
--
-- Safe to run again.

create table if not exists public.community_removed (
  id bigint generated always as identity primary key,
  bakery text not null,
  cookie_type text,
  city text,
  state text,
  removed_at timestamptz not null default now(),
  note text
);

comment on table public.community_removed is
  'Entries taken out of Top rated for everyone. Bakery required; cookie, city and state narrow it.';

alter table public.community_removed enable row level security;
revoke all on table public.community_removed from anon, authenticated;

create table if not exists public.community_blocked_words (
  word text primary key check (word = lower(btrim(word)) and word <> '')
);

comment on table public.community_blocked_words is
  'Names containing one of these as a whole word never show in Top rated. Lowercase.';

alter table public.community_blocked_words enable row level security;
revoke all on table public.community_blocked_words from anon, authenticated;

-- A starting list: common profanity and slurs. Add to it as needed.
insert into public.community_blocked_words (word) values
  ('fuck'), ('fucking'), ('fucker'), ('motherfucker'), ('shit'), ('shitty'), ('bullshit'),
  ('cunt'), ('pussy'), ('bitch'), ('bitches'), ('whore'), ('slut'), ('twat'), ('wanker'),
  ('asshole'), ('nigger'), ('nigga'), ('faggot'), ('fag'), ('retard'), ('retarded'),
  ('chink'), ('spic'), ('kike'), ('tranny'), ('dyke'), ('nazi'), ('hitler')
on conflict (word) do nothing;

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
      -- Taken off by the owner, for everyone.
      and not exists (
        select 1 from public.community_removed r
        where lower(btrim(c.data ->> 'bakery')) = lower(btrim(r.bakery))
          and (r.cookie_type is null or lower(btrim(c.data ->> 'cookieType')) = lower(btrim(r.cookie_type)))
          and (r.city is null or lower(btrim(coalesce(c.data ->> 'city', ''))) = lower(btrim(r.city)))
          and (r.state is null or c.data ->> 'state' = r.state)
      )
      -- Names with a blocked word in them never show.
      and not exists (
        select 1 from public.community_blocked_words w
        where lower(concat_ws(' ', c.data ->> 'cookieType', c.data ->> 'bakery', c.data ->> 'city'))
          ~ ('\m' || w.word || '\M')
      )
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
