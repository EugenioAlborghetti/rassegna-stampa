# Rassegna Stampa PWA

Applicazione web progressiva per consultare, ascoltare e ricostruire rassegne stampa giornaliere e storiche.

Versione iniziale pubblicata dal progetto Rassegna Stampa PWA 2.6.

Il frontend funziona come PWA. La funzione `functions/api/edition.js` ricostruisce le date mancanti tramite fonti web indicizzate e può usare un archivio Cloudflare KV con binding `ARCHIVE` per conservarle lato server.

Per il deployment Cloudflare vedere `DEPLOY_CLOUDFLARE.txt`.
