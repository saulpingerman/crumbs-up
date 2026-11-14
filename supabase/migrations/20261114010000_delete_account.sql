-- Lets a signed-in person delete their own account from inside the app.
--
-- Removing the account removes their journal with it (the cookies table is
-- tied to the account). Their photos are files, not rows, so the app removes
-- those through the storage service first.
--
-- Safe to run again.

create or replace function public.delete_my_account(really boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in';
  end if;
  -- Called with `false`, this only says "yes, deleting accounts is possible
  -- here": the app asks before it starts removing anything.
  if not really then
    return false;
  end if;
  delete from auth.users where id = (select auth.uid());
  return true;
end;
$$;

comment on function public.delete_my_account(boolean) is
  'Deletes the calling person''s own account, and their journal with it.';

-- Only someone signed in may call it, and it only ever acts on themselves.
revoke all on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;
