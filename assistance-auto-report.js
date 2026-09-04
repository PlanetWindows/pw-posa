(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let profile = null;
  let currentId = new URLSearchParams(location.search).get('assistance') || null;
  let busy = false;

  const toast = msg => {
    const el = $('toast');
    if (!el) return alert(msg);
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3200);
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));

  async function loadProfile(){
    const { data:{ session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data } = await sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    profile = data || null;
    return profile;
  }

  function hideOfficeUpload(){
    const input = $('assDocInput');
    const block = input?.closest('.upload-block');
    if (block) block.style.display = 'none';
  }

  function cleanDocumentButtons(){
    const root = $('assDetailContent');
    if (!root) return;
    root.querySelectorAll('.document-actions .btn').forEach(btn => {
      const text = (btn.textContent || '').trim();
      if (text.startsWith('Modulo originale') || text.startsWith('Modulo firmato')) btn.style.display = 'none';
      if (text.startsWith('Rapportino finale')) btn.textContent = text.includes('non disponibile') ? 'Rapportino assistenza · non disponibile' : 'Rapportino assistenza firmato';
    });
  }

  function removeLegacyInstallerSections(){
    const root = $('assDetailContent');
    if (!root) return;
    root.querySelectorAll('.ass-detail-section').forEach(sec => {
      const title = sec.querySelector('h4')?.textContent?.trim() || '';
      if (title === 'Firma digitale cliente' || title === 'Rapportino di fine assistenza') sec.remove();
      if (sec.textContent?.includes('Firma non disponibile') && sec.textContent?.includes('Ufficio deve caricare')) sec.remove();
      if (sec.classList.contains('completion-ok') && sec.textContent?.includes('Modulo firmato')) sec.remove();
    });
  }

  async function enhanceDetail(){
    const dialog = $('assistanceDetailDialog');
    const root = $('assDetailContent');
    if (!dialog?.open || !root) return;
    cleanDocumentButtons();
    if (profile?.role !== 'installer' || !currentId) return;
    removeLegacyInstallerSections();
    if (root.querySelector('[data-auto-assistance-report]')) return;

    const { data:a, error } = await sb.from('assistances').select('*').eq('id', currentId).single();
    if (error || !a) return;

    if (a.signed_at || a.final_report_path) {
      root.insertAdjacentHTML('beforeend', `<div class="ass-detail-section completion-ok" data-auto-assistance-report><strong>Rapportino assistenza completato e firmato</strong><p class="muted">Il PDF è archiviato e lo stato email è: ${esc(({sent:'Inviato',retry:'Da riprovare',failed:'Fallito',pending:'In attesa'})[a.email_status] || a.email_status)}.</p></div>`);
      return;
    }

    root.insertAdjacentHTML('beforeend', `
      <div class="ass-detail-section" data-auto-assistance-report>
        <h4>Rapportino di assistenza</h4>
        <p class="muted">Compila l'intervento. Alla conferma PW Posa genera automaticamente il PDF, acquisisce la firma del cliente, lo archivia e lo invia via email.</p>
        <label>Problematica riscontrata *<textarea id="autoAssIssue" rows="4">${esc(a.final_issue_description || a.issue_description || '')}</textarea></label>
        <label>Il problema è stato risolto? *<select id="autoAssResolved"><option value="">Seleziona</option><option value="true">Sì</option><option value="false">No</option></select></label>
        <label>Come si è intervenuti *<textarea id="autoAssIntervention" rows="5">${esc(a.intervention || '')}</textarea></label>
        <label>Note finali<textarea id="autoAssNotes" rows="3">${esc(a.final_notes || '')}</textarea></label>
        <div style="height:1px;background:var(--line);margin:18px 0"></div>
        <h4>Firma del cliente</h4>
        <label>Nome e cognome del firmatario *<input id="autoAssSigner" autocomplete="name"></label>
        <div class="signature-wrap" style="margin-top:10px"><canvas id="autoAssCanvas" width="900" height="300" style="touch-action:none;width:100%;background:#fff"></canvas></div>
        <div class="signature-actions">
          <button type="button" class="btn ghost" id="autoAssClear">Cancella e rifai</button>
          <button type="button" class="btn primary" id="autoAssSubmit">Conferma, genera PDF e invia</button>
        </div>
        <p class="muted" style="margin-top:10px">Data e ora della firma vengono registrate automaticamente.</p>
      </div>`);
    bindCanvas(a.id);
  }

  function bindCanvas(id){
    const canvas = $('autoAssCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let drawing = false, signed = false;
    const point = e => {
      const r = canvas.getBoundingClientRect();
      return { x:(e.clientX-r.left)*canvas.width/r.width, y:(e.clientY-r.top)*canvas.height/r.height };
    };
    canvas.addEventListener('pointerdown', e => {
      drawing = true; signed = true; canvas.setPointerCapture?.(e.pointerId);
      const p = point(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return; const p = point(e); ctx.lineTo(p.x,p.y); ctx.stroke(); e.preventDefault();
    });
    const stop = e => { drawing = false; try{ canvas.releasePointerCapture?.(e.pointerId); }catch{} };
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
    $('autoAssClear').onclick = () => { ctx.clearRect(0,0,canvas.width,canvas.height); signed = false; };
    $('autoAssSubmit').onclick = async () => {
      if (busy) return;
      const issue = $('autoAssIssue').value.trim();
      const resolved = $('autoAssResolved').value;
      const intervention = $('autoAssIntervention').value.trim();
      const notes = $('autoAssNotes').value.trim();
      const signer = $('autoAssSigner').value.trim();
      if (!issue) return toast('Compila la problematica riscontrata.');
      if (!resolved) return toast('Indica se il problema è stato risolto.');
      if (!intervention) return toast('Descrivi come si è intervenuti.');
      if (!signer) return toast('Inserisci nome e cognome del firmatario.');
      if (!signed) return toast('La firma del cliente è obbligatoria.');
      busy = true;
      const btn = $('autoAssSubmit');
      const old = btn.textContent; btn.disabled = true; btn.textContent = 'Generazione PDF in corso…';
      try {
        const { data, error } = await sb.functions.invoke('finalize-assistance', { body:{
          assistance_id:id,
          issue_description:issue,
          problem_resolved:resolved === 'true',
          intervention,
          final_notes:notes || null,
          signer_name:signer,
          signature_data_url:canvas.toDataURL('image/png')
        }});
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Impossibile completare il rapportino.');
        toast(data.email_status === 'sent' ? 'Rapportino generato, firmato e inviato al cliente.' : 'Rapportino generato e archiviato. Email da riprovare.');
        setTimeout(() => { const u = new URL(location.href); u.searchParams.set('assistance', id); location.href = u.toString(); }, 900);
      } catch (e) {
        console.error(e); toast(e.message || String(e)); btn.disabled = false; btn.textContent = old; busy = false;
      }
    };
  }

  async function refresh(){
    hideOfficeUpload();
    await enhanceDetail();
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('[data-assistance]');
    if (a?.dataset.assistance) currentId = a.dataset.assistance;
    setTimeout(refresh, 80);
    setTimeout(refresh, 350);
  }, true);

  const observer = new MutationObserver(() => { clearTimeout(observer._t); observer._t = setTimeout(refresh, 80); });
  window.addEventListener('load', async () => {
    await loadProfile();
    hideOfficeUpload();
    observer.observe(document.body, { childList:true, subtree:true });
    setTimeout(refresh, 500);
  });
  sb.auth.onAuthStateChange(() => setTimeout(async()=>{ await loadProfile(); refresh(); }, 200));
})();
