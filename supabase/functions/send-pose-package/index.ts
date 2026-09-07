import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!,ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!,SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,RESEND_API_KEY=Deno.env.get("RESEND_API_KEY")||"",FROM_EMAIL=Deno.env.get("ASSISTANCE_FROM_EMAIL")||"posapw@planetwindows.it";
const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:cors}),safe=(v:unknown)=>String(v??"").trim();
function b64(bytes:Uint8Array){let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(out)}
async function read(bucket:string,path:string){const {data,error}=await admin.storage.from(bucket).download(path);if(error||!data)throw error||new Error("Documento non disponibile");return new Uint8Array(await data.arrayBuffer())}
Deno.serve(async req=>{
  let ddtId="";
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";if(!auth)return json({error:"Sessione mancante"},401);
    const uc=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user}}=await uc.auth.getUser();if(!user)return json({error:"Utente non autenticato"},401);
    const {data:p}=await admin.from("profiles").select("role,active").eq("id",user.id).maybeSingle();if(p?.role!=="installer"||p?.active===false)return json({error:"Solo il posatore può completare l'invio"},403);
    const b=await req.json(),poseId=safe(b.pose_id),reportId=safe(b.report_id);if(!poseId||!reportId)return json({error:"pose_id e report_id obbligatori"},400);
    const [{data:pose,error:pe},{data:report,error:re},{data:link,error:le},{data:ddts,error:de}]=await Promise.all([
      uc.from("poses").select("*").eq("id",poseId).single(),
      uc.from("daily_reports").select("*").eq("id",reportId).single(),
      uc.from("daily_report_poses").select("report_id").eq("report_id",reportId).eq("pose_id",poseId).maybeSingle(),
      admin.from("ddt_documents").select("*").eq("pose_id",poseId).order("created_at",{ascending:false}).limit(1)
    ]);
    if(pe||!pose||re||!report||le||!link)return json({error:"Posa o rapportino non accessibili"},403);
    const ddt=ddts?.[0]||null;if(de)throw de;if(!ddt)return json({error:"DDT non presente"},409);ddtId=ddt.id;
    if(ddt.email_status==="pose_package_sent")return json({ok:true,already_sent:true,attachments:2});
    if(!report.pdf_storage_path)return json({error:"Rapportino firmato non disponibile"},409);
    if(!ddt.signed_path)return json({error:"DDT firmato non disponibile"},409);
    if(!safe(pose.client_email))return json({error:"Email cliente mancante"},409);
    if(!RESEND_API_KEY)throw new Error("RESEND_API_KEY non configurata");
    const [reportBytes,ddtBytes]=await Promise.all([read("pw-posa-documents",report.pdf_storage_path),read("pw-ddt-private",ddt.signed_path)]);
    const attachments=[{filename:report.pdf_file_name||"Rapportino_Posa_firmato.pdf",content:b64(reportBytes)},{filename:ddt.signed_name||"DDT_Firmato.pdf",content:b64(ddtBytes)}];
    const rr=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":`pose-package-${poseId}-${reportId}`},body:JSON.stringify({from:FROM_EMAIL,to:[pose.client_email],subject:`Planet Windows · Posa ${pose.job_number}`,html:`<p>Gentile ${pose.client_name},</p><p>in allegato trova la documentazione firmata relativa alla posa <strong>${pose.job_number}</strong>: rapportino di posa e DDT firmato.</p><p>Grazie,<br>Planet Windows</p>`,attachments})});
    if(!rr.ok)throw new Error(`Servizio email: ${rr.status} ${await rr.text()}`);
    const resendPayload=await rr.json().catch(()=>null);
    const {error:du}=await admin.from("ddt_documents").update({email_status:"pose_package_sent",email_last_error:null}).eq("id",ddt.id);if(du)throw du;
    return json({ok:true,already_sent:false,attachments:2,email_id:resendPayload?.id||null});
  }catch(e){const message=e instanceof Error?e.message:String(e);console.error(e);if(ddtId)await admin.from("ddt_documents").update({email_last_error:message}).eq("id",ddtId);return json({ok:false,error:message},500)}
});