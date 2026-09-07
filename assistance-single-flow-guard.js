(()=>{
  let cleanupTimer=null;
  function cleanup(){
    const root=document.getElementById('assDetailContent');
    if(!root)return;
    root.querySelectorAll('[data-auto-assistance-report]').forEach(el=>el.remove());
    const oldButtons=[...root.querySelectorAll('button')].filter(b=>/conferma\s*(,|e)?\s*genera\s*pdf/i.test((b.textContent||'').trim()));
    oldButtons.forEach(btn=>{
      const section=btn.closest('.ass-detail-section');
      if(section&&!section.closest('[data-assistance-close-flow]'))section.remove();
    });
    const official=[...root.querySelectorAll('[data-assistance-close-flow]')];
    official.slice(1).forEach(el=>el.remove());
  }
  function scheduleCleanup(delay=60){clearTimeout(cleanupTimer);cleanupTimer=setTimeout(cleanup,delay)}
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-assistance]')||e.target.closest('#assClose')||e.target.closest('#assEditBtn'))scheduleCleanup(90);
  },true);
  window.addEventListener('pwposa:assistance-close-rendered',()=>scheduleCleanup(0));
  window.addEventListener('load',()=>scheduleCleanup(400));
})();