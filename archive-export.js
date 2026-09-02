(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!window.JSZip||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  let currentPoseId=null;
  let profile=null;

  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),4200)};
  const safeName=v=>String(v||'file').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_').slice(0,120);
  const fmtDate=v=>{if(!v)return '—';const [y,m,d]=String(v).split('-');return `${d}/${m}/${y}`};
  const pad=n=>String(n).padStart(2,'0');

  async function getProfile(){
    if(profile) return profile;
    const {data:{session}}=await sb.auth.getSession();
    if(!session) return null;
    const {data,error}=await sb.from('profiles').select('*').eq('id',session.user.id).single();
    if(error) throw error;
    profile=data; return data;
  }

  async function getArchiveData(poseId){
    const {data:pose,error:pe}=await sb.from('poses').select('*').eq('id',poseId).single();
    if(pe) throw pe;
    const [{data:photos,error:phErr},{data:links,error:lErr}]=await Promise.all([
      sb.from('pose_photos').select('id,phase,storage_path,created_at,caption').eq('pose_id',poseId).order('created_at'),
      sb.from('daily_report_poses').select('report_id').eq('pose_id',poseId)
    ]);
    if(phErr) throw phErr;
    if(lErr) throw lErr;
    const ids=[...new Set((links||[]).map(x=>x.report_id).filter(Boolean))];
    let reports=[];
    if(ids.length){
      const {data,error}=await sb.from('daily_reports').select('*').in('id',ids).order('report_date');
      if(error) throw error;
      reports=data||[];
    }
    return {pose,reports,photos:photos||[]};
  }

  async function fetchStoredBlob(bucket,path){
    const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,300);
    if(error) throw error;
    if(!data?.signedUrl) throw new Error('Link file non disponibile');
    const res=await fetch(data.signedUrl,{cache:'no-store'});
    if(!res.ok) throw new Error(`Download ${res.status}`);
    return await res.blob();
  }

  function photoFolder(phase){
    const p=String(phase||'').toLowerCase();
    return p==='prima'?'Foto_Prima':p==='durante'?'Foto_Durante':p==='dopo'?'Foto_Fine_Posa':p==='segnalazione'?'Foto_Segnalazioni':'Foto_Altro';
  }

  function phaseShort(phase){
    const p=String(phase||'').toLowerCase();
    return p==='prima'?'PRIMA':p==='durante'?'DURANTE':p==='dopo'?'FINE':p==='segnalazione'?'SEGNALAZIONE':'FOTO';
  }

  function extensionFromPath(path,fallback){
    const clean=String(path||'').split('?')[0];
    const m=clean.match(/\.([a-zA-Z0-9]{2,5})$/);
    return m?`.${m[1].toLowerCase()}`:fallback;
  }

  function readablePhotoName(ph,index,ext){
    const d=ph.created_at?new Date(ph.created_at):null;
    const stamp=d&&!Number.isNaN(d.getTime())?`${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}_${pad(d.getHours())}-${pad(d.getMinutes())}`:`foto_${pad(index+1)}`;
    return `${phaseShort(ph.phase)}_${pad(index+1)}_${stamp}${ext}`;
  }

  async function discoverPdfPaths(poseId,reports){
    const folder=`poses/${poseId}/rapportini`;
    const found=new Map();

    for(const r of reports){
      const path=r.pdf_storage_path||`${folder}/${r.id}.pdf`;
      found.set(path,{path,report:r});
    }

    const {data:list,error}=await sb.storage.from('pw-posa-documents').list(folder,{limit:100,sortBy:{column:'name',order:'asc'}});
    if(!error){
      for(const f of list||[]){
        if(!f?.name||!f.name.toLowerCase().endsWith('.pdf')) continue;
        const path=`${folder}/${f.name}`;
        if(!found.has(path)){
          const reportId=f.name.replace(/\.pdf$/i,'');
          const report=reports.find(r=>String(r.id)===reportId)||null;
          found.set(path,{path,report});
        }
      }
    }
    return [...found.values()];
  }

  async function exportDossier(poseId,button){
    const p=await getProfile();
    if(!['office_scheduler','office_viewer'].includes(p?.role)) return toast('Esportazione disponibile solo per l’Ufficio');
    if(button){button.disabled=true;button.textContent='Preparazione ZIP…';}
    try{
      const {pose,reports,photos}=await getArchiveData(poseId);
      const zip=new JSZip();
      const reportsFolder=zip.folder('Rapportini');
      zip.folder('Foto_Prima'); zip.folder('Foto_Durante'); zip.folder('Foto_Fine_Posa'); zip.folder('Foto_Segnalazioni');
      const missing=[];

      const pdfEntries=await discoverPdfPaths(poseId,reports);
      const info=[
        'PW Posa - Fascicolo commessa',
        '',
        `Commessa: ${pose.job_number||'—'}`,
        `Cliente: ${pose.client_name||'—'}`,
        `Telefono: ${pose.client_phone||'—'}`,
        `Indirizzo: ${pose.address||'—'}${pose.city?`, ${pose.city}`:''}${pose.postal_code?` ${pose.postal_code}`:''}`,
        `Data inizio posa: ${fmtDate(pose.scheduled_date)}`,
        `Data fine posa prevista: ${fmtDate(pose.scheduled_end_date||pose.scheduled_date)}`,
        '',
        `PDF trovati: ${pdfEntries.length}`,
        `Foto: ${photos.length}`
      ].join('\r\n');
      zip.file('Dati_Commessa.txt',info);

      for(let i=0;i<pdfEntries.length;i++){
        const entry=pdfEntries[i];
        try{
          const blob=await fetchStoredBlob('pw-posa-documents',entry.path);
          const r=entry.report;
          const datePart=r?.report_date?String(r.report_date).split('-').reverse().join('-'):'';
          const base=r?.report_number||`Rapportino_${pad(i+1)}`;
          const filename=`${safeName(base)}${datePart?`_${datePart}`:''}.pdf`;
          reportsFolder.file(filename,blob);
        }catch(err){missing.push(`PDF ${entry.path}: ${err.message}`);}
      }

      const phaseCounters={};
      for(let i=0;i<photos.length;i++){
        const ph=photos[i];
        if(!ph.storage_path){missing.push(`Foto ${i+1}: percorso mancante`);continue;}
        try{
          const blob=await fetchStoredBlob('pw-posa-photos',ph.storage_path);
          const folderName=photoFolder(ph.phase);
          const folder=zip.folder(folderName);
          phaseCounters[folderName]=(phaseCounters[folderName]||0)+1;
          const ext=extensionFromPath(ph.storage_path,blob.type==='image/png'?'.png':'.jpg');
          folder.file(readablePhotoName(ph,phaseCounters[folderName]-1,ext),blob);
        }catch(err){missing.push(`Foto ${i+1} (${ph.phase||'senza fase'}): ${err.message}`);}
      }

      if(missing.length) zip.file('File_non_inclusi.txt',missing.join('\r\n'));
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
      if(!blob?.size) throw new Error('ZIP generato vuoto');
      const filename=`POSA_${safeName(pose.job_number||pose.id)}.zip`;

      const file=new File([blob],filename,{type:'application/zip'});
      if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
        try{await navigator.share({files:[file],title:`Fascicolo ${pose.job_number}`});toast('Fascicolo pronto');return;}catch(err){if(err?.name==='AbortError') return;}
      }
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      toast(missing.length?`ZIP esportato. ${missing.length} file non inclusi`:'Fascicolo esportato');
    }catch(err){toast(`Esportazione: ${err.message}`);console.error('PW Posa export',err);}
    finally{if(button){button.disabled=false;button.textContent='Esporta fascicolo';}}
  }

  function injectButton(){
    const host=$('archiveDossier');
    if(!host||host.classList.contains('hidden')||!currentPoseId) return;
    if(host.querySelector('[data-export-dossier]')) return;
    getProfile().then(p=>{
      if(!['office_scheduler','office_viewer'].includes(p?.role)) return;
      const head=host.querySelector('.archive-dossier-head'); if(!head) return;
      const btn=document.createElement('button');
      btn.type='button';btn.className='btn primary archive-export-btn';btn.dataset.exportDossier=currentPoseId;btn.textContent='Esporta fascicolo';
      const back=head.querySelector('#archiveCloseDossier');
      if(back) back.insertAdjacentElement('beforebegin',btn); else head.appendChild(btn);
      btn.addEventListener('click',()=>exportDossier(currentPoseId,btn));
    }).catch(err=>console.warn('Export dossier',err));
  }

  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-archive-pose]');
    if(open?.dataset.archivePose){currentPoseId=open.dataset.archivePose;setTimeout(injectButton,60);}
  },true);
  new MutationObserver(()=>setTimeout(injectButton,0)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
})();