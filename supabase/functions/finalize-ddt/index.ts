import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "pw-ddt-private";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const safe=(v:unknown)=>String(v??"").trim();
function pngBytes(dataUrl:string){if(!dataUrl.startsWith("data:image/png;base64,"))throw new Error("Firma non valida");return Uint8Array.from(atob(dataUrl.split(",")[1]),c=>c.charCodeAt(0));}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const authHeader=req.headers.get("Authorization")||"";if(!authHeader)return json({error:"Sessione mancante"},401);
    const userClient=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:"Utente non autenticato"},401);
    const {data:profile}=await admin.from("profiles").select("role,active").eq("id",user.id).maybeSingle();if(profile?.role!=="installer"||profile?.active===false)return json({error:"Solo il posatore può firmare il DDT"},403);
    const body=await req.json(),id=safe(body.ddt_id);if(!id)return json({error:"ddt_id obbligatorio"},400);
    const {data:d,error:de}=await userClient.from("ddt_documents").select("*").eq("id",id).single();if(de||!d)return json({error:"DDT non accessibile"},403);
    if(!d.original_path)return json({error:"PDF originale DDT non disponibile"},400);
    const {data:orig,error:oe}=await admin.storage.from(BUCKET).download(d.original_path);if(oe||!orig)throw oe||new Error("Impossibile leggere il DDT originale");
    const pdf=await PDFDocument.load(await orig.arrayBuffer());
    for(const [role,dataUrl] of [["installer",safe(body.installer_signature_data_url)],["client",safe(body.client_signature_data_url)]] as const){
      const area=role==="installer"?d.installer_signature_area:d.client_signature_area;if(!area)throw new Error(`Area firma ${role} non configurata`);
      const page=pdf.getPage(Math.max(0,Math.min(pdf.getPageCount()-1,(Number(area.page)||1)-1))),{width,height}=page.getSize();
      const png=await pdf.embedPng(pngBytes(dataUrl));page.drawImage(png,{x:Number(area.x)*width,y:height-(Number(area.y)+Number(area.h))*height,width:Number(area.w)*width,height:Number(area.h)*height});
    }
    const bytes=new Uint8Array(await pdf.save()),base=safe(d.original_name).replace(/\.pdf$/i,"")||"DDT",name=`${base}_FIRMATO.pdf`,path=`${id}/signed/${Date.now()}-${name.replace(/[^\w.-]+/g,"_")}`;
    const up=await admin.storage.from(BUCKET).upload(path,bytes,{contentType:"application/pdf",upsert:false});if(up.error)throw up.error;
    if(d.signed_path&&d.signed_path!==path)await admin.storage.from(BUCKET).remove([d.signed_path]);
    const signedAt=new Date().toISOString();const {error:ue}=await admin.from("ddt_documents").update({signed_path:path,signed_name:name,signed_at:signedAt,signed_by:user.id,email_status:"pending",email_last_error:null}).eq("id",id);if(ue)throw ue;
    return json({ok:true,ddt_id:id,signed_path:path,signed_name:name,signed_at:signedAt,assistance_id:d.assistance_id,pose_id:d.pose_id});
  }catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});
