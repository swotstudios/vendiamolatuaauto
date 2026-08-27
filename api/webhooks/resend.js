/**
 * POST /api/webhooks/resend — eventi di consegna, apertura e click da Resend.
 *
 * Sicurezza:
 * - la firma Svix viene verificata sul body grezzo prima di qualsiasi lettura
 *   del database; una richiesta non firmata viene respinta con 401;
 * - il webhook può aggiornare soltanto le colonne di tracciamento di
 *   `messages`, mai una lead: nessun evento email cambia lo stato di una lead.
 *
 * Idempotenza: ogni consegna porta un header `svix-id` univoco, che viene
 * inserito in `email_events` sotto vincolo UNIQUE. Un retry viola il vincolo e
 * viene scartato dal database prima di toccare i contatori, quindi due
 * consegne dello stesso evento non possono contarne due.
 */

import { db, HttpError } from '../_lib/supabase.js';
import { verifySvixSignature } from '../_lib/svix.js';
import { applyEmailEvent, HANDLED_TYPES } from '../_lib/emailEvents.js';

// La firma è calcolata sui byte esatti del corpo: se Vercel lo deserializzasse
// e noi lo ri-serializzassimo, la verifica fallirebbe sempre.
export const config = { api: { bodyParser: false } };

/** Codice Postgres per violazione di vincolo univoco. */
const UNIQUE_VIOLATION = '23505';

function reply(res, status, payload) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(payload));
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Metodo non consentito' });
  }

  const rawBody = await readRawBody(req);

  const check = verifySvixSignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    id: req.headers['svix-id'],
    timestamp: req.headers['svix-timestamp'],
    signature: req.headers['svix-signature'],
    body: rawBody,
  });

  if (!check.valid) {
    // Il motivo resta nei log: al chiamante non diciamo cosa non tornava.
    console.warn('[webhook/resend] richiesta respinta:', check.reason);
    return reply(res, 401, { error: 'Firma non valida' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return reply(res, 400, { error: 'Payload non valido' });
  }

  const type = event?.type;
  const emailId = event?.data?.email_id;
  const eventId = req.headers['svix-id'];
  const occurredAt = event?.created_at || new Date().toISOString();

  if (!type || !emailId) {
    return reply(res, 400, { error: 'Payload incompleto' });
  }

  try {
    // Il messaggio potrebbe non essere nostro (test dal pannello Resend,
    // email inviate da altri strumenti): in quel caso archiviamo e basta.
    const [message] = await db(
      `messages?provider_message_id=eq.${encodeURIComponent(emailId)}` +
      `&select=id,lead_id,status,sent_at,delivered_at,opened_at,clicked_at,open_count,click_count,bounced_at,complained_at` +
      `&limit=1`,
    );

    // Prima si registra l'evento: se è un duplicato il vincolo UNIQUE lo
    // blocca qui e i contatori non vengono nemmeno sfiorati.
    try {
      await db('email_events', {
        method: 'POST',
        body: {
          provider_event_id: eventId,
          message_id: message?.id ?? null,
          lead_id: message?.lead_id ?? null,
          type,
          provider_email_id: emailId,
          payload: event,
          occurred_at: occurredAt,
        },
        prefer: 'return=minimal',
      });
    } catch (error) {
      if (error?.details?.code === UNIQUE_VIOLATION) {
        return reply(res, 200, { ok: true, duplicate: true });
      }
      throw error;
    }

    if (!message) return reply(res, 200, { ok: true, ignored: 'messaggio sconosciuto' });
    if (!HANDLED_TYPES.has(type)) return reply(res, 200, { ok: true, ignored: 'evento non gestito' });

    const { patch, timelineEvent } = applyEmailEvent(type, message, occurredAt, event.data);

    if (Object.keys(patch).length) {
      await db(`messages?id=eq.${message.id}`, {
        method: 'PATCH',
        body: patch,
        prefer: 'return=minimal',
      });
    }

    // Solo il primo evento del suo tipo finisce nello storico: le aperture e i
    // click successivi aggiornano contatori e timestamp senza aggiungere righe.
    if (timelineEvent && message.lead_id) {
      try {
        await db('lead_events', {
          method: 'POST',
          body: {
            lead_id: message.lead_id,
            type: timelineEvent.type,
            title: timelineEvent.title,
            description: timelineEvent.description,
            metadata: { channel: 'email', provider_event: type, provider_email_id: emailId },
          },
          prefer: 'return=minimal',
        });
      } catch (eventError) {
        console.error('[webhook/resend] evento timeline non registrato', eventError);
      }
    }

    return reply(res, 200, { ok: true });
  } catch (error) {
    console.error('[webhook/resend]', error);
    // Con un 5xx Svix riprova: corretto per un guasto temporaneo del database.
    return reply(res, error instanceof HttpError ? error.status : 500, { error: 'Errore interno' });
  }
}
