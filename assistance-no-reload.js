(()=>{
  const nativeSetTimeout=window.setTimeout.bind(window);
  let suppressReloadUntil=0;

  const assistanceMode=()=>{
    const fields=document.getElementById('assistanceFields');
    return !!fields&&!fields.classList.contains('hidden');
  };

  document.addEventListener('click',e=>{
    if(e.target.closest('#poseSubmitBtn')&&assistanceMode()){
      suppressReloadUntil=Date.now()+4000;
      nativeSetTimeout(()=>{
        const dlg=document.getElementById('poseDialog');
        if(dlg?.open){try{dlg.close()}catch{}}
        if(document.getElementById('pageTitle')?.textContent==='Calendario'){
          document.querySelector('[data-view="calendar"]')?.click();
        }
      },900);
    }
  },true);

  window.setTimeout=function(handler,timeout,...args){
    if(Date.now()<suppressReloadUntil && typeof handler==='function' && /location\.reload\s*\(/.test(String(handler))){
      return nativeSetTimeout(()=>{},0);
    }
    return nativeSetTimeout(handler,timeout,...args);
  };
})();
