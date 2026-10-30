begin;
create function pw_external.assign_team_name(p_team_id uuid,p_name text,p_company text) returns uuid language plpgsql security invoker set search_path='' as $$
declare tid uuid:=coalesce(p_team_id,gen_random_uuid());base text;candidate text;n integer:=1;conflict_name text;
begin
 base:='Esterni · '||case when nullif(btrim(coalesce(p_company,'')),'') is null then btrim(p_name) else btrim(p_company)||' · '||btrim(p_name) end;
 loop
  candidate:=base||case when n=1 then '' else ' ('||n||')' end;
  begin
   if p_team_id is null then
    insert into public.teams(id,name) values(tid,candidate);
   else
    update public.teams set name=candidate where id=tid;
    if not found then raise exception 'Squadra del posatore non disponibile';end if;
   end if;
   return tid;
  exception when unique_violation then
   get stacked diagnostics conflict_name=constraint_name;
   if conflict_name<>'teams_name_key' then raise;end if;
  end;
  n:=n+1;
  if n>1000 then raise exception 'Impossibile assegnare un nome alla squadra';end if;
 end loop;
end;$$;
revoke all on function pw_external.assign_team_name(uuid,text,text) from public,anon,authenticated;
grant execute on function pw_external.assign_team_name(uuid,text,text) to service_role;

create or replace function public.pw_external_provision(p_user uuid,p_name text,p_company text,p_email text,p_phone text,p_notes text) returns uuid language plpgsql security invoker set search_path='' as $$
declare tid uuid;iid uuid;
begin
 tid:=pw_external.assign_team_name(null,p_name,p_company);
 update public.profiles set role='installer',full_name=p_name,active=true where id=p_user;
 insert into public.team_members(team_id,user_id,is_lead) values(tid,p_user,true);
 insert into public.external_installers(profile_id,team_id,full_name,company,email,phone,notes) values(p_user,tid,p_name,coalesce(p_company,''),p_email,coalesce(p_phone,''),coalesce(p_notes,'')) returning id into iid;
 return iid;
end;$$;

create or replace function pw_external.installer_save(p_id uuid,p_data jsonb) returns public.external_installers language plpgsql security definer set search_path='' as $$
declare i public.external_installers;
begin
 if auth.uid() is null or not public.is_office_scheduler() then raise exception 'Operazione riservata all’ufficio';end if;
 select * into strict i from public.external_installers where id=p_id for update;
 if i.deletion_started_at is not null or i.deleted_at is not null then raise exception 'Account in eliminazione o già eliminato';end if;
 update public.external_installers set full_name=btrim(p_data->>'full_name'),company=coalesce(p_data->>'company',''),phone=coalesce(p_data->>'phone',''),notes=coalesce(p_data->>'notes',''),active=coalesce((p_data->>'active')::boolean,true) where id=p_id returning * into i;
 update public.profiles set full_name=i.full_name,active=i.active where id=i.profile_id;
 update public.team_members set active=i.active where user_id=i.profile_id and team_id=i.team_id;
 perform pw_external.assign_team_name(i.team_id,i.full_name,i.company);
 update public.teams set active=i.active where id=i.team_id;
 return i;
end;$$;
notify pgrst,'reload schema';
commit;
