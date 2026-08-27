-- Applicata al progetto Supabase VLTA_Database (lzhtqdkunocvediekgal).
--
-- Il ruolo service_role, usato dalle funzioni serverless in /api, non aveva i
-- privilegi DML sulle tabelle: ogni scrittura falliva con 42501
-- ("permission denied for table leads") e le route rispondevano 502.
--
-- service_role bypassa RLS ma NON i GRANT di tabella: sono due meccanismi
-- distinti. Un ALTER DEFAULT PRIVILEGES presente su questo database concede
-- alle nuove tabelle solo Dxtm (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN),
-- mai i quattro DML, quindi le tabelle sono nate senza.
--
-- Vengono concessi solo i privilegi che il codice usa davvero. anon e
-- authenticated restano deliberatamente senza accesso: il database non è
-- raggiungibile con la sola chiave pubblica né per GRANT né per policy RLS.
--
-- NOTA per le tabelle future: nasceranno con lo stesso problema finché
-- l'ALTER DEFAULT PRIVILEGES resta invariato. Serve un GRANT esplicito.
grant select, insert, update on public.leads       to service_role;
grant select, insert         on public.lead_events to service_role;
grant insert                 on public.messages    to service_role;
