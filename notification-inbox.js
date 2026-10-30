(() => {
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let channel=null,recipient=null,timer=null,rows=[],limit=50,refreshing=false;
  function mount() {
    if($('pwInboxButton'))return;
    const actions=document.querySelector('.topbar-actions');if(!actions)return;
    const button=document.createElement('button');button.id='pwInboxButton';button.type='button';button.className='btn ghost pw-inbox-toggle';button.innerHTML='Notifiche <span id="pwInboxCount" class="pw-inbox-count hidden">0</span>';button.onclick=()=>{$('pwInbox').showModal();refresh();};actions.insertBefore(button,$('topLogoutBtn'));
    document.body.insertAdjacentHTML('beforeend',`<dialog id="pwInbox" class="dialog wide pw-inbox"><div class="dialog-head"><h3>Notifiche</h3><button type="button" class="icon-btn" id="pwInboxClose" aria-label="Chiudi">×</button></div><div class="pw-inbox-actions"><button type="button" class="btn ghost" id="pwInboxReadAll">Segna tutte come lette</button><button type="button" class="btn ghost" id="pwInboxRefresh">Aggiorna</button></div><div id="pwInboxList" class="pw-inbox-list" aria-live="polite"></div><div class="pw-inbox-actions"><button type="button" class="btn ghost" id="pwInboxMore">Mostra precedenti</button></div></dialog>`);
    $('pwInboxClose').onclick=()=>$('pwInbox').close();$('pwInboxRefresh').onclick=refresh;$('pwInboxMore').onclick=()=>{limit+=50;refresh();};
    $('pwInboxReadAll').onclick=async()=>{const app=window.PWPosa;if(!app?.state.session)return;const r=await app.sb.from('notifications').update({read_at:new Date().toISOString()}).eq('recipient_id',recipient).is('read_at',null);if(r.error)app.toast(r.error.message);else refresh();};
  }
  function render() {
    $('pwInboxList').innerHTML=rows.map(n=>`<button type="button" class="pw-notification${n.read_at?'':' unread'}" data-notification-id="${esc(n.id)}"><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${esc(new Date(n.created_at).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'}))}${n.event_action==='deleted'?' · Attività eliminata':''}</small></button>`).join('')||'<p class="empty">Nessuna notifica.</p>';
    $('pwInboxMore').classList.toggle('hidden',rows.length<limit);
    $('pwInboxList').querySelectorAll('[data-notification-id]').forEach(b=>b.onclick=()=>open(rows.find(n=>n.id===b.dataset.notificationId)));
  }
  async function refresh() {
    const app=window.PWPosa;if(!app?.state.session||refreshing||!recipient)return;refreshing=true;
    try {
      const [list,count]=await Promise.all([app.sb.from('notifications').select('*').eq('recipient_id',recipient).order('created_at',{ascending:false}).limit(limit),app.sb.from('notifications').select('id',{count:'exact',head:true}).eq('recipient_id',recipient).is('read_at',null)]);
      if(list.error)throw list.error;if(count.error)throw count.error;rows=list.data||[];
      const badge=$('pwInboxCount');badge.textContent=String(count.count||0);badge.classList.toggle('hidden',!count.count);$('pwInboxButton').setAttribute('aria-label',`Notifiche: ${count.count||0} non lette`);render();
    }catch(e){if($('pwInbox')?.open)app.toast('Notifiche: '+e.message);}finally{refreshing=false;}
  }
  async function open(n) {
    if(!n)return;const app=window.PWPosa;
    try {
      if(!n.read_at){const r=await app.sb.from('notifications').update({read_at:new Date().toISOString()}).eq('id',n.id).eq('recipient_id',recipient);if(r.error)throw r.error;}
      await refresh();if(n.event_action==='deleted')return;
      const kind=n.entity_type||(n.pose_id?'pose':null),id=n.entity_id||n.pose_id;if(!id)return;
      $('pwInbox').close();
      if(kind==='external_pose')window.PWExternalBridge.openRequest(id);
      else if(kind==='technical')await window.PWTechnician.openDetail(id);
      else if(kind==='pose')await app.openPoseDetail(id);
      else if(kind==='assistance') {const button=document.createElement('button');button.dataset.assistance=id;button.hidden=true;document.body.appendChild(button);button.click();button.remove();}
    }catch(e){app.toast(e.message);}
  }
  async function connect() {
    const app=window.PWPosa;if(!app?.state.session)return;mount();const uid=app.state.session.user.id;
    if(recipient!==uid){if(channel)await app.sb.removeChannel(channel);clearInterval(timer);recipient=uid;rows=[];limit=50;
      channel=app.sb.channel(`pw-notifications-${uid}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`recipient_id=eq.${uid}`},()=>{refresh();if(app.state.view==='calendar'&&!document.querySelector('dialog[open]'))app.renderCalendar();}).subscribe();
      timer=setInterval(()=>{if(document.visibilityState==='visible')refresh();},30000);
    }
    await refresh();
    const params=new URLSearchParams(location.search),notificationId=params.get('notification');
    if(notificationId){const r=await app.sb.from('notifications').select('*').eq('id',notificationId).eq('recipient_id',uid).maybeSingle();if(r.data)open(r.data);params.delete('notification');history.replaceState(null,'',`${location.pathname}${params.size?'?'+params:''}${location.hash}`);}
  }
  window.addEventListener('pw:ready',connect);window.addEventListener('pw:activity-saved',refresh);window.addEventListener('load',()=>{if(window.PWPosa?.state.session)connect();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
})();

