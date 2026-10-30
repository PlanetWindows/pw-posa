begin;
create schema if not exists pw_external;
revoke all on schema pw_external from public,anon;
grant usage on schema pw_external to authenticated,service_role;

create table public.external_installers (
 id uuid primary key default gen_random_uuid(),profile_id uuid not null unique references public.profiles(id),
 team_id uuid not null unique references public.teams(id),full_name text not null check(length(btrim(full_name))>0),
 company text not null default '',email text not null,phone text not null default '',notes text not null default '',
 active boolean not null default true,created_at timestamptz not null default now()
);
create table public.external_requests (
 id uuid primary key default gen_random_uuid(),installer_id uuid not null references public.external_installers(id),
 reference text not null default '',client_name text not null default '',address text not null check(length(btrim(address))>0),
 floor text not null check(length(btrim(floor))>0),description text not null check(length(btrim(description))>0),
 price numeric(12,2) not null check(price>=0),conditions text not null default '',work_dates date[] not null,
 start_time time not null default '08:00',end_time time not null default '17:00',
 status text not null default 'pending' check(status in('pending','counterproposed','confirmed','in_progress','incomplete','completed','rejected')),
 proposed_dates date[],response_note text not null default '',conditions_accepted_at timestamptz,
 linked_pose_id uuid unique references public.poses(id) on delete set null,
 version integer not null default 1,created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(cardinality(work_dates) between 1 and 180),check(end_time>start_time)
);
alter table public.poses add column external_request_id uuid unique references public.external_requests(id);
create table public.external_bookings (
 installer_id uuid not null references public.external_installers(id),booking_date date not null,
 request_id uuid not null references public.external_requests(id),primary key(installer_id,booking_date)
);
create index external_bookings_request_idx on public.external_bookings(request_id);
create index external_requests_installer_idx on public.external_requests(installer_id,created_at desc);
create index external_requests_status_idx on public.external_requests(status);
create index external_requests_created_by_idx on public.external_requests(created_by);
create table public.external_reports (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.external_requests(id),
 report_date date not null,description text not null check(length(btrim(description))>0),operators text not null default '',
 hours numeric(5,2) check(hours between 0 and 24),incomplete boolean not null default false,reason text not null default '',
 created_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 unique(request_id,report_date),check(not incomplete or length(btrim(reason))>0)
);
create table public.external_tests (
 request_id uuid primary key references public.external_requests(id),test_date date not null,
 outcome text not null check(outcome in('conforme','da_completare')),checks text not null,
 cleaned boolean not null,operator_name text not null check(length(btrim(operator_name))>0),
 notes text not null default '',created_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 check(outcome<>'conforme' or cleaned)
);
create table public.external_files (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.external_requests(id),
 kind text not null check(kind in('pdf','before','after')),file_name text not null,
 storage_path text not null unique,mime_type text not null,size_bytes bigint not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create index external_files_request_idx on public.external_files(request_id,kind);
create index external_files_created_by_idx on public.external_files(created_by);
create index external_reports_created_by_idx on public.external_reports(created_by);
create index external_tests_created_by_idx on public.external_tests(created_by);
create table public.external_events (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.external_requests(id),
 actor_id uuid not null references public.profiles(id),action text not null,message text not null,
 created_at timestamptz not null default now()
);
create index external_events_request_idx on public.external_events(request_id,created_at);
create index external_events_actor_idx on public.external_events(actor_id);

create function pw_external.can_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active) and (
 public.is_office_user() or exists(select 1 from public.external_requests r join public.external_installers i on i.id=r.installer_id where r.id=p_id and i.profile_id=auth.uid() and i.active));
$$;
create function pw_external.can_work(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pw_external.can_access(p_id) and exists(select 1 from public.external_requests where id=p_id and status in('confirmed','in_progress','incomplete','completed'));
$$;
revoke all on function pw_external.can_access(uuid),pw_external.can_work(uuid) from public,anon;
grant execute on function pw_external.can_access(uuid),pw_external.can_work(uuid) to authenticated,service_role;

alter table public.external_installers enable row level security;
alter table public.external_requests enable row level security;
alter table public.external_bookings enable row level security;
alter table public.external_reports enable row level security;
alter table public.external_tests enable row level security;
alter table public.external_files enable row level security;
alter table public.external_events enable row level security;
create policy external_installers_read on public.external_installers for select to authenticated using(public.is_office_user() or (profile_id=(select auth.uid()) and active));
create policy external_requests_read on public.external_requests for select to authenticated using(pw_external.can_access(id));
create policy external_bookings_read on public.external_bookings for select to authenticated using(pw_external.can_access(request_id));
create policy external_reports_read on public.external_reports for select to authenticated using(pw_external.can_access(request_id));
create policy external_tests_read on public.external_tests for select to authenticated using(pw_external.can_access(request_id));
create policy external_files_read on public.external_files for select to authenticated using(pw_external.can_access(request_id));
create policy external_events_read on public.external_events for select to authenticated using(pw_external.can_access(request_id));
revoke all on public.external_installers,public.external_requests,public.external_bookings,public.external_reports,public.external_tests,public.external_files,public.external_events from anon,authenticated;
grant select on public.external_installers,public.external_requests,public.external_bookings,public.external_reports,public.external_tests,public.external_files,public.external_events to authenticated;
grant all on public.external_installers,public.external_requests,public.external_bookings,public.external_reports,public.external_tests,public.external_files,public.external_events to service_role;

create function pw_external.notify(p_id uuid,p_action text,p_title text,p_message text) returns void language plpgsql security definer set search_path='' as $$
declare r public.external_requests;who text;
begin
 if auth.uid() is null then raise exception 'Accesso richiesto';end if;
 select * into strict r from public.external_requests where id=p_id;
 select full_name into who from public.profiles where id=auth.uid() and active;
 if who is null then raise exception 'Accesso non abilitato';end if;
 insert into public.external_events(request_id,actor_id,action,message) values(p_id,auth.uid(),p_action,p_message);
 insert into public.notifications(recipient_id,pose_id,notification_type,title,message,entity_type,entity_id,event_action,actor_name)
 select p.id,r.linked_pose_id,'external_'||p_action,p_title,concat_ws(' · ',nullif(r.reference,''),r.address,p_message)||E'\nDa: '||who,'external_pose',p_id,p_action,who
 from public.profiles p where p.active and p.id<>auth.uid() and (p.role in('office_scheduler','office_viewer') or p.id=(select profile_id from public.external_installers where id=r.installer_id and active));
end;$$;
revoke all on function pw_external.notify(uuid,text,text,text) from public,anon,authenticated;

create function pw_external.normal_dates(p_data jsonb) returns date[] language plpgsql immutable set search_path='' as $$
declare result date[];
begin
 if jsonb_typeof(p_data)<>'array' then raise exception 'Indicare le date';end if;
 select array_agg(d order by d) into result from(select distinct v::date as d from jsonb_array_elements_text(p_data) a(v)) a;
 if coalesce(cardinality(result),0) not between 1 and 180 or array_position(result,null) is not null then raise exception 'Selezionare da 1 a 180 giornate';end if;
 return result;
end;$$;
revoke all on function pw_external.normal_dates(jsonb) from public,anon,authenticated;

create function pw_external.sync_pose(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.external_requests;i public.external_installers;pid uuid;
begin
 if auth.uid() is null then raise exception 'Accesso richiesto';end if;
 select * into strict r from public.external_requests where id=p_id;
 select * into strict i from public.external_installers where id=r.installer_id;
 perform set_config('pw_external.sync','on',true);
 if r.linked_pose_id is null then
   perform pg_advisory_xact_lock(hashtextextended(r.installer_id::text,0));
   if exists(select 1 from public.external_bookings b where b.installer_id=r.installer_id and b.booking_date=any(r.work_dates) and b.request_id<>r.id) then raise exception 'Il posatore ha già una posa confermata in una delle date selezionate';end if;
   if exists(select 1 from public.poses p where p.team_id=i.team_id and (p.scheduled_date<=r.work_dates[cardinality(r.work_dates)] and p.scheduled_end_date>=r.work_dates[1]) and (exists(select 1 from public.pose_dates d where d.pose_id=p.id and d.pose_date=any(r.work_dates)) or (not exists(select 1 from public.pose_dates d where d.pose_id=p.id) and exists(select 1 from unnest(r.work_dates) d where d between p.scheduled_date and p.scheduled_end_date)))) then raise exception 'La squadra è già impegnata nelle date selezionate';end if;
   insert into public.poses(job_number,client_name,address,scheduled_date,scheduled_end_date,start_time,end_time,team_id,instructions,office_notes,external_request_id)
   values('EXT-'||upper(left(r.id::text,8)),coalesce(nullif(r.client_name,''),r.address),r.address,r.work_dates[1],r.work_dates[cardinality(r.work_dates)],r.start_time,r.end_time,i.team_id,r.description,'Posa esterna confermata · '||i.full_name||' · Piano: '||r.floor||' · Riferimento: '||r.reference,r.id) returning id into pid;
   insert into public.pose_dates(pose_id,pose_date) select pid,d from unnest(r.work_dates) d;
   insert into public.external_bookings(installer_id,booking_date,request_id) select r.installer_id,d,r.id from unnest(r.work_dates) d;
   update public.external_requests set linked_pose_id=pid where id=r.id;
 else pid:=r.linked_pose_id;end if;
 update public.pose_execution set status=case r.status when 'confirmed' then 'confermata' when 'in_progress' then 'in_corso' when 'incomplete' then 'problema_da_risolvere' when 'completed' then 'completata' else status end,updated_by=auth.uid() where pose_id=pid;
 perform set_config('pw_external.sync','off',true);
end;$$;
revoke all on function pw_external.sync_pose(uuid) from public,anon,authenticated;

create function pw_external.save_request(p_data jsonb,p_id uuid,p_version integer) returns public.external_requests language plpgsql security definer set search_path='' as $$
declare r public.external_requests;dates date[];iid uuid;
begin
 if auth.uid() is null or not public.is_office_scheduler() then raise exception 'Operazione riservata all’ufficio';end if;
 dates:=pw_external.normal_dates(p_data->'work_dates');iid:=(p_data->>'installer_id')::uuid;
 if not exists(select 1 from public.external_installers where id=iid and active) then raise exception 'Posatore non attivo';end if;
 if p_id is not null then
 select * into strict r from public.external_requests where id=p_id for update;
 if r.version is distinct from p_version then raise exception 'La richiesta è cambiata. Aggiornare la pagina';end if;
 if r.status not in('pending','counterproposed') then raise exception 'La richiesta non è più modificabile';end if;
 update public.external_requests set installer_id=iid,reference=coalesce(p_data->>'reference',''),client_name=coalesce(p_data->>'client_name',''),address=btrim(p_data->>'address'),floor=btrim(p_data->>'floor'),description=btrim(p_data->>'description'),price=(p_data->>'price')::numeric,conditions=coalesce(p_data->>'conditions',''),work_dates=dates,start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,status='pending',proposed_dates=null,response_note='',conditions_accepted_at=null,version=version+1,updated_at=now() where id=p_id returning * into r;
 else
 insert into public.external_requests(installer_id,reference,client_name,address,floor,description,price,conditions,work_dates,start_time,end_time,created_by)
 values(iid,coalesce(p_data->>'reference',''),coalesce(p_data->>'client_name',''),btrim(p_data->>'address'),btrim(p_data->>'floor'),btrim(p_data->>'description'),(p_data->>'price')::numeric,coalesce(p_data->>'conditions',''),dates,(p_data->>'start_time')::time,(p_data->>'end_time')::time,auth.uid()) returning * into r;
 end if;
 perform pw_external.notify(r.id,case when p_id is null then 'created' else 'updated' end,case when p_id is null then 'Nuova richiesta di posa esterna' else 'Richiesta di posa modificata' end,'Date: '||array_to_string(r.work_dates,', '));
 return r;
end;$$;
create function public.pw_external_save_request(p_data jsonb,p_id uuid default null,p_version integer default null) returns public.external_requests language sql security invoker set search_path='' as $$select pw_external.save_request(p_data,p_id,p_version);$$;

create function pw_external.respond(p_id uuid,p_action text,p_version integer,p_data jsonb) returns public.external_requests language plpgsql security definer set search_path='' as $$
declare r public.external_requests;i public.external_installers;dates date[];title text;
begin
 if auth.uid() is null then raise exception 'Accesso richiesto';end if;
 select * into strict r from public.external_requests where id=p_id for update;
 select * into strict i from public.external_installers where id=r.installer_id;
 if not pw_external.can_access(p_id) then raise exception 'Accesso non consentito';end if;
 if r.version is distinct from p_version then raise exception 'La richiesta è cambiata. Aggiornare la pagina';end if;
 if p_action in('accept','reject','propose') then
  if auth.uid()<>i.profile_id or not i.active then raise exception 'Può rispondere solo il posatore assegnato';end if;
  if r.status not in('pending','counterproposed') or (p_action in('accept','propose') and r.status<>'pending') then raise exception 'Risposta non più disponibile';end if;
  if p_action in('accept','propose') and coalesce((p_data->>'accept_conditions')::boolean,false) is not true then raise exception 'Confermare le condizioni e la pulizia del cantiere';end if;
  if p_action='propose' then
   dates:=pw_external.normal_dates(p_data->'dates');
   if dates=r.work_dates then raise exception 'La controproposta deve indicare date diverse';end if;
  end if;
  update public.external_requests set status=case p_action when 'accept' then 'confirmed' when 'reject' then 'rejected' else 'counterproposed' end,proposed_dates=dates,response_note=coalesce(p_data->>'note',''),conditions_accepted_at=case when p_action in('accept','propose') then now() else null end,version=version+1,updated_at=now() where id=p_id returning * into r;
  title:=case p_action when 'accept' then 'Posa esterna confermata' when 'reject' then 'Incarico rifiutato' else 'Nuove date proposte dal posatore' end;
 elsif p_action in('approve_dates','reject_dates') then
  if not public.is_office_scheduler() or r.status<>'counterproposed' then raise exception 'Controproposta non disponibile';end if;
  update public.external_requests set status=case when p_action='approve_dates' then 'confirmed' else 'pending' end,work_dates=case when p_action='approve_dates' then proposed_dates else work_dates end,proposed_dates=null,conditions_accepted_at=case when p_action='approve_dates' then conditions_accepted_at else null end,version=version+1,updated_at=now() where id=p_id returning * into r;
  title:=case when p_action='approve_dates' then 'L’ufficio ha confermato le nuove date' else 'L’ufficio non ha accettato le nuove date' end;
 else raise exception 'Azione non valida';end if;
 if r.status='confirmed' then perform pw_external.sync_pose(r.id);select * into r from public.external_requests where id=r.id;end if;
 perform pw_external.notify(r.id,p_action,title,concat_ws(' · ','Date: '||array_to_string(coalesce(r.proposed_dates,r.work_dates),', '),nullif(r.response_note,'')));
 return r;
end;$$;
create function public.pw_external_respond(p_id uuid,p_action text,p_version integer,p_data jsonb default '{}') returns public.external_requests language sql security invoker set search_path='' as $$select pw_external.respond(p_id,p_action,p_version,p_data);$$;

create function pw_external.report(p_id uuid,p_version integer,p_data jsonb) returns public.external_reports language plpgsql security definer set search_path='' as $$
declare r public.external_requests;outrow public.external_reports;d date;
begin
 if auth.uid() is null then raise exception 'Accesso richiesto';end if;
 select * into strict r from public.external_requests where id=p_id for update;
 if not pw_external.can_work(p_id) or (not public.is_office_scheduler() and not exists(select 1 from public.external_installers where id=r.installer_id and profile_id=auth.uid() and active)) then raise exception 'Accesso non consentito';end if;
 if r.version is distinct from p_version then raise exception 'La richiesta è cambiata. Aggiornare la pagina';end if;
 if r.status='completed' then raise exception 'Lavori già conclusi con collaudo';end if;
 d:=(p_data->>'report_date')::date;
 if not d=any(r.work_dates) or d>(now() at time zone 'Europe/Rome')::date then raise exception 'Il rapportino è disponibile nelle giornate della posa, fino a oggi';end if;
 insert into public.external_reports(request_id,report_date,description,operators,hours,incomplete,reason,created_by)
 values(p_id,d,btrim(p_data->>'description'),coalesce(p_data->>'operators',''),nullif(p_data->>'hours','')::numeric,coalesce((p_data->>'incomplete')::boolean,false),coalesce(p_data->>'reason',''),auth.uid())
 on conflict(request_id,report_date) do update set description=excluded.description,operators=excluded.operators,hours=excluded.hours,incomplete=excluded.incomplete,reason=excluded.reason,updated_at=now() returning * into outrow;
 update public.external_requests set status=case when (select incomplete from public.external_reports where request_id=p_id order by report_date desc limit 1) then 'incomplete' else 'in_progress' end,version=version+1,updated_at=now() where id=p_id;
 perform pw_external.sync_pose(p_id);
 perform pw_external.notify(p_id,'report','Rapportino giornaliero aggiornato',to_char(d,'DD/MM/YYYY')||case when outrow.incomplete then ' · Lavoro incompleto: '||outrow.reason else ' · '||outrow.description end);
 return outrow;
end;$$;
create function public.pw_external_save_report(p_id uuid,p_version integer,p_data jsonb) returns public.external_reports language sql security invoker set search_path='' as $$select pw_external.report(p_id,p_version,p_data);$$;

create function pw_external.finish(p_id uuid,p_version integer,p_data jsonb) returns public.external_tests language plpgsql security definer set search_path='' as $$
declare r public.external_requests;outrow public.external_tests;d date;
begin
 if auth.uid() is null then raise exception 'Accesso richiesto';end if;
 select * into strict r from public.external_requests where id=p_id for update;
 if not pw_external.can_work(p_id) or (not public.is_office_scheduler() and not exists(select 1 from public.external_installers where id=r.installer_id and profile_id=auth.uid() and active)) then raise exception 'Accesso non consentito';end if;
 if r.version is distinct from p_version then raise exception 'La richiesta è cambiata. Aggiornare la pagina';end if;
 if r.status='completed' then raise exception 'Collaudo già concluso';end if;
 d:=(p_data->>'test_date')::date;
 if d<r.work_dates[1] or d>(now() at time zone 'Europe/Rome')::date then raise exception 'Data collaudo non valida';end if;
 if p_data->>'outcome'='conforme' then
  if not exists(select 1 from public.external_reports where request_id=p_id) then raise exception 'Compilare prima il rapportino giornaliero';end if;
  if exists(select 1 from unnest(r.work_dates) x where x<=d and not exists(select 1 from public.external_reports a where a.request_id=p_id and a.report_date=x)) then raise exception 'Completare i rapportini delle giornate di posa fino al collaudo';end if;
  if (select incomplete from public.external_reports where request_id=p_id order by report_date desc limit 1) then raise exception 'Risolvere il lavoro incompleto e aggiornare il rapportino prima del collaudo';end if;
  if not coalesce((p_data->>'cleaned')::boolean,false) then raise exception 'Confermare la pulizia prima di concludere';end if;
 elsif length(btrim(coalesce(p_data->>'notes','')))=0 then raise exception 'Indicare cosa resta da completare';end if;
 insert into public.external_tests(request_id,test_date,outcome,checks,cleaned,operator_name,notes,created_by)
 values(p_id,d,p_data->>'outcome',btrim(p_data->>'checks'),coalesce((p_data->>'cleaned')::boolean,false),btrim(p_data->>'operator_name'),coalesce(p_data->>'notes',''),auth.uid())
 on conflict(request_id) do update set test_date=excluded.test_date,outcome=excluded.outcome,checks=excluded.checks,cleaned=excluded.cleaned,operator_name=excluded.operator_name,notes=excluded.notes,updated_at=now() returning * into outrow;
 update public.external_requests set status=case when outrow.outcome='conforme' then 'completed' else 'incomplete' end,version=version+1,updated_at=now() where id=p_id;
 perform pw_external.sync_pose(p_id);
 perform pw_external.notify(p_id,'test',case when outrow.outcome='conforme' then 'Collaudo concluso · lavori completati' else 'Collaudo: lavoro da completare' end,concat_ws(' · ',outrow.operator_name,nullif(outrow.notes,'')));
 return outrow;
end;$$;
create function public.pw_external_save_test(p_id uuid,p_version integer,p_data jsonb) returns public.external_tests language sql security invoker set search_path='' as $$select pw_external.finish(p_id,p_version,p_data);$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pw-external-private','pw-external-private',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']);
create policy external_storage_read on storage.objects for select to authenticated using(bucket_id='pw-external-private' and pw_external.can_access(((storage.foldername(name))[2])::uuid));
create policy external_storage_insert on storage.objects for insert to authenticated with check(bucket_id='pw-external-private' and (storage.foldername(name))[1]='requests' and (storage.foldername(name))[4]=(select auth.uid())::text and (public.is_office_scheduler() or ((storage.foldername(name))[3] in('before','after') and pw_external.can_work(((storage.foldername(name))[2])::uuid) and exists(select 1 from public.external_requests r join public.external_installers i on i.id=r.installer_id where r.id=((storage.foldername(name))[2])::uuid and i.profile_id=(select auth.uid()) and i.active))));
create policy external_storage_cleanup on storage.objects for delete to authenticated using(bucket_id='pw-external-private' and owner_id=(select auth.uid())::text and not exists(select 1 from public.external_files f where f.storage_path=name));
create function pw_external.register_file(p_id uuid,p_kind text,p_path text,p_name text) returns public.external_files language plpgsql security definer set search_path='' as $$
declare outrow public.external_files;obj storage.objects;
begin
 if auth.uid() is null or not pw_external.can_access(p_id) then raise exception 'Accesso non consentito';end if;
 if not public.is_office_scheduler() and (p_kind='pdf' or not pw_external.can_work(p_id) or not exists(select 1 from public.external_requests r join public.external_installers i on i.id=r.installer_id where r.id=p_id and i.profile_id=auth.uid() and i.active)) then raise exception 'Caricamento non consentito';end if;
 if p_kind not in('pdf','before','after') or split_part(p_path,'/',1)<>'requests' or split_part(p_path,'/',2)<>p_id::text or split_part(p_path,'/',3)<>p_kind or split_part(p_path,'/',4)<>auth.uid()::text then raise exception 'Percorso non valido';end if;
 select * into strict obj from storage.objects where bucket_id='pw-external-private' and name=p_path and owner_id=auth.uid()::text;
 if (p_kind='pdf' and obj.metadata->>'mimetype'<>'application/pdf') or (p_kind<>'pdf' and obj.metadata->>'mimetype' not in('image/jpeg','image/png','image/webp','image/heic','image/heif')) then raise exception 'Formato del file non valido';end if;
 insert into public.external_files(request_id,kind,file_name,storage_path,mime_type,size_bytes,created_by) values(p_id,p_kind,p_name,p_path,obj.metadata->>'mimetype',(obj.metadata->>'size')::bigint,auth.uid()) returning * into outrow;
 perform pw_external.notify(p_id,'file','Nuovo allegato alla posa',case p_kind when 'pdf' then 'PDF: ' when 'before' then 'Foto prima: ' else 'Foto dopo: ' end||p_name);
 return outrow;
end;$$;
create function public.pw_external_register_file(p_id uuid,p_kind text,p_path text,p_name text) returns public.external_files language sql security invoker set search_path='' as $$select pw_external.register_file(p_id,p_kind,p_path,p_name);$$;

create function pw_external.installer_save(p_id uuid,p_data jsonb) returns public.external_installers language plpgsql security definer set search_path='' as $$
declare i public.external_installers;
begin
 if auth.uid() is null or not public.is_office_scheduler() then raise exception 'Operazione riservata all’ufficio';end if;
 update public.external_installers set full_name=btrim(p_data->>'full_name'),company=coalesce(p_data->>'company',''),phone=coalesce(p_data->>'phone',''),notes=coalesce(p_data->>'notes',''),active=coalesce((p_data->>'active')::boolean,true) where id=p_id returning * into strict i;
 update public.profiles set full_name=i.full_name,active=i.active where id=i.profile_id;
 update public.team_members set active=i.active where user_id=i.profile_id and team_id=i.team_id;
 update public.teams set name='Esterni · '||coalesce(nullif(i.company,''),i.full_name),active=i.active where id=i.team_id;
 return i;
end;$$;
create function public.pw_external_save_installer(p_id uuid,p_data jsonb) returns public.external_installers language sql security invoker set search_path='' as $$select pw_external.installer_save(p_id,p_data);$$;

create function public.pw_external_provision(p_user uuid,p_name text,p_company text,p_email text,p_phone text,p_notes text) returns uuid language plpgsql security invoker set search_path='' as $$
declare tid uuid;iid uuid;
begin
 insert into public.teams(name) values('Esterni · '||coalesce(nullif(p_company,''),p_name)) returning id into tid;
 update public.profiles set role='installer',full_name=p_name,active=true where id=p_user;
 insert into public.team_members(team_id,user_id,is_lead) values(tid,p_user,true);
 insert into public.external_installers(profile_id,team_id,full_name,company,email,phone,notes) values(p_user,tid,p_name,coalesce(p_company,''),p_email,coalesce(p_phone,''),coalesce(p_notes,'')) returning id into iid;
 return iid;
end;$$;
revoke all on function public.pw_external_provision(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.pw_external_provision(uuid,text,text,text,text,text) to service_role;

revoke all on function pw_external.save_request(jsonb,uuid,integer),pw_external.respond(uuid,text,integer,jsonb),pw_external.report(uuid,integer,jsonb),pw_external.finish(uuid,integer,jsonb),pw_external.register_file(uuid,text,text,text),pw_external.installer_save(uuid,jsonb) from public,anon;
grant execute on function pw_external.save_request(jsonb,uuid,integer),pw_external.respond(uuid,text,integer,jsonb),pw_external.report(uuid,integer,jsonb),pw_external.finish(uuid,integer,jsonb),pw_external.register_file(uuid,text,text,text),pw_external.installer_save(uuid,jsonb) to authenticated;
revoke all on function public.pw_external_save_request(jsonb,uuid,integer),public.pw_external_respond(uuid,text,integer,jsonb),public.pw_external_save_report(uuid,integer,jsonb),public.pw_external_save_test(uuid,integer,jsonb),public.pw_external_register_file(uuid,text,text,text),public.pw_external_save_installer(uuid,jsonb) from public,anon;
grant execute on function public.pw_external_save_request(jsonb,uuid,integer),public.pw_external_respond(uuid,text,integer,jsonb),public.pw_external_save_report(uuid,integer,jsonb),public.pw_external_save_test(uuid,integer,jsonb),public.pw_external_register_file(uuid,text,text,text),public.pw_external_save_installer(uuid,jsonb) to authenticated;

create function pw_external.protect_link() returns trigger language plpgsql set search_path='' as $$
begin
 if (case when tg_op='INSERT' then new.external_request_id else old.external_request_id end) is not null and coalesce(current_setting('pw_external.sync',true),'')<>'on' then raise exception 'Gestire questa posa da PW Posa Esterni';end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function pw_external.protect_link() from public,anon,authenticated;
create trigger external_pose_protect before insert or update or delete on public.poses for each row execute function pw_external.protect_link();

-- Preserve legacy notifications for every existing kind; external requests emit
-- their own single event addressed to the other party.
do $$declare s text;begin
 select pg_get_functiondef('pw_posa.notify_activity_change()'::regprocedure) into s;
 s:=replace(s,'prev:=case when tg_op=',E'if tg_table_name=''poses'' and (r->>''external_request_id'') is not null then return coalesce(new,old);end if;\n prev:=case when tg_op=');
 execute s;
 select pg_get_functiondef('public.notify_office_of_execution_change()'::regprocedure) into s;
 s:=replace(s,E'begin\n',E'begin\n if exists(select 1 from public.poses where id=new.pose_id and external_request_id is not null) then return new;end if;\n');
 execute s;
end;$$;

alter publication supabase_realtime add table public.external_requests;
notify pgrst,'reload schema';
commit;
