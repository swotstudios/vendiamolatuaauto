/**
 * Client minimale per l'API di Resend.
 *
 * Come per Supabase, niente dipendenze npm: una sola chiamata HTTP con fetch.
 * La chiave vive solo qui, lato server.
 */

import { HttpError } from './supabase.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

/** Nome mostrato come mittente accanto all'indirizzo. */
const FROM_NAME = 'Vendiamolatuaauto';

/** Oltre questo tempo consideriamo l'invio fallito e lo diciamo all'operatore. */
const TIMEOUT_MS = 10000;

export function isEmailConfigured() {
  return Boolean(RESEND_API_KEY && FROM_EMAIL);
}

/**
 * Invia una email tramite Resend.
 *
 * @param {{ to: string, subject: string, html: string, text: string, replyTo?: string }} message
 * @returns {Promise<{ id: string }>} identificativo del messaggio lato provider
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!isEmailConfigured()) {
    throw new HttpError(500, "Invio email non configurato: mancano RESEND_API_KEY o RESEND_FROM_EMAIL");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new HttpError(
      502,
      error.name === 'AbortError'
        ? "Il servizio di invio email non ha risposto in tempo"
        : "Impossibile contattare il servizio di invio email",
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Il messaggio di Resend è utile all'operatore (dominio non verificato,
    // destinatario rifiutato, quota esaurita), quindi lo lasciamo passare.
    const detail = data?.message || data?.error?.message || `errore ${res.status}`;
    throw new HttpError(502, `Invio email non riuscito: ${detail}`);
  }

  return { id: data.id };
}
