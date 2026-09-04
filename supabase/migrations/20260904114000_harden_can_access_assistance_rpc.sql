-- Limita l'helper RLS dell'Assistenza ai soli utenti autenticati.
revoke execute on function public.can_access_assistance(uuid) from public, anon;
grant execute on function public.can_access_assistance(uuid) to authenticated;
