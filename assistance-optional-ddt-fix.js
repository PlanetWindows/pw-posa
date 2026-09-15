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

  function syncPanel(){
    const panel=document.querySelector('[data-assistance-close-flow-v4]');
    if(!panel||!noDdt(panel))return;

    const mainTitle=[...panel.querySelectorAll('h4')].find(x=>(x.textContent||'').trim()==='Rapportino + DDT');
    if(mainTitle)mainTitle.textContent='Rapportino di fine assistenza';

    const intro=panel.querySelector('.eyebrow')?.nextElementSibling?.nextElementSibling;
    if(intro?.classList.contains('muted'))intro.textContent='Compila e firma il rapportino. Il DDT è facoltativo e non blocca la chiusura dell’assistenza.';

    const ddtTitle=[...panel.querySelectorAll('h4')].find(x=>(x.textContent||'').trim()==='Firme DDT');
    if(ddtTitle)ddtTitle.textContent='DDT (facoltativo)';

    const ddtMissing=[...panel.querySelectorAll('.form-error')].find(x=>(x.textContent||'').includes('DDT non presente'));
    if(ddtMissing){
      ddtMissing.classList.remove('form-error');
      ddtMissing.classList.add('muted');
      ddtMissing.textContent='Nessun DDT associato: verrà inviato al cliente solo il rapportino firmato.';
    }

    const btn=panel.querySelector('#assV4Send');
    if(btn){
      btn.disabled=false;
      btn.textContent='INVIA RAPPORTINO';
      btn.dataset.optionalDdtReady='1';
    }
  }

  const isIOS=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  const signatureCanvasIds=['assV4ReportInstaller','assV4ReportClient','assV4DdtInstaller','assV4DdtClient','ddtInstallerSign','ddtClientSign'];

  function bindIOSSignatureCanvas(c){
    if(!isIOS||!c||c.dataset.iosSignatureFix==='1')return;
    c.dataset.iosSignatureFix='1';
    c.style.touchAction='none';
    c.style.webkitUserSelect='none';
    c.style.userSelect='none';

    const ctx=c.getContext('2d');
    if(!ctx)return;
    ctx.lineWidth=3;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.strokeStyle='#111';

    let drawing=false;
    let last=null;
    let activePointer=null;

    const point=(clientX,clientY)=>{
      const r=c.getBoundingClientRect();
      return {
        x:(clientX-r.left)*c.width/Math.max(r.width,1),
        y:(clientY-r.top)*c.height/Math.max(r.height,1)
      };
    };

    const begin=(clientX,clientY,pointerId=null)=>{
      drawing=true;
      activePointer=pointerId;
      last=point(clientX,clientY);
      if(pointerId!==null&&c.setPointerCapture){
        try{c.setPointerCapture(pointerId)}catch(_){ }
      }
    };

    const move=(clientX,clientY)=>{
      if(!drawing||!last)return;
      const p=point(clientX,clientY);
      ctx.beginPath();
      ctx.moveTo(last.x,last.y);
      ctx.lineTo(p.x,p.y);
      ctx.stroke();
      last=p;
      c.dataset.signed='1';
    };

    const end=()=>{
      drawing=false;
      last=null;
      activePointer=null;
    };

    if(window.PointerEvent){
      c.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'&&e.button!==0)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        begin(e.clientX,e.clientY,e.pointerId);
      },{capture:true,passive:false});
      c.addEventListener('pointermove',e=>{
        if(!drawing||(activePointer!==null&&e.pointerId!==activePointer))return;
        e.preventDefault();
        e.stopImmediatePropagation();
        move(e.clientX,e.clientY);
      },{capture:true,passive:false});
      c.addEventListener('pointerup',e=>{
        if(activePointer!==null&&e.pointerId!==activePointer)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        end();
      },{capture:true,passive:false});
      c.addEventListener('pointercancel',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        end();
      },{capture:true,passive:false});
    }else{
      c.addEventListener('touchstart',e=>{
        const t=e.touches?.[0];
        if(!t)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        begin(t.clientX,t.clientY);
      },{capture:true,passive:false});
      c.addEventListener('touchmove',e=>{
        const t=e.touches?.[0];
        if(!t||!drawing)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        move(t.clientX,t.clientY);
      },{capture:true,passive:false});
      c.addEventListener('touchend',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        end();
      },{capture:true,passive:false});
      c.addEventListener('touchcancel',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        end();
      },{capture:true,passive:false});
    }
  }

  function repairIOSSignatures(){
    if(!isIOS)return;
    signatureCanvasIds.forEach(id=>bindIOSSignatureCanvas($(id)));
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
    if(card?.dataset.assistance)currentId=card.dataset.assistance;
    setTimeout(repairIOSSignatures,80);
    setTimeout(repairIOSSignatures,300);
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

  new MutationObserver(()=>{
    syncPanel();
    repairIOSSignatures();
  }).observe(document.body,{subtree:true,childList:true});

  window.addEventListener('load',()=>{
    setTimeout(syncPanel,1000);
    setTimeout(repairIOSSignatures,300);
    setTimeout(repairIOSSignatures,1200);
  });
})();
