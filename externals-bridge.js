(() => {
'use strict';
let dialog=null,frame=null,refreshTimer=null,channel=null;
const sameOrigin=location.origin;
function openRequest(id){if(!/^[0-9a-f-]{36}$/i.test(id))return;if(!dialog){dialog=document.createElement('dialog');dialog.id='pwExternalDialog';dialog.innerHTML='<div class="pw-external-top"><strong>PW Posa Esterni</strong><button type="button" aria-label="Chiudi riepilogo">×</button></div><iframe title="Riepilogo posa esterna" class="pw-external-frame"></iframe>';document.body.appendChild(dialog);frame=dialog.querySelector('iframe');dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{frame.src='about:blank';refreshCalendar();});}frame.src=`./esterni/?request=${encodeURIComponent(id)}&embed=1`;if(!dialog.open)dialog.showModal();}
function refreshCalendar(){const app=window.PWPosa;if(app?.state.view==='calendar'&&!dialog?.open){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>app.renderCalendar(),350);}}
window.addEventListener('message',e=>{if(e.origin!==sameOrigin||e.source!==frame?.contentWindow)return;if(e.data?.type==='pw-external-close')dialog.close();else if(e.data?.type==='pw-external-updated')refreshCalendar();});
window.addEventListener('pw:ready',async()=>{const app=window.PWPosa;if(channel)await app.sb.removeChannel(channel);channel=app.sb.channel('pw-external-main-calendar').on('postgres_changes',{event:'*',schema:'public',table:'external_requests'},refreshCalendar).subscribe();});
async function detachPush(){const app=window.PWPosa;if(!('serviceWorker'in navigator)||!app?.state.session)return;const reg=await navigator.serviceWorker.getRegistration('./esterni/');if(!reg||!reg.scope.endsWith('/esterni/'))return;const sub=await reg.pushManager?.getSubscription();if(!sub)return;const r=await app.sb.from('push_subscriptions').delete().eq('user_id',app.state.session.user.id).eq('endpoint',sub.endpoint);if(r.error&&!await sub.unsubscribe())throw r.error;}
window.PWExternalBridge={openRequest,detachPush};
window.PWPosa.sb.auth.onAuthStateChange((event,session)=>{const previous=window.PWPosa.state.session?.user.id;if(previous&&(event==='SIGNED_OUT'||event==='SIGNED_IN'&&session?.user.id!==previous))location.reload();});
})();
