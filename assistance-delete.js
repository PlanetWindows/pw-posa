(()=>{
  const c=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!c.SUPABASE_URL||!c.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY),$=id=>document.getElementById(id);
  let role=null,id=null,protocol='',busy=false;
  const canDelete=()=>role==='office_scheduler';
  const toast=m=>{const e=$('toast');if(!e)return;e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),4200)};

  async function init(){
    const{data:{session}}=await sb.auth.getSession();if(!session)return;
    const{data}=await sb.from('profiles').select('role').eq('id',session.user.id).maybeSingle();role=data?.role||null;
  }

  function ensureConfirmDialog(){
    let dlg=$('deleteAssistanceDialog');if(dlg)return dlg;
    dlg=document.createElement('dialog');dlg.id='deleteAssistanceDialog';dlg.className='delete-pose-dialog';
    dlg.innerHTML=`<div class="delete-pose-inner"><div class="eyebrow">CONFERMA ELIMINAZIONE</div><h3 id="deleteAssistanceTitle">Eliminare l'assistenza?</h3><p id="deleteAssistanceText">Questa operazione eliminerà definitivamente l'assistenza e i dati collegati.</p><div class="delete-pose-actions"><button type="button" class="btn ghost" id="deleteAssistanceCancel">Annulla</button><button type="button" class="btn delete-pose-danger" id="deleteAssistanceConfirm">Elimina assistenza</button></div></div>`;
    document.body.appendChild(dlg);$('deleteAssistanceCancel').onclick=()=>dlg.close();dlg.addEventListener('cancel',e=>{e.preventDefault();dlg.close()});$('deleteAssistanceConfirm').onclick=removeAssistance;return dlg;
  }

  async function removeAssistance(){
    if(!id||busy)return;if(!canDelete())return toast('Solo l’Ufficio che gestisce il calendario può eliminare assistenze');busy=true;
    const button=$('deleteAssistanceConfirm');if(button)button.disabled=true;
    try{
      const ph=await sb.from('assistance_photos').select('storage_path').eq('assistance_id',id);
      const a=await sb.from('assistances').select('final_report_path,signed_document_path,summary_document_path').eq('id',id).single();
      const ddt=await sb.from('ddt_documents').select('original_path,signed_path').eq('assistance_id',id);
      const paths=[...(ph.data||[]).map(x=>x.storage_path),...(ddt.data||[]).flatMap(x=>[x.original_path,x.signed_path]),a.data?.final_report_path,a.data?.signed_document_path,a.data?.summary_document_path].filter(Boolean);
      if(paths.length)await sb.storage.from('pw-assistance-private').remove([...new Set(paths)]);
      await sb.from('ddt_documents').delete().eq('assistance_id',id);await sb.from('assistance_push_events').delete().eq('assistance_id',id);await sb.from('assistance_photos').delete().eq('assistance_id',id);await sb.from('assistance_dates').delete().eq('assistance_id',id);
      const r=await sb.from('assistances').delete().eq('id',id).select('id');if(r.error)throw r.error;if(!r.data?.length)throw new Error('L’assistenza non è stata eliminata. Verifica la policy DELETE di Supabase.');
      $('deleteAssistanceDialog')?.close();$('assistanceDetailDialog')?.close();toast('Assistenza eliminata');id=null;protocol='';document.querySelector('.nav-item[data-view="calendar"]')?.click();
    }catch(e){toast(e?.message||String(e));}finally{busy=false;if(button)button.disabled=false;}
  }

  async function resolveActiveAssistance(){
    const detail=$('assistanceDetailDialog');if(!detail?.open)return false;
    const title=String($('assDetailTitle')?.textContent||'').trim();
    if(title.includes('·'))protocol=title.split('·')[0].trim();
    if(id)return true;
    if(!protocol)return false;
    const {data}=await sb.from('assistances').select('id,protocol_order').eq('protocol_order',protocol).order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(data?.id){id=data.id;protocol=data.protocol_order||protocol;return true;}return false;
  }

  async function ensureDeleteButton(){
    const detail=$('assistanceDetailDialog');if(!detail?.open)return;
    if(!role)await init();if(!canDelete()){detail.querySelector('#deleteAssistanceBtn')?.remove();return;}
    await resolveActiveAssistance();if(!id)return;
    const actions=detail.querySelector('.detail-head-actions');if(!actions)return;
    let btn=$('deleteAssistanceBtn');if(btn)return;
    btn=document.createElement('button');btn.type='button';btn.id='deleteAssistanceBtn';btn.className='btn ghost delete-pose-btn';btn.innerHTML='🗑 Elimina';
    const edit=$('assEditBtn');if(edit)edit.insertAdjacentElement('afterend',btn);else actions.prepend(btn);
    btn.onclick=()=>{const dlg=ensureConfirmDialog();$('deleteAssistanceTitle').textContent=`Eliminare l'assistenza ${protocol||''}?`;$('deleteAssistanceText').textContent='Confermando, l’assistenza verrà eliminata definitivamente insieme ai dati collegati. Questa operazione non può essere annullata.';if(!dlg.open)dlg.showModal();};
  }

  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-assistance]');if(a?.dataset.assistance){id=a.dataset.assistance;protocol='';}
    setTimeout(ensureDeleteButton,80);setTimeout(ensureDeleteButton,300);
  },true);
  new MutationObserver(()=>setTimeout(ensureDeleteButton,30)).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('load',async()=>{await init();setTimeout(ensureDeleteButton,400)});
})();