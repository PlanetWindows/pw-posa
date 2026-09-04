(() => {
  function loadOnce(src,attr){
    if(document.querySelector(`script[${attr}="1"]`)) return;
    const s=document.createElement('script');s.src=src;s.setAttribute(attr,'1');document.body.appendChild(s);
  }
  function ensureExtras(){
    loadOnce('ddt-dedupe.js?v=20260904-ddt4','data-ddt-dedupe');
    loadOnce('ddt-archive.js?v=20260904-ddt4','data-ddt-archive-script');
  }
  function bootDdtAfterAssistance(){
    if(document.getElementById('poseDdtBlock')){ensureExtras();return;}
    const ready=document.getElementById('normalPoseFields')&&document.getElementById('assistanceFields');
    if(!ready){setTimeout(bootDdtAfterAssistance,120);return;}
    if(!document.querySelector('script[data-ddt-late="1"]')){
      const s=document.createElement('script');s.src='ddt.js?v=20260904-ddt4';s.dataset.ddtLate='1';s.onload=ensureExtras;document.body.appendChild(s);
    }else ensureExtras();
  }
  if(document.readyState==='complete')bootDdtAfterAssistance();
  else window.addEventListener('load',()=>setTimeout(bootDdtAfterAssistance,80),{once:true});
})();