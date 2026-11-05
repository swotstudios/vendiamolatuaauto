/**
 * GET /api/cron/keepalive — tiene sveglio il progetto Supabase.
 *
 * Sul piano gratuito Supabase mette in pausa un progetto dopo alcuni giorni
 * senza attività, e al risveglio le funzioni falliscono: è già successo, con
 * /admin e il form della landing in errore. Una query banale al giorno basta
 * a far risultare il database attivo.
 *
 * Protetta da CRON_SECRET: Vercel invia automaticamente quell'header alle
 * esecuzioni pianificate quando la variabile è definita sul progetto, quindi
 * la rotta non è richiamabile da fuori.
 */

import { timingSafeEqual } from 'node:crypto';
import { db } from '../_lib/supabase.js';
import { sendJson, requireMethod } from '../_lib/http.js';

/** Confronto a tempo costante, senza rivelare nulla dalla durata. */
function matchesSecret(header, secret) {
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(String(header || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Senza segreto la rotta sarebbe aperta: meglio spenta.
    return sendJson(res, 500, { error: 'CRON_SECRET non configurata' });
  }

  if (!matchesSecret(req.headers.authorization, secret)) {
    return sendJson(res, 401, { error: 'Non autorizzato' });
  }

  try {
    // Query minima: serve solo a generare attività sul database.
    await db('leads?select=id&limit=1');
    return sendJson(res, 200, { ok: true, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[cron/keepalive]', error);
    return sendJson(res, 503, { ok: false, error: 'Database non raggiungibile' });
  }
}
