/**
 * GET /api/admin/config — configurazione pubblica per la pagina /admin.
 *
 * La landing è statica e non ha un build step in cui iniettare le variabili
 * d'ambiente: la pagina admin le chiede qui a runtime. Espone solo l'URL del
 * progetto, la chiave pubblica e il dominio del sito, mai la service role key.
 */

import { SUPABASE_URL, ANON_KEY } from '../_lib/supabase.js';
import { sendJson, requireMethod } from '../_lib/http.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  if (!SUPABASE_URL || !ANON_KEY) {
    return sendJson(res, 500, {
      error: "Configurazione incompleta: imposta SUPABASE_URL e SUPABASE_ANON_KEY.",
    });
  }

  // siteUrl serve alla pagina admin per costruire il redirect del link di
  // recupero password; è lo stesso dominio già usato per la CTA nelle email.
  return sendJson(res, 200, {
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    siteUrl: process.env.PUBLIC_SITE_URL || null,
  });
}
