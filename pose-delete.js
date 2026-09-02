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
      <p id="deletePoseText">Questa operazione eliminerà la posa dal calendario.</p>
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

  async function countLinked(table, poseId){
    const {count,error} = await sb.from(table).select('*',{count:'exact',head:true}).eq('pose_id',poseId);
    if(error) throw new Error(`Controllo ${table}: ${error.message}`);
    return Number(count||0);
  }

  async function preflight(poseId){
    const checks = [
      ['daily_report_poses','rapportini'],
      ['pose_photos','foto'],
      ['pose_checklists','checklist'],
      ['issues','segnalazioni']
    ];
    const found=[];
    for(const [table,label] of checks){
      const count = await countLinked(table,poseId);
      if(count>0) found.push({label,count});
    }
    return found;
  }

  async function deletePose(){
    if(!currentPoseId) return toast('Posa non identificata');
    const p = await getProfile().catch(()=>null);
    if(!isScheduler(p)) return toast('Solo l’Ufficio che gestisce il calendario può eliminare pose');
    const btn=$('deletePoseConfirm'); if(btn) btn.disabled=true;
    try{
      const linked = await preflight(currentPoseId);
      if(linked.length){
        const desc = linked.map(x=>`${x.count} ${x.label}`).join(', ');
        throw new Error(`Eliminazione bloccata: questa posa contiene ${desc}. Il fascicolo storico non viene cancellato automaticamente.`);
      }
      const {data,error} = await sb.from('poses').delete().eq('id',currentPoseId).select('id');
      if(error) throw error;
      if(!data?.length) throw new Error('La posa non è stata eliminata. Verifica che la policy DELETE di Supabase consenta l’operazione all’Ufficio.');
      $('deletePoseDialog')?.close();
      $('detailDialog')?.close();
      toast('Posa eliminata');
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
        $('deletePoseText').textContent='Questa operazione eliminerà la posa dal calendario. Se esistono rapportini, PDF, foto, checklist o segnalazioni, l’eliminazione verrà bloccata per proteggere lo storico.';
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