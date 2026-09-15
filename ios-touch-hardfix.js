(()=>{
  // Disabled: the previous hard-fix replaced native <dialog> methods and could
  // leave the iPhone UI unresponsive. Keep this file as a harmless cleanup so
  // older cached service workers that still inject it cannot freeze the app.
  document.documentElement.classList.remove('ios-assistance-open');
  if(document.body)document.body.classList.remove('ios-assistance-open');
  const dlg=document.getElementById('assistanceDetailDialog');
  if(dlg)dlg.classList.remove('ios-assistance-fixed');
})();
