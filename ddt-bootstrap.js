(() => {
  function bootDdtAfterAssistance(){
    if(document.getElementById('poseDdtBlock')) return;
    const ready=document.getElementById('normalPoseFields') && document.getElementById('assistanceFields');
    if(!ready){ setTimeout(bootDdtAfterAssistance,120); return; }
    if(document.querySelector('script[data-ddt-late="1"]')) return;
    const s=document.createElement('script');
    s.src='ddt.js?v=20260904-ddt2';
    s.dataset.ddtLate='1';
    document.body.appendChild(s);
  }
  if(document.readyState==='complete') bootDdtAfterAssistance();
  else window.addEventListener('load',()=>setTimeout(bootDdtAfterAssistance,80),{once:true});
})();