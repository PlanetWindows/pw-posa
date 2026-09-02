(() => {
  const KEY='pw-posa-current-view';

  document.addEventListener('click',e=>{
    const nav=e.target.closest('.nav-item[data-view]');
    if(nav?.dataset.view){
      try{localStorage.setItem(KEY,nav.dataset.view)}catch(_){}
    }
  },true);

  async function restore(){
    let view='';
    try{view=localStorage.getItem(KEY)||''}catch(_){}
    if(!view||view==='calendar') return;
    for(let i=0;i<40;i++){
      const app=document.getElementById('appView');
      if(app && !app.classList.contains('hidden')){
        const btn=document.querySelector(`.nav-item[data-view="${CSS.escape(view)}"]:not(.hidden)`);
        if(btn){ btn.click(); return; }
      }
      await new Promise(r=>setTimeout(r,100));
    }
  }

  window.addEventListener('load',()=>setTimeout(restore,180));
})();