/**
 * Token per la conferma di contatto inviata via email.
 *
 * Il token viaggia in chiaro solo dentro il link dell'email; nel database
 * viene conservato esclusivamente il suo SHA-256. Non contiene lead_id né
 * dati personali: è un valore casuale da 32 byte, non enumerabile.
 */

import { randomBytes, createHash } from 'node:crypto';

/** Durata del link inviato al cliente. */
export const TOKEN_TTL_DAYS = 30;

/** SHA-256 esadecimale, usato sia in scrittura sia in lettura. */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Genera un nuovo token di conferma.
 * Viene rigenerato a ogni invio di valutazione: vale sempre e solo il link
 * dell'ultima email, i precedenti smettono di funzionare.
 */
export function createConfirmationToken() {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, hash: hashToken(token), expiresAt: expiresAt.toISOString() };
}

/** URL assoluto della CTA, da inserire nell'email. */
export function confirmationUrl(token) {
  const base = (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  return `${base}/api/lead-confirm?token=${encodeURIComponent(token)}`;
}

/** I token sono opachi ma controlliamo comunque la forma prima di interrogare il database. */
export function looksLikeToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{20,120}$/.test(value);
}
