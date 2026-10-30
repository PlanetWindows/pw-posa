# PW Posa

Web app di Planet Windows per programmare pose, assistenze, rilievi, uscite in cantiere e richiamate.

## Accessi

- `office_scheduler`: programma e gestisce tutte le attività, consulta ed esporta i fascicoli.
- `office_viewer`: consulta tutte le attività ed esporta i fascicoli, senza modificare la programmazione.
- `installer`: vede soltanto pose, assistenze e relativi documenti della propria squadra attiva.
- `technician`: vede le proprie attività; inserisce e sposta rilievi e uscite, compila note o rapportini facoltativi e allega foto/documenti.

La separazione è applicata sia nell'interfaccia sia attraverso le policy del database e dello storage. L'assegnazione ai posatori resta basata sulle squadre esistenti.

## Calendario e tecnico

`planner.js` gestisce le viste Mese, Settimana e Giorno. La vista mensile mostra due attività e il pulsante per aprire l'intera giornata. Le viste orarie affiancano gli appuntamenti contemporanei. Le giornate non consecutive vengono lette da `pose_dates` e `assistance_dates`.

`technician.js` gestisce i dati del cliente senza numero di commessa: nome, cognome, via, città, provincia, CAP, data e ora. I rilievi sono blu, le uscite in cantiere gialle, le note/richiamate fucsia. Nelle richiamate la data della telefonata resta distinta dallo stato Da fare/Completata e può essere modificata solo dall'ufficio. Il rapportino e gli allegati sono facoltativi.

L'ufficio può scaricare un PDF riepilogativo oppure un fascicolo ZIP con il PDF e tutti gli allegati privati.

## Notifiche

`notification-inbox.js` mostra lo storico personale e il conteggio delle notifiche non lette. I trigger generano titolo, riferimento e autore sul server, anche per le eliminazioni. L'avviso di fascicolo pronto non indica un autore. Il dispositivo push viene associato all'account che ha effettuato l'accesso e scollegato prima dell'uscita, anche quando più persone usano lo stesso browser. La coda `office_push_events` e la funzione `send-office-push` consegnano ora notifiche a tutti i ruoli interessati; i vecchi trigger push paralleli sono sostituiti per evitare duplicati.

Il fascicolo posa viene segnalato pronto quando la posa è completata, i rapportini collegati sono archiviati come PDF e gli eventuali DDT sono firmati. Per le assistenze servono stato completato e PDF finale; per le attività tecniche è sufficiente lo stato Completata, poiché il testo del rapportino è facoltativo.

## Configurazione e aggiornamento

`config.js` contiene soltanto URL e chiave pubblica Supabase. Le chiavi privilegiate rimangono nei segreti delle Edge Functions. Applicare la migrazione in `supabase/migrations` e distribuire le funzioni prima dei file statici.

La funzione `pw-posa-admin` autentica autonomamente un utente Ufficio Calendario tramite Admin Auth e può creare soltanto l'utenza tecnico prevista. Non reimposta le password degli utenti esistenti. Non inserire password o chiavi privilegiate nel codice o nel repository.

## Verifica

- `tests/permissions-and-notifications.sql`: eseguire dentro una transazione con ROLLBACK. Crea utenti sintetici e verifica assegnazioni, allegati, profili ufficio, data delle chiamate e notifiche. Non invia email.
- `tests/planner-browser.cjs`: prove Playwright dell'intera interfaccia con dati sintetici, su desktop e telefono; verifica calendario, sovrapposizioni, scheda tecnico, richiamate, PDF e fascicolo ZIP.
- `tests/mock-supabase.js` è una fixture locale per il browser e non viene caricata dall'app.

Le prove del browser richiedono Playwright e Chromium. `PW_TEST_VENDOR` può indicare una directory di moduli con le stesse versioni jsPDF e JSZip usate in `index.html`, per verificare le esportazioni senza dipendere dalla CDN. Nessuna prova deve contenere credenziali o dati reali dei clienti.


## PW Posa Esterni

`esterni/` contiene l’app dei posatori esterni. Ufficio e posatori accedono con Supabase; le richieste confermate creano una sola posa collegata e le date in `pose_dates`. Nel calendario PW Posa sono arancioni e indicano Confermata. Il riepilogo apre lo stesso incarico, con rapportini, foto multiple prima e dopo, collaudo e fascicolo ZIP. La guida operativa è in `esterni/README.md`.

La migrazione `20261030091202_pw_posa_esterni.sql` e la funzione `pw-external-admin` precedono la pubblicazione statica. `tests/external-workflow.sql` verifica transazioni, controproposte, permessi e notifiche con rollback; `node tests/external-export.cjs` verifica i PDF, le foto multiple e l’interruzione di esportazioni parziali.
