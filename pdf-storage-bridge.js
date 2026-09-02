(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const bucket='pw-posa-documents';
  let currentArchivePoseId=null;
  let scanning=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const fmtDate=v=>{if(!v)return '—';const [y,m,d]=String(v).split('-');return `${d}/${m}/${y}`};
  const fallbackPath=(poseId,reportId)=>`poses/${poseId}/rapportini/${reportId}.pdf`;

  async function exists(path){
    const {data,error}=await sb.storage.from(bucket).download(path);
    return !error && data && data.size>0;
  }

  async function open(path){
    const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,300);
    if(error) throw error;
    window.open(data.signedUrl,'_blank','noopener');
  }

  function toast(msg){
    const el=document.getElementById('toast'); if(!el)return;
    el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3500);
  }

  async function patchDocuments(){
    if(scanning) return;
    const rows=[...document.querySelectorAll('.document-row')];
    if(!rows.length) return;
    scanning=true;
    try{
      let count=0;
      for(const row of rows){
        const openBtn=row.querySelector('[data-report-pdf]');
        if(openBtn){count++;continue;}
        const gen=row.querySelector('[data-generate-pdf]');
        if(!gen) continue;
        const reportId=gen.dataset.generatePdf,poseId=gen.dataset.poseId;
        if(!reportId||!poseId) continue;
        const path=fallbackPath(poseId,reportId);
        if(await exists(path)){
          row.querySelector('.badge')?.replaceChildren(document.createTextNode('Archiviato'));
          gen.removeAttribute('data-generate-pdf');
          gen.removeAttribute('data-pose-id');
          gen.dataset.fallbackPdf=path;
          gen.textContent='Apri PDF';
          count++;
        }
      }
      const head=document.querySelector('.panel-head span');
      if(head && /PDF/.test(head.textContent||'')) head.textContent=`${count} PDF`;
    }finally{scanning=false;}
  }

  async function reportsForPose(poseId){
    const {data:links,error:le}=await sb.from('daily_report_poses').select('report_id').eq('pose_id',poseId);
    if(le) throw le;
    const ids=[...new Set((links||[]).map(x=>x.report_id).filter(Boolean))];
    if(!ids.length) return [];
    const {data,error}=await sb.from('daily_reports').select('*').in('id',ids).order('report_date',{ascending:false});
    if(error) throw error;
    const out=[];
    for(const r of data||[]){
      let path=r.pdf_storage_path||fallbackPath(poseId,r.id);
      const ok=r.pdf_storage_path?true:await exists(path);
      out.push({...r,_resolvedPdfPath:ok?path:null});
    }
    return out;
  }

  async function patchArchiveCards(){
    const cards=[...document.querySelectorAll('[data-archive-pose]')];
    for(const card of cards){
      const poseId=card.dataset.archivePose;
      if(!poseId) continue;
      try{
        const reports=await reportsForPose(poseId);
        const count=reports.filter(r=>r._resolvedPdfPath).length;
        const first=card.querySelector('.archive-meta span');
        if(first) first.textContent=`${count} PDF`;
      }catch(_){ }
    }
  }

  async function patchArchiveDossier(){
    const host=document.getElementById('archiveDossier');
    if(!host||host.classList.contains('hidden')||!currentArchivePoseId) return;
    try{
      const reports=await reportsForPose(currentArchivePoseId);
      const section=[...host.querySelectorAll('.archive-section')].find(s=>s.querySelector('h4')?.textContent.trim()==='Documenti');
      if(!section) return;
      const count=reports.filter(r=>r._resolvedPdfPath).length;
      section.innerHTML=`<div class="archive-section-head"><h4>Documenti</h4><span>${count} PDF archiviati</span></div>${reports.length?reports.map(r=>`<div class="archive-file-row"><div><strong>${esc(r.report_number||'Rapportino')}</strong><span>${fmtDate(r.report_date)}${r._resolvedPdfPath?' · PDF archiviato':' · PDF mancante'}</span></div>${r._resolvedPdfPath?`<button class="btn ghost" type="button" data-fallback-pdf="${esc(r._resolvedPdfPath)}">Apri PDF</button>`:'<span class="badge">Da generare</span>'}</div>`).join(''):'<div class="empty compact">Nessun documento collegato.</div>'}`;
    }catch(_){ }
  }

  document.addEventListener('click',e=>{
    const card=e.target.closest('[data-archive-pose]');
    if(card?.dataset.archivePose){currentArchivePoseId=card.dataset.archivePose;setTimeout(patchArchiveDossier,250);}
    const fallback=e.target.closest('[data-fallback-pdf]');
    if(fallback){e.preventDefault();e.stopImmediatePropagation();open(fallback.dataset.fallbackPdf).catch(err=>toast(err.message));return;}
    const nav=e.target.closest('.nav-item[data-view="documents"],.nav-item[data-view="archive"]');
    if(nav){setTimeout(()=>{patchDocuments();patchArchiveCards();},350);}
    if(e.target.closest('[data-generate-pdf]')) setTimeout(patchDocuments,2200);
  },true);

  const obs=new MutationObserver(()=>{
    clearTimeout(obs._t);
    obs._t=setTimeout(()=>{patchDocuments();patchArchiveCards();patchArchiveDossier();},250);
  });
  const start=()=>{const c=document.getElementById('content');if(c)obs.observe(c,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.addEventListener('pwposa:pdf-saved',()=>setTimeout(()=>{patchDocuments();patchArchiveCards();patchArchiveDossier();},300));
})();