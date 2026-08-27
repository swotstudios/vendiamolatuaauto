-- Applicata al progetto Supabase VLTA_Database (lzhtqdkunocvediekgal).
--
-- Token per la CTA "Sì, voglio essere contattato" nell'email di valutazione.
--
-- Nel database finisce solo lo SHA-256 del token: chi leggesse queste righe non
-- potrebbe costruire un link valido. Il token in chiaro esiste unicamente nel
-- link inviato al cliente e non contiene lead_id né dati personali.
--
-- Il consenso viene registrato sulle colonne già esistenti hot_at e
-- dealer_contact_consent: il passaggio a hot e il consenso coincidono, quindi
-- non è stata aggiunta una contact_consent_at che sarebbe stata una seconda
-- fonte di verità da tenere allineata.
alter table public.leads
  add column if not exists confirmation_token_hash text,
  add column if not exists confirmation_token_expires_at timestamptz;

create index if not exists leads_confirmation_token_hash_idx
  on public.leads (confirmation_token_hash);

comment on column public.leads.confirmation_token_hash is 'SHA-256 del token della CTA di contatto; il token in chiaro non viene mai salvato';
comment on column public.leads.confirmation_token_expires_at is 'Scadenza del token della CTA (30 giorni dall''invio della valutazione)';
