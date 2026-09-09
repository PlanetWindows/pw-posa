(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const BUCKET = 'pw-assistance-private';
  let session = null;
  let profile = null;
  let currentAssistanceId = null;

  const toast = (message) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3200);
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (s) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[s]));

  async function ensureInstaller() {
    if (profile) return profile.role === 'installer';
    const auth = await sb.auth.getSession();
    session = auth.data.session;
    if (!session) return false;
    const r = await sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    if (r.error) throw r.error;
    profile = r.data;
    return profile?.role === 'installer';
  }

  function safeName(name) {
    return String(name || 'foto.jpg').replace(/[^\w.-]+/g, '_').slice(-120);
  }

  async function openPhoto(path) {
    const r = await sb.storage.from(BUCKET).createSignedUrl(path, 900);
    if (r.error) throw r.error;
    window.open(r.data.signedUrl, '_blank');
  }

  async function renderPhotoList(assistanceId, section) {
    const r = await sb.from('assistance_photos')
      .select('id,storage_path,file_name,created_at')
      .eq('assistance_id', assistanceId)
      .order('created_at');
    if (r.error) throw r.error;

    const host = section.querySelector('.ass-detail-photos');
    if (!host) return;
    const photos = r.data || [];
    host.innerHTML = photos.length
      ? photos.map((p) => `<button type="button" class="ass-detail-photo" data-installer-photo-path="${esc(p.storage_path)}">${esc(p.file_name || 'Foto')}</button>`).join('')
      : '<span class="muted">Nessuna foto.</span>';

    host.querySelectorAll('[data-installer-photo-path]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await openPhoto(btn.dataset.installerPhotoPath); }
        catch (error) { toast('Impossibile aprire la foto: ' + (error.message || error)); }
      });
    });
  }

  async function uploadOne(assistanceId, file) {
    const path = `${assistanceId}/photos/${Date.now()}-${crypto.randomUUID()}-${safeName(file.name)}`;
    const up = await sb.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false
    });
    if (up.error) throw up.error;

    const ins = await sb.from('assistance_photos').insert({
      assistance_id: assistanceId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || 'image/jpeg',
      size_bytes: file.size,
      uploaded_by: session.user.id
    });
    if (ins.error) throw ins.error;
  }

  async function injectUploader(assistanceId) {
    if (!assistanceId) return;
    let allowed = false;
    try { allowed = await ensureInstaller(); }
    catch (error) { console.error(error); return; }
    if (!allowed) return;

    const dialog = document.getElementById('assistanceDetailDialog');
    const root = document.getElementById('assDetailContent');
    if (!dialog?.open || !root) return;

    const photoSection = [...root.querySelectorAll('.ass-detail-section')].find((section) =>
      /fotograf/i.test(section.querySelector('h4')?.textContent || '')
    );
    if (!photoSection) return;

    const existing = photoSection.querySelector('[data-installer-photo-uploader]');
    if (existing?.dataset.assistanceId === assistanceId) return;
    existing?.remove();

    const wrap = document.createElement('div');
    wrap.dataset.installerPhotoUploader = 'true';
    wrap.dataset.assistanceId = assistanceId;
    wrap.style.marginTop = '14px';
    wrap.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn ghost" data-add-installer-photos>+ Aggiungi foto</button>
        <span class="muted" data-installer-photo-status>Puoi caricare una o più fotografie dell'intervento.</span>
      </div>
      <input type="file" accept="image/*" multiple hidden data-installer-photo-input>
    `;
    photoSection.appendChild(wrap);

    const button = wrap.querySelector('[data-add-installer-photos]');
    const input = wrap.querySelector('[data-installer-photo-input]');
    const status = wrap.querySelector('[data-installer-photo-status]');

    button.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])].filter((file) => file.type.startsWith('image/'));
      input.value = '';
      if (!files.length) return toast('Seleziona almeno una fotografia.');

      button.disabled = true;
      status.textContent = files.length === 1 ? 'Caricamento foto…' : `Caricamento di ${files.length} foto…`;
      let uploaded = 0;
      try {
        for (const file of files) {
          await uploadOne(assistanceId, file);
          uploaded += 1;
        }
        await renderPhotoList(assistanceId, photoSection);
        status.textContent = uploaded === 1 ? '1 foto caricata.' : `${uploaded} foto caricate.`;
        toast(uploaded === 1 ? 'Foto aggiunta all’assistenza.' : `${uploaded} foto aggiunte all’assistenza.`);
      } catch (error) {
        console.error(error);
        status.textContent = uploaded ? `${uploaded} foto caricate; una foto non è stata salvata.` : 'Caricamento non riuscito.';
        toast('Caricamento foto: ' + (error.message || error));
      } finally {
        button.disabled = false;
      }
    });
  }

  function scheduleInject(id) {
    [80, 220, 500, 900].forEach((delay) => setTimeout(() => injectUploader(id), delay));
  }

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-assistance]');
    if (!opener?.dataset.assistance) return;
    currentAssistanceId = opener.dataset.assistance;
    scheduleInject(currentAssistanceId);
  }, true);

  new MutationObserver(() => {
    const dialog = document.getElementById('assistanceDetailDialog');
    if (dialog?.open && currentAssistanceId) injectUploader(currentAssistanceId);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
})();

(() => {
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!isIOS || document.querySelector('script[data-ios-assistance-send-fix]')) return;
  const script = document.createElement('script');
  script.src = 'ios-assistance-send-fix.js?v=20260909-iosmail1';
  script.dataset.iosAssistanceSendFix = '1';
  document.head.appendChild(script);
})();
