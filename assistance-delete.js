(()=>{
  const c=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!c.SUPABASE_URL||!c.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY),$=id=>document.getElementById(id);
  let role=null,id=null,busy=false;
  const canDelete=()=>role==='office_scheduler'||role==='office';
  const toast=m=>{const e=$('toast');if(!e)return alert(m);e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3200)};

  async function init(){
    const{data:{session}}=await sb.auth.getSession();if(!session)return;
    const{data}=await sb.from('profiles').select('role').eq('id',session.user.id).maybeSingle();role=data?.role||null;
  }

  async function removeAssistance(assistanceId,button){
    if(!assistanceId||busy)return;
    if(!confirm('Eliminare definitivamente questa assistenza e il relativo fascicolo?'))return;
    busy=true;
    const old=button?.textContent;
    if(button){button.disabled=true;button.textContent='Eliminazione…'}
    try{
      const ph=await sb.from('assistance_photos').select('storage_path').eq('assistance_id',assistanceId);
      const a=await sb.from('assistances').select('final_report_path,signed_document_path,summary_document_path').eq('id',assistanceId).single();
      const ddt=await sb.from('ddt_documents').select('original_path,signed_path').eq('assistance_id',assistanceId);
      const paths=[
        ...(ph.data||[]).map(x=>x.storage_path),
        ...(ddt.data||[]).flatMap(x=>[x.original_path,x.signed_path]),
        a.data?.final_report_path,a.data?.signed_document_path,a.data?.summary_document_path
      ].filter(Boolean);
      if(paths.length)await sb.storage.from('pw-assistance-private').remove([...new Set(paths)]);
      await sb.from('ddt_documents').delete().eq('assistance_id',assistanceId);
      await sb.from('assistance_push_events').delete().eq('assistance_id',assistanceId);
      await sb.from('assistance_photos').delete().eq('assistance_id',assistanceId);
      await sb.from('assistance_dates').delete().eq('assistance_id',assistanceId);
      const r=await sb.from('assistances').delete().eq('id',assistanceId);
      if(r.error)throw r.error;
      toast('Assistenza eliminata');
      $('assistanceDetailDialog')?.close();
      $('poseDialog')?.close();
      setTimeout(()=>location.reload(),500);
    }catch(e){
      console.error(e);toast(e.message||String(e));
      if(button){button.disabled=false;button.textContent=old||'Elimina assistenza'}
      busy=false;
    }
  }

  function syncActiveId(){
    const dlg=$('poseDialog');
    const assFields=$('assistanceFields');
    const isAss=dlg?.open&&assFields&&!assFields.classList.contains('hidden');
    if(!isAss)return;
    const title=$('poseDialogTitle')?.textContent||'';
    const editing=/Modifica assistenza/i.test(title);
    if(!editing)return;
    const protocol=$('assProtocol')?.value?.trim();
    if(!protocol)return;
    sb.from('assistances').select('id').eq('protocol_order',protocol).order('updated_at',{ascending:false}).limit(1).maybeSingle().then(({data})=>{
      if(data?.id){id=data.id;mountFormDelete()}
    });
  }

  function mountFormDelete(){
    if(!canDelete()||!id)return;
    const dlg=$('poseDialog'),assFields=$('assistanceFields');
    if(!dlg?.open||!assFields||assFields.classList.contains('hidden'))return;
    const title=$('poseDialogTitle')?.textContent||'';
    if(!/Modifica assistenza/i.test(title))return;
    const footer=dlg.querySelector('.modal-footer');if(!footer||footer.querySelector('[data-delete-assistance-form]'))return;
    const b=document.createElement('button');
    b.type='button';b.className='btn ghost';b.dataset.deleteAssistanceForm='1';b.textContent='Elimina assistenza';
    b.style.cssText='margin-right:auto;border-color:#b42318;color:#b42318';
    b.onclick=()=>removeAssistance(id,b);
    footer.insertBefore(b,footer.firstChild);
  }

  function enhanceDetail(){
    if(!canDelete())return;
    const d=$('assistanceDetailDialog'),root=$('assDetailContent');
    if(!d?.open||!root||!id||root.querySelector('[data-delete-assistance]'))return;
    const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.deleteAssistance='1';b.textContent='Elimina assistenza';
    b.style.cssText='margin-top:18px;border-color:#b42318;color:#b42318';
    b.onclick=()=>removeAssistance(id,b);root.appendChild(b);
  }

  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-assistance]');if(a?.dataset.assistance)id=a.dataset.assistance;
    if(e.target.closest('#newPoseBtn'))id=null;
    setTimeout(()=>{enhanceDetail();syncActiveId();mountFormDelete()},100);
    setTimeout(()=>{enhanceDetail();syncActiveId();mountFormDelete()},350);
  },true);

  new MutationObserver(()=>setTimeout(()=>{enhanceDetail();syncActiveId();mountFormDelete()},60)).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('load',async()=>{await init();setTimeout(()=>{enhanceDetail();syncActiveId();mountFormDelete()},400)});
})();