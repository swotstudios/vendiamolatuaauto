/**
 * Client minimale per l'API REST di Supabase (PostgREST) e per GoTrue.
 *
 * Volutamente senza dipendenze npm: la landing è un sito statico servito da
 * Vercel senza build step, e mantenere zero dipendenze evita di introdurre
 * un passaggio di install/bundle su un progetto già in produzione.
 *
 * Le chiamate in questo modulo usano la service role key e devono quindi
 * partire ESCLUSIVAMENTE da codice server (cartella /api).
 */

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Errore con status HTTP, così le route possono propagarlo senza tradurlo. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Verifica che le variabili d'ambiente necessarie siano configurate. */
export function assertServerEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    throw new HttpError(500, `Variabili d'ambiente mancanti: ${missing.join(', ')}`);
  }
}

/**
 * Esegue una richiesta su PostgREST con la service role key.
 *
 * @param {string} path  es. `leads?select=*&order=created_at.desc`
 * @param {{ method?: string, body?: unknown, prefer?: string }} [options]
 */
export async function db(path, { method = 'GET', body, prefer } = {}) {
  assertServerEnv();

  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!res.ok) {
    const message = (data && data.message) || 'Errore nella comunicazione con il database';
    throw new HttpError(res.status === 404 ? 404 : 502, message, data);
  }
  return data;
}

/**
 * Conta le righe che soddisfano un filtro, senza trasportarle.
 * PostgREST restituisce il totale nell'header Content-Range con
 * `Prefer: count=exact`.
 */
export async function count(path) {
  assertServerEnv();

  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${separator}select=id&limit=1`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });

  if (!res.ok) return 0;
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

/**
 * Escape del testo usato dentro un filtro PostgREST.
 * Virgole e parentesi sono separatori nella sintassi `or=(...)`: se arrivassero
 * grezze dalla query dell'utente romperebbero (o altererebbero) il filtro.
 */
export function sanitizeFilterValue(value) {
  return String(value).replace(/[,()*\\]/g, ' ').trim();
}
