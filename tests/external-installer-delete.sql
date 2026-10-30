-- Synthetic account only; all changes, notifications and storage metadata roll back.
begin;
create temporary table external_delete_test(office_id uuid,viewer_id uuid,user_id uuid,installer_id uuid,request_id uuid,pose_id uuid);
insert into external_delete_test select id,gen_random_uuid(),gen_random_uuid(),null,null,null from public.profiles where role='office_scheduler' and active limit 1;
do $$declare c external_delete_test;r public.external_requests;begin
 select * into c from external_delete_test;
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role) values(c.user_id,'pwqa-'||c.user_id||'@example.invalid','{"full_name":"QA Delete"}','{}','authenticated','authenticated'),(c.viewer_id,'pwqa-'||c.viewer_id||'@example.invalid','{"full_name":"QA Viewer"}','{}','authenticated','authenticated');
 update public.profiles set role='office_viewer' where id=c.viewer_id;
 c.installer_id:=public.pw_external_provision(c.user_id,'QA Delete','','qa-delete@example.invalid','','');
 perform set_config('request.jwt.claim.sub',c.office_id::text,true);
 r:=public.pw_external_save_request(jsonb_build_object('installer_id',c.installer_id,'address','Via di prova 1','floor','Terra','description','Verifica storico','price',100,'work_dates',jsonb_build_array((now() at time zone 'Europe/Rome')::date),'start_time','08:00','end_time','17:00'),null,null);
 perform set_config('request.jwt.claim.sub',c.user_id::text,true);
 r:=public.pw_external_respond(r.id,'accept',r.version,'{"accept_conditions":true}');
 update external_delete_test set installer_id=c.installer_id,request_id=r.id,pose_id=r.linked_pose_id;
 insert into storage.objects(bucket_id,name,owner_id,owner,metadata) values('pw-external-private','requests/'||r.id||'/before/'||c.user_id||'/photo.jpg',c.user_id::text,c.user_id,'{"mimetype":"image/jpeg","size":1024}');
 perform public.pw_external_register_file(r.id,'before','requests/'||r.id||'/before/'||c.user_id||'/photo.jpg','photo.jpg');
end;$$;
grant select,update on external_delete_test to authenticated;
set local role authenticated;
do $$declare c external_delete_test;denied boolean;outcome jsonb;begin
 select * into c from external_delete_test;
 perform set_config('request.jwt.claim.sub',c.user_id::text,true);
 denied:=false;begin perform public.pw_external_prepare_installer_delete(c.installer_id,'QA Delete');exception when others then denied:=true;end;if not denied then raise exception 'TEST failed: installer deleted account';end if;
 perform set_config('request.jwt.claim.sub',c.viewer_id::text,true);
 denied:=false;begin perform public.pw_external_prepare_installer_delete(c.installer_id,'QA Delete');exception when others then denied:=true;end;if not denied then raise exception 'TEST failed: viewer deleted account';end if;
 perform set_config('request.jwt.claim.sub',c.office_id::text,true);
 denied:=false;begin perform public.pw_external_prepare_installer_delete(c.installer_id,'Wrong name');exception when others then denied:=true;end;if not denied then raise exception 'TEST failed: confirmation not enforced';end if;
 if not(select active from public.external_installers where id=c.installer_id) then raise exception 'TEST failed: bad confirmation changed access';end if;
 outcome:=public.pw_external_prepare_installer_delete(c.installer_id,'QA Delete');
 if(select active from public.profiles where id=c.user_id) then raise exception 'TEST failed: old JWT retains active role';end if;
 if not exists(select 1 from public.external_requests where id=c.request_id) or not exists(select 1 from public.poses where id=c.pose_id) or not exists(select 1 from public.external_files where request_id=c.request_id) then raise exception 'TEST failed: deletion removed work or files';end if;
 if not exists(select 1 from storage.objects where bucket_id='pw-external-private' and name like 'requests/'||c.request_id||'/%' and owner_id=c.office_id::text and owner=c.office_id) then raise exception 'TEST failed: file ownership not preserved for office';end if;
 denied:=false;begin perform public.pw_external_finish_installer_delete(c.installer_id);exception when others then denied:=true;end;if not denied then raise exception 'TEST failed: finished before Auth deletion';end if;
 denied:=false;begin perform public.pw_external_save_installer(c.installer_id,'{"full_name":"QA Delete","active":true}');exception when others then denied:=true;end;if not denied then raise exception 'TEST failed: reactivation while deleting';end if;
 perform set_config('request.jwt.claim.sub',c.user_id::text,true);
 if exists(select 1 from public.external_requests where id=c.request_id) then raise exception 'TEST failed: deleted access still reads assigned work';end if;
end;$$;
reset role;
-- Simulate the Auth Admin API's deletion marker only inside this rolled-back test.
update auth.users set deleted_at=now() where id=(select user_id from external_delete_test);
set local role authenticated;
do $$declare c external_delete_test;outcome jsonb;denied boolean;begin
 select * into c from external_delete_test;
 perform set_config('request.jwt.claim.sub',c.office_id::text,true);
 outcome:=public.pw_external_finish_installer_delete(c.installer_id);
 if not coalesce((outcome->>'deleted')::boolean,false) or not exists(select 1 from public.external_installers where id=c.installer_id and deleted_at is not null and not active) then raise exception 'TEST failed: account not finalized';end if;
 if not exists(select 1 from public.external_bookings where request_id=c.request_id) then raise exception 'TEST failed: confirmed dates changed';end if;
 outcome:=public.pw_external_finish_installer_delete(c.installer_id);
 if not coalesce((outcome->>'deleted')::boolean,false) then raise exception 'TEST failed: retry not idempotent';end if;
 outcome:=public.pw_external_prepare_installer_delete(c.installer_id,'QA Delete');
 if not coalesce((outcome->>'already_deleted')::boolean,false) then raise exception 'TEST failed: deleted-account retry';end if;
 denied:=false;begin perform public.pw_external_save_request(jsonb_build_object('installer_id',c.installer_id,'address','Via test','floor','Terra','description','Incarico non consentito','price',10,'work_dates',jsonb_build_array((now() at time zone 'Europe/Rome')::date),'start_time','08:00','end_time','17:00'),null,null);exception when others then denied:=true;end;
 if not denied then raise exception 'TEST failed: new work assigned to deleted account';end if;
 if has_function_privilege('anon','public.pw_external_prepare_installer_delete(uuid,text)','execute') then raise exception 'TEST failed: anonymous deletion exposed';end if;
end;$$;
reset role;
rollback;
select 'PASS: only office may delete, typed confirmation, immediate access revocation, archived work/files/dates, safe file ownership, Auth-finalization guard, reactivation guard, idempotent recovery and no anonymous access' as result;
