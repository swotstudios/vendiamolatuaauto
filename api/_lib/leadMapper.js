/**
 * Mappatura fra i campi del form della landing e le colonne della tabella
 * `leads`. È l'unico punto in cui i due nomi si incontrano: se il form cambia,
 * si aggiorna qui senza toccare lo schema del database.
 *
 * Campi del form senza colonna dedicata (le 10 domande dello step 2) finiscono
 * in `form_answers` (jsonb), così restano interrogabili senza aggiungere una
 * colonna per ogni domanda che potrebbe cambiare al prossimo redesign.
 */

import { HttpError } from './supabase.js';

/** Chiavi dello step 2 salvate in `form_answers`, nell'ordine di comparsa nel form. */
export const STEP2_KEYS = [
  'librettoManutenzione',
  'revisione',
  'tipoVenditore',
  'partitaIva',
  'leasing',
  'incidenti',
  'guidabile',
  'condizioniGenerali',
  'problemiMeccanici',
  'descrizioneProblema',
  'coloreEsterno',
];

/** Etichette leggibili delle domande dello step 2, usate dalla dashboard. */
export const STEP2_LABELS = {
  librettoManutenzione: 'Libretto di manutenzione',
  revisione: 'Revisione ultimi 6 mesi',
  tipoVenditore: 'Tipo venditore',
  partitaIva: 'Partita IVA',
  leasing: 'Leasing / finanziamento in corso',
  incidenti: 'Incidenti subiti',
  guidabile: 'Auto guidabile',
  condizioniGenerali: 'Condizioni generali',
  problemiMeccanici: 'Problemi meccanici o spie accese',
  descrizioneProblema: 'Descrizione del problema',
  coloreEsterno: 'Colore esterno',
};

const trimmed = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

/** "Mario Rossi Bianchi" -> { first_name: 'Mario', last_name: 'Rossi Bianchi' } */
function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: null, last_name: null };
  const first_name = parts.shift();
  return { first_name, last_name: parts.length ? parts.join(' ') : null };
}

function toInteger(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** Valida il payload del form e solleva HttpError 400 al primo problema. */
function validate({ step1, step3 }) {
  const problems = [];

  if (!trimmed(step1.marca)) problems.push('marca');
  if (!trimmed(step1.modello)) problems.push('modello');
  if (!toInteger(step1.anno)) problems.push('anno');
  if (toInteger(step1.km) === null) problems.push('chilometraggio');
  if (!trimmed(step3.nomeCognome)) problems.push('nome');

  const email = trimmed(step3.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('email');

  const phone = trimmed(step3.telefono);
  if (!phone || phone.replace(/\D/g, '').length < 7) problems.push('telefono');

  const cap = trimmed(step3.cap);
  if (!cap || !/^\d{5}$/.test(cap)) problems.push('CAP');

  if (!step3.accettaTermini) problems.push('accettazione termini');

  if (problems.length) {
    throw new HttpError(400, `Dati del form non validi: ${problems.join(', ')}`);
  }
}

/**
 * Converte il payload inviato dal form nella riga da inserire in `leads`.
 * @param {object} payload  { step1, step2, step3, tracking }
 */
export function mapFormToLead(payload) {
  const step1 = payload.step1 || {};
  const step2 = payload.step2 || {};
  const step3 = payload.step3 || {};
  const tracking = payload.tracking || {};

  validate({ step1, step3 });

  const { first_name, last_name } = splitFullName(step3.nomeCognome);

  // Prefisso internazionale e numero sono due controlli distinti nel form ma
  // una sola colonna nel database.
  const prefisso = trimmed(step3.prefisso);
  const numero = trimmed(step3.telefono);
  const phone = prefisso ? `${prefisso} ${numero}` : numero;

  const form_answers = {};
  for (const key of STEP2_KEYS) {
    const value = trimmed(step2[key]);
    if (value) form_answers[key] = value;
  }

  return {
    first_name,
    last_name,
    email: trimmed(step3.email)?.toLowerCase() ?? null,
    phone,
    postal_code: trimmed(step3.cap),

    vehicle_make: trimmed(step1.marca),
    vehicle_model: trimmed(step1.modello),
    vehicle_year: toInteger(step1.anno),
    vehicle_km: toInteger(step1.km),
    vehicle_plate: trimmed(step3.targa)?.toUpperCase() ?? null,
    // Lo step 2 chiede le condizioni generali con una domanda a pillole: è
    // l'unica risposta dello step che ha già una colonna dedicata.
    vehicle_condition: trimmed(step2.condizioniGenerali),

    desired_price: toInteger(step3.prezzoDesiderato),
    form_answers,
    terms_accepted_at: new Date().toISOString(),

    status: 'cold',
    source: trimmed(tracking.source) || 'landing',
    utm_source: trimmed(tracking.utm_source),
    utm_medium: trimmed(tracking.utm_medium),
    utm_campaign: trimmed(tracking.utm_campaign),
    utm_content: trimmed(tracking.utm_content),
    utm_term: trimmed(tracking.utm_term),
  };
}

/** Riepilogo dell'auto usato nei titoli degli eventi. */
export function describeVehicle(lead) {
  return [lead.vehicle_make, lead.vehicle_model, lead.vehicle_year]
    .filter(Boolean)
    .join(' ') || 'Veicolo non specificato';
}
