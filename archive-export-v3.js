(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!window.JSZip||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  let currentPoseId=null;
  let profile=null;

  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),5000)};
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

  async function getPose(poseId){
    const {data,error}=await sb.from('poses').select('*').eq('id',poseId).single();
    if(error) throw error;
    return data;
  }

  async function getPhotos(poseId){
    const {data,error}=await sb.from('pose_photos').select('id,phase,storage_path,created_at,caption').eq('pose_id',poseId).order('created_at');
    if(error) throw error;
    return data||[];
  }

  async function getReportLinks(poseId){
    const {data,error}=await sb.from('daily_report_poses').select('report_id').eq('pose_id',poseId);
    if(error) throw error;
    return [...new Set((data||[]).map(x=>x.report_id).filter(Boolean))];
  }

  async function getReports(ids){
    if(!ids.length) return [];
    const {data,error}=await sb.from('daily_reports').select('*').in('id',ids).order('report_date');
    if(error){
      // Non bloccare l'export: i report ID sono comunque sufficienti per cercare il PDF nello Storage.
      return ids.map(id=>({id,report_number:null,report_date:null,pdf_storage_path:null,pdf_file_name:null}));
    }
    const byId=new Map((data||[]).map(r=>[String(r.id),r]));
    return ids.map(id=>byId.get(String(id))||({id,report_number:null,report_date:null,pdf_storage_path:null,pdf_file_name:null}));
  }

  async function fetchBlob(bucket,path){
    // Prima prova download diretto: funziona con le stesse policy Storage usate dall'app.
    const direct=await sb.storage.from(bucket).download(path);
    if(!direct.error&&direct.data&&direct.data.size>0) return direct.data;
    // Fallback signed URL.
    const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,300);
    if(error) throw error;
    if(!data?.signedUrl) throw new Error('Link file non disponibile');
    const res=await fetch(data.signedUrl,{cache:'no-store'});
    if(!res.ok) throw new Error(`Download ${res.status}`);
    const blob=await res.blob();
    if(!blob?.size) throw new Error('File vuoto');
    return blob;
  }

  async function resolvePdfEntries(poseId,reports){
    const folder=`poses/${poseId}/rapportini`;
    const entries=[];
    const seen=new Set();

    // 1) Percorsi noti dal DB oppure percorso deterministico usato dal salvataggio PDF.
    for(const r of reports){
      const candidates=[];
      if(r.pdf_storage_path) candidates.push(r.pdf_storage_path);
      candidates.push(`${folder}/${r.id}.pdf`);
      for(const path of candidates){
        if(!path||seen.has(path)) continue;
        try{
          const blob=await fetchBlob('pw-posa-documents',path);
          entries.push({path,blob,report:r});
          seen.add(path);
          break;
        }catch(_){ }
      }
    }

    // 2) Cerca qualunque PDF effettivamente presente nella cartella della posa.
    const {data:list,error}=await sb.storage.from('pw-posa-documents').list(folder,{limit:200,sortBy:{column:'name',order:'asc'}});
    if(!error){
      for(const f of list||[]){
        if(!f?.name||!f.name.toLowerCase().endsWith('.pdf')) continue;
        const path=`${folder}/${f.name}`;
        if(seen.has(path)) continue;
        try{
          const blob=await fetchBlob('pw-posa-documents',path);
          const reportId=f.name.replace(/\.pdf$/i,'');
          const report=reports.find(r=>String(r.id)===reportId)||null;
          entries.push({path,blob,report});
          seen.add(path);
        }catch(_){ }
      }
    }
    return entries;
  }

  function photoFolder(phase){
    const p=String(phase||'').toLowerCase();
    return p==='prima'?'Foto_Prima':p==='durante'?'Foto_Durante':p==='dopo'?'Foto_Fine_Posa':p==='segnalazione'?'Foto_Segnalazioni':'Foto_Altro';
  }

  function extension(path,blob){
    const clean=String(path||'').split('?')[0];
    const m=clean.match(/\.([a-zA-Z0-9]{2,5})$/);
    if(m) return `.${m[1].toLowerCase()}`;
    if(blob?.type==='image/png') return '.png';
    if(blob?.type==='image/webp') return '.webp';
    return '.jpg';
  }

  async function exportDossier(poseId,button){
    const p=await getProfile();
    if(!['office_scheduler','office_viewer'].includes(p?.role)) return toast('Esportazione disponibile solo per l’Ufficio');
    if(button){button.disabled=true;button.textContent='Preparazione ZIP…';}

    try{
      const pose=await getPose(poseId);
      const [photos,reportIds]=await Promise.all([getPhotos(poseId),getReportLinks(poseId)]);
      const reports=await getReports(reportIds);
      const pdfEntries=await resolvePdfEntries(poseId,reports);

      const zip=new JSZip();
      const rapportini=zip.folder('Rapportini');
      const folders={
        Foto_Prima:zip.folder('Foto_Prima'),
        Foto_Durante:zip.folder('Foto_Durante'),
        Foto_Fine_Posa:zip.folder('Foto_Fine_Posa'),
        Foto_Segnalazioni:zip.folder('Foto_Segnalazioni'),
        Foto_Altro:zip.folder('Foto_Altro')
      };
      const missing=[];

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
        `Rapportini PDF inclusi: ${pdfEntries.length}`,
        `Foto incluse: ${photos.length}`
      ].join('\r\n');
      zip.file('Dati_Commessa.txt',info);

      // Nomi volutamente semplici e leggibili.
      for(let i=0;i<pdfEntries.length;i++){
        const e=pdfEntries[i];
        const date=e.report?.report_date?String(e.report.report_date).split('-').reverse().join('-'):'';
        const name=date?`Rapportino_${date}.pdf`:`Rapportino_${pad(i+1)}.pdf`;
        rapportini.file(name,e.blob);
      }

      const counters={};
      for(const ph of photos){
        if(!ph.storage_path){missing.push(`Foto ${ph.id||''}: percorso mancante`);continue;}
        const folderName=photoFolder(ph.phase);
        counters[folderName]=(counters[folderName]||0)+1;
        try{
          const blob=await fetchBlob('pw-posa-photos',ph.storage_path);
          const ext=extension(ph.storage_path,blob);
          // Dentro ogni cartella: Foto_01.jpg, Foto_02.jpg ... senza timestamp tecnici.
          folders[folderName].file(`Foto_${pad(counters[folderName])}${ext}`,blob);
        }catch(err){missing.push(`Foto ${ph.id||''} (${ph.phase||'senza fase'}): ${err.message}`);}
      }

      if(missing.length) zip.file('File_non_inclusi.txt',missing.join('\r\n'));

      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
      if(!blob?.size) throw new Error('ZIP generato vuoto');
      const filename=`POSA_${safeName(pose.job_number||pose.id)}.zip`;

      // Desktop: download classico. Mobile: share se disponibile.
      const file=new File([blob],filename,{type:'application/zip'});
      if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
        try{
          await navigator.share({files:[file],title:`Fascicolo ${pose.job_number}`});
          toast(`Fascicolo esportato: ${pdfEntries.length} PDF, ${photos.length} foto`);
          return;
        }catch(err){if(err?.name==='AbortError') return;}
      }
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      toast(`Fascicolo esportato: ${pdfEntries.length} PDF, ${photos.length} foto`);
    }catch(err){
      toast(`Esportazione: ${err.message}`);
      console.error('PW Posa export v3',err);
    }finally{
      if(button){button.disabled=false;button.textContent='Esporta fascicolo';}
    }
  }

  function injectButton(){
    const host=$('archiveDossier');
    if(!host||host.classList.contains('hidden')||!currentPoseId) return;
    if(host.querySelector('[data-export-dossier]')) return;
    getProfile().then(p=>{
      if(!['office_scheduler','office_viewer'].includes(p?.role)) return;
      const head=host.querySelector('.archive-dossier-head');
      if(!head) return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn primary archive-export-btn';
      btn.dataset.exportDossier=currentPoseId;
      btn.textContent='Esporta fascicolo';
      const back=head.querySelector('#archiveCloseDossier');
      if(back) back.insertAdjacentElement('beforebegin',btn); else head.appendChild(btn);
      btn.addEventListener('click',()=>exportDossier(currentPoseId,btn));
    }).catch(err=>console.warn('Export dossier v3',err));
  }

  document.addEventListener('click',e=>{
    const open=e.target.closest('[data-archive-pose]');
    if(open?.dataset.archivePose){currentPoseId=open.dataset.archivePose;setTimeout(injectButton,60);}
  },true);
  new MutationObserver(()=>setTimeout(injectButton,0)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
})();