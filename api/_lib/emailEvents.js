/**
 * Traduzione degli eventi webhook di Resend in aggiornamenti di `messages` e,
 * quando ha senso, in una riga della timeline della lead.
 *
 * Regola di fondo: **nessun evento email cambia lo stato della lead**.
 * Aperture e click generici sono segnali di interesse, non consensi. Il
 * passaggio warm → hot dipende unicamente dalla CTA esplicita gestita da
 * /api/lead-confirm.
 *
 * Questo vale a maggior ragione per i click: Resend traccia i click
 * riscrivendo i link, quindi anche gli scanner antispam che li seguono
 * generano `email.clicked`.
 */

/** Eventi che sappiamo interpretare. Gli altri vengono archiviati e basta. */
export const HANDLED_TYPES = new Set([
  'email.sent',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.delivery_delayed',
  'email.failed',
]);

/** Stato sintetico mostrato in dashboard; l'ordine riflette l'avanzamento. */
const STATUS_RANK = {
  queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4,
  delayed: 1, bounced: 5, complained: 5, failed: 5,
};

/** Uno stato non torna indietro, salvo bounce/reclamo che vincono sempre. */
function nextStatus(current, candidate) {
  if (!current) return candidate;
  const a = STATUS_RANK[current] ?? 0;
  const b = STATUS_RANK[candidate] ?? 0;
  return b >= a ? candidate : current;
}

/**
 * Calcola come aggiornare il messaggio e se creare un evento in timeline.
 *
 * @param {string} type      tipo dell'evento Resend
 * @param {object} message   riga corrente di messages
 * @param {string} occurredAt ISO dell'istante dell'evento
 * @param {object} data      oggetto `data` del payload
 * @returns {{ patch: object, timelineEvent: object|null }}
 */
export function applyEmailEvent(type, message, occurredAt, data = {}) {
  const patch = {};
  let timelineEvent = null;

  switch (type) {
    case 'email.sent':
      if (!message.sent_at) patch.sent_at = occurredAt;
      patch.status = nextStatus(message.status, 'sent');
      patch.provider_status = 'sent';
      break;

    case 'email.delivered':
      if (!message.delivered_at) {
        patch.delivered_at = occurredAt;
        timelineEvent = {
          type: 'note_added',
          title: 'Email consegnata',
          description: null,
        };
      }
      patch.status = nextStatus(message.status, 'delivered');
      patch.provider_status = 'delivered';
      break;

    case 'email.opened':
      patch.open_count = (message.open_count || 0) + 1;
      patch.last_opened_at = occurredAt;
      patch.status = nextStatus(message.status, 'opened');
      patch.provider_status = 'opened';
      // Solo la prima apertura finisce in timeline: le successive
      // aggiornano contatore e ultimo accesso senza aggiungere righe.
      if (!message.opened_at) {
        patch.opened_at = occurredAt;
        timelineEvent = {
          type: 'email_opened',
          title: 'Email aperta',
          description: 'Dato indicativo: alcuni client di posta caricano le immagini da soli.',
        };
      }
      break;

    case 'email.clicked':
      patch.click_count = (message.click_count || 0) + 1;
      patch.last_clicked_at = occurredAt;
      patch.status = nextStatus(message.status, 'clicked');
      patch.provider_status = 'clicked';
      if (!message.clicked_at) {
        patch.clicked_at = occurredAt;
        timelineEvent = {
          type: 'note_added',
          title: 'Link nella mail cliccato',
          description: linkOf(data)
            ? `Destinazione: ${linkOf(data)}`
            : 'Non equivale al consenso a essere contattato.',
        };
      }
      break;

    case 'email.bounced':
      if (!message.bounced_at) {
        patch.bounced_at = occurredAt;
        timelineEvent = {
          type: 'note_added',
          title: 'Email non consegnata (bounce)',
          description: bounceReason(data),
        };
      }
      patch.status = nextStatus(message.status, 'bounced');
      patch.provider_status = 'bounced';
      break;

    case 'email.complained':
      if (!message.complained_at) {
        patch.complained_at = occurredAt;
        timelineEvent = {
          type: 'note_added',
          title: 'Email segnalata come spam',
          description: 'Il destinatario ha contrassegnato il messaggio come indesiderato.',
        };
      }
      patch.status = nextStatus(message.status, 'complained');
      patch.provider_status = 'complained';
      break;

    case 'email.delivery_delayed':
      patch.provider_status = 'delayed';
      break;

    case 'email.failed':
      patch.status = nextStatus(message.status, 'failed');
      patch.provider_status = 'failed';
      timelineEvent = {
        type: 'note_added',
        title: 'Invio email non riuscito',
        description: data?.failed?.reason || null,
      };
      break;

    default:
      break;
  }

  return { patch, timelineEvent };
}

/** Il campo del link cambia nome fra le versioni del payload: proviamo i noti. */
function linkOf(data) {
  const link = data?.click?.link || data?.click?.url || data?.link || data?.url;
  return typeof link === 'string' ? link.slice(0, 200) : null;
}

/** Motivo del bounce, se il payload lo riporta. */
function bounceReason(data) {
  const bounce = data?.bounce;
  if (!bounce) return null;
  const parts = [bounce.type, bounce.subType].filter(Boolean).join(' / ');
  const message = typeof bounce.message === 'string' ? bounce.message.slice(0, 300) : null;
  return [parts, message].filter(Boolean).join(' — ') || null;
}
