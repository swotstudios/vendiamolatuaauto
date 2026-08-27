# Vendiamolatuaauto

Landing statica + API serverless per la raccolta e la gestione delle lead.

## Struttura

```
index.html                 Landing (statica, nessun build step)
admin/index.html           Dashboard interna /admin
api/lead.js                POST pubblico: salva la lead dal form
api/lead-confirm.js        CTA pubblica: consenso al contatto, warm → hot
api/webhooks/resend.js     Webhook Resend: consegne, aperture, click, bounce
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
| `PUBLIC_SITE_URL` | Dominio pubblico, per il link assoluto della CTA |
| `RESEND_WEBHOOK_SECRET` | Verifica della firma dei webhook Resend |

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

Poi, dall'email:

```
CTA "Sì, voglio essere contattato" → /api/lead-confirm?token=…
                                     ↓
                    GET: mostra la pagina, non scrive nulla
                                     ↓
                    POST (dal JavaScript della pagina)
                                     ↓
              solo se warm → hot, hot_at, dealer_contact_consent
              + eventi cta_clicked e lead_became_hot
```

Il token è casuale (32 byte) e nel database ne resta solo lo SHA-256; viene
rigenerato a ogni invio di valutazione e scade dopo 30 giorni.

**Perché la GET non modifica nulla**: i client di posta e i filtri antispam
aprono da soli i link contenuti nelle email. Se la GET cambiasse stato, quegli
accessi automatici produrrebbero lead `hot` che nessuno ha mai cliccato. La
conferma parte quindi da una POST inviata dal JavaScript della pagina, che gli
scanner non eseguono; con JavaScript disattivato resta il pulsante `<noscript>`.

Il passaggio avviene solo da `warm`, e l'UPDATE filtra a sua volta su
`status=eq.warm`: due click simultanei non possono produrre eventi doppi.
Gli stati `assigned` e `purchased` esistono a schema ma non sono ancora
gestiti dall'interfaccia.

## Tracciamento delle email

`/api/webhooks/resend` riceve gli eventi di Resend (consegna, apertura, click,
bounce, reclamo) e aggiorna le colonne di tracciamento di `messages`.

La firma Svix viene verificata sul **body grezzo**: per questo la funzione
disattiva il body parser di Vercel con `export const config`. Rileggere il
corpo da un oggetto già deserializzato produrrebbe byte diversi e ogni verifica
fallirebbe.

L'idempotenza è garantita dal database: ogni consegna porta un `svix-id`
univoco che viene inserito in `email_events` sotto vincolo `UNIQUE`, quindi un
retry viene respinto prima di toccare i contatori.

**Nessun evento email cambia lo stato di una lead.** Aperture e click sono
segnali di interesse, non consensi:

- l'open rate è inaffidabile in due direzioni: Apple Mail Privacy Protection
  precarica il pixel generando aperture mai avvenute, mentre i client che
  bloccano le immagini non ne registrano nessuna anche a email letta;
- Resend traccia i click riscrivendo i link, quindi anche gli scanner
  antispam che li seguono generano `email.clicked`.

L'unico segnale qualificante resta il click sulla CTA, protetto dal doppio
passaggio di `/api/lead-confirm`.
