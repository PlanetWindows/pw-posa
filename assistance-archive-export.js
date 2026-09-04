(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!window.JSZip||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const B='pw-assistance-private';
  const safe=v=>String(v||'assistenza').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_').slice(0,120);
  const fd=v=>{if(!v)return'—';const[y,m,d]=String(v).slice(0,10).split('-');return`${d}/${m}/${y}`};
  const toast=m=>{const e=document.getElementById('toast');if(!e)return;e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),4500)};
  async function profile(){const {data:{session}}=await sb.auth.getSession();if(!session)return null;const r=await sb.from('profiles').select('role').eq('id',session.user.id).single();if(r.error)throw r.error;return r.data}
  async function blob(path){const r=await sb.storage.from(B).download(path);if(r.error)throw r.error;return r.data}
  function ext(path,b){const m=String(path||'').match(/\.([a-z0-9]{2,5})$/i);if(m)return'.'+m[1].toLowerCase();if(b?.type==='image/png')return'.png';if(b?.type==='image/webp')return'.webp';return'.jpg'}
  async function exportAssistance(id,btn){
    const p=await profile();if(!['office_scheduler','office_viewer'].includes(p?.role))return toast('Esportazione disponibile solo per l’Ufficio');
    const old=btn.textContent;btn.disabled=true;btn.textContent='Preparazione ZIP…';
    try{
      const ar=await sb.from('assistances').select('*').eq('id',id).single();if(ar.error)throw ar.error;const a=ar.data;
      const pr=await sb.from('assistance_photos').select('*').eq('assistance_id',id).order('created_at');if(pr.error)throw pr.error;const photos=pr.data||[];
      const zip=new JSZip(), pf=zip.folder('Fotografie'), rf=zip.folder('Rapportino_Assistenza'), missing=[];
      zip.file('Dati_Assistenza.txt',[
        'PW Posa - Fascicolo assistenza','',`Protocollo / ordine: ${a.protocol_order||'—'}`,`Cliente: ${a.client_name||'—'}`,`Telefono: ${a.client_phone||'—'}`,`Email: ${a.client_email||'—'}`,`Indirizzo: ${a.address||'—'}${a.city?`, ${a.city}`:''}${a.postal_code?` ${a.postal_code}`:''}`,`Data assistenza: ${fd(a.scheduled_date)}${a.scheduled_end_date&&a.scheduled_end_date!==a.scheduled_date?' → '+fd(a.scheduled_end_date):''}`,`Problematica: ${a.final_issue_description||a.issue_description||'—'}`,`Intervento eseguito: ${a.work_performed||a.final_work_performed||a.intervention_description||'—'}`,`Esito / risoluzione: ${a.resolution_status||a.final_resolution_status||a.resolved||'—'}`,`Note finali: ${a.final_notes||a.installer_notes||'—'}`
      ].join('\r\n'));
      if(a.final_report_path){try{rf.file(a.final_report_name||'Rapportino_Assistenza.pdf',await blob(a.final_report_path))}catch(e){missing.push('Rapportino: '+e.message)}}
      let i=0;for(const ph of photos){if(!ph.storage_path)continue;try{const b=await blob(ph.storage_path);i++;pf.file(`Foto_${String(i).padStart(2,'0')}${ext(ph.storage_path,b)}`,b)}catch(e){missing.push(`Foto ${ph.file_name||ph.id}: ${e.message}`)}}
      if(missing.length)zip.file('File_non_inclusi.txt',missing.join('\r\n'));
      const out=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});if(!out.size)throw new Error('ZIP generato vuoto');
      const name=`ASSISTENZA_${safe(a.protocol_order||a.id)}.zip`,url=URL.createObjectURL(out),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast(`Fascicolo assistenza esportato: ${photos.length} foto${a.final_report_path?', 1 rapportino':''}`);
    }catch(e){console.error(e);toast('Esportazione assistenza: '+(e.message||e))}finally{btn.disabled=false;btn.textContent=old}
  }
  let current=null;
  document.addEventListener('click',e=>{const o=e.target.closest('[data-open-assistance-folder]');if(o)current=o.dataset.openAssistanceFolder;const b=e.target.closest('[data-export-assistance]');if(b){e.preventDefault();exportAssistance(b.dataset.exportAssistance,b)}},true);
  function inject(){const host=document.getElementById('archiveDossier');if(!host||host.classList.contains('hidden')||!current)return;if(host.querySelector('[data-export-assistance]'))return;const title=host.querySelector('.eyebrow')?.textContent||'';if(!/ASSISTENZA/i.test(title))return;const head=host.querySelector('.archive-dossier-head');if(!head)return;const b=document.createElement('button');b.type='button';b.className='btn primary archive-export-btn';b.dataset.exportAssistance=current;b.textContent='Esporta su PC';const back=head.querySelector('#archiveCloseDossier');if(back)back.insertAdjacentElement('beforebegin',b);else head.appendChild(b)}
  new MutationObserver(()=>setTimeout(inject,20)).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
})();