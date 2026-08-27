/**
 * GET /api/admin/leads — elenco lead per la tabella della dashboard.
 *
 * Query string:
 *   q       ricerca su nome, email, telefono, targa, marca, modello
 *   status  filtro per stato (cold | warm | hot | assigned | purchased | lost)
 */

import { db, count, sanitizeFilterValue } from '../_lib/supabase.js';
import { requireAdmin } from '../_lib/auth.js';
import { sendJson, sendError, requireMethod } from '../_lib/http.js';

const LEAD_STATUSES = ['cold', 'warm', 'hot', 'assigned', 'purchased', 'lost'];

const COLUMNS = [
  'id', 'first_name', 'last_name', 'email', 'phone',
  'vehicle_make', 'vehicle_model', 'vehicle_version', 'vehicle_year', 'vehicle_plate',
  'status', 'valuation_amount', 'created_at', 'last_activity_at',
].join(',');

/**
 * Numeri di base per delivery, open e click rate. Il calcolo dei rate resta
 * alla vista: qui produciamo solo i conteggi grezzi.
 */
async function emailStats() {
  const [inviate, consegnate, aperte, cliccate, hot] = await Promise.all([
    count('messages?status=neq.failed'),
    count('messages?delivered_at=not.is.null'),
    count('messages?opened_at=not.is.null'),
    count('messages?clicked_at=not.is.null'),
    count('leads?hot_at=not.is.null'),
  ]);
  return { inviate, consegnate, aperte, cliccate, ctaAccettate: hot };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  try {
    await requireAdmin(req);

    const url = new URL(req.url, `https://${req.headers.host}`);
    const query = url.searchParams.get('q');
    const status = url.searchParams.get('status');

    const params = [`select=${COLUMNS}`, 'order=created_at.desc', 'limit=300'];

    if (status && LEAD_STATUSES.includes(status)) {
      params.push(`status=eq.${status}`);
    }

    const term = query ? sanitizeFilterValue(query) : '';
    if (term) {
      const pattern = `*${term}*`;
      const fields = [
        'first_name', 'last_name', 'email', 'phone',
        'vehicle_plate', 'vehicle_make', 'vehicle_model',
      ];
      params.push(`or=(${fields.map((f) => `${f}.ilike.${pattern}`).join(',')})`);
    }

    const leads = await db(`leads?${params.join('&')}`);

    // Riepilogo su tutte le email, indipendente dai filtri della tabella.
    // I conteggi arrivano dagli header Content-Range di PostgREST, così non
    // trasportiamo righe che non servono.
    const stats = await emailStats();

    return sendJson(res, 200, { leads, stats });
  } catch (error) {
    return sendError(res, error);
  }
}
