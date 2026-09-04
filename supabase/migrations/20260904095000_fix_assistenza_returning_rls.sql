-- Permette a PostgREST di restituire la riga appena inserita dall'Ufficio.
-- La precedente policy SELECT passava da can_access_assistance(id), una funzione STABLE
-- che durante INSERT ... RETURNING poteva non vedere ancora la nuova riga nello snapshot.
drop policy if exists assistances_select on public.assistances;
create policy assistances_select on public.assistances
for select using (
  public.is_office_user()
  or (public.is_installer() and public.user_belongs_to_team(team_id))
);
