(()=>{
  function cleanup(){
    const root=document.getElementById('assDetailContent');
    if(!root)return;

    // Remove the legacy auto-report block if an old/cached script appends it.
    root.querySelectorAll('[data-auto-assistance-report]').forEach(el=>el.remove());

    // Remove any legacy assistance section identified by its old submit button text.
    root.querySelectorAll('.ass-detail-section, section, div').forEach(el=>{
      if(el.closest('[data-assistance-close-flow]'))return;
      const btn=[...el.querySelectorAll('button')].find(b=>/conferma\s*(,|e)?\s*genera\s*pdf/i.test((b.textContent||'').trim()));
      if(btn){
        const section=btn.closest('.ass-detail-section')||btn.closest('section')||el;
        if(section&&!section.closest('[data-assistance-close-flow]'))section.remove();
      }
    });

    // Safety: only one official close-flow panel may exist.
    const official=[...root.querySelectorAll('[data-assistance-close-flow]')];
    official.slice(1).forEach(el=>el.remove());
  }

  const start=()=>{
    const root=document.getElementById('assDetailContent');
    if(!root){setTimeout(start,120);return;}
    cleanup();
    new MutationObserver(()=>cleanup()).observe(root,{childList:true,subtree:true});
    document.addEventListener('click',()=>setTimeout(cleanup,0),true);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();