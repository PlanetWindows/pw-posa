(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);
  let currentAssistanceId = new URLSearchParams(location.search).get('assistance') || null;
  let busy = false;

  const toast = (message) => {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4200);
  };

  const showError = (message = '') => {
    const el = $('assV4Error');
    if (!el) return;
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
  };

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function freshSession(force = false) {
    let { data, error } = await sb.auth.getSession();
    if (error) throw error;
    let session = data.session;
    const expiresSoon = session?.expires_at && (session.expires_at * 1000) < Date.now() + 90000;
    if (force || expiresSoon) {
      const refreshed = await sb.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      session = refreshed.data.session;
    }
    if (!session?.access_token) throw new Error('Sessione scaduta. Esci e accedi di nuovo.');
    return session;
  }

  async function latestDdt(assistanceId) {
    const r = await sb.from('ddt_documents')
      .select('id')
      .eq('assistance_id', assistanceId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (r.error) throw r.error;
    return r.data?.[0] || null;
  }

  async function checkSent(assistanceId) {
    const r = await sb.from('assistances')
      .select('email_status')
      .eq('id', assistanceId)
      .maybeSingle();
    return !r.error && r.data?.email_status === 'sent';
  }

  async function callUnified(payload, forceRefresh = false) {
    const session = await freshSession(forceRefresh);
    const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/finalize-assistance-ios`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: cfg.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401 && !forceRefresh) return callUnified(payload, true);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `Errore invio (${response.status})`);
    }
    return data;
  }

  async function finalizeIOS() {
    if (busy) return;
    showError('');

    const assistanceId = currentAssistanceId;
    if (!assistanceId) return showError('Assistenza non identificata. Chiudi e riapri la scheda.');

    const resolved = document.querySelector('input[name="assV4Resolved"]:checked')?.value;
    if (!resolved) return showError('Indica se il problema è stato risolto.');

    const notResolved = resolved === 'false';
    const intervention = ($('assV4Intervention')?.value || '').trim();
    const notes = ($('assV4Notes')?.value || '').trim();
    const signer = ($('assV4Signer')?.value || '').trim();

    if (notResolved && !intervention) return showError('Descrivi come siamo intervenuti.');
    if (!notes) return showError('Inserisci le note finali.');
    if (!signer) return showError('Inserisci nome e cognome del cliente.');

    for (const [id, label] of [
      ['assV4ReportInstaller', 'Firma Posatore – Rapportino'],
      ['assV4ReportClient', 'Firma Cliente – Rapportino'],
      ['assV4DdtInstaller', 'Firma Posatore – DDT'],
      ['assV4DdtClient', 'Firma Cliente – DDT']
    ]) {
      if ($(id)?.dataset.signed !== '1') return showError(`${label} obbligatoria.`);
    }

    const button = $('assV4Send');
    const progress = $('assV4Progress');
    busy = true;
    if (button) button.disabled = true;

    try {
      const ddt = await latestDdt(assistanceId);
      if (!ddt) throw new Error('DDT non presente.');

      const payload = {
        assistance_id: assistanceId,
        ddt_id: ddt.id,
        intervention: notResolved ? intervention : 'Problema risolto',
        problem_resolved: resolved === 'true',
        final_notes: notes,
        installer_signer_name: 'Angelo Idone',
        signer_name: signer,
        report_installer_signature_data_url: $('assV4ReportInstaller').toDataURL('image/png'),
        report_client_signature_data_url: $('assV4ReportClient').toDataURL('image/png'),
        ddt_installer_signature_data_url: $('assV4DdtInstaller').toDataURL('image/png'),
        ddt_client_signature_data_url: $('assV4DdtClient').toDataURL('image/png')
      };

      if (progress) progress.textContent = 'Preparazione documenti e invio email…';
      await callUnified(payload);

      if (progress) progress.textContent = 'Invio completato.';
      toast('Rapportino + DDT inviati in un’unica email.');
      $('assistanceDetailDialog')?.close();
    } catch (error) {
      console.error('PW Posa iOS assistance send:', error);

      let sent = false;
      try {
        sent = await checkSent(assistanceId);
        if (!sent) {
          await pause(1200);
          sent = await checkSent(assistanceId);
        }
      } catch (_) {}

      if (sent) {
        if (progress) progress.textContent = 'Invio completato.';
        toast('Rapportino + DDT inviati in un’unica email.');
        $('assistanceDetailDialog')?.close();
      } else {
        showError(error?.message || String(error));
        if (progress) progress.textContent = 'Nessuna nuova email inviata. Correggi e riprova.';
        if (button) button.disabled = false;
      }
    } finally {
      busy = false;
    }
  }

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-assistance]');
    if (opener?.dataset.assistance) currentAssistanceId = opener.dataset.assistance;

    const send = event.target.closest('#assV4Send');
    if (!send) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    finalizeIOS();
  }, true);
})();
