# Vendiamolatuaauto

Landing statica + API serverless per la raccolta e la gestione delle lead.

## Struttura

```
index.html                 Landing (statica, nessun build step)
admin/index.html           Dashboard interna /admin
api/lead.js                POST pubblico: salva la lead dal form
api/admin/config.js        Configurazione pubblica per la pagina admin
api/admin/leads.js         GET elenco lead (protetto)
api/admin/lead.js          GET dettaglio lead + timeline (protetto)
api/admin/valuation.js     POST stima + passaggio cold → warm (protetto)
api/_lib/                  Client Supabase e Resend, auth, mappatura, template email
supabase/migrations/       Migration applicate al progetto Supabase
```

Nessuna dipendenza npm: le funzioni usano `fetch` nativo verso l'API REST di
Supabase. Vercel serve i file statici ed esegue `/api` come funzioni Node.

## Sicurezza

- La `SUPABASE_SERVICE_ROLE_KEY` esiste solo lato server, in `/api`. Non compare
  mai in `index.html` né in `admin/index.html`.
- RLS è attiva su tutte le tabelle **senza policy**: il database non è
  raggiungibile con la sola chiave pubblica. Solo le funzioni server, che usano
  la service role, possono leggere e scrivere.
- `/admin` usa Supabase Auth (email + password). Ogni route admin verifica il
  token e controlla che l'email sia in `ADMIN_EMAILS` prima di toccare i dati.

Attenzione ai privilegi di tabella: `service_role` bypassa RLS ma **non** i
GRANT. Su questo database l'`ALTER DEFAULT PRIVILEGES` non concede i DML alle
nuove tabelle, quindi ogni tabella aggiunta in futuro va accompagnata da un
GRANT esplicito a `service_role`, altrimenti le funzioni rispondono 502 con
errore Postgres 42501.

## Variabili d'ambiente

Vedi `.env.example`. Servono in locale (`.env.local`) e su Vercel
(Production, Preview, Development):

| Variabile | Uso |
|---|---|
| `SUPABASE_URL` | URL del progetto Supabase |
| `SUPABASE_ANON_KEY` | Chiave pubblica: login admin e verifica dei token |
| `SUPABASE_SERVICE_ROLE_KEY` | Accesso al database, **solo server** |
| `ADMIN_EMAILS` | Email autorizzate a `/admin`, separate da virgola |
| `RESEND_API_KEY` | Invio email, **solo server** |
| `RESEND_FROM_EMAIL` | Mittente; il dominio va verificato su Resend |

## Flusso delle lead

```
form landing → /api/lead → leads (status: cold) + evento lead_created
                                     ↓
/admin → apri lead → stima → /api/admin/valuation
                                     ↓
                        stima salvata (sempre)
                                     ↓
                        email al cliente via Resend
                          ├─ inviata → status: warm, valuation_sent_at,
                          │            riga in messages, evento valuation_sent
                          └─ fallita → stato invariato, riga in messages
                                       con status failed, errore all'operatore
```

Lo stato `warm` significa "il cliente ha ricevuto la stima": non viene
impostato se l'email non è partita. La stima però resta salvata, così l'invio
si può ritentare senza reinserire nulla.

Gli stati successivi (`hot`, `assigned`, `purchased`, `lost`) esistono già a
schema ma non sono ancora gestiti dall'interfaccia.
