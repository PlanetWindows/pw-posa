(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  const pushClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let pending = null;
  let sending = false;

  function value(id) {
    return document.getElementById(id)?.value || '';
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'poseForm') return;
    pending = {
      event_type: value('poseId') ? 'updated' : 'created',
      team_id: value('teamId'),
      job_number: value('jobNumber').trim(),
      client_name: value('clientName').trim(),
      scheduled_date: value('scheduledDate'),
      start_time: value('startTime')
    };
  }, true);

  const toast = document.getElementById('toast');
  if (!toast) return;

  const observer = new MutationObserver(async () => {
    const message = (toast.textContent || '').trim();
    if (!pending || sending || !['Posa salvata', 'Posa aggiornata'].includes(message)) return;

    const payload = pending;
    pending = null;
    sending = true;
    try {
      const { data: sessionData } = await pushClient.auth.getSession();
      if (!sessionData?.session) throw new Error('Sessione non disponibile');

      const { data, error } = await pushClient.functions.invoke('send-push', { body: payload });
      if (error) throw error;
      if (!data?.success) console.warn('PW Posa: push non inviata', data);
      else console.log('PW Posa: push automatica inviata', data);
    } catch (error) {
      console.error('PW Posa: errore push automatica', error);
    } finally {
      sending = false;
    }
  });

  observer.observe(toast, { childList: true, characterData: true, subtree: true });
})();