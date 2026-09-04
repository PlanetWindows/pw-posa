(() => {
  const cfg=window.PW_POSA_CONFIG||{};if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY),$=id=>document.getElementById(id);
  const toast=m=>{const e=$('toast');if(!e)return alert(m);e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3600)};
  const isAssistance=()=>!$('assistanceFields')?.classList.contains('hidden');
  const dates=()=>{const start=$('scheduledDate')?.value,extra=[...document.querySelectorAll('#poseDatesList [data-remove-pose-date]')].map(x=>x.dataset.removePoseDate);return[...new Set([start,...extra].filter(Boolean))].sort()};
  async function syncPoseDates(poseId,list){const d=await sb.from('pose_dates').delete().eq('pose_id',poseId);if(d.error)throw d.error;if(list.length){const r=await sb.from('pose_dates').insert(list.map(pose_date=>({pose_id:poseId,pose_date})));if(r.error)throw r.error}}
  document.addEventListener('submit',async e=>{
    if(e.target?.id!=='poseForm'||isAssistance())return;
    e.preventDefault();e.stopImmediatePropagation();
    const list=dates();if(!list.length)return toast('Seleziona almeno una giornata di posa');
    const existingId=$('poseId')?.value||'';
    try{await window.PW_DDT?.validatePoseBeforeSave(existingId||null)}catch(err){return toast(err.message||String(err))}
    const {data:{session}}=await sb.auth.getSession();if(!session)return toast('Sessione scaduta');
    const payload={job_number:$('jobNumber').value.trim(),client_name:$('clientName').value.trim(),client_phone:$('clientPhone').value.trim()||null,client_email:window.PW_DDT?.getPoseEmail?.()||null,address:$('address').value.trim(),city:$('city').value.trim()||null,postal_code:$('postalCode').value.trim()||null,scheduled_date:list[0],scheduled_end_date:list.at(-1),start_time:$('startTime').value,end_time:$('endTime').value||null,team_id:$('teamId').value,financing:$('financing').value==='true',office_notes:$('officeNotes').value.trim()||null,updated_by:session.user.id};
    let poseId=existingId;let created=false;
    try{
      if(existingId){const r=await sb.from('poses').update(payload).eq('id',existingId);if(r.error)throw r.error}
      else{payload.created_by=session.user.id;const r=await sb.from('poses').insert(payload).select('id').single();if(r.error)throw r.error;poseId=r.data.id;created=true}
      await syncPoseDates(poseId,list);
      await window.PW_DDT.saveForPose(poseId);
      $('poseDialog').close();toast(existingId?'Posa aggiornata':'Posa salvata');setTimeout(()=>location.reload(),600);
    }catch(err){console.error(err);if(created&&poseId)await sb.from('poses').delete().eq('id',poseId);toast('Salvataggio posa: '+(err.message||String(err)))}
  },true);
})();