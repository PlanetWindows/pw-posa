(()=>{
  let pendingAssistanceSave=false;
  let suppressUntil=0;

  const isAssistanceMode=()=>{
    const selected=document.querySelector('[data-program-type="assistance"].active');
    const fields=document.getElementById('assistanceFields');
    return !!selected && !!fields && !fields.classList.contains('hidden');
  };

  function init(){
    const form=document.getElementById('poseForm');
    const dialog=document.getElementById('poseDialog');
    if(!form||!dialog)return;

    form.addEventListener('submit',()=>{
      if(isAssistanceMode()) pendingAssistanceSave=true;
    },true);

    dialog.addEventListener('close',()=>{
      if(!pendingAssistanceSave)return;
      pendingAssistanceSave=false;
      suppressUntil=Date.now()+1800;
    });

    const observer=new MutationObserver(()=>{
      if(Date.now()>=suppressUntil)return;
      if(dialog.open){
        try{dialog.close()}catch{}
      }
    });
    observer.observe(dialog,{attributes:true,attributeFilter:['open']});

    document.addEventListener('click',e=>{
      if(e.target.closest('#newPoseBtn')){
        pendingAssistanceSave=false;
        suppressUntil=0;
      }
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
