begin;
alter table public.external_installers add column deletion_started_at timestamptz,add column deleted_at timestamptz;

create function pw_external.prepare_installer_delete(p_id uuid,p_confirm_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.external_installers;actor uuid:=auth.uid();
begin
 if actor is null or not public.is_office_scheduler() then raise exception 'Operazione riservata all’ufficio';end if;
 select * into strict i from public.external_installers where id=p_id for update;
 if i.profile_id=actor or not exists(select 1 from public.profiles where id=i.profile_id and role='installer') then raise exception 'Questo account non può essere eliminato da PW Posa Esterni';end if;
 if btrim(coalesce(p_confirm_name,''))<>i.full_name then raise exception 'Scrivere il nome completo del posatore per confermare';end if;
 if i.deleted_at is not null then return jsonb_build_object('already_deleted',true,'installer_id',i.id);end if;
 perform 1 from public.profiles where id=i.profile_id for update;
 update public.external_installers set active=false,deletion_started_at=coalesce(deletion_started_at,now()) where id=i.id;
 update public.profiles set active=false where id=i.profile_id;
 update public.team_members set active=false where user_id=i.profile_id and team_id=i.team_id;
 update public.teams set active=false where id=i.team_id;
 -- Retained private photos/PDFs keep their bytes and access rules. Transfer only
 -- external-app object ownership so Auth can delete the login without losing files.
 update storage.objects set owner_id=actor::text,owner=actor where bucket_id='pw-external-private' and (owner_id=i.profile_id::text or owner=i.profile_id);
 delete from public.push_subscriptions where user_id=i.profile_id;
 delete from public.notifications where recipient_id=i.profile_id;
 return jsonb_build_object('installer_id',i.id,'profile_id',i.profile_id,'auth_deleted',exists(select 1 from auth.users where id=i.profile_id and deleted_at is not null));
end;$$;
create function public.pw_external_prepare_installer_delete(p_id uuid,p_confirm_name text) returns jsonb language sql security invoker set search_path='' as $$select pw_external.prepare_installer_delete(p_id,p_confirm_name);$$;

create function pw_external.finish_installer_delete(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.external_installers;actor uuid:=auth.uid();who text;
begin
 if actor is null or not public.is_office_scheduler() then raise exception 'Operazione riservata all’ufficio';end if;
 select * into strict i from public.external_installers where id=p_id for update;
 if i.deleted_at is not null then return jsonb_build_object('ok',true,'deleted',true,'installer_id',i.id);end if;
 if i.deletion_started_at is null or i.active or not exists(select 1 from auth.users where id=i.profile_id and deleted_at is not null) then raise exception 'L’eliminazione dell’accesso non è ancora completata';end if;
 update public.external_installers set active=false,deleted_at=now() where id=i.id;
 select full_name into who from public.profiles where id=actor;
 insert into public.external_events(request_id,actor_id,action,message)
 select id,actor,'installer_deleted','Account del posatore eliminato. Incarico e fascicolo conservati dall’ufficio.' from public.external_requests where installer_id=i.id;
 insert into public.notifications(recipient_id,notification_type,title,message,entity_type,entity_id,event_action,actor_name)
 select id,'external_installer_deleted','Account del posatore eliminato',i.full_name||' · Incarichi e fascicoli conservati.','external_installer',i.id,'deleted',who from public.profiles where active and role in('office_scheduler','office_viewer') and id<>actor;
 return jsonb_build_object('ok',true,'deleted',true,'installer_id',i.id,'preserved_requests',(select count(*) from public.external_requests where installer_id=i.id));
end;$$;
create function public.pw_external_finish_installer_delete(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select pw_external.finish_installer_delete(p_id);$$;

create or replace function pw_external.installer_save(p_id uuid,p_data jsonb) returns public.external_installers language plpgsql security definer set search_path='' as $$
declare i public.external_installers;
begin
 if auth.uid() is null or not public.is_office_scheduler() then raise exception 'Operazione riservata all’ufficio';end if;
 select * into strict i from public.external_installers where id=p_id for update;
 if i.deletion_started_at is not null or i.deleted_at is not null then raise exception 'Account in eliminazione o già eliminato';end if;
 update public.external_installers set full_name=btrim(p_data->>'full_name'),company=coalesce(p_data->>'company',''),phone=coalesce(p_data->>'phone',''),notes=coalesce(p_data->>'notes',''),active=coalesce((p_data->>'active')::boolean,true) where id=p_id returning * into i;
 update public.profiles set full_name=i.full_name,active=i.active where id=i.profile_id;
 update public.team_members set active=i.active where user_id=i.profile_id and team_id=i.team_id;
 update public.teams set name='Esterni · '||coalesce(nullif(i.company,''),i.full_name),active=i.active where id=i.team_id;
 return i;
end;$$;

create function pw_external.guard_request_installer() returns trigger language plpgsql security invoker set search_path='' as $$
declare i public.external_installers;
begin
 if tg_op='INSERT' or new.installer_id is distinct from old.installer_id or (new.status='confirmed' and old.status in('pending','counterproposed')) or (new.status='pending' and old.status in('pending','counterproposed')) then
  select * into strict i from public.external_installers where id=new.installer_id for share;
  if not i.active or i.deletion_started_at is not null or i.deleted_at is not null then raise exception 'Il posatore non è più disponibile per nuovi incarichi';end if;
 end if;
 return new;
end;$$;
create trigger external_request_active_installer before insert or update of installer_id,status on public.external_requests for each row execute function pw_external.guard_request_installer();

revoke all on function pw_external.prepare_installer_delete(uuid,text),pw_external.finish_installer_delete(uuid),public.pw_external_prepare_installer_delete(uuid,text),public.pw_external_finish_installer_delete(uuid) from public,anon;
grant execute on function pw_external.prepare_installer_delete(uuid,text),pw_external.finish_installer_delete(uuid),public.pw_external_prepare_installer_delete(uuid,text),public.pw_external_finish_installer_delete(uuid) to authenticated;
revoke all on function pw_external.guard_request_installer() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
