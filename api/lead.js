/**
 * POST /api/lead — endpoint pubblico chiamato dal form della landing.
 *
 * Salva la lead in stato `cold` e registra l'evento `lead_created`.
 * È l'unica route raggiungibile senza autenticazione: non legge nulla dal
 * database e non restituisce dati, si limita a inserire.
 */

import { db, HttpError } from './_lib/supabase.js';
import { mapFormToLead, describeVehicle } from './_lib/leadMapper.js';
import { sendJson, sendError, readJsonBody, requireMethod } from './_lib/http.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const payload = await readJsonBody(req);

    // Honeypot: campo invisibile agli utenti reali. Se è compilato la richiesta
    // arriva da un bot; rispondiamo come se fosse andata a buon fine per non
    // dargli un segnale su cosa è stato bloccato.
    if (payload.website) {
      return sendJson(res, 200, { ok: true });
    }

    const lead = mapFormToLead(payload);

    const inserted = await db('leads', {
      method: 'POST',
      body: lead,
      prefer: 'return=representation',
    });

    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!row?.id) throw new HttpError(502, 'Lead non salvata correttamente');

    // Lo storico è secondario rispetto alla lead: se fallisce, la lead resta
    // salvata e l'utente vede comunque la conferma.
    try {
      await db('lead_events', {
        method: 'POST',
        body: {
          lead_id: row.id,
          type: 'lead_created',
          title: 'Lead ricevuta',
          description: `Richiesta di valutazione dal form: ${describeVehicle(row)}`,
          metadata: { source: row.source },
        },
        prefer: 'return=minimal',
      });
    } catch (eventError) {
      console.error('[api/lead] evento lead_created non registrato', eventError);
    }

    return sendJson(res, 201, { ok: true, id: row.id });
  } catch (error) {
    return sendError(res, error);
  }
}
