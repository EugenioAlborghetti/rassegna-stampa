# Rassegna Stampa PWA

Applicazione web progressiva per consultare, ascoltare e ricostruire rassegne stampa giornaliere e storiche.

Il giorno corrente viene aperto automaticamente nel fuso orario italiano. Se manca un’edizione, l’app tenta di ricostruirla all’apertura. Il pulsante «Ricostruisci e registra» rimane disponibile anche sulle edizioni esistenti e genera una nuova revisione dopo ogni ricerca completata.

`POST /api/rebuild?date=AAAA-MM-GG` consulta l’archivio giornaliero de L’Eco di Bergamo, i feed RSS recenti e le ricerche Google News per sezione. Ogni risultato deve avere la data di pubblicazione richiesta nel fuso Europe/Rome, oppure comparire nell’elenco datato dell’archivio del quotidiano. Non usa la sola data di indicizzazione come prova. Le sezioni prive di risultati restano vuote e la copertura viene dichiarata nella risposta. La ricostruzione contiene titoli, eventuali estratti e collegamenti alle fonti, non sintesi redazionali automatiche.

Le ricostruzioni vengono registrate nel browser. Un binding Cloudflare KV `ARCHIVE`, se presente, abilita anche il salvataggio server; questa configurazione non è inclusa nel file `wrangler.toml`. L’app dichiara l’esito reale del salvataggio. Le edizioni pubblicate nella cartella `data` restano disponibili tramite `GET /api/edition?date=AAAA-MM-GG`; un’eventuale ricostruzione nel KV ha precedenza sui file pubblicati.

Per creare un’edizione pubblicabile dal terminale: `node scripts/rebuild.mjs AAAA-MM-GG`. Il comando controlla le date delle fonti prima di scrivere il relativo file nella cartella `data`. La pubblicazione richiede il commit del file nel repository collegato a Cloudflare.

Controlli: `npm test`. Versione distribuita e presenza dell’archivio server: `GET /api/version`.
