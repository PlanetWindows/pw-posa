(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const fmtDate=v=>{if(!v)return '—';const [y,m,d]=String(v).split('-');return `${d}/${m}/${y}`};
  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2800)};
  let archiveItems=[];

  async function loadArchive(){
    const {data:poses,error:poseError}=await sb.from('poses').select('*').order('job_number');
    if(poseError) throw poseError;
    const poseRows=poses||[];
    if(!poseRows.length) return [];
    const poseIds=poseRows.map(p=>p.id);
    const [{data:photos,error:photoError},{data:links,error:linkError}]=await Promise.all([
      sb.from('pose_photos').select('id,pose_id,phase,storage_path,created_at,caption').in('pose_id',poseIds).order('created_at',{ascending:false}),
      sb.from('daily_report_poses').select('report_id,pose_id').in('pose_id',poseIds)
    ]);
    if(photoError) throw photoError;
    if(linkError) throw linkError;
    const reportIds=[...new Set((links||[]).map(x=>x.report_id).filter(Boolean))];
    let reports=[];
    if(reportIds.length){
      const {data,error}=await sb.from('daily_reports').select('*').in('id',reportIds).order('report_date',{ascending:false});
      if(error) throw error;
      reports=data||[];
    }
    const reportMap=new Map(reports.map(r=>[r.id,r]));
    const reportsByPose=new Map();
    (links||[]).forEach(l=>{const r=reportMap.get(l.report_id);if(!r)return;if(!reportsByPose.has(l.pose_id))reportsByPose.set(l.pose_id,[]);reportsByPose.get(l.pose_id).push(r)});
    const photosByPose=new Map();
    (photos||[]).forEach(ph=>{if(!photosByPose.has(ph.pose_id))photosByPose.set(ph.pose_id,[]);photosByPose.get(ph.pose_id).push(ph)});
    return poseRows.map(p=>({pose:p,reports:reportsByPose.get(p.id)||[],photos:photosByPose.get(p.id)||[]}));
  }

  function phaseLabel(v){
    const p=String(v||'').toLowerCase();
    return p==='prima'?'Prima':p==='durante'?'Durante':p==='dopo'?'Dopo':p==='segnalazione'?'Segnalazione':p||'Foto';
  }

  function archiveCard(item){
    const p=item.pose;
    const pdfCount=item.reports.filter(r=>r.pdf_storage_path).length;
    return `<button type="button" class="archive-card" data-archive-pose="${esc(p.id)}">
      <div class="archive-card-top"><div><div class="eyebrow">COMMESSA</div><strong>${esc(p.job_number)}</strong></div><span class="badge orange">Fascicolo</span></div>
      <div class="archive-client">${esc(p.client_name)}</div>
      <div class="archive-address">${esc(p.address||'')}${p.city?`, ${esc(p.city)}`:''}</div>
      <div class="archive-meta"><span>${pdfCount} PDF</span><span>${item.photos.length} foto</span><span>${fmtDate(p.scheduled_date)}</span></div>
    </button>`;
  }

  function renderList(filter=''){
    const host=$('archiveList'); if(!host) return;
    const q=String(filter||'').trim().toLowerCase();
    const rows=archiveItems.filter(({pose:p})=>!q||String(p.job_number||'').toLowerCase().includes(q)||String(p.client_name||'').toLowerCase().includes(q));
    host.innerHTML=rows.length?rows.map(archiveCard).join(''):'<div class="empty">Nessuna commessa trovata.</div>';
    host.querySelectorAll('[data-archive-pose]').forEach(btn=>btn.addEventListener('click',()=>renderDossier(btn.dataset.archivePose)));
  }

  async function openStored(bucket,path){
    const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,300);
    if(error) throw error;
    window.open(data.signedUrl,'_blank','noopener');
  }

  function renderDossier(poseId){
    const item=archiveItems.find(x=>x.pose.id===poseId); if(!item) return;
    const p=item.pose;
    const host=$('archiveDossier'); if(!host) return;
    const reports=item.reports;
    const photos=item.photos;
    const photoGroups=['prima','durante','dopo','segnalazione'];
    host.innerHTML=`
      <div class="archive-dossier-head">
        <div><div class="eyebrow">FASCICOLO DIGITALE</div><h3>Commessa ${esc(p.job_number)}</h3><p>${esc(p.client_name)}</p></div>
        <button class="btn ghost" type="button" id="archiveCloseDossier">Chiudi</button>
      </div>
      <div class="archive-info-grid">
        <div><span>Cliente</span><strong>${esc(p.client_name)}</strong></div>
        <div><span>Telefono</span><strong>${esc(p.client_phone||'—')}</strong></div>
        <div><span>Indirizzo</span><strong>${esc(p.address||'—')}${p.city?`, ${esc(p.city)}`:''}${p.postal_code?` ${esc(p.postal_code)}`:''}</strong></div>
        <div><span>Periodo posa</span><strong>${fmtDate(p.scheduled_date)} → ${fmtDate(p.scheduled_end_date||p.scheduled_date)}</strong></div>
      </div>
      <div class="archive-section">
        <div class="archive-section-head"><h4>Documenti</h4><span>${reports.filter(r=>r.pdf_storage_path).length} PDF archiviati</span></div>
        ${reports.length?reports.map(r=>`<div class="archive-file-row"><div><strong>${esc(r.report_number||'Rapportino')}</strong><span>${fmtDate(r.report_date)}${r.pdf_storage_path?' · PDF archiviato':' · PDF mancante'}</span></div>${r.pdf_storage_path?`<button class="btn ghost" type="button" data-archive-pdf="${esc(r.pdf_storage_path)}">Apri PDF</button>`:'<span class="badge">Da generare</span>'}</div>`).join(''):'<div class="empty compact">Nessun documento collegato.</div>'}
      </div>
      <div class="archive-section">
        <div class="archive-section-head"><h4>Foto</h4><span>${photos.length} totali</span></div>
        <div class="archive-photo-groups">${photoGroups.map(phase=>{
          const rows=photos.filter(ph=>String(ph.phase||'').toLowerCase()===phase);
          return `<div class="archive-photo-group"><strong>${phaseLabel(phase)}</strong><span>${rows.length} foto</span>${rows.map((ph,i)=>`<button type="button" class="archive-photo-link" data-archive-photo="${esc(ph.storage_path)}">Apri foto ${i+1}</button>`).join('')}</div>`;
        }).join('')}</div>
      </div>`;
    host.classList.remove('hidden');
    $('archiveCloseDossier')?.addEventListener('click',()=>host.classList.add('hidden'));
    host.querySelectorAll('[data-archive-pdf]').forEach(btn=>btn.addEventListener('click',async()=>{try{await openStored('pw-posa-documents',btn.dataset.archivePdf)}catch(err){toast(err.message)}}));
    host.querySelectorAll('[data-archive-photo]').forEach(btn=>btn.addEventListener('click',async()=>{try{await openStored('pw-posa-photos',btn.dataset.archivePhoto)}catch(err){toast(err.message)}}));
  }

  async function renderArchive(){
    const content=$('content'); if(!content) return;
    $('pageTitle').textContent='Archivio';
    content.innerHTML=`<div class="panel archive-panel"><div class="panel-head"><div><div class="eyebrow">ARCHIVIO</div><h3>Fascicoli commessa</h3></div><span class="muted">Caricamento…</span></div></div>`;
    try{
      archiveItems=await loadArchive();
      content.innerHTML=`
        <div class="archive-toolbar"><div><div class="eyebrow">RICERCA</div><h3>Archivio commesse</h3></div><input id="archiveSearch" type="search" placeholder="Cerca numero commessa o cliente…" autocomplete="off"></div>
        <div id="archiveList" class="archive-grid"></div>
        <div id="archiveDossier" class="panel archive-dossier hidden"></div>`;
      renderList();
      $('archiveSearch').addEventListener('input',e=>renderList(e.target.value));
    }catch(err){content.innerHTML=`<div class="panel"><div class="empty">${esc(err.message)}</div></div>`;}
  }

  document.addEventListener('click',e=>{
    const nav=e.target.closest('.nav-item[data-view="archive"]');
    if(nav) setTimeout(()=>renderArchive(),0);
  });
})();