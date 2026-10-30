-- Regression: repeated company/name must work even when archived teams exist.
-- Uses the same service_role privileges as the production Edge Function.
begin;
create temporary table external_provision_test(office_id uuid,first_user uuid,second_user uuid,old_team uuid,old_named_team uuid,first_installer uuid,second_installer uuid,company text);
insert into external_provision_test select id,gen_random_uuid(),gen_random_uuid(),null,null,null,null,'QA-company-'||gen_random_uuid()::text from public.profiles where role='office_scheduler' and active limit 1;
do $$declare c external_provision_test;t1 uuid;t2 uuid;begin
 select * into c from external_provision_test;
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role) values(c.first_user,'pwqa-'||c.first_user||'@example.invalid','{"full_name":"QA Prova"}','{}','authenticated','authenticated'),(c.second_user,'pwqa-'||c.second_user||'@example.invalid','{"full_name":"QA Prova"}','{}','authenticated','authenticated');
 insert into public.teams(name,active) values('Esterni · '||c.company,false) returning id into t1;
 insert into public.teams(name,active) values('Esterni · '||c.company||' · QA Prova',false) returning id into t2;
 update external_provision_test set old_team=t1,old_named_team=t2;
end;$$;
grant select,update on external_provision_test to service_role,authenticated;
set local role service_role;
do $$declare c external_provision_test;i1 uuid;i2 uuid;t1 uuid;t2 uuid;begin
 select * into c from external_provision_test;
 i1:=public.pw_external_provision(c.first_user,'QA Prova',c.company,'pwqa-'||c.first_user||'@example.invalid','','');
 i2:=public.pw_external_provision(c.second_user,'QA Prova',c.company,'pwqa-'||c.second_user||'@example.invalid','','');
 select team_id into t1 from public.external_installers where id=i1;
 select team_id into t2 from public.external_installers where id=i2;
 if t1=t2 or t1 in(c.old_team,c.old_named_team) or t2 in(c.old_team,c.old_named_team) then raise exception 'TEST failed: new accounts reused a historical team';end if;
 if(select name from public.teams where id=t1)=(select name from public.teams where id=t2) then raise exception 'TEST failed: team names not unique';end if;
 if not exists(select 1 from public.team_members where team_id=t1 and user_id=c.first_user) or not exists(select 1 from public.team_members where team_id=t2 and user_id=c.second_user) then raise exception 'TEST failed: account membership not created';end if;
 update external_provision_test set first_installer=i1,second_installer=i2;
end;$$;
reset role;
set local role authenticated;
do $$declare c external_provision_test;i public.external_installers;n1 text;n2 text;begin
 select * into c from external_provision_test;
 perform set_config('request.jwt.claim.sub',c.office_id::text,true);
 i:=public.pw_external_save_installer(c.first_installer,jsonb_build_object('full_name','QA Prova','company',c.company,'phone','123','active',true));
 i:=public.pw_external_save_installer(c.second_installer,jsonb_build_object('full_name','QA Prova','company',c.company,'phone','456','active',true));
 select t.name into n1 from public.external_installers e join public.teams t on t.id=e.team_id where e.id=c.first_installer;
 select t.name into n2 from public.external_installers e join public.teams t on t.id=e.team_id where e.id=c.second_installer;
 if n1=n2 then raise exception 'TEST failed: editing same company/name collided';end if;
 if not exists(select 1 from public.teams where id=c.old_team and name='Esterni · '||c.company and not active) or not exists(select 1 from public.teams where id=c.old_named_team and name='Esterni · '||c.company||' · QA Prova' and not active) then raise exception 'TEST failed: historical teams changed';end if;
 if has_function_privilege('authenticated','pw_external.assign_team_name(uuid,text,text)','EXECUTE') or has_function_privilege('anon','public.pw_external_provision(uuid,text,text,text,text,text)','EXECUTE') then raise exception 'TEST failed: provisioning helper privileges widened';end if;
end;$$;
reset role;
rollback;
select 'PASS: service-role provisioning for repeated company and person names, archived team collisions, distinct team IDs, membership, office edits and least-privilege helper access' as result;
