(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY),B='pw-ddt-private';
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const labelStatus=s=>({delivered:'Consegnata',accepted:'Accettata dal servizio email',pending:'Da inviare',failed:'Invio fallito',delayed:'Consegna ritardata',sent:'Invio accettato (non verificato)'}[String(s||'').toLowerCase()]||String(s||'—'));
  async function url(path){const r=await sb.storage.from(B).createSignedUrl(path,300);if(r.error)throw r.error;return r.data.signedUrl}
  async function injectPose(poseId){
    const host=document.getElementById('archiveDossier');if(!host||host.classList.contains('hidden'))return;
    host.querySelector('[data-archive-ddt]')?.remove();
    const r=await sb.from('ddt_documents').select('*').eq('pose_id',poseId).maybeSingle();if(r.error)throw r.error;const d=r.data;
    const section=document.createElement('div');section.className='archive-section';section.dataset.archiveDdt='1';
    section.innerHTML=`<div class="archive-section-head"><h4>DDT</h4><span>${d?.signed_path?'Firmato':'Non firmato'}</span></div>${!d?'<div class="empty compact">Nessun DDT collegato.</div>':`<div class="archive-file-row"><div><strong>${esc(d.signed_name||d.original_name||'DDT')}</strong><span>${d.signed_path?'DDT firmato archiviato':'Originale archiviato'} · Email: ${esc(labelStatus(d.email_status))}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" type="button" data-ddt-archive-original>Apri originale</button>${d.signed_path?'<button class="btn ghost" type="button" data-ddt-archive-signed>Apri firmato</button>':''}</div></div>`}`;
    host.appendChild(section);
    section.querySelector('[data-ddt-archive-original]')?.addEventListener('click',async()=>window.open(await url(d.original_path),'_blank','noopener'));
    section.querySelector('[data-ddt-archive-signed]')?.addEventListener('click',async()=>window.open(await url(d.signed_path),'_blank','noopener'));
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-archive-pose]');if(!b)return;setTimeout(()=>injectPose(b.dataset.archivePose).catch(console.error),350)},true);
})();