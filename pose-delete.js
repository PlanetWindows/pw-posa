(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const toast = msg => { const el=$('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),4200); };
  let currentPoseId = null;
  let currentJobNumber = '';
  let profile = null;

  async function getProfile(){
    if(profile) return profile;
    const {data:{session}} = await sb.auth.getSession();
    if(!session) return null;
    const {data,error} = await sb.from('profiles').select('*').eq('id',session.user.id).single();
    if(error) throw error;
    profile = data;
    return data;
  }

  function isScheduler(p){ return p?.role === 'office_scheduler'; }

  function ensureConfirmDialog(){
    let dlg = $('deletePoseDialog');
    if(dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'deletePoseDialog';
    dlg.className = 'delete-pose-dialog';
    dlg.innerHTML = `<div class="delete-pose-inner">
      <div class="eyebrow">CONFERMA ELIMINAZIONE</div>
      <h3 id="deletePoseTitle">Eliminare la posa?</h3>
      <p id="deletePoseText">La posa sarà rimossa dai calendari. Il fascicolo e i documenti resteranno nello storico.</p>
      <div class="delete-pose-actions">
        <button type="button" class="btn ghost" id="deletePoseCancel">Annulla</button>
        <button type="button" class="btn delete-pose-danger" id="deletePoseConfirm">Elimina posa</button>
      </div>
    </div>`;
    document.body.appendChild(dlg);
    $('deletePoseCancel').addEventListener('click',()=>dlg.close());
    dlg.addEventListener('cancel',e=>{e.preventDefault();dlg.close();});
    return dlg;
  }

  async function deletePose(){
    if(!currentPoseId) return toast('Posa non identificata');
    const p = await getProfile().catch(()=>null);
    if(!isScheduler(p)) return toast('Solo l’Ufficio che gestisce il calendario può eliminare pose');
    const btn=$('deletePoseConfirm'); if(btn) btn.disabled=true;
    try{
      const {data:{session}} = await sb.auth.getSession();
      if(!session) throw new Error('Sessione scaduta. Accedi nuovamente.');
      const {data:pose,error:poseError}=await sb.from('poses').select('id,external_request_id,deleted_at').eq('id',currentPoseId).single();
      if(poseError) throw poseError;
      if(pose.deleted_at) throw new Error('Questa posa è già stata rimossa dal calendario.');
      if(pose.external_request_id){
        const {data:request,error:requestError}=await sb.from('external_requests').select('version,cancelled_at').eq('id',pose.external_request_id).single();
        if(requestError) throw requestError;
        if(request.cancelled_at) throw new Error('Questa posa esterna è già stata annullata.');
        const {error}=await sb.rpc('pw_external_cancel_request',{p_id:pose.external_request_id,p_version:request.version,p_confirm:true,p_reason:''});
        if(error) throw error;
      } else {
        const {data,error}=await sb.from('poses').update({
          deleted_at:new Date().toISOString(),
          deleted_by:session.user.id,
          updated_by:session.user.id
        }).eq('id',currentPoseId).is('deleted_at',null).select('id');
        if(error) throw error;
        if(!data?.length) throw new Error('Non è stato possibile rimuovere la posa dalla programmazione.');
      }
      $('deletePoseDialog')?.close();
      $('detailDialog')?.close();
      toast('Posa rimossa dai calendari. Fascicolo conservato in Archivio.');
      currentPoseId=null; currentJobNumber='';
      const calendarNav=document.querySelector('.nav-item[data-view="calendar"]:not(.hidden)') || document.querySelector('.nav-item[data-view="calendar"]');
      calendarNav?.click();
    }catch(err){
      const msg=String(err?.message||err);
      toast(msg.toLowerCase().includes('row-level security') ? 'Eliminazione non autorizzata dalla policy RLS di Supabase.' : msg);
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  async function ensureDeleteButton(){
    const detail=$('detailDialog');
    if(!detail?.open || !currentPoseId) return;
    const p = await getProfile().catch(()=>null);
    const actions=detail.querySelector('.detail-head-actions');
    if(!actions) return;
    const title=String($('detailTitle')?.textContent||'');
    if(title.includes('·')) currentJobNumber=title.split('·')[0].trim();
    let btn=$('deletePoseBtn');
    if(!isScheduler(p)){
      btn?.remove();
      return;
    }
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.id='deletePoseBtn';
      btn.className='btn ghost delete-pose-btn';
      btn.innerHTML='🗑 Elimina';
      const edit=$('editPoseBtn');
      if(edit) edit.insertAdjacentElement('afterend',btn); else actions.prepend(btn);
      btn.addEventListener('click',()=>{
        const dlg=ensureConfirmDialog();
        $('deletePoseTitle').textContent=`Eliminare la posa ${currentJobNumber || ''}?`;
        $('deletePoseText').textContent='Confermando, la posa verrà rimossa dai calendari e le date saranno liberate. Il fascicolo, le foto e i rapportini resteranno nell’Archivio.';
        if(!dlg.open) dlg.showModal();
      });
    }
  }

  document.addEventListener('click',e=>{
    const opener=e.target.closest('[data-pose]');
    if(opener?.dataset.pose){
      currentPoseId=opener.dataset.pose;
      setTimeout(ensureDeleteButton,80);
    }
  },true);

  const detail=$('detailDialog');
  if(detail){
    new MutationObserver(()=>setTimeout(ensureDeleteButton,0)).observe(detail,{attributes:true,attributeFilter:['open']});
  }
  document.addEventListener('click',e=>{ if(e.target?.id==='deletePoseConfirm') deletePose(); });
})();