-- Applicata al progetto Supabase VLTA_Database (lzhtqdkunocvediekgal).
--
-- Colonne additive per i dati raccolti dal form della landing che non avevano
-- ancora una destinazione. Nessuna colonna esistente viene rinominata o rimossa.
alter table public.leads
  add column if not exists postal_code text,
  add column if not exists form_answers jsonb not null default '{}'::jsonb,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.leads.postal_code is 'CAP raccolto dal form della landing';
comment on column public.leads.form_answers is 'Risposte dello step 2 del wizard (libretto, revisione, leasing, incidenti, ecc.)';
comment on column public.leads.terms_accepted_at is 'Timestamp accettazione termini e privacy dal form';
