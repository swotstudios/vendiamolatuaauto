/**
 * Template delle email inviate ai clienti.
 *
 * Le email vanno scritte con stili inline e struttura a tabella: i client di
 * posta ignorano larga parte del CSS moderno. La palette segue quella della
 * landing (navy #0F2D52, oro #C9A227).
 */

const NAVY = '#0F2D52';
const GOLD = '#C9A227';
const TEXT = '#1C2733';
const MUTED = '#5B6875';
const BORDER = '#DCE2EA';
const CARD_BG = '#F4F6F9';

const euro = (amount) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(amount);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function vehicleLabel(lead) {
  return [lead.vehicle_make, lead.vehicle_model, lead.vehicle_year]
    .filter(Boolean).join(' ') || 'la tua auto';
}

/**
 * Email con la valutazione indicativa.
 *
 * Il testo resta allineato a quanto promette la landing: una prima fascia
 * indicativa, senza vincoli, con il passo successivo lasciato al cliente.
 */
export function valuationEmail(lead) {
  const firstName = lead.first_name ? escapeHtml(lead.first_name) : 'Ciao';
  const vehicle = escapeHtml(vehicleLabel(lead));
  const amount = euro(Number(lead.valuation_amount));
  const km = lead.vehicle_km === null || lead.vehicle_km === undefined
    ? null
    : `${new Intl.NumberFormat('it-IT').format(lead.vehicle_km)} km`;

  const subject = `La tua valutazione per ${vehicleLabel(lead)}: ${amount}`;

  const details = [
    ['Veicolo', vehicleLabel(lead)],
    ['Chilometraggio', km],
    ['Targa', lead.vehicle_plate],
  ].filter(([, value]) => value);

  const detailRows = details.map(([label, value]) => `
              <tr>
                <td style="padding:4px 0;color:${MUTED};font-size:14px;">${escapeHtml(label)}</td>
                <td style="padding:4px 0;color:${TEXT};font-size:14px;text-align:right;">${escapeHtml(value)}</td>
              </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#EEF1F6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

          <tr>
            <td style="background:${NAVY};padding:22px 28px;">
              <span style="color:#FFFFFF;font-size:17px;font-weight:600;letter-spacing:-0.01em;">
                vendiamolatua<span style="color:${GOLD};">auto</span>.com
              </span>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 28px 8px;">
              <p style="margin:0 0 14px;color:${TEXT};font-size:16px;">${firstName},</p>
              <p style="margin:0 0 22px;color:${TEXT};font-size:15px;line-height:1.6;">
                abbiamo analizzato i dati di <strong>${vehicle}</strong> che ci hai inviato.
                Ecco la nostra prima valutazione indicativa:
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:10px;">
                <tr>
                  <td align="center" style="padding:24px 20px;">
                    <div style="color:${MUTED};font-size:13px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">
                      Valutazione indicativa
                    </div>
                    <div style="color:${NAVY};font-size:34px;font-weight:700;letter-spacing:-0.02em;">
                      ${escapeHtml(amount)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${details.length ? `
          <tr>
            <td style="padding:20px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${detailRows}
              </table>
            </td>
          </tr>` : ''}

          <tr>
            <td style="padding:22px 28px 0;">
              <p style="margin:0 0 14px;color:${TEXT};font-size:15px;line-height:1.6;">
                È una stima basata sulle informazioni che ci hai fornito, senza alcun
                impegno da parte tua. Il valore definitivo può variare dopo che un
                nostro partner ha visto l'auto di persona.
              </p>
              <p style="margin:0 0 14px;color:${TEXT};font-size:15px;line-height:1.6;">
                <strong>Ti interessa un'offerta concreta?</strong> Rispondi a questa email
                e ti metteremo in contatto con un rivenditore verificato della tua zona.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 28px 28px;">
              <p style="margin:0;color:${MUTED};font-size:14px;line-height:1.6;">
                A presto,<br>Il team di Vendiamolatuaauto.com
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:${CARD_BG};padding:16px 28px;border-top:1px solid ${BORDER};">
              <p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5;">
                Ricevi questa email perché hai richiesto una valutazione su
                vendiamolatuaauto.com. Se non sei stato tu, ignora questo messaggio.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${lead.first_name || 'Ciao'},`,
    '',
    `abbiamo analizzato i dati di ${vehicleLabel(lead)} che ci hai inviato.`,
    'Ecco la nostra prima valutazione indicativa:',
    '',
    `  ${amount}`,
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    'È una stima basata sulle informazioni che ci hai fornito, senza alcun impegno',
    "da parte tua. Il valore definitivo può variare dopo che un nostro partner ha",
    "visto l'auto di persona.",
    '',
    "Ti interessa un'offerta concreta? Rispondi a questa email e ti metteremo in",
    'contatto con un rivenditore verificato della tua zona.',
    '',
    'A presto,',
    'Il team di Vendiamolatuaauto.com',
  ].join('\n');

  return { subject, html, text };
}
