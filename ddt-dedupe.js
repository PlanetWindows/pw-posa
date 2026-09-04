(() => {
  function dedupeHost(host){
    if(!host) return;
    const cards=[...host.querySelectorAll('[data-ddt-card]')];
    if(cards.length<=1) return;
    // Keep the last rendered card because it reflects the freshest backend state.
    cards.slice(0,-1).forEach(card=>card.remove());
  }
  function dedupeAll(){
    dedupeHost(document.getElementById('detailContent'));
    dedupeHost(document.getElementById('assDetailContent'));
  }
  const obs=new MutationObserver(()=>queueMicrotask(dedupeAll));
  obs.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('click',()=>setTimeout(dedupeAll,350),true);
  window.addEventListener('load',dedupeAll);
})();