(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let profile = null;
  let currentArchivePoseId = null;
  const $ = id => document.getElementById(id);
  const toast = msg => { const el=$('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3800); };

  async function getProfile(){
    if(profile) return profile;
    const {data:{session}} = await sb.auth.getSession();
    if(!session) return null;
    const {data,error} = await sb.from('profiles').select('*').eq('id',session.user.id).single();
    if(error) throw error;
    profile = data;
    return data;
  }

  async function signedUrl(bucket,path){
    const {data,error} = await sb.storage.from(bucket).createSignedUrl(path,300);
    if(error) throw error;
    if(!data?.signedUrl) throw new Error('Link file non disponibile');
    return data.signedUrl;
  }

  function ensurePhotoViewer(){
    let viewer=$('archivePhotoViewer');
    if(viewer) return viewer;
    viewer=document.createElement('dialog');
    viewer.id='archivePhotoViewer';
    viewer.className='archive-photo-viewer';
    viewer.innerHTML=`<div class="archive-photo-viewer-inner"><button type="button" class="archive-photo-close" id="archivePhotoClose" aria-label="Chiudi foto">×</button><img id="archivePhotoImage" alt="Foto archivio" /></div>`;
    document.body.appendChild(viewer);
    const close=()=>{ if(viewer.open) viewer.close(); const img=$('archivePhotoImage'); if(img) img.removeAttribute('src'); };
    $('archivePhotoClose').addEventListener('click',close);
    viewer.addEventListener('click',e=>{ if(e.target===viewer) close(); });
    viewer.addEventListener('cancel',e=>{ e.preventDefault(); close(); });
    return viewer;
  }

  async function openPhoto(path){
    const url=await signedUrl('pw-posa-photos',path);
    const viewer=ensurePhotoViewer();
    const img=$('archivePhotoImage');
    img.src=url;
    if(!viewer.open) viewer.showModal();
  }

  async function openPdf(path){
    const url=await signedUrl('pw-posa-documents',path);
    window.open(url,'_blank','noopener');
  }

  document.addEventListener('click', async e => {
    const poseBtn = e.target.closest('[data-archive-pose]');
    if(poseBtn?.dataset.archivePose) currentArchivePoseId = poseBtn.dataset.archivePose;

    const photo = e.target.closest('[data-archive-photo]');
    if(photo){
      e.preventDefault(); e.stopImmediatePropagation();
      try{ await openPhoto(photo.dataset.archivePhoto); }
      catch(err){ toast(`Foto: ${err.message}`); }
      return;
    }
    const pdf = e.target.closest('[data-archive-pdf]');
    if(pdf){
      e.preventDefault(); e.stopImmediatePropagation();
      try{ await openPdf(pdf.dataset.archivePdf); }
      catch(err){ toast(`PDF: ${err.message}`); }
      return;
    }
    const delDoc = e.target.closest('[data-delete-archive-document]');
    if(delDoc){
      e.preventDefault(); e.stopImmediatePropagation();
      const p = await getProfile();
      if(p?.role !== 'office') return toast('Solo l’Ufficio può eliminare documenti');
      const path = delDoc.dataset.deleteArchiveDocument;
      if(!confirm('Eliminare definitivamente questo PDF dall’archivio?')) return;
      delDoc.disabled = true;
      try{
        const {data:rows,error:re} = await sb.from('daily_reports').select('id').eq('pdf_storage_path',path).limit(1);
        if(re) throw re;
        const reportId = rows?.[0]?.id;
        const {error:se} = await sb.storage.from('pw-posa-documents').remove([path]);
        if(se) throw new Error(`Eliminazione file non consentita: ${se.message}`);
        if(reportId){
          const {error:ue} = await sb.from('daily_reports').update({pdf_storage_path:null,pdf_file_name:null,pdf_generated_at:null}).eq('id',reportId);
          if(ue) throw ue;
        }
        toast('Documento eliminato');
        document.querySelector('.nav-item[data-view="archive"]')?.click();
      }catch(err){ toast(err.message); delDoc.disabled=false; }
      return;
    }
    const delPose = e.target.closest('[data-delete-archive-pose]');
    if(delPose){
      e.preventDefault(); e.stopImmediatePropagation();
      const p = await getProfile();
      if(p?.role !== 'office') return toast('Solo l’Ufficio può eliminare pose');
      const poseId = delPose.dataset.deleteArchivePose;
      if(!confirm('Eliminare definitivamente questa posa? L’operazione non può essere annullata.')) return;
      delPose.disabled = true;
      try{
        const {error} = await sb.from('poses').delete().eq('id',poseId);
        if(error) throw error;
        toast('Posa eliminata');
        currentArchivePoseId = null;
        document.querySelector('.nav-item[data-view="archive"]')?.click();
      }catch(err){ toast(`Impossibile eliminare la posa: ${err.message}`); delPose.disabled=false; }
    }
  }, true);

  async function enhanceDossier(){
    const host = $('archiveDossier');
    if(!host || host.classList.contains('hidden')) return;
    const p = await getProfile().catch(()=>null);
    if(p?.role !== 'office') return;

    if(currentArchivePoseId && !host.querySelector('[data-delete-archive-pose]')){
      const head = host.querySelector('.archive-dossier-head');
      if(head){
        const btn = document.createElement('button');
        btn.type='button'; btn.className='btn archive-delete-btn';
        btn.dataset.deleteArchivePose=currentArchivePoseId;
        btn.textContent='Elimina posa';
        head.appendChild(btn);
      }
    }

    host.querySelectorAll('[data-archive-pdf]').forEach(openBtn => {
      if(openBtn.parentElement?.querySelector('[data-delete-archive-document]')) return;
      const del = document.createElement('button');
      del.type='button'; del.className='btn archive-delete-btn';
      del.dataset.deleteArchiveDocument=openBtn.dataset.archivePdf;
      del.textContent='Elimina PDF';
      openBtn.insertAdjacentElement('afterend', del);
    });
  }

  const observer = new MutationObserver(() => setTimeout(()=>enhanceDossier(),0));
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
})();