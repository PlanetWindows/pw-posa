create table if not exists public.pw_posa_client_directory (
  source_id integer primary key,
  client_name text not null check (btrim(client_name) <> ''),
  client_phone text,
  client_email text
);
alter table public.pw_posa_client_directory enable row level security;
revoke all on public.pw_posa_client_directory from public, anon, authenticated;
grant select on public.pw_posa_client_directory to authenticated;
drop policy if exists office_reads_directory on public.pw_posa_client_directory;
create policy office_reads_directory on public.pw_posa_client_directory
  for select to authenticated using ((select public.is_office_scheduler()));

create or replace function public.pw_posa_search_clients(search_text text)
returns table(client_name text, client_phone text, client_email text)
language sql stable security invoker set search_path = ''
as $$
  select d.client_name, d.client_phone, d.client_email
  from public.pw_posa_client_directory d
  where length(btrim(search_text)) <= 120
    and (btrim(search_text) = '' or strpos(lower(d.client_name), lower(btrim(search_text))) > 0)
  order by lower(d.client_name), d.source_id
  limit 100;
$$;
revoke all on function public.pw_posa_search_clients(text) from public, anon;
grant execute on function public.pw_posa_search_clients(text) to authenticated;
