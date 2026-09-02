(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const toast = msg => { const el=$('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3800); };

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
    const popup=window.open('about:blank','_blank');
    try{
      const url=await signedUrl('pw-posa-documents',path);
      if(popup && !popup.closed) popup.location.replace(url); else window.location.assign(url);
    }catch(err){
      try{ popup?.close(); }catch(_e){}
      throw err;
    }
  }

  document.addEventListener('click', async e => {
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
    }
  }, true);
})();