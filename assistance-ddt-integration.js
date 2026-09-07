(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let lastAssistanceId = null;

  const toast = message => {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4200);
  };

  function isAssistanceMode() {
    const fields = $('assistanceFields');
    return !!fields && !fields.classList.contains('hidden');
  }

  document.addEventListener('click', e => {
    const card = e.target.closest('[data-assistance]');
    if (card?.dataset.assistance) lastAssistanceId = card.dataset.assistance;
    if (e.target.closest('#newPoseBtn')) lastAssistanceId = null;
  }, true);

  async function resolveSavedAssistanceId(snapshot) {
    if (lastAssistanceId) return lastAssistanceId;
    for (let i = 0; i < 20; i++) {
      const { data, error } = await sb
        .from('assistances')
        .select('id,protocol_order,client_email,created_at,updated_at')
        .eq('protocol_order', snapshot.protocol)
        .eq('client_email', snapshot.email)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data?.id) return data.id;
      await new Promise(r => setTimeout(r, 180));
    }
    return null;
  }

  document.addEventListener('submit', e => {
    if (e.target?.id !== 'poseForm' || !isAssistanceMode()) return;
    const snapshot = {
      protocol: String($('assProtocol')?.value || '').trim(),
      email: String($('assEmail')?.value || '').trim()
    };
    // Let assistance.js save the assistance first. DDT is attached afterwards, so a DDT error can never block the assistance itself.
    setTimeout(async () => {
      try {
        const id = await resolveSavedAssistanceId(snapshot);
        if (!id) return;
        const ddt = await window.PW_DDT?.saveForAssistance?.(id);
        if (ddt) {
          lastAssistanceId = id;
          window.dispatchEvent(new CustomEvent('pwposa:assistance-ddt-saved', { detail: { assistanceId: id, ddtId: ddt.id } }));
        }
      } catch (error) {
        console.error('PW Posa assistance DDT:', error);
        toast('Assistenza salvata. Il DDT non è stato salvato: riapri l’assistenza e riprova il DDT.');
      }
    }, 350);
  }, true);
})();