(() => {
  const $ = id => document.getElementById(id);
  const requiredFields = [
    ['assProtocol','Numero protocollo e/o ordine'],
    ['assClient','Cliente'],
    ['assEmail','Email cliente'],
    ['assTeam','Squadra'],
    ['assAddress','Indirizzo'],
    ['assDate','Data inizio'],
    ['assEndDate','Data fine'],
    ['assStart','Ora inizio'],
    ['assIssue','Problematica riscontrata'],
    ['assWarranty','Garanzia'],
    ['assPayment','Pagamento']
  ];

  function isAssistanceMode(){
    const fields=$('assistanceFields');
    return !!fields && !fields.classList.contains('hidden');
  }

  function ensureErrorBox(){
    const fields=$('assistanceFields');
    if(!fields) return null;
    let box=$('assValidationError');
    if(!box){
      box=document.createElement('div');
      box.id='assValidationError';
      box.className='span2';
      box.setAttribute('role','alert');
      box.style.cssText='display:none;padding:12px 14px;border:1px solid #b42318;border-radius:12px;background:#fff4f2;color:#8a1c13;font-weight:600;margin-bottom:4px;';
      fields.prepend(box);
    }
    return box;
  }

  function clearErrors(){
    const box=ensureErrorBox();
    if(box){box.textContent='';box.style.display='none';}
    document.querySelectorAll('#assistanceFields .pw-ass-invalid').forEach(el=>{
      el.classList.remove('pw-ass-invalid');
      el.style.outline='';
      el.style.outlineOffset='';
    });
  }

  function fail(id,message){
    clearErrors();
    const el=$(id), box=ensureErrorBox();
    if(box){box.textContent=message;box.style.display='block';}
    if(el){
      el.classList.add('pw-ass-invalid');
      el.style.outline='2px solid #b42318';
      el.style.outlineOffset='2px';
      el.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>el.focus({preventScroll:true}),250);
    }
    return false;
  }

  function validate(){
    clearErrors();
    for(const [id,label] of requiredFields){
      const el=$(id);
      if(!el || !String(el.value||'').trim()) return fail(id,`${label}: campo obbligatorio.`);
    }
    const email=$('assEmail');
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return fail('assEmail','Email cliente: inserisci un indirizzo email valido.');
    if($('assPayment')?.value==='true'){
      const amount=String($('assAmount')?.value||'').trim();
      if(!/^\d+(?:[.,]\d{1,2})?$/.test(amount)) return fail('assAmount','Importo da pagare: obbligatorio e con massimo due decimali.');
    }
    if($('assDate')?.value && $('assEndDate')?.value && $('assEndDate').value < $('assDate').value) return fail('assEndDate','La data finale non può precedere quella iniziale.');
    return true;
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('#poseSubmitBtn');
    if(!btn || !isAssistanceMode()) return;
    if(!validate()){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);

  document.addEventListener('input',e=>{
    if(e.target.closest('#assistanceFields')){
      const box=$('assValidationError');
      if(box){box.textContent='';box.style.display='none';}
      e.target.classList.remove('pw-ass-invalid');
      e.target.style.outline='';
      e.target.style.outlineOffset='';
    }
  },true);

  document.addEventListener('change',e=>{
    if(e.target.closest('#assistanceFields')){
      const box=$('assValidationError');
      if(box){box.textContent='';box.style.display='none';}
      e.target.classList.remove('pw-ass-invalid');
      e.target.style.outline='';
      e.target.style.outlineOffset='';
    }
  },true);
})();