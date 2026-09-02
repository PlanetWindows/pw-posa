(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const BUCKET = 'pw-posa-documents';

  const showError = (msg) => {
    const el = document.getElementById('toast');
    if (el) {
      el.textContent = msg;
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 5000);
    } else {
      alert(msg);
    }
  };

  async function signedUrlForPath(path) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Link PDF non disponibile');
    return data.signedUrl;
  }

  async function pathForReport(reportId) {
    const { data, error } = await sb
      .from('daily_reports')
      .select('pdf_storage_path')
      .eq('id', reportId)
      .maybeSingle();
    if (error) throw error;
    if (data?.pdf_storage_path) return data.pdf_storage_path;

    // Fallback per PDF già presenti nello Storage ma non ancora collegati nel record.
    const { data: links, error: linkError } = await sb
      .from('daily_report_poses')
      .select('pose_id')
      .eq('report_id', reportId)
      .limit(1);
    if (linkError) throw linkError;
    const poseId = links?.[0]?.pose_id;
    if (!poseId) throw new Error('PDF non collegato a una posa');
    return `poses/${poseId}/rapportini/${reportId}.pdf`;
  }

  async function openPdfFromClick(button) {
    // Apriamo una scheda immediatamente nel gesto utente: Safari/Chrome mobile
    // altrimenti bloccano window.open() dopo l'attesa della signed URL.
    const popup = window.open('', '_blank');
    if (popup) {
      try {
        popup.document.write('<!doctype html><title>Apertura PDF…</title><body style="font-family:Arial;padding:24px">Apertura PDF…</body>');
      } catch (_) {}
    }

    try {
      let path = button.dataset.archivePdf || '';
      if (!path && button.dataset.reportPdf) path = await pathForReport(button.dataset.reportPdf);
      if (!path) throw new Error('Percorso PDF mancante');
      const url = await signedUrlForPath(path);

      if (popup && !popup.closed) {
        popup.location.replace(url);
      } else {
        // Fallback sicuro se il browser ha bloccato la nuova scheda.
        window.location.href = url;
      }
    } catch (err) {
      try { if (popup && !popup.closed) popup.close(); } catch (_) {}
      showError(`Apertura PDF: ${err?.message || err}`);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-report-pdf], [data-archive-pdf]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPdfFromClick(button);
  }, true);
})();