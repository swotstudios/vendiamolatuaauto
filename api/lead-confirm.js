/**
 * /api/lead-confirm — CTA "Sì, voglio essere contattato" dell'email di valutazione.
 *
 * GET  mostra la pagina di conferma e NON modifica nulla. È deliberato: i client
 *      di posta e i filtri antispam aprono da soli i link nelle email, e una GET
 *      che cambia stato produrrebbe lead hot che nessuno ha mai cliccato.
 * POST esegue la transizione warm → hot. Viene invocata dal JavaScript della
 *      pagina (o dal pulsante in <noscript>), che gli scanner non eseguono.
 *
 * Solo una lead `warm` può diventare `hot`. Una lead già hot risponde
 * "già registrata" senza duplicare eventi; lost, purchased e assigned non
 * cambiano stato e ricevono un messaggio neutro.
 */

import { db, HttpError } from './_lib/supabase.js';
import { hashToken, looksLikeToken } from './_lib/tokens.js';
import { confirmPage, OUTCOMES } from './_lib/confirmPage.js';

/** Legge il body sia in JSON (fetch) sia in form-urlencoded (fallback noscript). */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (!raw) return {};

  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try { return JSON.parse(raw); } catch { return {}; }
}

/** Cerca la lead dal token e stabilisce cosa si può fare, senza modificare nulla. */
async function inspect(token) {
  if (!looksLikeToken(token)) return { outcome: 'invalid' };

  const hash = hashToken(token);
  const [lead] = await db(
    `leads?confirmation_token_hash=eq.${hash}` +
    `&select=id,status,hot_at,confirmation_token_expires_at&limit=1`,
  );

  if (!lead) return { outcome: 'invalid' };

  const expiresAt = lead.confirmation_token_expires_at;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return { outcome: 'expired', lead };
  }

  if (lead.status === 'warm') return { outcome: 'pending', lead, hash };
  if (lead.status === 'hot') return { outcome: 'already', lead };
  return { outcome: 'ineligible', lead };
}

function sendHtml(res, status, html) {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // La pagina dipende dal token: non deve finire in nessuna cache condivisa.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.send(html);
}

async function handleGet(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const token = url.searchParams.get('token');

  let outcome;
  try {
    ({ outcome } = await inspect(token));
  } catch (error) {
    console.error('[api/lead-confirm] GET', error);
    return sendHtml(res, 500, confirmPage({ outcome: 'error' }));
  }

  // Solo quando la lead è davvero confermabile la pagina invia il POST.
  if (outcome === 'pending') {
    return sendHtml(res, 200, confirmPage({ outcome: 'confirmed', token }));
  }
  return sendHtml(res, outcome === 'invalid' ? 404 : 200, confirmPage({ outcome }));
}

async function handlePost(req, res) {
  const wantsJson = String(req.headers.accept || '').includes('application/json');
  const respond = (status, outcome) => {
    if (wantsJson) {
      res.status(status);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.send(JSON.stringify({ outcome, ...OUTCOMES[outcome] }));
    }
    return sendHtml(res, status, confirmPage({ outcome }));
  };

  let token;
  try {
    ({ token } = await readBody(req));
  } catch {
    return respond(400, 'invalid');
  }

  try {
    const state = await inspect(token);
    if (state.outcome !== 'pending') {
      const status = state.outcome === 'invalid' ? 404 : 200;
      return respond(status, state.outcome);
    }

    const now = new Date().toISOString();

    // L'aggiornamento filtra anche su status=warm: se due click arrivano
    // insieme, il database ne lascia passare uno solo e il secondo trova zero
    // righe. L'idempotenza non dipende dal controllo fatto sopra.
    const updated = await db(
      `leads?confirmation_token_hash=eq.${state.hash}&status=eq.warm`,
      {
        method: 'PATCH',
        body: {
          status: 'hot',
          hot_at: now,
          dealer_contact_consent: true,
          last_activity_at: now,
          updated_at: now,
        },
        prefer: 'return=representation',
      },
    );

    const rows = Array.isArray(updated) ? updated : [updated].filter(Boolean);
    if (!rows.length) {
      // Qualcun altro è arrivato prima: rileggiamo per dire la cosa giusta.
      const after = await inspect(token);
      return respond(200, after.outcome === 'pending' ? 'error' : after.outcome);
    }

    const leadId = rows[0].id;
    try {
      await db('lead_events', {
        method: 'POST',
        body: [
          {
            lead_id: leadId,
            type: 'cta_clicked',
            title: 'Ha cliccato "Sì, voglio essere contattato"',
            description: "Consenso a essere contattato da un partner, dall'email di valutazione",
            metadata: { source: 'email_cta' },
          },
          {
            lead_id: leadId,
            type: 'lead_became_hot',
            title: 'Lead passata a Hot',
            description: 'Stato aggiornato: Warm → Hot',
            metadata: { status_from: 'warm', status_to: 'hot', consent_at: now },
          },
        ],
        prefer: 'return=minimal',
      });
    } catch (eventError) {
      // Il consenso è già registrato: un problema sullo storico non deve
      // far vedere un errore al cliente.
      console.error('[api/lead-confirm] eventi non registrati', eventError);
    }

    return respond(200, 'confirmed');
  } catch (error) {
    console.error('[api/lead-confirm] POST', error);
    return respond(error instanceof HttpError ? error.status : 500, 'error');
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.setHeader('Allow', 'GET, POST');
  return sendHtml(res, 405, confirmPage({ outcome: 'error' }));
}
