(()=>{
  const $=id=>document.getElementById(id);
  const DIALOG_KEY='pw-posa-open-dialog';
  let officeSavedLock=false;

  function closeDialog(id){
    const dlg=$(id);
    if(dlg?.open) dlg.close();
  }

  function clearProgrammazioneRestore(){
    try{sessionStorage.removeItem(DIALOG_KEY)}catch(_){}
  }

  // La Programmazione deve aprirsi solo con un'azione esplicita dell'utente.
  // smooth-session-state.js viene caricato prima di questo file: cancelliamo
  // subito l'eventuale flag rimasto da una sessione/refresh precedente.
  clearProgrammazioneRestore();

  function handleSuccessMessage(message){
    const text=String(message||'').trim();

    // UFFICIO: dopo un salvataggio riuscito chiudi la programmazione e
    // impedisci riaperture automatiche finché l'utente non la riapre volontariamente.
    if(text==='Posa salvata'||text==='Assistenza salvata'){
      officeSavedLock=true;
      closeDialog('poseDialog');
      return;
    }

    // POSATORE: il toast viene scritto solo dopo la conferma reale dell'invio.
    // Lascia il messaggio visibile per un istante, poi chiudi il dettaglio aperto.
    if(text==='Rapportino + DDT inviati in un’unica email.'){
      setTimeout(()=>{
        closeDialog('assistanceDetailDialog');
        closeDialog('detailDialog');
      },900);
    }
  }

  async function resetNewAssistanceDraft(attempt=0){
    const edit=$('assEditBtn');
    const dialog=$('poseDialog');
    const poseTab=document.querySelector('[data-program-type="pose"]');

    if(typeof edit?.onclick!=='function'||!dialog||!poseTab){
      if(attempt<10)setTimeout(()=>resetNewAssistanceDraft(attempt+1),50);
      return;
    }

    // assistance.js collega assEditBtn a openForm(S.active). Il suo handler del
    // pulsante Nuova posa/assistenza imposta prima S.active=null: richiamando quindi
    // questo handler sfruttiamo il reset nativo completo della nuova Assistenza
    // (foto, anteprime, allegati, date e stato temporaneo), senza toccare archivio/DB.
    const hadOwnShowModal=Object.prototype.hasOwnProperty.call(dialog,'showModal');
    const previousShowModal=dialog.showModal;
    dialog.showModal=()=>{};

    try{
      const result=edit.onclick();
      if(result&&typeof result.then==='function')await result;
      poseTab.click();
      document.querySelectorAll('[data-program-type]').forEach(button=>{button.disabled=false});
    }catch(error){
      console.warn('PW Posa · reset nuova assistenza',error);
    }finally{
      if(hadOwnShowModal)dialog.showModal=previousShowModal;
      else delete dialog.showModal;
    }
  }

  function removeDuplicateAssistanceDdtAction(){
    const root=$('assDetailContent');
    if(!root?.querySelector('[data-assistance-close-flow-v4]'))return;
    root.querySelectorAll('[data-ddt-sign]').forEach(button=>button.remove());
  }

  function setupAssistanceDdtGuard(attempt=0){
    const root=$('assDetailContent');
    if(!root){
      if(attempt<20)setTimeout(()=>setupAssistanceDdtGuard(attempt+1),100);
      return;
    }
    removeDuplicateAssistanceDdtAction();
    new MutationObserver(removeDuplicateAssistanceDdtAction).observe(root,{childList:true,subtree:true});
  }

  function init(){
    const toast=$('toast');
    const poseDialog=$('poseDialog');
    if(!toast||!poseDialog)return;

    new MutationObserver(()=>handleSuccessMessage(toast.textContent)).observe(toast,{childList:true,characterData:true,subtree:true});

    // Se qualche vecchio handler prova a riaprire da solo la modale dopo il salvataggio,
    // la richiudiamo. Il blocco si toglie solo con un'azione esplicita dell'utente.
    new MutationObserver(()=>{
      if(officeSavedLock&&poseDialog.open) poseDialog.close();
    }).observe(poseDialog,{attributes:true,attributeFilter:['open']});

    document.addEventListener('click',e=>{
      if(e.target.closest('#newPoseBtn,#editPoseBtn,#assEditBtn')) officeSavedLock=false;

      if(e.target.closest('#newPoseBtn')){
        // Non lasciare che smooth-session-state memorizzi la Programmazione per il refresh.
        clearProgrammazioneRestore();

        // L'handler di assistance.js è stato registrato prima e azzera S.active con
        // setTimeout(0). Aspettiamo un istante e poi eseguiamo il reset completo.
        setTimeout(()=>resetNewAssistanceDraft(),30);
      }
    },true);

    setupAssistanceDdtGuard();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
