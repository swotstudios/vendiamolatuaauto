/**
 * GET /api/admin/lead?id=<uuid> — dettaglio completo di una lead, la sua
 * timeline e lo stato delle email inviate, per il drawer della dashboard.
 */

import { db, HttpError } from '../_lib/supabase.js';
import { requireAdmin } from '../_lib/auth.js';
import { sendJson, sendError, requireMethod } from '../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  try {
    await requireAdmin(req);

    const url = new URL(req.url, `https://${req.headers.host}`);
    const id = url.searchParams.get('id');
    if (!id || !UUID_RE.test(id)) throw new HttpError(400, 'Identificativo lead non valido');

    const [lead] = await db(`leads?id=eq.${id}&select=*&limit=1`);
    if (!lead) throw new HttpError(404, 'Lead non trovata');

    const events = await db(
      `lead_events?lead_id=eq.${id}&select=id,type,title,description,metadata,created_at&order=created_at.asc`,
    );

    // Stato di consegna delle email: il corpo del messaggio non serve al
    // drawer, quindi non lo trasportiamo.
    const messages = await db(
      `messages?lead_id=eq.${id}` +
      `&select=id,channel,template_key,subject,status,provider_status,sent_at,delivered_at,` +
      `opened_at,last_opened_at,open_count,clicked_at,last_clicked_at,click_count,` +
      `bounced_at,complained_at,created_at` +
      `&order=created_at.desc`,
    );

    return sendJson(res, 200, { lead, events, messages });
  } catch (error) {
    return sendError(res, error);
  }
}
