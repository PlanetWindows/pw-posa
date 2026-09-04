import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY=Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY=Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT=Deno.env.get("VAPID_SUBJECT")||"mailto:info@planetwindows.it";
const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const date=v=>{if(!v)return"";const[y,m,d]=String(v).slice(0,10).split("-");return`${d}/${m}/${y}`};

if(VAPID_PUBLIC_KEY&&VAPID_PRIVATE_KEY)webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY)return json({error:"VAPID secrets missing"},500);
    const body=await req.json(),eventId=String(body.event_id||"");if(!eventId)return json({error:"event_id obbligatorio"},400);
    const {data:event,error:eventError}=await admin.from("assistance_push_events").select("*").eq("id",eventId).single();if(eventError||!event)return json({error:"Evento non disponibile"},404);
    if(event.processed_at)return json({ok:true,skipped:"already processed",sent:event.sent_count||0,failed:event.failed_count||0});
    const {data:a,error:aError}=await admin.from("assistances").select("*").eq("id",event.assistance_id).single();if(aError||!a)throw aError||new Error("Assistenza non disponibile");
    let users:string[]=[];
    if(event.audience==="office"){
      const {data}=await admin.from("profiles").select("id").in("role",["office_scheduler","office_viewer"]).eq("active",true);users=(data||[]).map((x:{id:string})=>x.id);
    }else{
      const {data:members}=await admin.from("team_members").select("user_id,profiles!inner(role,active)").eq("team_id",a.team_id);users=(members||[]).filter((x:any)=>x.profiles?.role==="installer"&&x.profiles?.active).map((x:any)=>x.user_id);
    }
    users=[...new Set(users)].filter(Boolean);if(!users.length){await admin.from("assistance_push_events").update({processed_at:new Date().toISOString(),status:"done",sent_count:0,failed_count:0}).eq("id",eventId);return json({ok:true,sent:0,failed:0,skipped:"no recipients"})}
    const {data:subs,error:subsError}=await admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id",users);if(subsError)throw subsError;
    const title=event.event_type==="assigned"?"PW Posa · Nuova assistenza":event.event_type==="completed"?"PW Posa · Assistenza completata":"PW Posa · Assistenza aggiornata";
    const when=[date(a.scheduled_date),a.start_time?String(a.start_time).slice(0,5):""].filter(Boolean).join(" · ");
    const bodyText=`${a.protocol_order||"Assistenza"}${a.client_name?` · ${a.client_name}`:""}${when?`\n${when}`:""}`;
    const payload=JSON.stringify({title,body:bodyText,url:`./?assistance=${encodeURIComponent(a.id)}`,tag:`pw-assistance-${a.id}-${event.event_type}`});
    let sent=0,failed=0;const stale:string[]=[];
    await Promise.all((subs||[]).map(async(s:any)=>{try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload);sent++}catch(err:any){failed++;const code=Number(err?.statusCode||err?.status);if(code===404||code===410)stale.push(s.id);console.error("Assistance push",err)}}));
    if(stale.length)await admin.from("push_subscriptions").delete().in("id",stale);
    await admin.from("assistance_push_events").update({processed_at:new Date().toISOString(),status:failed&&sent===0?"failed":"done",sent_count:sent,failed_count:failed}).eq("id",eventId);
    return json({ok:true,sent,failed});
  }catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});