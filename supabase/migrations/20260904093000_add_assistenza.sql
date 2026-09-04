-- PW Posa - Assistenza. Migrazione additiva: non modifica i dati o le tabelle delle pose esistenti.
create table if not exists public.assistances (
  id uuid primary key default gen_random_uuid(), protocol_order text not null, client_name text not null, client_phone text, client_email text not null,
  team_id uuid not null references public.teams(id), address text not null, city text, postal_code text,
  scheduled_date date not null, scheduled_end_date date not null, start_time time not null, end_time time,
  issue_description text not null, warranty boolean not null, payment_required boolean not null, payment_amount numeric(12,2),
  summary_document_path text, summary_document_name text, summary_document_mime text,
  signed_document_path text, signed_document_name text, signer_name text, signed_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed','retry')), email_last_error text,
  final_issue_description text, problem_resolved boolean, intervention text, final_notes text, final_report_path text, final_report_name text,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed')),
  completed_by uuid references auth.users(id), completed_at timestamptz, created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint assistance_payment_amount_check check ((payment_required=false and payment_amount is null) or (payment_required=true and payment_amount is not null and payment_amount>=0))
);
create table if not exists public.assistance_dates (id uuid primary key default gen_random_uuid(), assistance_id uuid not null references public.assistances(id) on delete cascade, assistance_date date not null, created_at timestamptz not null default now(), unique(assistance_id,assistance_date));
create table if not exists public.assistance_photos (id uuid primary key default gen_random_uuid(), assistance_id uuid not null references public.assistances(id) on delete cascade, storage_path text not null, file_name text not null, mime_type text, size_bytes bigint, uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now());
create index if not exists assistances_team_date_idx on public.assistances(team_id,scheduled_date);
create index if not exists assistance_dates_date_idx on public.assistance_dates(assistance_date);
create index if not exists assistance_photos_assistance_idx on public.assistance_photos(assistance_id);

create or replace function public.can_access_assistance(p_assistance_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.assistances a where a.id=p_assistance_id and (public.is_office_user() or public.user_belongs_to_team(a.team_id)));
$$;
create or replace function public.prepare_assistance_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.updated_at:=now(); if tg_op='INSERT' and new.created_by is null then new.created_by:=auth.uid(); end if; if new.updated_by is null then new.updated_by:=auth.uid(); end if;
  if new.payment_required=false then new.payment_amount:=null; end if; if new.scheduled_end_date<new.scheduled_date then raise exception 'La data finale non può precedere la data iniziale'; end if; return new;
end; $$;
drop trigger if exists assistances_prepare_change on public.assistances;
create trigger assistances_prepare_change before insert or update on public.assistances for each row execute function public.prepare_assistance_change();

create or replace function public.protect_assistance_office_fields() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if public.is_installer() then
    if row(new.protocol_order,new.client_name,new.client_phone,new.client_email,new.team_id,new.address,new.city,new.postal_code,new.scheduled_date,new.scheduled_end_date,new.start_time,new.end_time,new.issue_description,new.warranty,new.payment_required,new.payment_amount,new.summary_document_path,new.summary_document_name,new.summary_document_mime,new.signed_document_path,new.signed_document_name,new.signer_name,new.signed_at,new.email_status,new.email_last_error,new.created_by)
       is distinct from row(old.protocol_order,old.client_name,old.client_phone,old.client_email,old.team_id,old.address,old.city,old.postal_code,old.scheduled_date,old.scheduled_end_date,old.start_time,old.end_time,old.issue_description,old.warranty,old.payment_required,old.payment_amount,old.summary_document_path,old.summary_document_name,old.summary_document_mime,old.signed_document_path,old.signed_document_name,old.signer_name,old.signed_at,old.email_status,old.email_last_error,old.created_by)
    then raise exception 'Il posatore non può modificare i dati inseriti dall''Ufficio'; end if;
  end if; return new;
end; $$;
drop trigger if exists assistances_protect_office_fields on public.assistances;
create trigger assistances_protect_office_fields before update on public.assistances for each row execute function public.protect_assistance_office_fields();

alter table public.assistances enable row level security; alter table public.assistance_dates enable row level security; alter table public.assistance_photos enable row level security;
drop policy if exists assistances_select on public.assistances; create policy assistances_select on public.assistances for select using(public.can_access_assistance(id));
drop policy if exists assistances_office_insert on public.assistances; create policy assistances_office_insert on public.assistances for insert with check(public.is_office_scheduler());
drop policy if exists assistances_office_update on public.assistances; create policy assistances_office_update on public.assistances for update using(public.is_office_scheduler()) with check(public.is_office_scheduler());
drop policy if exists assistances_installer_update on public.assistances; create policy assistances_installer_update on public.assistances for update using(public.is_installer() and public.user_belongs_to_team(team_id)) with check(public.is_installer() and public.user_belongs_to_team(team_id));
drop policy if exists assistances_office_delete on public.assistances; create policy assistances_office_delete on public.assistances for delete using(public.is_office_scheduler());
drop policy if exists assistance_dates_select on public.assistance_dates; create policy assistance_dates_select on public.assistance_dates for select using(public.can_access_assistance(assistance_id));
drop policy if exists assistance_dates_office_all on public.assistance_dates; create policy assistance_dates_office_all on public.assistance_dates for all using(public.is_office_scheduler()) with check(public.is_office_scheduler());
drop policy if exists assistance_photos_select on public.assistance_photos; create policy assistance_photos_select on public.assistance_photos for select using(public.can_access_assistance(assistance_id));
drop policy if exists assistance_photos_office_all on public.assistance_photos; create policy assistance_photos_office_all on public.assistance_photos for all using(public.is_office_scheduler()) with check(public.is_office_scheduler());

insert into storage.buckets(id,name,public) values('pw-assistance-private','pw-assistance-private',false) on conflict(id) do update set public=false;
drop policy if exists pw_assistance_select on storage.objects; create policy pw_assistance_select on storage.objects for select using(bucket_id='pw-assistance-private' and public.can_access_assistance(((storage.foldername(name))[1])::uuid));
drop policy if exists pw_assistance_insert on storage.objects; create policy pw_assistance_insert on storage.objects for insert with check(bucket_id='pw-assistance-private' and (public.is_office_scheduler() or (public.is_installer() and public.can_access_assistance(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2]='reports')));
drop policy if exists pw_assistance_update on storage.objects; create policy pw_assistance_update on storage.objects for update using(bucket_id='pw-assistance-private' and public.is_office_scheduler()) with check(bucket_id='pw-assistance-private' and public.is_office_scheduler());
drop policy if exists pw_assistance_delete on storage.objects; create policy pw_assistance_delete on storage.objects for delete using(bucket_id='pw-assistance-private' and public.is_office_scheduler());

create or replace function public.notify_assistance_team() returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_title text;
begin
  if tg_op='INSERT' then v_type:='assistance_assigned';v_title:='Nuova assistenza assegnata';
  elsif old.team_id is distinct from new.team_id or old.scheduled_date is distinct from new.scheduled_date or old.scheduled_end_date is distinct from new.scheduled_end_date or old.start_time is distinct from new.start_time or old.end_time is distinct from new.end_time or old.protocol_order is distinct from new.protocol_order or old.issue_description is distinct from new.issue_description then v_type:='assistance_updated';v_title:='Assistenza aggiornata'; else return new; end if;
  insert into public.notifications(recipient_id,notification_type,title,message)
  select distinct tm.user_id,v_type,v_title,coalesce(new.protocol_order,'Assistenza')||' · '||new.client_name from public.team_members tm join public.profiles p on p.id=tm.user_id
  where tm.team_id=new.team_id and p.role='installer' and p.active=true and not exists(select 1 from public.notifications n where n.recipient_id=tm.user_id and n.notification_type=v_type and n.message=coalesce(new.protocol_order,'Assistenza')||' · '||new.client_name and n.created_at>now()-interval '10 seconds'); return new;
end; $$;
drop trigger if exists assistances_notify_team on public.assistances; create trigger assistances_notify_team after insert or update on public.assistances for each row execute function public.notify_assistance_team();
create or replace function public.notify_office_assistance_completed() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.status='completed' and old.status is distinct from new.status then insert into public.notifications(recipient_id,notification_type,title,message) select p.id,'assistance_completed','Assistenza completata',coalesce(new.protocol_order,'Assistenza')||' · '||new.client_name from public.profiles p where p.role in('office_scheduler','office_viewer') and p.active=true; end if; return new; end; $$;
drop trigger if exists assistances_notify_office_completed on public.assistances; create trigger assistances_notify_office_completed after update of status on public.assistances for each row execute function public.notify_office_assistance_completed();

create table if not exists public.assistance_push_events(id uuid primary key default gen_random_uuid(),assistance_id uuid not null references public.assistances(id) on delete cascade,audience text not null check(audience in('team','office')),event_type text not null check(event_type in('assigned','updated','completed')),created_at timestamptz not null default now(),processed_at timestamptz,status text not null default 'pending',sent_count integer not null default 0,failed_count integer not null default 0);
alter table public.assistance_push_events enable row level security;
create or replace function public.enqueue_assistance_push() returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_event_id uuid; v_audience text; v_event_type text;
begin
  if tg_op='INSERT' then v_audience:='team';v_event_type:='assigned';
  elsif new.status='completed' and old.status is distinct from new.status then v_audience:='office';v_event_type:='completed';
  elsif old.team_id is distinct from new.team_id or old.scheduled_date is distinct from new.scheduled_date or old.scheduled_end_date is distinct from new.scheduled_end_date or old.start_time is distinct from new.start_time or old.end_time is distinct from new.end_time or old.protocol_order is distinct from new.protocol_order or old.issue_description is distinct from new.issue_description then v_audience:='team';v_event_type:='updated'; else return new; end if;
  insert into public.assistance_push_events(assistance_id,audience,event_type) values(new.id,v_audience,v_event_type) returning id into v_event_id;
  perform net.http_post(url:='https://vbpinzygwexuvwomnmbt.supabase.co/functions/v1/send-assistance-push',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('event_id',v_event_id)); return new;
end; $$;
drop trigger if exists assistances_auto_push on public.assistances; create trigger assistances_auto_push after insert or update on public.assistances for each row execute function public.enqueue_assistance_push();