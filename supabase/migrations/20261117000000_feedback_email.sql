-- Feedback by email: each message sent from the app's feedback page is also
-- emailed to help@crumbs-up.com, through Resend (which already sends the
-- app's account emails).
--
-- The Resend API key is kept in Supabase Vault, never in the repo. Until it
-- is added, nothing is emailed and feedback is only kept in the table. To
-- add it, run once in the SQL Editor (a key with "Sending access"):
--
--   select vault.create_secret('re_…', 'resend_feedback_key', 'Emails feedback to help@');
--
-- An email that can't be sent never stops the feedback being saved.
--
-- Safe to run again.

create extension if not exists pg_net;

create or replace function public.email_feedback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  api_key text;
  recent integer;
  reply_to text;
  label text;
  body text;
begin
  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'resend_feedback_key'
  limit 1;
  if api_key is null or api_key = '' then
    return null;
  end if;

  -- A flood of messages is someone hammering the form: keep them, but stop
  -- filling the inbox.
  select count(*) into recent
  from public.feedback
  where sent_at > now() - interval '1 hour';
  if recent > 30 then
    return null;
  end if;

  -- Reply goes straight to the sender when they left a usable address.
  if new.contact ~* '^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$' then
    reply_to := new.contact;
  end if;

  label := case new.kind when 'bug' then 'Bug' when 'idea' then 'Idea' else 'Feedback' end;
  body := new.message
    || E'\n\n----\n'
    || label
    || E'\nReply to: ' || coalesce(reply_to, 'no address given')
    || E'\nSigned in: ' || case when new.user_id is null then 'no' else 'yes' end
    || E'\nScreen: ' || coalesce(new.screen, '?')
    || E'\nApp version: ' || coalesce(new.app_version, '?')
    || E'\nDevice: ' || coalesce(new.device, '?')
    || E'\nSent: ' || to_char(new.sent_at at time zone 'America/New_York', 'Mon FMDD, YYYY FMHH12:MI AM')
    || ' (Eastern)';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_strip_nulls(jsonb_build_object(
      'from', 'Crumbs Up feedback <feedback@crumbs-up.com>',
      'to', jsonb_build_array('help@crumbs-up.com'),
      'reply_to', reply_to,
      'subject', label || ': ' || left(regexp_replace(btrim(new.message), '\s+', ' ', 'g'), 70),
      'text', body
    )),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  -- Never lose a message because its email couldn't go.
  return null;
end;
$$;

comment on function public.email_feedback() is
  'Emails each new feedback message to help@crumbs-up.com via Resend (key in Vault as resend_feedback_key).';

revoke all on function public.email_feedback() from public, anon, authenticated;

drop trigger if exists email_feedback on public.feedback;
create trigger email_feedback
after insert on public.feedback
for each row execute function public.email_feedback();
