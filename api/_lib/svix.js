/**
 * Verifica della firma dei webhook Resend, che usa Svix.
 *
 * Il contenuto firmato è `${svix-id}.${svix-timestamp}.${body grezzo}`, con
 * HMAC-SHA256 e chiave ottenuta decodificando in base64 la parte del secret
 * dopo il prefisso `whsec_`. L'header può contenere più firme separate da
 * spazio, ognuna nel formato `versione,firma`: ne basta una valida di versione
 * v1 (durante una rotazione del secret Svix ne invia più di una).
 *
 * Il body deve essere quello grezzo, byte per byte: rileggerlo da un oggetto
 * già deserializzato produrrebbe una firma diversa.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Finestra di tolleranza sul timestamp, per respingere i replay. */
const TOLERANCE_SECONDS = 5 * 60;

/** Confronto a tempo costante fra due stringhe di lunghezza qualsiasi. */
function safeEquals(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * @param {object} params
 * @param {string} params.secret     valore di RESEND_WEBHOOK_SECRET (whsec_…)
 * @param {string} params.id         header svix-id
 * @param {string} params.timestamp  header svix-timestamp (secondi epoch)
 * @param {string} params.signature  header svix-signature
 * @param {string} params.body       corpo grezzo della richiesta
 * @returns {{ valid: boolean, reason?: string }}
 */
export function verifySvixSignature({ secret, id, timestamp, signature, body }) {
  if (!secret) return { valid: false, reason: 'secret non configurato' };
  if (!id || !timestamp || !signature) return { valid: false, reason: 'header di firma mancanti' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { valid: false, reason: 'timestamp non valido' };

  const skew = Math.abs(Date.now() / 1000 - sentAt);
  if (skew > TOLERANCE_SECONDS) return { valid: false, reason: 'timestamp fuori tolleranza' };

  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let key;
  try {
    key = Buffer.from(rawSecret, 'base64');
  } catch {
    return { valid: false, reason: 'secret non decodificabile' };
  }
  if (!key.length) return { valid: false, reason: 'secret vuoto' };

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`, 'utf8')
    .digest('base64');

  // L'header elenca "v1,firma" separati da spazio: ne basta una valida.
  const provided = String(signature).split(' ');
  for (const entry of provided) {
    const separator = entry.indexOf(',');
    if (separator === -1) continue;
    const version = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (version !== 'v1') continue;
    if (safeEquals(value, expected)) return { valid: true };
  }

  return { valid: false, reason: 'firma non corrispondente' };
}
