(()=>{
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;

  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  let currentId=new URLSearchParams(location.search).get('assistance')||null;
  let busy=false;

  const toast=m=>{
    const e=$('toast');
    if(!e)return alert(m);
    e.textContent=m;
    e.classList.add('show');
    setTimeout(()=>e.classList.remove('show'),4200);
  };

  const setError=m=>{
    const e=$('assV4Error');
    if(!e)return;
    e.textContent=m||'';
    e.style.display=m?'block':'none';
  };

  function noDdt(panel){
    return !!panel && !panel.querySelector('#assV4DdtInstaller');
  }

  function setText(el,text){
    if(el && el.textContent!==text)el.textContent=text;
  }

  function syncPanel(){
    const panel=document.querySelector('[data-assistance-close-flow-v4]');
    if(!panel||!noDdt(panel))return false;

    const mainTitle=[...panel.querySelectorAll('h4')].find(x=>(x.textContent||'').trim()==='Rapportino + DDT');
    setText(mainTitle,'Rapportino di fine assistenza');

    const intro=panel.querySelector('.eyebrow')?.nextElementSibling?.nextElementSibling;
    if(intro?.classList.contains('muted'))setText(intro,'Compila e firma il rapportino. Il DDT è facoltativo e non blocca la chiusura dell’assistenza.');

    const ddtTitle=[...panel.querySelectorAll('h4')].find(x=>(x.textContent||'').trim()==='Firme DDT');
    setText(ddtTitle,'DDT (facoltativo)');

    const ddtMissing=[...panel.querySelectorAll('.form-error')].find(x=>(x.textContent||'').includes('DDT non presente'));
    if(ddtMissing){
      ddtMissing.classList.remove('form-error');
      ddtMissing.classList.add('muted');
      setText(ddtMissing,'Nessun DDT associato: verrà inviato al cliente solo il rapportino firmato.');
    }

    const btn=panel.querySelector('#assV4Send');
    if(btn){
      btn.disabled=false;
      setText(btn,'INVIA RAPPORTINO');
      btn.dataset.optionalDdtReady='1';
    }
    return true;
  }

  function scheduleSync(){
    [80,250,500,900,1500].forEach(ms=>setTimeout(syncPanel,ms));
  }

  async function sendReportOnly(){
    if(busy)return;
    const btn=$('assV4Send');
    const progress=$('assV4Progress');
    setError('');

    if(!currentId)return setError('Assistenza non identificata. Chiudi e riapri la scheda.');

    const resolved=document.querySelector('input[name="assV4Resolved"]:checked')?.value;
    if(!resolved)return setError('Indica se il problema è stato risolto.');

    const notResolved=resolved==='false';
    const intervention=($('assV4Intervention')?.value||'').trim();
    const notes=($('assV4Notes')?.value||'').trim();
    const signer=($('assV4Signer')?.value||'').trim();

    if(notResolved&&!intervention)return setError('Descrivi come siamo intervenuti.');
    if(!notes)return setError('Inserisci le note finali.');
    if(!signer)return setError('Inserisci nome e cognome del cliente.');
    if($('assV4ReportInstaller')?.dataset.signed!=='1')return setError('Firma Posatore – Rapportino obbligatoria.');
    if($('assV4ReportClient')?.dataset.signed!=='1')return setError('Firma Cliente – Rapportino obbligatoria.');

    busy=true;
    if(btn)btn.disabled=true;

    try{
      const installerSignature=$('assV4ReportInstaller').toDataURL('image/png');
      const clientSignature=$('assV4ReportClient').toDataURL('image/png');

      if(progress)progress.textContent='1/2 · Generazione Rapportino firmato…';
      let r=await sb.functions.invoke('finalize-assistance-v2',{body:{
        assistance_id:currentId,
        intervention:notResolved?intervention:'Problema risolto',
        problem_resolved:resolved==='true',
        final_notes:notes,
        installer_signer_name:'Angelo Idone',
        installer_signature_data_url:installerSignature,
        signer_name:signer,
        signature_data_url:clientSignature
      }});
      if(r.error||!r.data?.ok)throw Error(r.data?.error||r.error?.message||'Errore Rapportino');

      if(progress)progress.textContent='2/2 · Invio Rapportino al cliente…';
      r=await sb.functions.invoke('send-assistance-package',{body:{assistance_id:currentId}});
      if(r.error||!r.data?.ok)throw Error(r.data?.error||r.error?.message||'Errore invio');

      toast('Rapportino inviato al cliente.');
      busy=false;
      $('assistanceDetailDialog')?.close();
    }catch(e){
      console.error(e);
      setError(e?.message||String(e));
      if(progress)progress.textContent='Nessuna nuova email inviata. Correggi e riprova.';
      busy=false;
      if(btn)btn.disabled=false;
    }
  }

  document.addEventListener('click',e=>{
    const card=e.target.closest('[data-assistance]');
    if(card?.dataset.assistance){
      currentId=card.dataset.assistance;
      scheduleSync();
    }
  },true);

  document.addEventListener('click',e=>{
    const btn=e.target.closest('#assV4Send');
    if(!btn)return;
    const panel=btn.closest('[data-assistance-close-flow-v4]');
    if(!noDdt(panel))return;
    e.preventDefault();
    e.stopImmediatePropagation();
    sendReportOnly();
  },true);

  window.addEventListener('load',()=>{
    [400,900,1600,2500].forEach(ms=>setTimeout(syncPanel,ms));
  });
})();
