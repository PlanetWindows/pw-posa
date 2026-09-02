(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  let currentPoseId=null;
  let currentPhase=null;
  let profile=null;

  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)};

  async function getProfile(){
    if(profile) return profile;
    const {data:{session}}=await sb.auth.getSession(); if(!session) return null;
    const {data,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
    if(error) throw error; profile=data; return data;
  }

  function ensureChooser(){
    if($('photoChoiceDialog')) return;
    const dlg=document.createElement('dialog');
    dlg.id='photoChoiceDialog'; dlg.className='photo-choice';
    dlg.innerHTML=`<div class="photo-choice-inner"><div class="eyebrow">AGGIUNGI FOTO</div><h3 id="photoChoiceTitle">Foto posa</h3><p class="muted">Scegli come aggiungere la foto.</p><div class="photo-choice-actions"><button type="button" class="btn primary" id="photoCameraBtn">📷 Scatta foto</button><button type="button" class="btn ghost" id="photoLibraryBtn">🖼️ Scegli dalla libreria</button></div><button type="button" class="btn ghost photo-choice-close" id="photoChoiceClose">Annulla</button></div>`;
    document.body.appendChild(dlg);
    $('photoChoiceClose').addEventListener('click',()=>dlg.close());
    $('photoCameraBtn').addEventListener('click',()=>chooseFile(true));
    $('photoLibraryBtn').addEventListener('click',()=>chooseFile(false));
  }

  function chooseFile(camera){
    const dlg=$('photoChoiceDialog'); if(dlg?.open) dlg.close();
    const input=document.createElement('input'); input.type='file'; input.accept='image/*';
    if(camera) input.setAttribute('capture','environment');
    input.style.display='none'; document.body.appendChild(input);
    input.addEventListener('change',async()=>{
      const file=input.files?.[0]; input.remove(); if(!file) return;
      try{await uploadPhoto(file)}catch(err){toast(err.message)}
    },{once:true});
    input.click();
  }

  async function uploadPhoto(file){
    if(!currentPoseId||!currentPhase) return;
    const {data:{session}}=await sb.auth.getSession(); if(!session) throw new Error('Sessione scaduta');
    const safe=(file.name||'foto.jpg').replace(/[^a-zA-Z0-9._-]+/g,'-');
    const path=`poses/${currentPoseId}/${currentPhase}/${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}-${safe}`;
    const status=document.querySelector(`[data-photo-status="${currentPhase}"]`); if(status) status.textContent='Caricamento…';
    const {error:upErr}=await sb.storage.from('pw-posa-photos').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});
    if(upErr) throw upErr;
    const {error:dbErr}=await sb.from('pose_photos').insert({pose_id:currentPoseId,phase:currentPhase,storage_path:path,uploaded_by:session.user.id,caption:null});
    if(dbErr) throw dbErr;
    toast('Foto caricata'); await renderPhotoControls(currentPoseId);
  }

  async function renderPhotoControls(poseId){
    const root=$('photoSection'); if(!root) return;
    const p=await getProfile();
    const {data,error}=await sb.from('pose_photos').select('id,phase,storage_path,created_at').eq('pose_id',poseId).order('created_at',{ascending:false});
    if(error){root.innerHTML=`<div class="action-card"><strong>Foto posa</strong><p class="muted">${esc(error.message)}</p></div>`;return;}
    const rows=data||[];
    const labels={prima:'Prima della posa',durante:'Durante la posa',dopo:'Dopo la posa',segnalazione:'Foto segnalazione'};
    root.innerHTML=Object.entries(labels).map(([phase,label])=>{
      const count=rows.filter(x=>String(x.phase||'').toLowerCase()===phase).length;
      const plus=p?.role==='installer'?`<button type="button" class="photo-add-btn" data-photo-add="${phase}" aria-label="Aggiungi ${esc(label)}">+</button>`:'';
      return `<div class="action-card photo-phase-card"><div class="photo-phase-head"><strong>${esc(label)}</strong>${plus}</div><p class="muted">${count} foto ${count===1?'presente':'presenti'}</p><div class="photo-upload-status" data-photo-status="${phase}"></div></div>`;
    }).join('');
    root.querySelectorAll('[data-photo-add]').forEach(btn=>btn.addEventListener('click',()=>{
      currentPhase=btn.dataset.photoAdd; ensureChooser(); $('photoChoiceTitle').textContent=labels[currentPhase]||'Foto posa'; $('photoChoiceDialog').showModal();
    }));
  }

  function scheduleRender(){ if(!currentPoseId) return; setTimeout(()=>renderPhotoControls(currentPoseId).catch(err=>console.warn(err)),500); }
  document.addEventListener('click',e=>{const el=e.target.closest('[data-pose]');if(el){currentPoseId=el.dataset.pose;scheduleRender();}},true);
  const detail=$('detailDialog'); if(detail)new MutationObserver(()=>{if(detail.open)scheduleRender()}).observe(detail,{attributes:true,attributeFilter:['open']});
})();
