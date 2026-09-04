(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);

  async function refreshAssistanceTeams(){
    const select=$('assTeam');
    if(!select)return;
    const current=select.value;
    const {data,error}=await sb.from('teams').select('id,name').eq('active',true).order('name');
    if(error){console.warn('PW Assistenza: squadre non aggiornate',error);return;}
    const teams=data||[];
    select.innerHTML=teams.map(t=>`<option value="${String(t.id).replace(/"/g,'&quot;')}">${String(t.name||'Squadra').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]))}</option>`).join('');
    if(current&&teams.some(t=>t.id===current))select.value=current;
    else if(teams.length)select.value=teams[0].id;
  }

  document.addEventListener('click',e=>{
    if(e.target.closest('[data-program-type="assistance"]'))setTimeout(refreshAssistanceTeams,0);
    if(e.target.closest('#assEditBtn'))setTimeout(refreshAssistanceTeams,0);
  },true);

  window.addEventListener('load',()=>setTimeout(refreshAssistanceTeams,300));
})();