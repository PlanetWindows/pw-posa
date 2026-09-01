# PW Posa

Prima versione web dell'app PW Posa collegata a Supabase.

## File
- `index.html` — interfaccia
- `styles.css` — grafica responsive
- `app.js` — login, ruoli, calendario, pose, squadre e segnalazioni
- `config.js` — configurazione Supabase
- `manifest.webmanifest` — installazione come web app
- `favicon.svg` — icona

## Prima di pubblicare
Aprire `config.js` e sostituire:

`INCOLLA_QUI_LA_ANON_PUBLISHABLE_KEY`

con la **anon / publishable key** del progetto Supabase.

NON usare mai la `service_role` key nel browser o su GitHub.

## Ruoli previsti
- `office_scheduler`: gestione calendario e pose
- `office_viewer`: sola lettura ufficio
- `installer`: pose assegnate alla propria squadra

La sicurezza effettiva è demandata alle policy RLS già configurate in Supabase.
