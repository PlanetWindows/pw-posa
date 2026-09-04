import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY=Deno.env.get("RESEND_API_KEY")||"";
const FROM_EMAIL=Deno.env.get("ASSISTANCE_FROM_EMAIL")||"";
const BUCKET="pw-assistance-private";
const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:cors});
function b64(bytes:Uint8Array){let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(out)}
async function sendEmail(to:string,name:string,bytes:Uint8Array,protocol:string,client:string){
  if(!RESEND_API_KEY)throw new Error("RESEND_API_KEY non configurata");
  if(!FROM_EMAIL)throw new Error("ASSISTANCE_FROM_EMAIL non configurata");
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:FROM_EMAIL,to:[to],subject:`Planet Windows · Modulo assistenza firmato ${protocol}`,html:`<p>Gentile ${client},</p><p>in allegato trova il modulo firmato relativo all'assistenza <strong>${protocol}</strong>.</p><p>Planet Windows</p>`,attachments:[{filename:name,content:b64(bytes)}]})});
  if(!r.ok)throw new Error(`Servizio email: ${r.status} ${await r.text()}`);
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";if(!auth)return json({error:"Sessione mancante"},401);
    const userClient=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();if(userError||!user)return json({error:"Utente non autenticato"},401);
    const body=await req.json(),id=String(body.assistance_id||"");if(!id)return json({error:"assistance_id obbligatorio"},400);
    const {data:profile}=await admin.from("profiles").select("role").eq("id",user.id).maybeSingle();
    const {data:a,error:aError}=await userClient.from("assistances").select("*").eq("id",id).single();if(aError||!a)return json({error:"Assistenza non accessibile"},403);
    if(!["installer","office_scheduler"].includes(profile?.role||""))return json({error:"Ruolo non autorizzato"},403);
    let signedBytes:Uint8Array,signedPath:string|null=a.signed_document_path,signedName:string|null=a.signed_document_name;
    if(body.retry_only===true){
      if(!signedPath)return json({error:"Modulo firmato non disponibile"},400);
      const {data:file,error}=await admin.storage.from(BUCKET).download(signedPath);if(error||!file)throw error||new Error("Documento firmato non leggibile");signedBytes=new Uint8Array(await file.arrayBuffer());
    }else{
      const signer=String(body.signer_name||"").trim(),dataUrl=String(body.signature_data_url||"");if(!signer)return json({error:"Nome firmatario obbligatorio"},400);if(!dataUrl.startsWith("data:image/png;base64,"))return json({error:"Firma obbligatoria o formato non valido"},400);if(!a.summary_document_path)return json({error:"Modulo originale non disponibile"},400);
      const {data:original,error}=await admin.storage.from(BUCKET).download(a.summary_document_path);if(error||!original)throw error||new Error("Modulo originale non leggibile");
      const pdf=await PDFDocument.load(await original.arrayBuffer()),png=Uint8Array.from(atob(dataUrl.split(",")[1]),c=>c.charCodeAt(0)),sig=await pdf.embedPng(png),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.getPages()[pdf.getPageCount()-1],{width}=page.getSize(),w=Math.min(180,width*.34),h=w*sig.height/sig.width,x=Math.max(28,width-w-34),y=44;
      page.drawRectangle({x:x-8,y:y-20,width:w+16,height:h+42,borderWidth:.8,borderColor:rgb(.78,.64,.33),color:rgb(1,1,1),opacity:.92});page.drawText("Firma cliente",{x,y:y+h+8,size:9,font});page.drawImage(sig,{x,y,width:w,height:h});const at=new Date();page.drawText(`${signer} · ${at.toLocaleString("it-IT",{timeZone:"Europe/Rome"})}`,{x,y:y-12,size:8,font});
      signedBytes=await pdf.save();signedName=`Modulo_Assistenza_${String(a.protocol_order).replace(/[^a-zA-Z0-9_-]+/g,"_")}_firmato.pdf`;signedPath=`${id}/signed/${Date.now()}-${signedName}`;
      const up=await admin.storage.from(BUCKET).upload(signedPath,signedBytes,{contentType:"application/pdf",upsert:false});if(up.error)throw up.error;
      const u=await admin.from("assistances").update({signed_document_path:signedPath,signed_document_name:signedName,signer_name:signer,signed_at:at.toISOString(),email_status:"pending",email_last_error:null}).eq("id",id);if(u.error)throw u.error;
    }
    let status="sent",emailError:string|null=null;try{await sendEmail(a.client_email,signedName||"Modulo_assistenza_firmato.pdf",signedBytes,a.protocol_order,a.client_name)}catch(e){status="retry";emailError=e instanceof Error?e.message:String(e)}
    await admin.from("assistances").update({email_status:status,email_last_error:emailError}).eq("id",id);return json({ok:true,email_status:status,email_error:emailError,signed_document_path:signedPath});
  }catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});