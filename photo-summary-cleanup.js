(() => {
  function clean(){
    const root=document.getElementById('photoSection');
    if(!root) return;
    const text=(root.textContent||'').toLowerCase();
    if(text.includes('permission denied for table pose_photos')||text.includes('permission denied')){
      root.innerHTML='';
      root.classList.add('hidden');
    }
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-pose]')) setTimeout(clean,650);
  },true);
  const detail=document.getElementById('detailDialog');
  if(detail) new MutationObserver(()=>setTimeout(clean,650)).observe(detail,{subtree:true,childList:true,attributes:true});
})();