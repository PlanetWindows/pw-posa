-- Protegge il documento originale una volta firmato: la firma deve restare sempre collegata allo stesso originale.
create or replace function public.protect_signed_assistance_documents()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.signed_at is not null and (
    new.summary_document_path is distinct from old.summary_document_path or
    new.summary_document_name is distinct from old.summary_document_name or
    new.summary_document_mime is distinct from old.summary_document_mime or
    new.signed_document_path is distinct from old.signed_document_path or
    new.signed_document_name is distinct from old.signed_document_name or
    new.signer_name is distinct from old.signer_name or
    new.signed_at is distinct from old.signed_at
  ) then
    raise exception 'Il modulo originale e la versione firmata non possono essere sostituiti dopo la firma';
  end if;
  return new;
end;
$$;

drop trigger if exists assistances_protect_signed_documents on public.assistances;
create trigger assistances_protect_signed_documents
before update on public.assistances
for each row execute function public.protect_signed_assistance_documents();
