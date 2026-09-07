(()=>{
  const $=id=>document.getElementById(id);
  let officeSavedLock=false;

  function closeDialog(id){
    const dlg=$(id);
    if(dlg?.open) dlg.close();
  }

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
    },true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
