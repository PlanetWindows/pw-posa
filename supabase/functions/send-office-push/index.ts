import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";

// Every push is backed by a server-created, unguessable queue event. Callers
// cannot supply a recipient, title, message or subscription endpoint.
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const publicKey=Deno.env.get("VAPID_PUBLIC_KEY"),privateKey=Deno.env.get("VAPID_PRIVATE_KEY");
if(publicKey&&privateKey)webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")||"mailto:info@planetwindows.it",publicKey,privateKey);
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply({error:"Metodo non consentito"},405);
 let eventId:string|undefined;
 try {
  if(!publicKey||!privateKey)return reply({error:"Notifiche non configurate"},503);
  const body=await req.json();eventId=String(body.event_id||"");
  if(!/^[0-9a-f-]{36}$/i.test(eventId))return reply({error:"Evento non valido"},400);
  const prior=await admin.from("office_push_events").select("id,notification_id,status,processed_at").eq("id",eventId).maybeSingle();
  if(prior.error||!prior.data)return reply({error:"Evento non valido"},404);
  if(prior.data.processed_at||prior.data.status==="processing")return reply({success:true,duplicate:true});
  const claimed=await admin.from("office_push_events").update({status:"processing"}).eq("id",eventId).is("processed_at",null).in("status",["pending","failed"]).select("id,notification_id").maybeSingle();
  if(claimed.error)throw claimed.error;if(!claimed.data)return reply({success:true,duplicate:true});
  const result=await admin.from("notifications").select("*").eq("id",claimed.data.notification_id).single();
  if(result.error)throw result.error;const notification=result.data;
  const profile=await admin.from("profiles").select("role,active").eq("id",notification.recipient_id).single();
  if(profile.error||!profile.data?.active||!["office_scheduler","office_viewer","installer","technician"].includes(profile.data.role)){
   await admin.from("office_push_events").update({processed_at:new Date().toISOString(),status:"ignored"}).eq("id",eventId);return reply({success:true,ignored:true});
  }
  const subscriptions=await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id",notification.recipient_id);if(subscriptions.error)throw subscriptions.error;
  if(!subscriptions.data?.length){await admin.from("office_push_events").update({processed_at:new Date().toISOString(),status:"no_device"}).eq("id",eventId);return reply({success:true,sent:0});}
  const payload=JSON.stringify({title:notification.title,body:notification.message,url:`./?notification=${encodeURIComponent(notification.id)}`,tag:`pw-notification-${notification.id}`});
  let sent=0,failed=0;
  await Promise.all(subscriptions.data.map(async(s:{id:string;endpoint:string;p256dh:string;auth:string})=>{
   try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload);sent++;}
   catch(error:unknown){failed++;const code=(error as {statusCode?:number}).statusCode;if(code===404||code===410)await admin.from("push_subscriptions").delete().eq("id",s.id);}
  }));
  await admin.from("office_push_events").update({processed_at:new Date().toISOString(),status:sent?"sent":"failed",sent_count:sent,failed_count:failed}).eq("id",eventId);
  return reply({success:sent>0,sent,failed});
 }catch(error:unknown){
  if(eventId)await admin.from("office_push_events").update({status:"failed"}).eq("id",eventId).is("processed_at",null);
  console.error("PW Posa: invio notifica non riuscito",error instanceof Error?error.message:"errore");return reply({error:"Invio notifica non riuscito"},500);
 }
});
