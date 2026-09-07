(()=>{
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const toast=m=>{const e=$('toast');if(!e)return alert(m);e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),4200)};
  let profile=null,currentId=null,busy=false;
  const key=id=>`pw-ass-close-v3:${id}`;
  const getDraft=id=>{try{return JSON.parse(sessionStorage.getItem(key(id))||'{}')}catch{return{}}};
  const putDraft=(id,d)=>{try{sessionStorage.setItem(key(id),JSON.stringify(d))}catch{}};
  const clearDraft=id=>{try{sessionStorage.removeItem(key(id))}catch{}};

  async function loadProfile(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session)return null;
    const {data}=await sb.from('profiles').select('role').eq('id',session.user.id).maybeSingle();
    profile=data||null;return profile;
  }

  function removeLegacy(root){
    root.querySelectorAll('[data-auto-assistance-report]').forEach(x=>x.remove());
    root.querySelectorAll('[data-assistance-close-flow],[data-assistance-close-flow-v3]').forEach((x,i)=>{if(i>0)x.remove()});
    [...root.querySelectorAll('button')].forEach(btn=>{
      if(/conferma\s*(,|e)?\s*genera\s*pdf/i.test((btn.textContent||'').trim())){
        const section=btn.closest('.ass-detail-section');
        if(section&&!section.hasAttribute('data-assistance-close-flow-v3'))section.remove();
      }
    });
    root.querySelectorAll('[data-ddt-card]').forEach(x=>x.style.display='none');
  }

  async function newestDdt(assistanceId){
    const {data,error}=await sb.from('ddt_documents').select('*').eq('assistance_id',assistanceId).order('created_at',{ascending:false}).limit(1);
    if(error){console.warn('DDT assistenza:',error);return null}
    return data?.[0]||null;
  }

  function saveFields(id){
    const old=getDraft(id);
    const d={...old,
      intervention:$('assV3Intervention')?.value??old.intervention??'',
      resolved:document.querySelector('input[name="assV3Resolved"]:checked')?.value??old.resolved??'',
      notes:$('assV3Notes')?.value??old.notes??'',
      signer:$('assV3Signer')?.value??old.signer??''
    };
    putDraft(id,d);return d;
  }

  function bindCanvas(canvas,clearButton,id,draftKey){
    if(!canvas)return;
    const ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';canvas.dataset.signed='0';
    const draft=getDraft(id);
    if(draft[draftKey]){const img=new Image();img.onload=()=>{ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.dataset.signed='1'};img.src=draft[draftKey]}
    let drawing=false,last=null;
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
    canvas.addEventListener('pointerdown',e=>{drawing=true;last=point(e);canvas.dataset.signed='1';try{canvas.setPointerCapture?.(e.pointerId)}catch{}e.preventDefault()},{passive:false});
    canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;e.preventDefault()},{passive:false});
    const end=e=>{if(!drawing)return;drawing=false;try{canvas.releasePointerCapture?.(e.pointerId)}catch{}const d=getDraft(id);d[draftKey]=canvas.toDataURL('image/png');putDraft(id,d)};
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    clearButton?.addEventListener('click',()=>{ctx.clearRect(0,0,canvas.width,canvas.height);canvas.dataset.signed='0';const d=getDraft(id);delete d[draftKey];putDraft(id,d)});
  }

  function setError(message=''){
    const box=$('assV3Error');if(!box)return;
    box.textContent=message;box.style.display=message?'block':'none';
  }

  async function render(force=false){
    const dlg=$('assistanceDetailDialog'),root=$('assDetailContent');
    if(!dlg?.open||!root||!currentId)return;
    if(!profile)await loadProfile();
    if(profile?.role!=='installer')return;
    removeLegacy(root);
    if(!force&&root.querySelector('[data-assistance-close-flow-v3]'))return;
    root.querySelectorAll('[data-assistance-close-flow-v3]').forEach(x=>x.remove());

    const [{data:a,error:ae},ddt]=await Promise.all([
      sb.from('assistances').select('*').eq('id',currentId).single(),
      newestDdt(currentId)
    ]);
    if(ae||!a){toast('Impossibile caricare l’assistenza.');return}

    const draft=getDraft(a.id);
    const reportReady=!!a.final_report_path;
    const ddtNeeded=!!ddt;
    const ddtReady=!ddtNeeded||!!ddt.signed_path;
    const sent=a.email_status==='sent';
    const needSignatures=!sent&&(!reportReady||!ddtReady);
    const resolved=draft.resolved!==undefined?draft.resolved:(a.problem_resolved===true?'true':a.problem_resolved===false?'false':'');

    const panel=document.createElement('section');
    panel.dataset.assistanceCloseFlowV3='1';panel.className='ass-detail-section';
    panel.innerHTML=`
      <div class="eyebrow">CHIUSURA ASSISTENZA</div>
      <h4 style="margin:4px 0 6px">Rapportino + ${ddtNeeded?'DDT':'documentazione finale'}</h4>
      <p class="muted" style="margin:0 0 14px">Un solo flusso e una sola email al cliente.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <span class="badge ${reportReady?'green':'orange'}">Rapportino ${reportReady?'pronto':'da completare'}</span>
        <span class="badge ${ddtReady?'green':'orange'}">DDT ${ddtNeeded?(ddtReady?'firmato':'da firmare'):'non previsto'}</span>
        <span class="badge ${sent?'green':'orange'}">Email ${sent?'inviata':'da inviare'}</span>
      </div>
      <div id="assV3Error" style="display:none;padding:12px 14px;border:1px solid #b42318;border-radius:12px;background:#fff4f2;color:#8a1c13;font-weight:600;margin-bottom:14px"></div>
      ${sent?'<div class="completion-ok"><strong>Documentazione inviata al cliente.</strong></div>':reportReady?'':`
        <label>Problematica riscontrata dall’Ufficio<textarea rows="4" readonly style="background:#f3f1ed;color:#5f5957">${esc(a.issue_description||'')}</textarea></label>
        <label>Come si è intervenuti *<textarea id="assV3Intervention" rows="5">${esc(draft.intervention||a.intervention||'')}</textarea></label>
        <div><strong>Il problema è stato risolto? *</strong><div style="display:flex;gap:22px;margin:9px 0 14px">
          <label style="display:flex;align-items:center;gap:7px"><input type="radio" name="assV3Resolved" value="true" ${resolved==='true'?'checked':''} style="width:auto"> Sì</label>
          <label style="display:flex;align-items:center;gap:7px"><input type="radio" name="assV3Resolved" value="false" ${resolved==='false'?'checked':''} style="width:auto"> No</label>
        </div></div>
        <label id="assV3NotesWrap" style="display:${resolved==='false'?'':'none'}">Note / cosa rimane da segnalare *<textarea id="assV3Notes" rows="4">${esc(draft.notes||a.final_notes||'')}</textarea></label>
      `}
      ${needSignatures?`
        <div style="height:1px;background:var(--line);margin:20px 0"></div>
        <h4>Firme</h4>
        <label>Posatore<input value="Angelo Idone" readonly style="background:#f3f1ed"></label>
        <div class="signature-wrap"><canvas id="assV3InstallerCanvas" width="900" height="300" style="touch-action:none;width:100%;background:#fff"></canvas></div>
        <button type="button" class="btn ghost" id="assV3InstallerClear">Cancella firma posatore</button>
        <label style="margin-top:16px">Nome e cognome cliente *<input id="assV3Signer" value="${esc(draft.signer||a.signer_name||'')}" autocomplete="off"></label>
        <div class="signature-wrap"><canvas id="assV3ClientCanvas" width="900" height="300" style="touch-action:none;width:100%;background:#fff"></canvas></div>
        <button type="button" class="btn ghost" id="assV3ClientClear">Cancella firma cliente</button>
      `:''}
      ${!sent?`<div style="margin-top:22px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#fbfaf8">
        <strong>Invio finale</strong><p class="muted" style="margin:6px 0 12px">Il cliente riceverà una sola email con ${ddtNeeded?'Rapportino Assistenza + DDT firmato':'il Rapportino Assistenza'}.</p>
        <button type="button" class="btn primary" id="assV3Final" style="width:100%">Conferma e invia documentazione al cliente</button>
        <div id="assV3Progress" class="muted" style="margin-top:10px"></div>
      </div>`:''}`;
    root.appendChild(panel);

    document.querySelectorAll('input[name="assV3Resolved"]').forEach(r=>r.addEventListener('change',()=>{const w=$('assV3NotesWrap');if(w)w.style.display=r.value==='false'?'':'none';if(r.value==='true'&&$('assV3Notes'))$('assV3Notes').value='';saveFields(a.id)}));
    ['assV3Intervention','assV3Notes','assV3Signer'].forEach(id=>$(id)?.addEventListener('input',()=>saveFields(a.id),{passive:true}));
    bindCanvas($('assV3InstallerCanvas'),$('assV3InstallerClear'),a.id,'installerSignature');
    bindCanvas($('assV3ClientCanvas'),$('assV3ClientClear'),a.id,'clientSignature');
    $('assV3Final')?.addEventListener('click',()=>finalize(a,ddt));
    window.dispatchEvent(new CustomEvent('pwposa:assistance-close-rendered'));
  }

  async function finalize(a,ddt){
    if(busy)return;
    setError('');
    const btn=$('assV3Final'),progress=$('assV3Progress');
    const reportReady=!!a.final_report_path,ddtReady=!ddt||!!ddt.signed_path;
    const draft=saveFields(a.id);
    const signer=($('assV3Signer')?.value||draft.signer||a.signer_name||'').trim();
    let intervention=a.intervention||'',resolved=a.problem_resolved,notes=a.final_notes||'';
    if(!reportReady){
      intervention=(draft.intervention||'').trim();
      if(!intervention)return setError('Descrivi come si è intervenuti.');
      if(draft.resolved!=='true'&&draft.resolved!=='false')return setError('Indica se il problema è stato risolto.');
      resolved=draft.resolved==='true';notes=(draft.notes||'').trim();
      if(!resolved&&!notes)return setError('Inserisci le note su cosa rimane da segnalare.');
    }
    const installerCanvas=$('assV3InstallerCanvas'),clientCanvas=$('assV3ClientCanvas');
    const needSigs=!reportReady||!ddtReady;
    if(needSigs&&installerCanvas?.dataset.signed!=='1')return setError('Firma del posatore obbligatoria.');
    if(needSigs&&clientCanvas?.dataset.signed!=='1')return setError('Firma del cliente obbligatoria.');
    if(needSigs&&!signer)return setError('Inserisci nome e cognome del cliente.');

    busy=true;if(btn)btn.disabled=true;
    try{
      const installerSig=installerCanvas?.toDataURL('image/png');
      const clientSig=clientCanvas?.toDataURL('image/png');
      if(ddt&&!ddt.signed_path){
        if(progress)progress.textContent='1/3 · Firma del DDT…';
        const {data,error}=await sb.functions.invoke('finalize-ddt',{body:{ddt_id:ddt.id,installer_signature_data_url:installerSig,client_signature_data_url:clientSig}});
        if(error)throw new Error(error.message||'Errore firma DDT');if(!data?.ok)throw new Error(data?.error||'Errore firma DDT');
      }
      if(!reportReady){
        if(progress)progress.textContent=ddt?'2/3 · Generazione rapportino…':'1/2 · Generazione rapportino…';
        const {data,error}=await sb.functions.invoke('finalize-assistance-v2',{body:{assistance_id:a.id,intervention,problem_resolved:resolved,final_notes:resolved?null:notes,installer_signer_name:'Angelo Idone',installer_signature_data_url:installerSig,signer_name:signer,signature_data_url:clientSig}});
        if(error)throw new Error(error.message||'Errore rapportino');if(!data?.ok)throw new Error(data?.error||'Errore rapportino');
      }
      if(progress)progress.textContent=ddt?'3/3 · Invio unica email…':'2/2 · Invio email…';
      const {data,error}=await sb.functions.invoke('send-assistance-package',{body:{assistance_id:a.id}});
      if(error)throw new Error(error.message||'Errore invio email');if(!data?.ok)throw new Error(data?.error||'Errore invio email');
      clearDraft(a.id);toast(ddt?'Rapportino + DDT inviati al cliente in un’unica email.':'Rapportino inviato al cliente.');
      busy=false;await render(true);
    }catch(err){
      console.error('Chiusura assistenza:',err);setError(err?.message||String(err));if(progress)progress.textContent='Operazione interrotta: correggi l’errore e riprova.';busy=false;if(btn)btn.disabled=false;
    }
  }

  document.addEventListener('click',e=>{
    const card=e.target.closest('[data-assistance]');
    if(card?.dataset.assistance){currentId=card.dataset.assistance;setTimeout(()=>render(true).catch(console.warn),260)}
  },true);
  window.addEventListener('load',async()=>{await loadProfile();const q=new URLSearchParams(location.search).get('assistance');if(q){currentId=q;setTimeout(()=>render(true).catch(console.warn),900)}});
})();