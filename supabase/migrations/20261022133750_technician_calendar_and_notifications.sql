-- PW Posa: technician appointments, private attachments and explicit notifications.
-- Existing installation, assistance, DDT and report data are preserved.
create schema if not exists pw_posa;
revoke all on schema pw_posa from public, anon;
grant usage on schema pw_posa to authenticated, service_role;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('office_scheduler','office_viewer','installer','technician'));

create table public.technician_activities (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null check(activity_type in ('survey','site_visit','note')),
  technician_id uuid not null references public.profiles(id),
  first_name text not null check(length(btrim(first_name)) between 1 and 120),
  last_name text not null default '' check(length(last_name)<=120),
  address text not null default '' check(length(address)<=300),
  province text not null default '',
  postal_code text not null default '',
  scheduled_date date not null,
  start_time time,
  status text not null default 'todo' check(status in ('todo','completed')),
  office_notes text check(length(office_notes)<=20000),
  technician_notes text check(length(technician_notes)<=20000),
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  updated_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint technician_activity_fields check (
    (activity_type='note' and length(btrim(coalesce(office_notes,'')))>0 and start_time is null)
    or (activity_type in ('survey','site_visit') and length(btrim(last_name))>0 and length(btrim(address))>0 and province ~ '^[A-Z]{2}$' and postal_code ~ '^[0-9]{5}$' and start_time is not null)
  )
);
create index technician_activities_schedule_idx on public.technician_activities(technician_id,scheduled_date,start_time);
create index technician_activities_todo_idx on public.technician_activities(technician_id,status,activity_type);
create index technician_activities_created_by_idx on public.technician_activities(created_by);
create index technician_activities_updated_by_idx on public.technician_activities(updated_by);
alter table public.technician_activities enable row level security;
revoke all on public.technician_activities from anon;
grant select,insert,update,delete on public.technician_activities to authenticated;

create function pw_posa.can_read_technical(assigned_to uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and (public.is_office_user() or (public.current_app_role()='technician' and assigned_to=auth.uid()));
$$;
create function pw_posa.can_edit_technical(assigned_to uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and (public.is_office_scheduler() or (public.current_app_role()='technician' and assigned_to=auth.uid()));
$$;
create policy technician_activities_select on public.technician_activities for select to authenticated using(pw_posa.can_read_technical(technician_id));
create policy technician_activities_insert on public.technician_activities for insert to authenticated with check(pw_posa.can_edit_technical(technician_id) and (public.is_office_scheduler() or activity_type<>'note'));
create policy technician_activities_update on public.technician_activities for update to authenticated using(pw_posa.can_edit_technical(technician_id)) with check(pw_posa.can_edit_technical(technician_id));
create policy technician_activities_delete on public.technician_activities for delete to authenticated using(public.is_office_scheduler());

create function pw_posa.prepare_technical_activity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  if not exists(select 1 from public.profiles where id=new.technician_id and role='technician' and active) then raise exception 'Seleziona un tecnico attivo'; end if;
  if tg_op='UPDATE' then
    new.id:=old.id;new.created_at:=old.created_at;new.created_by:=old.created_by;
    if not public.is_office_scheduler() then
      if new.technician_id<>old.technician_id or new.activity_type<>old.activity_type or new.office_notes is distinct from old.office_notes then raise exception 'Solo l’ufficio può modificare assegnazione, tipo e note ufficio'; end if;
      if old.activity_type='note' and (new.first_name<>old.first_name or new.last_name<>old.last_name or new.address<>old.address or new.province<>old.province or new.postal_code<>old.postal_code or new.scheduled_date<>old.scheduled_date or new.start_time is distinct from old.start_time) then raise exception 'La data e la richiesta della telefonata restano registrate dall’ufficio'; end if;
    end if;
  else
    new.created_by:=auth.uid();new.created_at:=now();
    if not public.is_office_scheduler() and new.activity_type='note' then raise exception 'Le richieste di richiamata sono inserite dall’ufficio'; end if;
  end if;
  new.updated_by:=auth.uid();new.updated_at:=now();new.province:=upper(btrim(new.province));
  new.completed_at:=case when new.status='completed' then coalesce(case when tg_op='UPDATE' then old.completed_at end,now()) else null end;
  return new;
end; $$;
create trigger technician_activities_prepare before insert or update on public.technician_activities for each row execute function pw_posa.prepare_technical_activity();

create table public.technician_attachments (
 id uuid primary key default gen_random_uuid(),
 activity_id uuid not null references public.technician_activities(id) on delete cascade,
 storage_path text not null unique,
 file_name text not null check(length(file_name) between 1 and 500),
 mime_type text,
 size_bytes bigint not null check(size_bytes between 0 and 26214400),
 uploaded_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(),
 constraint technician_attachment_path check(split_part(storage_path,'/',1)=activity_id::text and split_part(storage_path,'/',2) ~ '^[0-9a-f-]{36}$' and split_part(storage_path,'/',3)<>'' and storage_path !~ '(^|/)\.\.(/|$)')
);
create index technician_attachments_activity_idx on public.technician_attachments(activity_id);
create index technician_attachments_uploaded_by_idx on public.technician_attachments(uploaded_by);
alter table public.technician_attachments enable row level security;
revoke all on public.technician_attachments from anon;
grant select,insert,delete on public.technician_attachments to authenticated;
create policy technician_attachments_select on public.technician_attachments for select to authenticated using(exists(select 1 from public.technician_activities a where a.id=activity_id));
create policy technician_attachments_insert on public.technician_attachments for insert to authenticated with check(uploaded_by=(select auth.uid()) and exists(select 1 from public.technician_activities a where a.id=activity_id and pw_posa.can_edit_technical(a.technician_id)));
create policy technician_attachments_delete on public.technician_attachments for delete to authenticated using(public.is_office_scheduler() or (uploaded_by=(select auth.uid()) and exists(select 1 from public.technician_activities a where a.id=activity_id and pw_posa.can_edit_technical(a.technician_id))));
insert into storage.buckets(id,name,public,file_size_limit) values('pw-technician-private','pw-technician-private',false,26214400);
create function pw_posa.can_read_technical_file(object_path text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.technician_activities a where a.id=case when split_part(object_path,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(object_path,'/',1)::uuid end);
$$;
create function pw_posa.can_write_technical_file(object_path text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.technician_activities a where a.id=case when split_part(object_path,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(object_path,'/',1)::uuid end and pw_posa.can_edit_technical(a.technician_id));
$$;
create policy technician_storage_select on storage.objects for select to authenticated using(bucket_id='pw-technician-private' and pw_posa.can_read_technical_file(name));
create policy technician_storage_insert on storage.objects for insert to authenticated with check(bucket_id='pw-technician-private' and pw_posa.can_write_technical_file(name));
create policy technician_storage_delete on storage.objects for delete to authenticated using(bucket_id='pw-technician-private' and (public.is_office_scheduler() or (owner_id=(select auth.uid())::text and pw_posa.can_write_technical_file(name))));

-- Keep dates and all child resources within the same assignment boundary.
create or replace function public.can_access_pose(p_pose_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.is_office_user() or (public.is_installer() and exists(select 1 from public.poses p join public.team_members tm on tm.team_id=p.team_id where p.id=p_pose_id and tm.user_id=auth.uid() and tm.active)));
$$;
create or replace function public.can_access_assistance(p_assistance_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.assistances a where a.id=p_assistance_id and (public.is_office_user() or (public.is_installer() and public.user_belongs_to_team(a.team_id))));
$$;
drop policy "Authenticated users can read pose dates" on public.pose_dates;
drop policy "Authenticated users can insert pose dates" on public.pose_dates;
drop policy "Authenticated users can update pose dates" on public.pose_dates;
drop policy "Authenticated users can delete pose dates" on public.pose_dates;
create policy pose_dates_select_assigned on public.pose_dates for select to authenticated using(public.can_access_pose(pose_id));
create policy pose_dates_scheduler_write on public.pose_dates for all to authenticated using(public.is_office_scheduler()) with check(public.is_office_scheduler());

alter table public.notifications add column entity_type text,add column entity_id uuid,add column event_action text,add column actor_name text;
create index notifications_recipient_created_idx on public.notifications(recipient_id,created_at desc);

create function pw_posa.author_name(actor uuid) returns text
language sql stable security definer set search_path='' as $$
 select coalesce(nullif(btrim(p.full_name),''),p.email,'Ufficio') from public.profiles p where p.id=actor and (auth.uid() is not null or auth.jwt()->>'role'='service_role' or session_user in ('postgres','supabase_admin'));
$$;
create function pw_posa.notify_activity_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb;prev jsonb;kind text;verb text;headline text;details text;actor uuid;who text;assigned uuid;old_assigned uuid;ref uuid;num text;client text;
begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 prev:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 if tg_op='UPDATE' and (r-array['updated_at','updated_by'])=(prev-array['updated_at','updated_by']) then return new; end if;
 actor:=coalesce(auth.uid(),nullif(r->>'updated_by','')::uuid,nullif(r->>'created_by','')::uuid);
 if actor is null then return coalesce(new,old); end if;
 who:=coalesce(pw_posa.author_name(actor),'Utente');ref:=(r->>'id')::uuid;
 verb:=case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
 if tg_table_name='poses' then
   kind:='pose';num:=r->>'job_number';client:=r->>'client_name';assigned:=(r->>'team_id')::uuid;
   headline:=case tg_op when 'INSERT' then 'Nuova posa inserita' when 'UPDATE' then 'Posa «'||num||'» modificata' else 'Posa «'||num||'» eliminata' end;
 elsif tg_table_name='assistances' then
   kind:='assistance';num:=r->>'protocol_order';client:=r->>'client_name';assigned:=(r->>'team_id')::uuid;
   headline:=case tg_op when 'INSERT' then 'Nuova assistenza inserita' when 'UPDATE' then 'Assistenza «'||num||'» modificata' else 'Assistenza «'||num||'» eliminata' end;
 else
   kind:='technical';client:=btrim((r->>'first_name')||' '||(r->>'last_name'));assigned:=(r->>'technician_id')::uuid;
   headline:=case r->>'activity_type' when 'survey' then case tg_op when 'INSERT' then 'Nuovo rilievo inserito' when 'UPDATE' then 'Rilievo modificato' else 'Rilievo eliminato' end when 'site_visit' then case tg_op when 'INSERT' then 'Nuova giornata fuori per cantiere inserita' when 'UPDATE' then 'Giornata fuori per cantiere modificata' else 'Giornata fuori per cantiere eliminata' end else case tg_op when 'INSERT' then 'Nuova nota per il tecnico' when 'UPDATE' then case when r->>'status'='completed' then 'Nota / richiamata completata' else 'Nota / richiamata modificata' end else 'Nota per il tecnico eliminata' end end;
 end if;
 details:=concat_ws(' · ',nullif(num,''),client,to_char((r->>'scheduled_date')::date,'DD/MM/YYYY'),nullif(left(r->>'start_time',5),''))||E'\nDa: '||who;
 insert into public.notifications(recipient_id,pose_id,notification_type,title,message,entity_type,entity_id,event_action,actor_name)
 select p.id,case when kind='pose' and tg_op<>'DELETE' then ref else null end,kind||'_'||verb,headline,details,kind,ref,verb,who
 from public.profiles p where p.active and (p.role in('office_scheduler','office_viewer') or (kind='technical' and p.role='technician' and p.id=assigned) or (kind<>'technical' and p.role='installer' and exists(select 1 from public.team_members tm where tm.user_id=p.id and tm.team_id=assigned and tm.active)));
 return coalesce(new,old);
end; $$;
drop trigger poses_notify_team on public.poses;
drop trigger assistances_notify_team on public.assistances;
drop trigger assistances_notify_office_completed on public.assistances;
drop trigger poses_auto_push on public.poses;
drop trigger assistances_auto_push on public.assistances;
create trigger poses_explicit_notifications after insert or update or delete on public.poses for each row execute function pw_posa.notify_activity_change();
create trigger assistances_explicit_notifications after insert or update or delete on public.assistances for each row execute function pw_posa.notify_activity_change();
create trigger technician_explicit_notifications after insert or update or delete on public.technician_activities for each row execute function pw_posa.notify_activity_change();

-- Notify once after the complete dossier is actually exportable.
create table pw_posa.export_ready(entity_type text not null,entity_id uuid not null,created_at timestamptz not null default now(),primary key(entity_type,entity_id));
alter table pw_posa.export_ready enable row level security;
revoke all on pw_posa.export_ready from public,anon,authenticated;
create function pw_posa.check_export_ready(kind text,ref uuid) returns void
language plpgsql security definer set search_path='' as $$
declare ready boolean:=false;details text;added integer;
begin
 if auth.uid() is null and auth.jwt()->>'role' is distinct from 'service_role' and session_user not in ('postgres','supabase_admin') then return; end if;
 if kind='pose' then
   select e.status='completata' and exists(select 1 from public.daily_report_poses l join public.daily_reports r on r.id=l.report_id where l.pose_id=p.id and r.status in('submitted','verified') and r.pdf_storage_path is not null)
    and not exists(select 1 from public.daily_report_poses l join public.daily_reports r on r.id=l.report_id where l.pose_id=p.id and (r.status not in('submitted','verified') or r.pdf_storage_path is null))
    and not exists(select 1 from public.ddt_documents d where d.pose_id=p.id and d.signed_path is null),
    'Posa '||p.job_number||' · '||p.client_name
   into ready,details from public.poses p join public.pose_execution e on e.pose_id=p.id where p.id=ref;
 elsif kind='assistance' then
   select a.status='completed' and a.final_report_path is not null and not exists(select 1 from public.ddt_documents d where d.assistance_id=a.id and d.signed_path is null),'Assistenza '||a.protocol_order||' · '||a.client_name into ready,details from public.assistances a where a.id=ref;
 else
   select a.status='completed',(case a.activity_type when 'survey' then 'Rilievo' when 'site_visit' then 'Uscita in cantiere' else 'Nota / richiamata' end)||' · '||btrim(a.first_name||' '||a.last_name) into ready,details from public.technician_activities a where a.id=ref;
 end if;
 if not coalesce(ready,false) then delete from pw_posa.export_ready where entity_type=kind and entity_id=ref;return;end if;
 insert into pw_posa.export_ready(entity_type,entity_id) values(kind,ref) on conflict do nothing;
 get diagnostics added=row_count;
 if added=0 then return;end if;
 insert into public.notifications(recipient_id,pose_id,notification_type,title,message,entity_type,entity_id,event_action)
 select p.id,case when kind='pose' then ref else null end,'dossier_ready','Fascicolo pronto per l’esportazione',details,kind,ref,'ready' from public.profiles p where p.active and p.role in('office_scheduler','office_viewer');
end; $$;
create function pw_posa.check_export_ready_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare pose_ref uuid;link record;
begin
 if tg_table_name='assistances' then perform pw_posa.check_export_ready('assistance',new.id);
 elsif tg_table_name='technician_activities' then perform pw_posa.check_export_ready('technical',new.id);
 elsif tg_table_name='pose_execution' then perform pw_posa.check_export_ready('pose',new.pose_id);
 elsif tg_table_name='daily_report_poses' then perform pw_posa.check_export_ready('pose',new.pose_id);
 elsif tg_table_name='daily_reports' then for link in select pose_id from public.daily_report_poses where report_id=new.id loop perform pw_posa.check_export_ready('pose',link.pose_id);end loop;
 elsif tg_table_name='ddt_documents' then if new.pose_id is not null then perform pw_posa.check_export_ready('pose',new.pose_id);elsif new.assistance_id is not null then perform pw_posa.check_export_ready('assistance',new.assistance_id);end if;
 end if;return new;
end; $$;
create trigger technician_export_ready after insert or update on public.technician_activities for each row execute function pw_posa.check_export_ready_trigger();
create trigger assistance_export_ready after insert or update on public.assistances for each row execute function pw_posa.check_export_ready_trigger();
create trigger pose_export_ready after update on public.pose_execution for each row execute function pw_posa.check_export_ready_trigger();
create trigger report_export_ready after insert or update on public.daily_reports for each row execute function pw_posa.check_export_ready_trigger();
create trigger report_link_export_ready after insert on public.daily_report_poses for each row execute function pw_posa.check_export_ready_trigger();
create trigger ddt_export_ready after insert or update on public.ddt_documents for each row execute function pw_posa.check_export_ready_trigger();

-- Existing operational updates also carry the author, keeping their workflows.
create or replace function public.notify_office_of_execution_change() returns trigger language plpgsql security definer set search_path=public as $$
declare p_row public.poses;who text;
begin
 if new.status is distinct from old.status then
 select * into p_row from public.poses where id=new.pose_id;who:=coalesce(pw_posa.author_name(coalesce(auth.uid(),new.updated_by)),'Utente');
 insert into public.notifications(recipient_id,pose_id,notification_type,title,message,entity_type,entity_id,event_action,actor_name)
 select p.id,new.pose_id,'pose_status_changed','Posa «'||p_row.job_number||'» modificata',p_row.client_name||' · Stato: '||replace(new.status,'_',' ')||E'\nDa: '||who,'pose',new.pose_id,'updated',who from public.profiles p where p.active and p.role in('office_scheduler','office_viewer');
 end if;return new;
end; $$;
create or replace function public.notify_office_of_submitted_report() returns trigger language plpgsql security definer set search_path=public as $$
declare who text;
begin
 if new.status='submitted' and (tg_op='INSERT' or old.status is distinct from 'submitted') then
 who:=coalesce(pw_posa.author_name(coalesce(auth.uid(),new.created_by)),'Utente');
 insert into public.notifications(recipient_id,notification_type,title,message,actor_name)
 select p.id,'report_submitted','Rapportino posa inviato','Rapportino '||coalesce(new.report_number,'')||' · '||to_char(new.report_date,'DD/MM/YYYY')||E'\nDa: '||who,who from public.profiles p where p.active and p.role in('office_scheduler','office_viewer');
 end if;return new;
end; $$;

create or replace function public.notify_office_of_issue() returns trigger language plpgsql security definer set search_path=public as $$
declare who text;job text;
begin
 who:=coalesce(pw_posa.author_name(coalesce(auth.uid(),new.created_by)),'Utente');select job_number into job from public.poses where id=new.pose_id;
 insert into public.notifications(recipient_id,pose_id,notification_type,title,message,entity_type,entity_id,event_action,actor_name)
 select p.id,new.pose_id,'issue_created','Nuova segnalazione per posa «'||coalesce(job,'')||'»',replace(new.issue_type,'_',' ')||' · priorità '||new.priority||E'\nDa: '||who,'pose',new.pose_id,'updated',who from public.profiles p where p.active and p.role in('office_scheduler','office_viewer');return new;
end; $$;

create function pw_posa.enqueue_notification_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare ref uuid;
begin
 if not exists(select 1 from public.profiles p where p.id=new.recipient_id and p.active and p.role in('office_scheduler','office_viewer','installer','technician')) then return new;end if;
 insert into public.office_push_events(notification_id) values(new.id) returning id into ref;
 perform net.http_post(url:='https://vbpinzygwexuvwomnmbt.supabase.co/functions/v1/send-office-push',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('event_id',ref));return new;
end; $$;
drop trigger notifications_auto_office_push on public.notifications;
create trigger notifications_explicit_push after insert on public.notifications for each row execute function pw_posa.enqueue_notification_push();

revoke all on all functions in schema pw_posa from public,anon,authenticated;
grant execute on function pw_posa.can_read_technical(uuid),pw_posa.can_edit_technical(uuid),pw_posa.can_read_technical_file(text),pw_posa.can_write_technical_file(text) to authenticated;
grant all on all tables in schema pw_posa to service_role;
-- Trigger-only functions are not client RPCs.
revoke execute on function public.notify_office_of_execution_change(),public.notify_office_of_submitted_report(),public.notify_office_of_issue() from public,anon,authenticated;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications;end if;
end; $$;
notify pgrst,'reload schema';
