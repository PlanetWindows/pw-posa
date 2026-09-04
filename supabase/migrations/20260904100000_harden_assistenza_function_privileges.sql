-- Le funzioni trigger SECURITY DEFINER non devono essere richiamabili via RPC.
revoke execute on function public.prepare_assistance_change() from public, anon, authenticated;
revoke execute on function public.protect_assistance_office_fields() from public, anon, authenticated;
revoke execute on function public.notify_assistance_team() from public, anon, authenticated;
revoke execute on function public.notify_office_assistance_completed() from public, anon, authenticated;
revoke execute on function public.enqueue_assistance_push() from public, anon, authenticated;
revoke execute on function public.protect_signed_assistance_documents() from public, anon, authenticated;

-- Usata dalle policy RLS delle tabelle figlie: accessibile solo agli utenti autenticati.
revoke execute on function public.can_access_assistance(uuid) from anon;
grant execute on function public.can_access_assistance(uuid) to authenticated;
