# PW Posa Esterni

Applicazione riservata a Ufficio PW Posa e posatori esterni abilitati. Condivide il progetto Supabase e gli accessi di PW Posa. Il percorso è `esterni/` nella stessa pubblicazione di PW Posa.

## Primo utilizzo

Accedere con le credenziali dell’ufficio di PW Posa. Da **Posatori → Nuovo posatore** inserire nome, azienda, email e telefono. Conservare e comunicare al posatore la password provvisoria mostrata una sola volta. Non viene inviata alcuna email automatica di creazione dell’account.

Da **Nuova richiesta** selezionare il posatore, compilare indirizzo, piano, lavoro, prezzo e giornate. Si possono allegare più PDF. Le giornate non consecutive si ottengono togliendo la selezione alle date da escludere.

Il posatore può accettare, rifiutare l’incarico o proporre altre date. La controproposta impegna le date solo quando l’ufficio la approva. L’accettazione conferma anche la pulizia del cantiere. La conferma crea una sola posa in PW Posa e blocca tutte le date, controllando le sovrapposizioni per lo stesso posatore.

Le pose confermate sono verdi con lucchetto nell’app Esterni, arancioni con “Confermata” in PW Posa. Il dettaglio in PW Posa apre il medesimo incarico: non è una copia indipendente.

Dopo la conferma si possono inserire più foto prima e dopo i lavori, compilare il rapportino per ciascuna giornata di posa trascorsa o corrente, segnalare lavoro incompleto con motivo obbligatorio, compilare il collaudo. Un collaudo conforme richiede la pulizia confermata e i rapportini fino alla data di collaudo; l’ultimo rapportino non deve indicare un problema irrisolto. Il collaudo con esito da completare lascia l’incarico incompleto.

L’ufficio esporta il fascicolo ZIP dal riepilogo in entrambe le app. Contiene riepilogo PDF, rapportini PDF, collaudo PDF, storico e tutti i documenti e le foto originali. Se un allegato non è scaricabile l’esportazione si interrompe con un errore, senza produrre un fascicolo parziale.

## Notifiche e installazione

Premere **Attiva notifiche** su ciascun dispositivo. Su iPhone aprire da Safari, aggiungere alla schermata Home e avviare dall’icona. Gli avvisi sono creati sul server per l’altra parte e per gli altri uffici abilitati; l’autore non riceve il proprio avviso. Le impostazioni e i permessi del dispositivo possono impedirne la visualizzazione.

Le notifiche nell’app funzionano anche senza permesso push. La funzione esistente `send-office-push` consegna le nuove notifiche usando la stessa coda, senza cambiare i destinatari delle attività esistenti. Uscendo dall’app, il dispositivo viene scollegato dall’account.

## Dati e sicurezza

Tutti i dati operativi sono su Supabase. Non sono presenti chiavi privilegiate nel client. Le nuove tabelle hanno RLS; ciascun posatore vede solo i propri incarichi. I file usano il bucket privato `pw-external-private`. I link agli allegati scadono. Prezzi, assegnazioni e conferme si modificano soltanto con funzioni server autorizzate e controllo di versione. Gli account vengono creati dalla Edge Function `pw-external-admin`, riservata all’ufficio. Le richieste accettate non si modificano dal vecchio editor di PW Posa per evitare divergenze.

La migrazione `20261030091202_pw_posa_esterni.sql` e la funzione `pw-external-admin` devono essere applicate prima della pubblicazione dei file. Il test `tests/external-workflow.sql` usa dati sintetici e annulla tutta la transazione.
