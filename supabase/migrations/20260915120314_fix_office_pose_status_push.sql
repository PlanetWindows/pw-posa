create or replace function public.enqueue_office_push()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_event_id uuid;
begin
  if new.notification_type not in ('issue_created','report_submitted','pose_status_changed') then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.recipient_id
      and p.role = 'office_scheduler'
      and p.active = true
  ) then
    return new;
  end if;

  insert into public.office_push_events(notification_id)
  values (new.id)
  returning id into v_event_id;

  perform net.http_post(
    url := 'https://vbpinzygwexuvwomnmbt.supabase.co/functions/v1/send-office-push',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('event_id',v_event_id)
  );

  return new;
end;
$function$;
