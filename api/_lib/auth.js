/**
 * Protezione di /admin.
 *
 * Il client fa login con Supabase Auth (email + password) usando la chiave
 * pubblica e ottiene un JWT. Ogni chiamata alle route /api/admin/* porta quel
 * token, che qui viene verificato contro Supabase; solo dopo la verifica, e
 * solo se l'email è nell'allowlist, la route può usare la service role key.
 *
 * Non esiste alcuna password nel frontend: chi non è in ADMIN_EMAILS non passa
 * nemmeno con un account Supabase valido.
 */

import { SUPABASE_URL, ANON_KEY, HttpError } from './supabase.js';

function allowedEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Verifica il token della richiesta e restituisce l'utente admin.
 * Solleva HttpError 401/403 se la richiesta non è autorizzata.
 */
export async function requireAdmin(req) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new HttpError(500, "Variabili d'ambiente mancanti: SUPABASE_URL / SUPABASE_ANON_KEY");
  }

  const allowlist = allowedEmails();
  if (!allowlist.length) {
    throw new HttpError(500, 'ADMIN_EMAILS non configurata: accesso admin disabilitato');
  }

  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'Autenticazione richiesta');

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new HttpError(401, 'Sessione non valida o scaduta');

  const user = await res.json();
  const email = (user.email || '').toLowerCase();
  if (!allowlist.includes(email)) {
    throw new HttpError(403, 'Questo account non è autorizzato ad accedere alla dashboard');
  }

  return { id: user.id, email: user.email };
}
