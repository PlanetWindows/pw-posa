(() => {
  function ensureDedupe(){
    if(document.querySelector('script[data-ddt-dedupe="1"]')) return;
    const s=document.createElement('script');
    s.src='ddt-dedupe.js?v=20260904-ddt3';
    s.dataset.ddtDedupe='1';
    document.body.appendChild(s);
  }
  function bootDdtAfterAssistance(){
    if(document.getElementById('poseDdtBlock')){ ensureDedupe(); return; }
    const ready=document.getElementById('normalPoseFields') && document.getElementById('assistanceFields');
    if(!ready){ setTimeout(bootDdtAfterAssistance,120); return; }
    if(!document.querySelector('script[data-ddt-late="1"]')){
      const s=document.createElement('script');
      s.src='ddt.js?v=20260904-ddt3';
      s.dataset.ddtLate='1';
      s.onload=ensureDedupe;
      document.body.appendChild(s);
    } else {
      ensureDedupe();
    }
  }
  if(document.readyState==='complete') bootDdtAfterAssistance();
  else window.addEventListener('load',()=>setTimeout(bootDdtAfterAssistance,80),{once:true});
})();