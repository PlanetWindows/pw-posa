alter table public.poses add column if not exists client_email text;

create table if not exists public.ddt_documents (
  id uuid primary key default gen_random_uuid(),
  pose_id uuid references public.poses(id) on delete cascade,
  assistance_id uuid references public.assistances(id) on delete cascade,
  original_path text not null,
  original_name text not null,
  original_mime text not null default 'application/pdf',
  signature_page integer not null default 1 check(signature_page > 0),
  installer_signature_area jsonb,
  client_signature_area jsonb,
  signed_path text,
  signed_name text,
  signed_at timestamptz,
  signed_by uuid references auth.users(id),
  email_status text not null default 'pending' check(email_status in ('pending','sent','failed','retry')),
  email_last_error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ddt_one_parent check ((pose_id is not null)::int + (assistance_id is not null)::int = 1)
);
create unique index if not exists ddt_one_per_pose on public.ddt_documents(pose_id) where pose_id is not null;
create unique index if not exists ddt_one_per_assistance on public.ddt_documents(assistance_id) where assistance_id is not null;

create or replace function public.can_access_ddt(p_ddt_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.ddt_documents d
    left join public.poses p on p.id=d.pose_id
    left join public.assistances a on a.id=d.assistance_id
    where d.id=p_ddt_id and (
      public.is_office_user()
      or (p.id is not null and public.can_access_pose(p.id))
      or (a.id is not null and public.can_access_assistance(a.id))
    )
  );
$$;

create or replace function public.prepare_ddt_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  new.updated_at:=now();
  if tg_op='INSERT' and new.created_by is null then new.created_by:=auth.uid(); end if;
  return new;
end; $$;
drop trigger if exists ddt_prepare_change on public.ddt_documents;
create trigger ddt_prepare_change before insert or update on public.ddt_documents for each row execute function public.prepare_ddt_change();

create or replace function public.protect_ddt_office_fields() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if public.is_installer() then
    if row(new.pose_id,new.assistance_id,new.original_path,new.original_name,new.original_mime,new.signature_page,new.installer_signature_area,new.client_signature_area,new.created_by)
       is distinct from row(old.pose_id,old.assistance_id,old.original_path,old.original_name,old.original_mime,old.signature_page,old.installer_signature_area,old.client_signature_area,old.created_by)
    then raise exception 'Il posatore non può modificare il DDT originale o le aree firma'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists ddt_protect_office_fields on public.ddt_documents;
create trigger ddt_protect_office_fields before update on public.ddt_documents for each row execute function public.protect_ddt_office_fields();

alter table public.ddt_documents enable row level security;
drop policy if exists ddt_select on public.ddt_documents;
create policy ddt_select on public.ddt_documents for select using(public.can_access_ddt(id));
drop policy if exists ddt_office_insert on public.ddt_documents;
create policy ddt_office_insert on public.ddt_documents for insert with check(public.is_office_scheduler());
drop policy if exists ddt_office_update on public.ddt_documents;
create policy ddt_office_update on public.ddt_documents for update using(public.is_office_scheduler()) with check(public.is_office_scheduler());
drop policy if exists ddt_office_delete on public.ddt_documents;
create policy ddt_office_delete on public.ddt_documents for delete using(public.is_office_scheduler());
drop policy if exists ddt_installer_update on public.ddt_documents;
create policy ddt_installer_update on public.ddt_documents for update using(public.is_installer() and public.can_access_ddt(id)) with check(public.is_installer() and public.can_access_ddt(id));

insert into storage.buckets(id,name,public) values('pw-ddt-private','pw-ddt-private',false) on conflict(id) do update set public=false;
drop policy if exists pw_ddt_select on storage.objects;
create policy pw_ddt_select on storage.objects for select using(bucket_id='pw-ddt-private' and public.can_access_ddt(((storage.foldername(name))[1])::uuid));
drop policy if exists pw_ddt_office_insert on storage.objects;
create policy pw_ddt_office_insert on storage.objects for insert with check(bucket_id='pw-ddt-private' and public.is_office_scheduler());
drop policy if exists pw_ddt_installer_insert on storage.objects;
create policy pw_ddt_installer_insert on storage.objects for insert with check(bucket_id='pw-ddt-private' and public.is_installer() and public.can_access_ddt(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2]='signed');
drop policy if exists pw_ddt_office_update on storage.objects;
create policy pw_ddt_office_update on storage.objects for update using(bucket_id='pw-ddt-private' and public.is_office_scheduler()) with check(bucket_id='pw-ddt-private' and public.is_office_scheduler());
drop policy if exists pw_ddt_office_delete on storage.objects;
create policy pw_ddt_office_delete on storage.objects for delete using(bucket_id='pw-ddt-private' and public.is_office_scheduler());