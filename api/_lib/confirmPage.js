/**
 * Pagina pubblica mostrata al cliente che clicca la CTA nell'email.
 *
 * È servita dalla funzione /api/lead-confirm, non dal filesystem statico,
 * perché il contenuto dipende dall'esito del token. La palette segue quella
 * della landing (navy #0F2D52, oro #C9A227).
 *
 * Difesa dal prefetch: i client di posta e i filtri antispam aprono da soli i
 * link contenuti nelle email. Per questo la GET non modifica nulla: si limita
 * a mostrare questa pagina, ed è un frammento di JavaScript a inviare la
 * conferma via POST. Gli scanner automatici non eseguono JavaScript, quindi
 * non trasformano per sbaglio una lead in hot. Con JavaScript disattivato
 * resta il pulsante dentro <noscript>.
 */

const NAVY = '#0F2D52';
const GOLD = '#C9A227';
const TEXT = '#1C2733';
const MUTED = '#5B6875';
const BG = '#EEF1F6';
const BORDER = '#DCE2EA';

/** Testi finali per ogni esito possibile. */
export const OUTCOMES = {
  confirmed: {
    title: 'Richiesta ricevuta',
    body: 'Perfetto. Abbiamo registrato la tua disponibilità a essere contattato. '
        + 'Se individueremo un partner compatibile nella tua zona, ti contatterà '
        + "direttamente per approfondire la valutazione della tua auto.",
    tone: 'ok',
  },
  already: {
    title: 'Richiesta già registrata',
    body: 'Avevamo già registrato la tua disponibilità a essere contattato: '
        + 'non devi fare altro. Se individueremo un partner compatibile nella tua '
        + 'zona, ti contatterà direttamente.',
    tone: 'ok',
  },
  ineligible: {
    title: 'Richiesta già in gestione',
    body: 'Questa richiesta è già stata presa in carico. Se hai bisogno di '
        + "aggiornarla o hai domande, rispondi pure all'email che ti abbiamo "
        + 'inviato: ti risponderemo direttamente.',
    tone: 'neutral',
  },
  expired: {
    title: 'Link scaduto',
    body: 'Questo link non è più valido. Se vuoi ancora essere messo in contatto '
        + "con un partner della tua zona, rispondi all'email con la valutazione "
        + 'e ce ne occupiamo noi.',
    tone: 'neutral',
  },
  invalid: {
    title: 'Link non valido',
    body: 'Non siamo riusciti a riconoscere questo link. Potrebbe essere stato '
        + "copiato solo in parte. Rispondi all'email con la valutazione e ti "
        + 'aiutiamo noi.',
    tone: 'neutral',
  },
  error: {
    title: 'Qualcosa è andato storto',
    body: 'Non siamo riusciti a registrare la tua richiesta. Riprova fra qualche '
        + "minuto oppure rispondi all'email con la valutazione: ce ne occupiamo noi.",
    tone: 'neutral',
  },
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * @param {object} options
 * @param {keyof OUTCOMES} options.outcome  esito da mostrare subito
 * @param {string} [options.token]          se presente, la pagina conferma via POST
 */
export function confirmPage({ outcome, token }) {
  const content = OUTCOMES[outcome] || OUTCOMES.error;
  const autoConfirm = Boolean(token);

  // Testi di tutti gli esiti: il JavaScript sceglie quello giusto dopo il POST
  // senza dover ricaricare la pagina.
  const outcomesJson = JSON.stringify(
    Object.fromEntries(Object.entries(OUTCOMES).map(([key, v]) => [key, { title: v.title, body: v.body }])),
  );

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(content.title)} · Vendiamolatuaauto</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: ${BG};
    color: ${TEXT};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    line-height: 1.6;
  }
  .card {
    width: 100%;
    max-width: 520px;
    background: #FFFFFF;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(15, 45, 82, .1);
  }
  .card-head { background: ${NAVY}; padding: 20px 28px; }
  .brand { color: #FFFFFF; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
  .brand span { color: ${GOLD}; }
  .card-body { padding: 32px 28px; text-align: center; }
  .mark {
    width: 52px; height: 52px;
    margin: 0 auto 18px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .mark.ok { background: #E4F1E6; }
  .mark.neutral { background: #EDF0F5; }
  .mark svg { width: 26px; height: 26px; }
  h1 { font-size: 22px; margin: 0 0 10px; letter-spacing: -0.02em; }
  p { margin: 0; color: ${MUTED}; font-size: 15px; }
  .card-foot {
    padding: 16px 28px;
    border-top: 1px solid ${BORDER};
    text-align: center;
  }
  .card-foot a { color: ${NAVY}; font-size: 14px; text-decoration: none; font-weight: 500; }
  .card-foot a:hover { text-decoration: underline; }
  .confirm-btn {
    display: inline-block;
    margin-top: 20px;
    padding: 13px 26px;
    background: ${GOLD};
    color: ${NAVY};
    border: 0;
    border-radius: 50px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .spinner {
    width: 26px; height: 26px;
    border: 3px solid ${BORDER};
    border-top-color: ${NAVY};
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
</head>
<body>
  <div class="card">
    <div class="card-head">
      <span class="brand">vendiamolatua<span>auto</span>.com</span>
    </div>
    <div class="card-body">
      <div class="mark ${autoConfirm ? 'neutral' : content.tone}" id="mark">
        ${autoConfirm
          ? '<div class="spinner"></div>'
          : content.tone === 'ok'
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="#2C6E35" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 7"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>`}
      </div>
      <h1 id="title">${escapeHtml(autoConfirm ? 'Un momento…' : content.title)}</h1>
      <p id="body">${escapeHtml(autoConfirm ? 'Stiamo registrando la tua richiesta.' : content.body)}</p>
      ${autoConfirm ? `
      <noscript>
        <form method="POST" action="/api/lead-confirm">
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <button class="confirm-btn" type="submit">Sì, voglio essere contattato</button>
        </form>
      </noscript>` : ''}
    </div>
    <div class="card-foot">
      <a href="https://www.vendiamolatuaauto.com">Torna su Vendiamolatuaauto.com</a>
    </div>
  </div>
${autoConfirm ? `
<script>
(function () {
  var OUTCOMES = ${outcomesJson};
  var OK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#2C6E35" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 7"/></svg>';
  var NEUTRAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>';

  function render(outcome) {
    var content = OUTCOMES[outcome] || OUTCOMES.error;
    var isOk = outcome === 'confirmed' || outcome === 'already';
    document.getElementById('title').textContent = content.title;
    document.getElementById('body').textContent = content.body;
    var mark = document.getElementById('mark');
    mark.className = 'mark ' + (isOk ? 'ok' : 'neutral');
    mark.innerHTML = isOk ? OK_SVG : NEUTRAL_SVG;
    document.title = content.title + ' · Vendiamolatuaauto';
  }

  fetch('/api/lead-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ token: ${JSON.stringify(token)} })
  })
    .then(function (res) { return res.json().catch(function () { return {}; }); })
    .then(function (data) { render(data.outcome || 'error'); })
    .catch(function () { render('error'); });
})();
</script>` : ''}
</body>
</html>`;
}
