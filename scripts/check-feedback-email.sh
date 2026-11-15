#!/usr/bin/env bash
# Checks, against the local Supabase (`npx supabase start`), that a feedback
# message sets off an email to help@crumbs-up.com, and that nothing is sent
# without a Resend key. Everything happens inside one transaction that is
# rolled back, so no email ever leaves and any real key is left as it was.
set -euo pipefail
db="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:24322/postgres}"

psql "$db" -v ON_ERROR_STOP=1 -q <<'SQL'
begin;

delete from vault.secrets where name = 'resend_feedback_key';
select vault.create_secret('re_dummy_for_the_check', 'resend_feedback_key');

insert into public.feedback (kind, message, contact, screen, app_version, device)
values ('bug', E'Checking   that feedback\nis emailed', 'someone@example.com', '/check', 'check', 'psql');

do $$
declare
  request record;
  sent jsonb;
begin
  select * into request
  from net.http_request_queue
  where url = 'https://api.resend.com/emails'
  order by id desc
  limit 1;
  if not found then
    raise exception 'No email was set off by the feedback';
  end if;
  sent := convert_from(request.body, 'UTF8')::jsonb;
  if request.headers ->> 'Authorization' is distinct from 'Bearer re_dummy_for_the_check' then
    raise exception 'Not sent with the key from Vault: %', request.headers;
  end if;
  if sent -> 'to' <> '["help@crumbs-up.com"]'::jsonb then
    raise exception 'Not sent to help@: %', sent;
  end if;
  if sent ->> 'reply_to' is distinct from 'someone@example.com' then
    raise exception 'Reply-To is not the sender: %', sent;
  end if;
  if sent ->> 'subject' <> 'Bug: Checking that feedback is emailed' then
    raise exception 'Unexpected subject: %', sent ->> 'subject';
  end if;
  if position('Screen: /check' in sent ->> 'text') = 0 then
    raise exception 'The details are missing: %', sent ->> 'text';
  end if;
  raise notice 'With a key: emailed "%"', sent ->> 'subject';
end $$;

-- No usable reply address: no Reply-To.
insert into public.feedback (kind, message, contact) values ('idea', 'No address', 'not an address');
do $$
begin
  if (select convert_from(body, 'UTF8')::jsonb ? 'reply_to'
      from net.http_request_queue order by id desc limit 1) then
    raise exception 'Reply-To set from something that is not an address';
  end if;
end $$;

-- Without a key, feedback is kept and nothing is sent.
delete from vault.secrets where name = 'resend_feedback_key';
create temporary table before_count as select count(*) as n from net.http_request_queue;
insert into public.feedback (kind, message) values ('other', 'No key');
do $$
begin
  if (select count(*) from net.http_request_queue) <> (select n from before_count) then
    raise exception 'An email was set off with no key';
  end if;
  raise notice 'Without a key: kept, not emailed';
end $$;

rollback;
SQL
echo "✓ Feedback emails are set off as they should be"
