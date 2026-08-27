/**
 * GET /api/admin/leads — elenco lead per la tabella della dashboard.
 *
 * Query string:
 *   q       ricerca su nome, email, telefono, targa, marca, modello
 *   status  filtro per stato (cold | warm | hot | assigned | purchased | lost)
 */

import { db, sanitizeFilterValue } from '../_lib/supabase.js';
import { requireAdmin } from '../_lib/auth.js';
import { sendJson, sendError, requireMethod } from '../_lib/http.js';

const LEAD_STATUSES = ['cold', 'warm', 'hot', 'assigned', 'purchased', 'lost'];

const COLUMNS = [
  'id', 'first_name', 'last_name', 'email', 'phone',
  'vehicle_make', 'vehicle_model', 'vehicle_version', 'vehicle_year', 'vehicle_plate',
  'status', 'valuation_amount', 'created_at', 'last_activity_at',
].join(',');

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
    return sendJson(res, 200, { leads });
  } catch (error) {
    return sendError(res, error);
  }
}
