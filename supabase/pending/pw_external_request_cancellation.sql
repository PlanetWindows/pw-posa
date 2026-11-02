-- Cancel the operational booking while retaining the external work dossier.
alter table public.external_requests
 add column cancelled_at timestamptz,
 add column cancelled_by uuid references public.profiles(id),
 add column cancellation_reason text not null default '',
 add column cancelled_from_status text,
 add column cancelled_pose_id uuid;
alter table public.external_requests add constraint external_requests_cancellation_check
 check(cancelled_at is null or (cancelled_by is not null and cancelled_from_status is not null));
create index external_requests_cancelled_by_idx on public.external_requests(cancelled_by) where cancelled_by is not null;

create function pw_external.cancel_request(p_id uuid,p_version integer,p_confirm boolean,p_reason text)
 returns public.external_requests language plpgsql security definer set search_path='' as $$
declare r public.external_requests;pid uuid;previous_sync text;removed integer;reason text;
begin
 if auth.uid() is null or not public.is_office_scheduler() then raise exception 'Operazione riservata all’ufficio';end if;
 if p_confirm is distinct from true then raise exception 'Confermare l’eliminazione della posa';end if;
 reason:=btrim(coalesce(p_reason,''));
 if length(reason)>2000 then raise exception 'Il motivo può contenere al massimo 2000 caratteri';end if;
 select * into strict r from public.external_requests where id=p_id for update;
 if r.cancelled_at is not null then return r;end if;
 if r.version is distinct from p_version then raise exception 'La posa è cambiata. Riaprire il riepilogo prima di eliminarla';end if;
 perform pg_advisory_xact_lock(hashtextextended(r.installer_id::text,0));
 pid:=r.linked_pose_id;
 if pid is not null and not exists(select 1 from public.poses where id=pid and external_request_id=r.id) then raise exception 'Collegamento della posa non coerente. Contattare l’ufficio';end if;
 update public.external_requests set cancelled_at=now(),cancelled_by=auth.uid(),
  cancellation_reason=reason,cancelled_from_status=r.status,cancelled_pose_id=pid,version=version+1,updated_at=now()
  where id=r.id;
 delete from public.external_bookings where request_id=r.id;
 if pid is not null then
  -- Preserve external inbox links, which otherwise cascade with the derived pose.
  update public.notifications set pose_id=null where pose_id=pid;
  previous_sync:=coalesce(current_setting('pw_external.sync',true),'');
  perform set_config('pw_external.sync','on',true);
  delete from public.poses where id=pid and external_request_id=r.id;
  get diagnostics removed=row_count;
  perform set_config('pw_external.sync',previous_sync,true);
  if removed<>1 then raise exception 'La posa collegata è cambiata. Aggiornare la pagina';end if;
 end if;
 perform pw_external.notify(r.id,'cancelled','Posa esterna eliminata',
  'Posa eliminata dall’ufficio. Date liberate: '||array_to_string(r.work_dates,', ')||case when reason<>'' then E'\nMotivo: '||reason else '' end);
 select * into r from public.external_requests where id=p_id;
 return r;
end;$$;
create function public.pw_external_cancel_request(p_id uuid,p_version integer,p_confirm boolean,p_reason text default '')
 returns public.external_requests language sql security invoker set search_path='' as $$
 select pw_external.cancel_request(p_id,p_version,p_confirm,p_reason);
$$;
revoke all on function pw_external.cancel_request(uuid,integer,boolean,text),public.pw_external_cancel_request(uuid,integer,boolean,text) from public,anon;
grant execute on function pw_external.cancel_request(uuid,integer,boolean,text),public.pw_external_cancel_request(uuid,integer,boolean,text) to authenticated;

-- Serialise attachment registration with cancellation and reject further writes.
create or replace function pw_external.register_file(p_id uuid,p_kind text,p_path text,p_name text)
 returns public.external_files language plpgsql security definer set search_path='' as $$
declare outrow public.external_files;obj storage.objects;r public.external_requests;
begin
 if auth.uid() is null or not pw_external.can_access(p_id) then raise exception 'Accesso non consentito';end if;
 select * into strict r from public.external_requests where id=p_id for update;
 if r.cancelled_at is not null then raise exception 'La posa è stata eliminata. Il fascicolo è in sola lettura';end if;
 if not public.is_office_scheduler() and (p_kind='pdf' or not pw_external.can_work(p_id) or not exists(select 1 from public.external_installers i where i.id=r.installer_id and i.profile_id=auth.uid() and i.active)) then raise exception 'Caricamento non consentito';end if;
 if p_kind not in('pdf','before','after') or split_part(p_path,'/',1)<>'requests' or split_part(p_path,'/',2)<>p_id::text or split_part(p_path,'/',3)<>p_kind or split_part(p_path,'/',4)<>auth.uid()::text then raise exception 'Percorso non valido';end if;
 select * into strict obj from storage.objects where bucket_id='pw-external-private' and name=p_path and owner_id=auth.uid()::text;
 if (p_kind='pdf' and obj.metadata->>'mimetype'<>'application/pdf') or (p_kind<>'pdf' and obj.metadata->>'mimetype' not in('image/jpeg','image/png','image/webp','image/heic','image/heif')) then raise exception 'Formato del file non valido';end if;
 insert into public.external_files(request_id,kind,file_name,storage_path,mime_type,size_bytes,created_by)
  values(p_id,p_kind,p_name,p_path,obj.metadata->>'mimetype',(obj.metadata->>'size')::bigint,auth.uid()) returning * into outrow;
 perform pw_external.notify(p_id,'file','Nuovo allegato alla posa',case p_kind when 'pdf' then 'PDF: ' when 'before' then 'Foto prima: ' else 'Foto dopo: ' end||p_name);
 return outrow;
end;$$;

alter policy external_storage_insert on storage.objects with check (
 case when bucket_id='pw-external-private' and (storage.foldername(name))[1]='requests'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then (storage.foldername(name))[4]=(select auth.uid())::text
  and (storage.foldername(name))[3] in('pdf','before','after')
  and exists(select 1 from public.external_requests r where r.id=((storage.foldername(name))[2])::uuid and r.cancelled_at is null)
  and (public.is_office_scheduler() or ((storage.foldername(name))[3] in('before','after')
   and pw_external.can_work(((storage.foldername(name))[2])::uuid)
   and exists(select 1 from public.external_requests r join public.external_installers i on i.id=r.installer_id
    where r.id=((storage.foldername(name))[2])::uuid and i.profile_id=(select auth.uid()) and i.active)))
 else false end
);

-- A cancelled request can never be materialised into a new main-app pose.
do $$declare source text;needle text;
begin
 select pg_get_functiondef('pw_external.sync_pose(uuid)'::regprocedure) into source;
 needle:='select * into strict r from public.external_requests where id=p_id;';
 if position(needle in source)=0 then raise exception 'Definizione sync_pose inattesa';end if;
 source:=replace(source,needle,needle||E'\n if r.cancelled_at is not null or r.status not in(''confirmed'',''in_progress'',''incomplete'',''completed'') then raise exception ''Posa non confermata o eliminata'';end if;');
 execute source;
end;$$;
create or replace function pw_external.can_work(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select pw_external.can_access(p_id) and exists(select 1 from public.external_requests where id=p_id and cancelled_at is null and status in('confirmed','in_progress','incomplete','completed'));
$$;

-- Existing status values remain unchanged for compatibility; the archive marker
-- is authoritative and all status-changing commands reject archived requests.
do $$declare source text;needle text;signature text;
begin
 foreach signature in array array['pw_external.save_request(jsonb,uuid,integer)','pw_external.respond(uuid,text,integer,jsonb)'] loop
  select pg_get_functiondef(signature::regprocedure) into source;
  needle:=case when signature like '%save_request%' then 'select * into strict r from public.external_requests where id=p_id for update;' else 'if not pw_external.can_access(p_id) then raise exception ''Accesso non consentito'';end if;' end;
  if position(needle in source)=0 then raise exception 'Definizione funzione inattesa: %',signature;end if;
  source:=replace(source,needle,needle||E'\n if r.cancelled_at is not null then raise exception ''La posa è stata eliminata'';end if;');
  execute source;
 end loop;
end;$$;
notify pgrst,'reload schema';
