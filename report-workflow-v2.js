(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));

  async function enhance(){
    const form=$('dailyReportForm');
    if(!form||form.dataset.workflowV2==='1')return;
    form.dataset.workflowV2='1';
    const dialog=$('detailDialog');
    const poseId=dialog?.dataset?.poseId||document.querySelector('[data-current-pose]')?.dataset.currentPose||null;
    let pose=null;
    if(poseId){const r=await sb.from('poses').select('id,office_notes').eq('id',poseId).maybeSingle();pose=r.data||null;}
    // Fallback: reports.js keeps the current pose in the opened detail; infer it from active opener if needed.
    const completed=$('reportCompleted');
    if(completed){
      const label=completed.closest('label');
      if(label){label.childNodes[0].textContent='Descrizione ';}
      completed.value=pose?.office_notes||completed.value||'';
      completed.readOnly=true;
      completed.required=false;
      completed.placeholder='Descrizione inserita dall’Ufficio';
      completed.style.background='#f5f3ef';
    }
    const grid=form.querySelector('.report-grid');
    if(!grid)return;
    const remaining=$('reportRemaining')?.closest('label');
    const reason=$('reportReason')?.closest('label');
    const issues=$('reportIssues')?.closest('label');
    const materials=$('reportMaterials')?.closest('label');
    const notes=$('reportNotes')?.closest('label');
    if(issues)issues.childNodes[0].textContent='Non conformità ';
    if(materials)materials.remove();
    if(notes)notes.childNodes[0].textContent='Note finali ';

    const choice=document.createElement('div');
    choice.className='span2 report-finished-choice';
    choice.innerHTML='<strong>Il lavoro è stato finito? *</strong><div style="display:flex;gap:22px;margin-top:9px"><label style="display:flex;align-items:center;gap:7px;font-weight:600"><input type="radio" name="pwFinished" value="yes" required style="width:auto"> Sì</label><label style="display:flex;align-items:center;gap:7px;font-weight:600"><input type="radio" name="pwFinished" value="no" required style="width:auto"> No</label></div>';
    if(remaining)grid.insertBefore(choice,remaining);else grid.appendChild(choice);

    const conditional=[remaining,reason,issues].filter(Boolean);
    const setMode=v=>{
      conditional.forEach(x=>x.style.display=v==='no'?'':'none');
      if(v==='yes'){
        if($('reportRemaining'))$('reportRemaining').value='';
        if($('reportReason'))$('reportReason').value='';
        if($('reportIssues'))$('reportIssues').value='';
      }
    };
    // Existing reports: if there is unfinished work/non-conformity, preselect No; otherwise leave the choice explicit for new reports.
    const existingNo=!!(($('reportRemaining')?.value||'').trim()||($('reportReason')?.value||'').trim()||($('reportIssues')?.value||'').trim());
    if(form.dataset.reportId){const r=choice.querySelector(`input[value="${existingNo?'no':'yes'}"]`);if(r){r.checked=true;setMode(r.value)}}else setMode('');
    choice.querySelectorAll('input').forEach(r=>r.addEventListener('change',()=>setMode(r.value)));

    // Keep removed legacy field empty when reports.js serializes the form.
    const hidden=document.createElement('textarea');hidden.id='reportMaterials';hidden.hidden=true;hidden.value='';form.appendChild(hidden);
  }

  new MutationObserver(()=>enhance().catch(console.warn)).observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',()=>setTimeout(()=>enhance().catch(console.warn),80),true);
})();