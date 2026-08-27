/** Helper condivisi per le route serverless. */

import { HttpError } from './supabase.js';

export function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

/** Traduce un errore in risposta JSON, senza mai esporre dettagli interni. */
export function sendError(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : 'Errore interno del server';
  if (status >= 500) console.error('[api]', error);
  sendJson(res, status, { error: message });
}

/** Legge il body JSON della richiesta, tollerando body già parsato da Vercel. */
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { throw new HttpError(400, 'Body JSON non valido'); }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Body JSON non valido'); }
}

/** Rifiuta i metodi HTTP non previsti dalla route. */
export function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  sendJson(res, 405, { error: 'Metodo non consentito' });
  return false;
}
