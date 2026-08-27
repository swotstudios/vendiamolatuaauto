-- Applicata al progetto Supabase VLTA_Database (lzhtqdkunocvediekgal).
--
-- Tracciamento degli eventi email di Resend.
--
-- opened_at e clicked_at, già presenti, conservano la PRIMA apertura e il PRIMO
-- click: le colonne last_* e i contatori raccolgono le occorrenze successive.
-- Non sono state aggiunte first_opened_at / first_clicked_at perché sarebbero
-- state duplicati semantici delle colonne esistenti.
alter table public.messages
  add column if not exists delivered_at    timestamptz,
  add column if not exists last_opened_at  timestamptz,
  add column if not exists open_count      integer not null default 0,
  add column if not exists last_clicked_at timestamptz,
  add column if not exists click_count     integer not null default 0,
  add column if not exists bounced_at      timestamptz,
  add column if not exists complained_at   timestamptz,
  add column if not exists provider_status text;

-- provider_message_id diventa la chiave con cui il webhook ritrova il messaggio.
create index if not exists messages_provider_message_id_idx
  on public.messages (provider_message_id);

-- Storico grezzo degli eventi webhook.
--
-- provider_event_id è l'header svix-id, univoco per consegna: il vincolo UNIQUE
-- fa respingere i duplicati dal database, così un retry di Svix non può
-- incrementare due volte i contatori nemmeno con richieste concorrenti.
-- La tabella è anche la base per calcolare in futuro delivery/open/click rate.
create table if not exists public.email_events (
  id                uuid primary key default gen_random_uuid(),
  provider_event_id text        not null unique,
  message_id        uuid        references public.messages (id) on delete set null,
  lead_id           uuid        references public.leads (id)    on delete cascade,
  type              text        not null,
  provider_email_id text,
  payload           jsonb       not null default '{}'::jsonb,
  occurred_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists email_events_lead_id_idx    on public.email_events (lead_id);
create index if not exists email_events_message_id_idx on public.email_events (message_id);

alter table public.email_events enable row level security;

-- Su questo database le tabelle nascono senza privilegi DML (vedi la migration
-- 20260827_grant_dml_to_service_role): senza questi GRANT il webhook
-- fallirebbe con Postgres 42501. messages serviva già l'INSERT, ora il webhook
-- ha bisogno anche di leggere e aggiornare.
grant select, insert         on public.email_events to service_role;
grant select, insert, update on public.messages     to service_role;

comment on table public.email_events is 'Eventi webhook Resend, deduplicati sull''header svix-id';
