/**
 * POST /api/admin/valuation — salva la stima, la invia al cliente via email e
 * fa avanzare la lead da `cold` a `warm`.
 *
 * Ordine delle operazioni, pensato per non perdere lavoro se qualcosa fallisce:
 *   1. la stima viene salvata subito, sempre;
 *   2. si tenta l'invio dell'email;
 *   3. solo se l'email parte davvero la lead diventa `warm` e viene
 *      valorizzato `valuation_sent_at`.
 *
 * Se l'invio fallisce, l'operatore vede l'errore ma la stima resta salvata e
 * può ritentare: lo stato `warm` significa "il cliente ha ricevuto la stima",
 * quindi non va impostato se l'email non è partita.
 */

import { db, HttpError } from '../_lib/supabase.js';
import { requireAdmin } from '../_lib/auth.js';
import { sendEmail, isEmailConfigured } from '../_lib/resend.js';
import { valuationEmail } from '../_lib/emailTemplates.js';
import { sendJson, sendError, readJsonBody, requireMethod } from '../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_LABELS = {
  cold: 'Cold', warm: 'Warm', hot: 'Hot',
  assigned: 'Assegnata', purchased: 'Acquistata', lost: 'Persa',
};

const euro = (amount) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(amount);

/** Registra il messaggio inviato (o il tentativo fallito) nella tabella messages. */
async function logMessage(leadId, { subject, body, providerId, status, sentAt }) {
  try {
    await db('messages', {
      method: 'POST',
      body: {
        lead_id: leadId,
        channel: 'email',
        template_key: 'valuation',
        subject,
        body,
        provider_message_id: providerId ?? null,
        status,
        sent_at: sentAt ?? null,
      },
      prefer: 'return=minimal',
    });
  } catch (error) {
    console.error('[api/admin/valuation] messaggio non registrato', error);
  }
}

/** Scrive gli eventi della timeline senza far fallire la richiesta principale. */
async function logEvents(events) {
  try {
    await db('lead_events', { method: 'POST', body: events, prefer: 'return=minimal' });
  } catch (error) {
    console.error('[api/admin/valuation] eventi non registrati', error);
  }
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const admin = await requireAdmin(req);
    const { id, amount, note } = await readJsonBody(req);

    if (!id || !UUID_RE.test(id)) throw new HttpError(400, 'Identificativo lead non valido');

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new HttpError(400, 'Inserisci una stima valida maggiore di zero');
    }

    if (!isEmailConfigured()) {
      throw new HttpError(500, "Invio email non configurato: mancano RESEND_API_KEY o RESEND_FROM_EMAIL");
    }

    const [current] = await db(`leads?id=eq.${id}&select=*&limit=1`);
    if (!current) throw new HttpError(404, 'Lead non trovata');

    if (!current.email) {
      throw new HttpError(400, 'Questa lead non ha un indirizzo email: impossibile inviare la valutazione');
    }

    const now = new Date().toISOString();
    const previousAmount = current.valuation_amount === null ? null : Number(current.valuation_amount);

    // 1. La stima viene salvata subito: se l'invio fallirà, il lavoro resta.
    await db(`leads?id=eq.${id}`, {
      method: 'PATCH',
      body: {
        valuation_amount: value,
        valuation_note: (note ?? '').trim() || null,
        valuation_saved_at: now,
        last_activity_at: now,
        updated_at: now,
      },
      prefer: 'return=minimal',
    });

    await logEvents([{
      lead_id: id,
      type: 'valuation_saved',
      title: previousAmount ? `Stima aggiornata: ${euro(value)}` : `Stima inserita: ${euro(value)}`,
      description: previousAmount ? `Valore precedente: ${euro(previousAmount)}` : null,
      metadata: { amount: value, previous_amount: previousAmount, by: admin.email },
    }]);

    // 2. Invio dell'email al cliente.
    const message = valuationEmail({ ...current, valuation_amount: value });
    let sent;
    try {
      sent = await sendEmail({
        to: current.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (sendError_) {
      await logMessage(id, {
        subject: message.subject,
        body: message.text,
        providerId: null,
        status: 'failed',
        sentAt: null,
      });
      await logEvents([{
        lead_id: id,
        type: 'note_added',
        title: 'Invio della valutazione non riuscito',
        description: sendError_.message,
        metadata: { by: admin.email, channel: 'email' },
      }]);

      // La stima è salvata: lo comunichiamo insieme all'errore, così l'operatore
      // sa che può limitarsi a ritentare l'invio.
      throw new HttpError(
        502,
        `${sendError_.message}. La stima è stata salvata: puoi ritentare l'invio.`,
      );
    }

    // 3. Email partita: ora la lead può avanzare.
    const nextStatus = current.status === 'cold' ? 'warm' : current.status;
    const statusChanged = nextStatus !== current.status;
    const sentAt = new Date().toISOString();

    const updated = await db(`leads?id=eq.${id}`, {
      method: 'PATCH',
      body: {
        status: nextStatus,
        valuation_sent_at: sentAt,
        last_activity_at: sentAt,
        updated_at: sentAt,
      },
      prefer: 'return=representation',
    });

    await logMessage(id, {
      subject: message.subject,
      body: message.text,
      providerId: sent.id,
      status: 'sent',
      sentAt,
    });

    await logEvents([{
      lead_id: id,
      type: 'valuation_sent',
      title: `Valutazione inviata a ${current.email}`,
      description: statusChanged
        ? `Stato aggiornato: ${STATUS_LABELS[current.status]} → ${STATUS_LABELS[nextStatus]}`
        : null,
      metadata: {
        by: admin.email,
        provider_message_id: sent.id,
        status_from: current.status,
        status_to: nextStatus,
      },
    }]);

    const timeline = await db(
      `lead_events?lead_id=eq.${id}&select=id,type,title,description,metadata,created_at&order=created_at.asc`,
    );

    return sendJson(res, 200, {
      ok: true,
      lead: Array.isArray(updated) ? updated[0] : updated,
      events: timeline,
      emailSentTo: current.email,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
