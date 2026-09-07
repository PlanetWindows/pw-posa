(()=>{
  function isAssistanceMode(){
    const fields=document.getElementById('assistanceFields');
    return !!fields && !fields.classList.contains('hidden');
  }

  function init(){
    const form=document.getElementById('poseForm');
    const dialog=document.getElementById('poseDialog');
    if(!form||!dialog)return;

    // IMPORTANT: assistance.js owns the submit when the Assistance tab is active.
    // Stop the event before app.js/savePose can process the same submit as a normal pose.
    form.addEventListener('submit',e=>{
      if(!isAssistanceMode())return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },true);

    // Safety net: after a successful assistance close, do not allow a stale async
    // normal-pose handler to reopen the shared dialog.
    let justClosedAt=0;
    dialog.addEventListener('close',()=>{
      if(isAssistanceMode()) justClosedAt=Date.now();
    });
    const nativeShow=dialog.showModal.bind(dialog);
    dialog.showModal=function(){
      if(Date.now()-justClosedAt<2500 && isAssistanceMode()) return;
      return nativeShow();
    };

    document.addEventListener('click',e=>{
      if(e.target.closest('#newPoseBtn')) justClosedAt=0;
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
