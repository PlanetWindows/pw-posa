(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  let activePoseId=null;
  document.addEventListener('click',e=>{const p=e.target.closest('[data-pose]');if(p?.dataset.pose)activePoseId=p.dataset.pose;},true);

  async function enhance(){
    const form=$('dailyReportForm');
    if(!form||form.dataset.workflowV2==='1')return;
    form.dataset.workflowV2='1';
    const poseId=activePoseId;
    let pose=null;
    if(poseId){const r=await sb.from('poses').select('id,office_notes').eq('id',poseId).maybeSingle();pose=r.data||null;}

    const completed=$('reportCompleted');
    if(completed){
      const label=completed.closest('label');if(label)label.childNodes[0].textContent='Descrizione ';
      completed.value=pose?.office_notes||completed.value||'';
      completed.readOnly=true;
      completed.required=false;
      completed.placeholder='Descrizione inserita dall’Ufficio';
      completed.style.background='#f5f3ef';
    }

    const grid=form.querySelector('.report-grid');if(!grid)return;
    const remaining=$('reportRemaining')?.closest('label');
    const reason=$('reportReason')?.closest('label');
    const issues=$('reportIssues')?.closest('label');
    const materials=$('reportMaterials')?.closest('label');
    const notes=$('reportNotes')?.closest('label');

    // New simplified wording requested for pose reports.
    if(issues)issues.childNodes[0].textContent='Non conformità ';
    if(materials)materials.childNodes[0].textContent='Materiali mancanti ';
    if(notes)notes.childNodes[0].textContent='Note finali ';

    // Old fields no longer belong to the visible workflow.
    if(remaining)remaining.style.display='none';
    if(reason)reason.style.display='none';

    const choice=document.createElement('div');
    choice.className='span2 report-finished-choice';
    choice.innerHTML='<strong>Il lavoro è stato finito? *</strong><div style="display:flex;gap:22px;margin-top:9px"><label style="display:flex;align-items:center;gap:7px;font-weight:600"><input type="radio" name="pwFinished" value="yes" required style="width:auto"> Sì</label><label style="display:flex;align-items:center;gap:7px;font-weight:600"><input type="radio" name="pwFinished" value="no" required style="width:auto"> No</label></div>';
    if(issues)grid.insertBefore(choice,issues);else if(notes)grid.insertBefore(choice,notes);else grid.appendChild(choice);

    const negativeOnly=[issues,materials].filter(Boolean);
    const setMode=v=>{
      negativeOnly.forEach(x=>x.style.display=v==='no'?'':'none');
      // Note finali ALWAYS remain visible, for both Sì and No.
      if(notes)notes.style.display='';
      if(v==='yes'){
        if($('reportIssues'))$('reportIssues').value='';
        if($('reportMaterials'))$('reportMaterials').value='';
      }
      // Legacy fields are no longer used in this workflow.
      if($('reportRemaining'))$('reportRemaining').value='';
      if($('reportReason'))$('reportReason').value='';
    };

    const existingNo=!!(($('reportIssues')?.value||'').trim()||($('reportMaterials')?.value||'').trim());
    if(form.dataset.reportId){
      const r=choice.querySelector(`input[value="${existingNo?'no':'yes'}"]`);
      if(r){r.checked=true;setMode(r.value)}
    }else setMode('');
    choice.querySelectorAll('input').forEach(r=>r.addEventListener('change',()=>setMode(r.value)));
  }

  new MutationObserver(()=>enhance().catch(console.warn)).observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',()=>setTimeout(()=>enhance().catch(console.warn),80),true);
})();