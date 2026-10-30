begin;
drop policy external_storage_read on storage.objects;
create policy external_storage_read on storage.objects for select to authenticated using(
 case when bucket_id='pw-external-private' and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then pw_external.can_access(((storage.foldername(name))[2])::uuid) else false end);
drop policy external_storage_insert on storage.objects;
create policy external_storage_insert on storage.objects for insert to authenticated with check(
 case when bucket_id='pw-external-private' and (storage.foldername(name))[1]='requests' and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then (storage.foldername(name))[4]=(select auth.uid())::text and (public.is_office_scheduler() or
 ((storage.foldername(name))[3] in('before','after') and pw_external.can_work(((storage.foldername(name))[2])::uuid) and exists(select 1 from public.external_requests r join public.external_installers i on i.id=r.installer_id where r.id=((storage.foldername(name))[2])::uuid and i.profile_id=(select auth.uid()) and i.active)))
 else false end);
create or replace function pw_external.normal_dates(p_data jsonb) returns date[] language plpgsql immutable set search_path='' as $$
declare result date[];
begin
 if jsonb_typeof(p_data)<>'array' then raise exception 'Indicare le date';end if;
 select array_agg(d order by d) into result from(select distinct v::date as d from jsonb_array_elements_text(p_data) a(v)) a;
 if coalesce(cardinality(result),0) not between 1 and 180 or array_position(result,null) is not null or exists(select 1 from unnest(result) d where not isfinite(d)) then raise exception 'Selezionare da 1 a 180 giornate valide';end if;
 return result;
end;$$;
alter table public.external_tests add constraint external_tests_checks_not_blank check(length(btrim(checks))>0);
commit;
