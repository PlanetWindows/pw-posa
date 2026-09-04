(() => {
  const VIEW_KEY='pw-posa-current-view';
  const DETAIL_KEY='pw-posa-open-detail';
  const DIALOG_KEY='pw-posa-open-dialog';

  // Avoid the login screen flashing while Supabase restores an existing session.
  document.documentElement.classList.add('pw-session-checking');
  const style=document.createElement('style');
  style.textContent=`
    html.pw-session-checking #loginView{visibility:hidden!important}
    html.pw-session-checking body{background:#fff}
  `;
  document.head.appendChild(style);

  const finishSessionCheck=()=>document.documentElement.classList.remove('pw-session-checking');

  // The app itself restores Supabase auth. Keep login hidden briefly while that happens;
  // if there is no valid session, app.js will leave the login visible and we reveal it.
  window.addEventListener('load',()=>{
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const app=document.getElementById('appView');
      if(app && !app.classList.contains('hidden')){
        clearInterval(timer); finishSessionCheck();
      } else if(tries>=30){
        clearInterval(timer); finishSessionCheck();
      }
    },100);
  });

  function saveDetail(type,id){
    if(!id)return;
    try{sessionStorage.setItem(DETAIL_KEY,JSON.stringify({type,id}))}catch(_){}
  }
  function clearDetail(){try{sessionStorage.removeItem(DETAIL_KEY)}catch(_){}}

  document.addEventListener('click',e=>{
    const nav=e.target.closest('.nav-item[data-view]');
    if(nav?.dataset.view){try{localStorage.setItem(VIEW_KEY,nav.dataset.view)}catch(_){} clearDetail();}

    const pose=e.target.closest('[data-pose]');
    if(pose?.dataset.pose) saveDetail('pose',pose.dataset.pose);

    const assistance=e.target.closest('[data-assistance],[data-open-assistance],[data-open-assistance-folder]');
    const aid=assistance?.dataset.assistance||assistance?.dataset.openAssistance||assistance?.dataset.openAssistanceFolder;
    if(aid) saveDetail('assistance',aid);

    if(e.target.closest('#closeDetailDialog,#archiveCloseDossier,[data-close-assistance],.dialog .icon-btn')) clearDetail();
  },true);

  // Remember whether the user was composing/editing a job. We only reopen the same UI;
  // browser-native form values are intentionally not fabricated or submitted automatically.
  document.addEventListener('click',e=>{
    if(e.target.closest('#newPoseBtn')){try{sessionStorage.setItem(DIALOG_KEY,'new')}catch(_){}}
    if(e.target.closest('#closePoseDialog,#cancelPoseBtn')){try{sessionStorage.removeItem(DIALOG_KEY)}catch(_){}}
  },true);
  document.addEventListener('submit',e=>{
    if(e.target?.id==='poseForm'){try{sessionStorage.removeItem(DIALOG_KEY)}catch(_){}}
  },true);

  async function restoreOpenContext(){
    let detail=null, dialog='';
    try{detail=JSON.parse(sessionStorage.getItem(DETAIL_KEY)||'null');dialog=sessionStorage.getItem(DIALOG_KEY)||''}catch(_){}
    for(let i=0;i<50;i++){
      const app=document.getElementById('appView');
      if(app && !app.classList.contains('hidden')){
        if(dialog==='new') document.getElementById('newPoseBtn')?.click();
        if(detail?.id){
          const selectors=detail.type==='pose'
            ? [`[data-pose="${CSS.escape(detail.id)}"]`]
            : [`[data-assistance="${CSS.escape(detail.id)}"]`,`[data-open-assistance="${CSS.escape(detail.id)}"]`,`[data-open-assistance-folder="${CSS.escape(detail.id)}"]`];
          for(const s of selectors){const el=document.querySelector(s);if(el){el.click();break;}}
        }
        return;
      }
      await new Promise(r=>setTimeout(r,100));
    }
  }
  window.addEventListener('load',()=>setTimeout(restoreOpenContext,450));
})();