(() => {
  const cfg=window.PW_POSA_CONFIG||{};if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);let poseId=null,assId=null;
  const label=s=>({delivered:'Consegnata',accepted:'Accettata dal servizio email · consegna non ancora verificata',pending:'Da inviare',failed:'Invio fallito',delayed:'Consegna ritardata',sent:'Invio accettato · consegna non verificata'}[String(s||'').toLowerCase()]||String(s||'—'));
  async function enhance(){
    const card=document.querySelector('.ddt-card[data-ddt-card]');if(!card)return;
    const kind=assId?'assistance':'pose',id=assId||poseId;if(!id)return;
    const col=kind==='assistance'?'assistance_id':'pose_id';const r=await sb.from('ddt_documents').select('*').eq(col,id).maybeSingle();if(r.error||!r.data)return;const d=r.data;
    const st=card.querySelector('.ddt-email-status');if(st)st.innerHTML=st.innerHTML.replace(/Stato invio:\s*[^<]+$/i,`Stato invio: ${label(d.email_status)}`);
    if(!d.signed_path||String(d.email_status).toLowerCase()==='delivered'||card.querySelector('[data-ddt-retry-email]'))return;
    const actions=card.querySelector('.ddt-actions');if(!actions)return;const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.ddtRetryEmail='1';b.textContent='Riprova invio email';
    b.onclick=async()=>{const old=b.textContent;b.disabled=true;b.textContent='Verifica invio…';try{const res=await sb.functions.invoke('send-ddt-email',{body:{ddt_id:d.id}});if(res.error)throw res.error;const status=res.data?.status||'accepted';b.textContent=status==='delivered'?'Email consegnata':'Invio accettato';setTimeout(()=>location.reload(),900)}catch(e){console.error(e);b.disabled=false;b.textContent='Riprova invio email';alert('Invio email non riuscito: '+(e.message||e))}};actions.appendChild(b);
  }
  document.addEventListener('click',e=>{const p=e.target.closest('[data-pose]');if(p?.dataset.pose){poseId=p.dataset.pose;assId=null}const a=e.target.closest('[data-assistance]');if(a?.dataset.assistance){assId=a.dataset.assistance;poseId=null}setTimeout(()=>enhance().catch(console.warn),600)},true);
  new MutationObserver(()=>setTimeout(()=>enhance().catch(()=>{}),80)).observe(document.body,{subtree:true,childList:true});
})();