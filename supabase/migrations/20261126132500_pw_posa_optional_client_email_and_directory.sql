alter table public.assistances alter column client_email drop not null;

create or replace function public.pw_posa_search_clients(search_text text)
returns table(client_name text, client_phone text, client_email text)
language sql stable security invoker set search_path = ''
as $$
  with contacts as (
    select p.client_name, p.client_phone, p.client_email, p.updated_at
    from public.poses p
    where p.external_request_id is null
    union all
    select a.client_name, a.client_phone, a.client_email, a.updated_at
    from public.assistances a
  ), matches as (
    select *, lower(btrim(client_name)) as normalized_name
    from contacts
    where public.is_office_scheduler()
      and length(btrim(search_text)) between 2 and 120
      and strpos(lower(client_name), lower(btrim(search_text))) > 0
  )
  select m.client_name, m.client_phone, m.client_email
  from (
    select distinct on (normalized_name, nullif(btrim(client_phone), ''), nullif(lower(btrim(client_email)), ''))
      normalized_name, client_name, client_phone, client_email, updated_at
    from matches
    order by normalized_name, nullif(btrim(client_phone), ''), nullif(lower(btrim(client_email)), ''),
             updated_at desc, client_name
  ) m
  order by strpos(m.normalized_name, lower(btrim(search_text))), m.normalized_name,
           m.updated_at desc, m.client_phone, m.client_email
  limit 12;
$$;

revoke all on function public.pw_posa_search_clients(text) from public, anon;
grant execute on function public.pw_posa_search_clients(text) to authenticated;

create or replace function public.pw_posa_complete_assistance_without_email(assistance_uuid uuid)
returns boolean
language sql volatile security invoker set search_path = ''
as $$
  with completed as (
    update public.assistances a
    set status = 'completed', completed_by = auth.uid(), completed_at = now(), updated_by = auth.uid()
    where a.id = assistance_uuid
      and public.is_installer()
      and nullif(btrim(a.client_email), '') is null
      and a.final_report_path is not null
      and not exists (
        select 1 from public.ddt_documents d
        where d.assistance_id = a.id and d.signed_path is null
      )
    returning a.id
  )
  select exists(select 1 from completed);
$$;

revoke all on function public.pw_posa_complete_assistance_without_email(uuid) from public, anon;
grant execute on function public.pw_posa_complete_assistance_without_email(uuid) to authenticated;
