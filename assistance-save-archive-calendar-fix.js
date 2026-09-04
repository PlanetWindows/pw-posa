(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const B='pw-assistance-private';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const fd=v=>{if(!v)return'—';const[y,m,d]=String(v).slice(0,10).split('-');return`${d}/${m}/${y}`};
  const ft=v=>v?String(v).slice(0,5):'—';
  const euro=v=>v==null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(v));
  let activeId=new URLSearchParams(location.search).get('assistance')||null;
  let saving=false;

  const toast=m=>{const e=$('toast');if(!e)return alert(m);e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3200)};
  const assistanceMode=()=>{const f=$('assistanceFields');return !!f&&!f.classList.contains('hidden')};
  const val=id=>($(id)?.value||'').trim();

  function fail(id,msg){
    const el=$(id); toast(msg);
    if(el){el.style.outline='2px solid #b42318';el.style.outlineOffset='2px';el.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>el.focus(),200)}
    throw new Error('__validation__');
  }
  function validate(){
    for(const [id,label] of [['assProtocol','Numero protocollo e/o ordine'],['assClient','Cliente'],['assEmail','Email cliente'],['assTeam','Squadra'],['assAddress','Indirizzo'],['assDate','Data inizio'],['assEndDate','Data fine'],['assStart','Ora inizio'],['assIssue','Problematica'],['assWarranty','Garanzia'],['assPayment','Pagamento']]) if(!val(id)) fail(id,`${label}: campo obbligatorio.`);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('assEmail')))fail('assEmail','Inserisci una email cliente valida.');
    if(val('assPayment')==='true'&&!/^\d+(?:[.,]\d{1,2})?$/.test(val('assAmount')))fail('assAmount','Importo obbligatorio con massimo due decimali.');
    if(val('assEndDate')<val('assDate'))fail('assEndDate','La data finale non può precedere quella iniziale.');
  }
  async function upload(id,file){
    const safe=(file.name||'foto.jpg').replace(/[^\w.-]+/g,'_');
    const path=`${id}/photos/${Date.now()}-${crypto.randomUUID()}-${safe}`;
    const r=await sb.storage.from(B).upload(path,file,{contentType:file.type||'image/jpeg'});
    if(r.error)throw r.error; return path;
  }
  async function newPhotoFiles(){
    const out=[];
    for(const card of document.querySelectorAll('#assPhotoPreview .ass-photo-card')){
      const img=card.querySelector('img'); if(!img?.src?.startsWith('blob:'))continue;
      const blob=await fetch(img.src).then(r=>r.blob());
      const name=card.querySelector('span')?.textContent?.trim()||`foto-${Date.now()}.jpg`;
      out.push(new File([blob],name,{type:blob.type||'image/jpeg'}));
    }
    return out;
  }
  function extraDates(){return [...document.querySelectorAll('#assExtraDates [data-rd]')].map(b=>b.dataset.rd).filter(Boolean)}

  async function saveAssistance(){
    if(saving)return; saving=true;
    const btn=$('poseSubmitBtn'); const old=btn?.textContent;
    if(btn){btn.disabled=true;btn.textContent='Salvataggio…'}
    try{
      validate();
      const {data:{session}}=await sb.auth.getSession(); if(!session)throw new Error('Sessione scaduta. Accedi di nuovo.');
      const payment=val('assPayment')==='true';
      const payload={protocol_order:val('assProtocol'),client_name:val('assClient'),client_phone:val('assPhone')||null,client_email:val('assEmail'),team_id:val('assTeam'),address:val('assAddress'),city:val('assCity')||null,postal_code:val('assPostal')||null,scheduled_date:val('assDate'),scheduled_end_date:val('assEndDate'),start_time:val('assStart'),end_time:val('assEnd')||null,issue_description:val('assIssue'),warranty:val('assWarranty')==='true',payment_required:payment,payment_amount:payment?Number(val('assAmount').replace(',','.')):null,updated_by:session.user.id};
      let id=activeId;
      if(id){const r=await sb.from('assistances').update(payload).eq('id',id).select('id').single();if(r.error)throw r.error}
      else{payload.created_by=session.user.id;const r=await sb.from('assistances').insert(payload).select('id').single();if(r.error)throw r.error;id=r.data.id;activeId=id}

      const existing=await sb.from('assistance_photos').select('*').eq('assistance_id',id); if(existing.error)throw existing.error;
      const visibleOld=new Set([...document.querySelectorAll('#assPhotoPreview [data-old]')].map(x=>x.dataset.old));
      for(const ph of existing.data||[]){if(!visibleOld.has(ph.id)){await sb.storage.from(B).remove([ph.storage_path]);await sb.from('assistance_photos').delete().eq('id',ph.id)}}
      for(const file of await newPhotoFiles()){
        const path=await upload(id,file);
        const r=await sb.from('assistance_photos').insert({assistance_id:id,storage_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size,uploaded_by:session.user.id}); if(r.error)throw r.error;
      }
      const dr=await sb.from('assistance_dates').delete().eq('assistance_id',id); if(dr.error)throw dr.error;
      const dates=[...new Set([val('assDate'),val('assEndDate'),...extraDates()].filter(Boolean))];
      if(dates.length){const r=await sb.from('assistance_dates').insert(dates.map(d=>({assistance_id:id,assistance_date:d})));if(r.error)throw r.error}
      if(window.PW_DDT) await window.PW_DDT.saveForAssistance(id);
      toast('Assistenza salvata');
      $('poseDialog')?.close();
      setTimeout(()=>location.reload(),650);
    }catch(e){if(e.message!=='__validation__'){console.error(e);toast(e.message||String(e))}}
    finally{saving=false;if(btn){btn.disabled=false;btn.textContent=old||'Salva assistenza'}}
  }

  document.addEventListener('click',e=>{
    const submit=e.target.closest('#poseSubmitBtn');
    if(submit&&assistanceMode()){
      e.preventDefault();
      e.stopImmediatePropagation();
      saveAssistance();
      return;
    }
    const a=e.target.closest('[data-assistance]'); if(a?.dataset.assistance)activeId=a.dataset.assistance;
    if(e.target.closest('#newPoseBtn'))activeId=null;
  },true);

  document.addEventListener('submit',e=>{
    if(e.target?.id!=='poseForm'||!assistanceMode())return;
    e.preventDefault(); e.stopImmediatePropagation(); saveAssistance();
  },true);

  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'||!assistanceMode()||!e.target.closest('#assistanceFields'))return;
    if(e.target.tagName==='TEXTAREA')return;
    e.preventDefault();
    e.stopImmediatePropagation();
    saveAssistance();
  },true);

  function labelCalendar(){
    document.querySelectorAll('.pose-chip').forEach(chip=>{
      if(chip.querySelector('.pw-type-label'))return;
      const isAss=chip.classList.contains('assistance-chip')||chip.hasAttribute('data-assistance')||/ASSISTENZA/i.test(chip.textContent||'');
      chip.classList.toggle('pw-calendar-assistance',isAss); chip.classList.toggle('pw-calendar-pose',!isAss);
      chip.insertAdjacentHTML('afterbegin',`<span class="pw-type-label ${isAss?'assistenza':'posa'}">${isAss?'ASSISTENZA':'POSA'}</span>`);
    });
  }

  async function openStored(path){const r=await sb.storage.from(B).createSignedUrl(path,300);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener')}
  async function appendArchive(){
    if($('pageTitle')?.textContent!=='Archivio')return;
    const host=$('archiveList'); if(!host||host.dataset.assLoaded==='1')return;
    const r=await sb.from('assistances').select('*').order('scheduled_date',{ascending:false}); if(r.error)return;
    host.dataset.assLoaded='1';
    for(const a of r.data||[]){
      const p=await sb.from('assistance_photos').select('id,storage_path,file_name').eq('assistance_id',a.id);
      const n=(p.data||[]).length;
      host.insertAdjacentHTML('beforeend',`<article class="archive-card archive-folder-card assistance-folder-card"><div class="archive-card-top"><div class="archive-folder-title"><span class="archive-folder-icon" aria-hidden="true">📁</span><div><div class="eyebrow">FASCICOLO ASSISTENZA</div><strong>ASSISTENZA ${esc(a.protocol_order)}</strong></div></div><span class="badge pw-assistance-badge">Assistenza</span></div><div class="archive-client">Cliente: ${esc(a.client_name)}</div><div class="archive-address">${esc(a.address||'')}${a.city?`, ${esc(a.city)}`:''}</div><div class="archive-meta"><span>${a.final_report_path?'1 rapportino':'0 rapportini'}</span><span>${n} foto</span><span>${fd(a.scheduled_date)}</span></div><button type="button" class="btn ghost" data-open-assistance-folder="${a.id}">Apri fascicolo</button></article>`);
    }
  }
  async function renderAssistanceDossier(id){
    const ar=await sb.from('assistances').select('*').eq('id',id).single(); if(ar.error)return toast(ar.error.message); const a=ar.data;
    const pr=await sb.from('assistance_photos').select('*').eq('assistance_id',id).order('created_at',{ascending:false}); const photos=pr.data||[];
    const host=$('archiveDossier'); if(!host)return;
    host.innerHTML=`<div class="archive-dossier-head"><div><div class="eyebrow">FASCICOLO DIGITALE ASSISTENZA</div><h3>ASSISTENZA ${esc(a.protocol_order)}</h3><p>${esc(a.client_name)}</p></div><button class="btn ghost" type="button" id="archiveCloseDossier">← Torna all'archivio</button></div><div class="archive-info-grid"><div><span>Cliente</span><strong>${esc(a.client_name)}</strong></div><div><span>Telefono</span><strong>${esc(a.client_phone||'—')}</strong></div><div><span>Indirizzo</span><strong>${esc(a.address||'—')}${a.city?`, ${esc(a.city)}`:''}${a.postal_code?` ${esc(a.postal_code)}`:''}</strong></div><div><span>Data assistenza</span><strong>${fd(a.scheduled_date)}${a.scheduled_end_date&&a.scheduled_end_date!==a.scheduled_date?` → ${fd(a.scheduled_end_date)}`:''}</strong></div></div><div class="archive-section"><div class="archive-section-head"><h4>Rapportino assistenza</h4><span>${a.final_report_path?'1 PDF':'0 PDF'}</span></div>${a.final_report_path?`<div class="archive-file-row"><div><strong>${esc(a.final_report_name||'Rapportino assistenza')}</strong><span>PDF firmato e archiviato · Email: ${esc(a.email_status||'pending')}</span></div><button class="btn ghost" type="button" data-ass-report="${esc(a.final_report_path)}">Apri PDF</button></div>`:'<div class="empty compact">Rapportino non ancora compilato dal posatore.</div>'}</div><div class="archive-section"><div class="archive-section-head"><h4>Problematica</h4></div><div>${esc(a.final_issue_description||a.issue_description||'—')}</div></div><div class="archive-section"><div class="archive-section-head"><h4>Fotografie</h4><span>${photos.length} foto</span></div>${photos.length?`<div class="archive-photo-list">${photos.map((ph,i)=>`<button type="button" class="archive-photo-link" data-ass-photo="${esc(ph.storage_path)}">Apri foto ${i+1}</button>`).join('')}</div>`:'<div class="empty compact">Nessuna foto.</div>'}</div>`;
    host.classList.remove('hidden'); $('archiveList')?.classList.add('archive-list-dimmed');
    $('archiveCloseDossier')?.addEventListener('click',()=>{host.classList.add('hidden');$('archiveList')?.classList.remove('archive-list-dimmed')});
    host.querySelectorAll('[data-ass-report]').forEach(b=>b.onclick=()=>openStored(b.dataset.assReport));
    host.querySelectorAll('[data-ass-photo]').forEach(b=>b.onclick=()=>openStored(b.dataset.assPhoto));
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-open-assistance-folder]');if(b){e.preventDefault();renderAssistanceDossier(b.dataset.openAssistanceFolder)}},true);

  let t; const refresh=()=>{clearTimeout(t);t=setTimeout(()=>{labelCalendar();appendArchive()},100)};
  new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('load',()=>setTimeout(refresh,400));
})();