-- Run in a transaction and ROLLBACK. Includes synthetic Auth users; sends no mail.
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','pw-qa-office@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','pw-qa-installer-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000003','pw-qa-installer-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000004','pw-qa-tech-a@example.invalid'),
 ('10000000-0000-4000-8000-000000000005','pw-qa-tech-b@example.invalid'),
 ('10000000-0000-4000-8000-000000000006','pw-qa-viewer@example.invalid');
update public.profiles set role=case right(id::text,1) when '1' then 'office_scheduler' when '6' then 'office_viewer' when '4' then 'technician' when '5' then 'technician' else 'installer' end,full_name='QA '||right(id::text,1) where id::text like '10000000-0000-4000-8000-00000000000%';
insert into public.teams(id,name) values('20000000-0000-4000-8000-000000000001','QA squadra A'),('20000000-0000-4000-8000-000000000002','QA squadra B');
insert into public.team_members(team_id,user_id) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into public.poses(id,job_number,client_name,address,scheduled_date,scheduled_end_date,start_time,team_id) values
 ('30000000-0000-4000-8000-000000000001','QA-A','QA Cliente A','Via A','2026-10-21','2026-10-21','09:00','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','QA-B','QA Cliente B','Via B','2026-10-21','2026-10-21','10:00','20000000-0000-4000-8000-000000000002');
insert into public.pose_dates(pose_id,pose_date) values('30000000-0000-4000-8000-000000000001','2026-10-21'),('30000000-0000-4000-8000-000000000002','2026-10-21');
insert into public.assistances(id,protocol_order,client_name,client_email,address,scheduled_date,scheduled_end_date,start_time,team_id,issue_description,warranty,payment_required) values
 ('40000000-0000-4000-8000-000000000001','QA-ASS-A','QA Assistenza A','qa@example.invalid','Via A','2026-10-21','2026-10-21','09:00','20000000-0000-4000-8000-000000000001','QA problema',true,false),
 ('40000000-0000-4000-8000-000000000002','QA-ASS-B','QA Assistenza B','qa@example.invalid','Via B','2026-10-21','2026-10-21','10:00','20000000-0000-4000-8000-000000000002','QA problema',true,false);
insert into public.technician_activities(id,activity_type,technician_id,first_name,last_name,address,province,postal_code,scheduled_date,start_time) values
 ('50000000-0000-4000-8000-000000000001','survey','10000000-0000-4000-8000-000000000004','QA','Cliente A','Via A','MO','41037','2026-10-21','09:30'),
 ('50000000-0000-4000-8000-000000000002','site_visit','10000000-0000-4000-8000-000000000005','QA','Cliente B','Via B','MO','41037','2026-10-21','10:30');
insert into public.technician_activities(id,activity_type,technician_id,first_name,scheduled_date,office_notes) values('50000000-0000-4000-8000-000000000003','note','10000000-0000-4000-8000-000000000004','Franco','2026-10-20','Ha chiamato Franco: richiamalo.');
reset role;
do $$begin
 if not exists(select 1 from public.notifications where entity_id='30000000-0000-4000-8000-000000000001' and title='Nuova posa inserita' and actor_name='QA 1' and message like '%Da: QA 1') then raise exception 'QA: missing clear creation notification / author';end if;
 if exists(select 1 from public.notifications n join public.profiles p on p.id=n.recipient_id where n.entity_id='30000000-0000-4000-8000-000000000001' and p.role='technician') then raise exception 'QA: pose notification leaked to technician';end if;
end;$$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 if (select count(*) from public.poses where id in('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'))<>1 then raise exception 'QA: installer pose isolation';end if;
 if exists(select 1 from public.pose_dates where pose_id='30000000-0000-4000-8000-000000000002') then raise exception 'QA: installer date leakage';end if;
 if (select count(*) from public.assistances where id in('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002'))<>1 then raise exception 'QA: installer assistance isolation';end if;
 if exists(select 1 from public.technician_activities) then raise exception 'QA: installer sees technician data';end if;
end;$$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
do $$declare blocked boolean:=false;begin
 if exists(select 1 from public.poses) or exists(select 1 from public.assistances) then raise exception 'QA: technician sees installer data';end if;
 if (select count(*) from public.technician_activities)<>2 then raise exception 'QA: technician assignment isolation';end if;
 begin update public.technician_activities set scheduled_date='2026-10-22' where id='50000000-0000-4000-8000-000000000003';exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'QA: technician overwrote call date';end if;
 update public.technician_activities set scheduled_date='2026-10-23',start_time='11:00',technician_notes=null,status='completed' where id='50000000-0000-4000-8000-000000000001';
 if not exists(select 1 from public.technician_activities where id='50000000-0000-4000-8000-000000000001' and scheduled_date='2026-10-23' and status='completed' and technician_notes is null) then raise exception 'QA: reschedule or optional report failed';end if;
 update public.technician_activities set status='completed',technician_notes='Richiamato.' where id='50000000-0000-4000-8000-000000000003';
end;$$;
insert into storage.objects(bucket_id,name,owner_id) values('pw-technician-private','50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/foto.jpg','10000000-0000-4000-8000-000000000004');
insert into public.technician_attachments(activity_id,storage_path,file_name,mime_type,size_bytes) values('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/foto.jpg','foto.jpg','image/jpeg',100);
reset role;
do $$begin
 if (select count(*) from public.notifications where entity_type='technical' and entity_id='50000000-0000-4000-8000-000000000001' and recipient_id='10000000-0000-4000-8000-000000000001' and notification_type='dossier_ready')<>1 then raise exception 'QA: dossier-ready notice missing or duplicated';end if;
 if exists(select 1 from public.notifications where entity_id='50000000-0000-4000-8000-000000000001' and notification_type='dossier_ready' and (actor_name is not null or message like '%Da:%')) then raise exception 'QA: dossier-ready has an author';end if;
 if not exists(select 1 from public.notifications where entity_id='50000000-0000-4000-8000-000000000001' and event_action='updated' and actor_name='QA 4' and recipient_id='10000000-0000-4000-8000-000000000001') then raise exception 'QA: office not notified about technician rescheduling';end if;
end;$$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.technician_attachments where activity_id='50000000-0000-4000-8000-000000000001') then raise exception 'QA: private attachment metadata leakage';end if;
 if exists(select 1 from storage.objects where bucket_id='pw-technician-private' and name like '50000000-0000-4000-8000-000000000001/%') then raise exception 'QA: private attachment storage leakage';end if;
end;$$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
set local role authenticated;
do $$declare changed integer;begin
 if (select count(*) from public.technician_activities)<>3 then raise exception 'QA: office viewer cannot see all technical activity';end if;
 update public.technician_activities set status='todo' where id='50000000-0000-4000-8000-000000000001';get diagnostics changed=row_count;
 if changed<>0 then raise exception 'QA: office viewer can edit';end if;
end;$$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
update public.poses set start_time='11:00' where id='30000000-0000-4000-8000-000000000001';
update public.assistances set start_time='11:00' where id='40000000-0000-4000-8000-000000000001';
delete from public.poses where id='30000000-0000-4000-8000-000000000001';
delete from public.assistances where id='40000000-0000-4000-8000-000000000001';
reset role;
do $$begin
 if not exists(select 1 from public.notifications where entity_id='30000000-0000-4000-8000-000000000001' and title='Posa «QA-A» eliminata' and actor_name='QA 1') then raise exception 'QA: deleted pose notification lost its number or author';end if;
 if not exists(select 1 from public.notifications where entity_id='40000000-0000-4000-8000-000000000001' and title='Assistenza «QA-ASS-A» eliminata' and actor_name='QA 1') then raise exception 'QA: deleted assistance notification lost its number or author';end if;
end;$$;
select 'permissions_and_notifications_ok' as result;
