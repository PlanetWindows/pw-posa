import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { LOGO_PNG_B64 } from "./logo.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET="pw-posa-documents";
const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:cors});
const safe=(v:unknown)=>String(v??"").trim();
const fmtDate=(v:unknown)=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(safe(v));return m?`${m[3]}/${m[2]}/${m[1]}`:safe(v)||"-"};
function pngBytes(v:string){if(!v.startsWith("data:image/png;base64,"))throw new Error("Firma posatore obbligatoria o formato non valido");return Uint8Array.from(atob(v.split(",")[1]),c=>c.charCodeAt(0));}
function b64Bytes(v:string){return Uint8Array.from(atob(v),c=>c.charCodeAt(0));}

async function makePdf(report:any,pose:any,signature:string,ts:Date){
  const pdf=await PDFDocument.create();
  let page=pdf.addPage([595.28,841.89]);
  const reg=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const gold=rgb(.824,.671,.404),black=rgb(.137,.122,.125),muted=rgb(.4,.38,.36),line=rgb(.86,.82,.74),soft=rgb(.99,.985,.97);
  const L=40,R=555,W=515;let y=762;
  const footer=()=>page.drawText(`PW Posa · Documento generato il ${new Date().toLocaleString("it-IT",{timeZone:"Europe/Rome"})}`,{x:L,y:28,size:7.5,font:reg,color:muted});
  const newPage=()=>{footer();page=pdf.addPage([595.28,841.89]);page.drawLine({start:{x:L,y:806},end:{x:R,y:806},thickness:2,color:gold});y=780};
  const ensure=(h:number)=>{if(y-h<58)newPage()};
  const lines=(t:string,n=88)=>{const out:string[]=[];for(const p of safe(t).split(/\n+/)){let s=p.trim();if(!s){out.push(" ");continue}while(s.length>n){let c=s.lastIndexOf(" ",n);if(c<25)c=n;out.push(s.slice(0,c));s=s.slice(c).trim()}out.push(s)}return out.length?out:["-"]};
  const row=(k:string,v:string)=>{const ls=lines(v,68),h=Math.max(24,ls.length*12+9);ensure(h);page.drawText(`${k}:`,{x:L,y,size:10,font:bold,color:black});let ty=y;for(const ln of ls){page.drawText(ln,{x:L+124,y:ty,size:10,font:reg,color:black});ty-=12}y-=h};
  const block=(k:string,v:string,min=56)=>{const ls=lines(v,92),h=Math.max(min,30+ls.length*12);ensure(h+12);page.drawRectangle({x:L,y:y-h+8,width:W,height:h,borderColor:line,borderWidth:.8,color:soft});page.drawText(k.toUpperCase(),{x:L+12,y:y-11,size:8.5,font:bold,color:gold});let ty=y-29;for(const ln of ls){page.drawText(ln,{x:L+12,y:ty,size:9.5,font:reg,color:black});ty-=12}y-=h+12};

  const logo=await pdf.embedPng(b64Bytes(LOGO_PNG_B64));
  const logoW=150,logoH=logoW*logo.height/logo.width;
  page.drawImage(logo,{x:L,y:783,width:logoW,height:logoH});
  page.drawLine({start:{x:L,y:754},end:{x:R,y:754},thickness:2.2,color:gold});
  page.drawText("RAPPORTINO DI FINE GIORNATA",{x:L,y:722,size:20,font:bold,color:black});
  page.drawText(`Numero: ${safe(report.report_number)||"-"}`,{x:L,y:704,size:10,font:reg,color:muted});
  y=676;
  row("Data rapportino",fmtDate(report.report_date));
  row("Commessa",safe(pose.job_number)||"-");
  row("Cliente",safe(pose.client_name)||"-");
  row("Cantiere",[safe(pose.address),safe(pose.city),safe(pose.postal_code)].filter(Boolean).join(", "));
  row("Ore lavorate",safe(report.hours_worked)||"-");
  y-=4;
  block("Descrizione",safe(report.completed_work),64);
  const unfinished=!!(safe(report.issues_found)||safe(report.materials_notes));
  row("Il lavoro è stato finito?",unfinished?"NO":"SI");
  if(unfinished){block("Non conformità",safe(report.issues_found)||"-",52);block("Materiali mancanti",safe(report.materials_notes)||"-",52)}
  block("Note finali",safe(report.final_notes)||"-",52);
  ensure(104);
  page.drawRectangle({x:L,y:y-88+8,width:W,height:88,borderColor:gold,borderWidth:1});
  page.drawText("FIRMA POSATORE",{x:L+12,y:y-10,size:8.5,font:bold,color:gold});
  const img=await pdf.embedPng(pngBytes(signature)),sw=Math.min(172,img.width*.42),sh=Math.min(48,sw*img.height/img.width);
  page.drawImage(img,{x:L+12,y:y-66,width:sw,height:sh});
  page.drawText("Angelo Idone",{x:L+210,y:y-36,size:10,font:bold,color:black});
  page.drawText(ts.toLocaleString("it-IT",{timeZone:"Europe/Rome"}),{x:L+210,y:y-53,size:9,font:reg,color:muted});
  footer();
  return new Uint8Array(await pdf.save());
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";if(!auth)return json({error:"Sessione mancante"},401);
    const uc=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user}}=await uc.auth.getUser();if(!user)return json({error:"Utente non autenticato"},401);
    const {data:p}=await admin.from("profiles").select("role,active").eq("id",user.id).maybeSingle();
    if(p?.role!=="installer"||p?.active===false)return json({error:"Solo il posatore può completare il rapportino"},403);
    const b=await req.json(),reportId=safe(b.report_id),poseId=safe(b.pose_id),signature=safe(b.installer_signature_data_url);
    if(!reportId||!poseId||!signature)return json({error:"Dati rapportino incompleti"},400);
    const {data:link}=await uc.from("daily_report_poses").select("report_id").eq("report_id",reportId).eq("pose_id",poseId).maybeSingle();
    if(!link)return json({error:"Rapportino non collegato alla posa"},403);
    const [{data:report,error:re},{data:pose,error:pe}]=await Promise.all([uc.from("daily_reports").select("*").eq("id",reportId).single(),uc.from("poses").select("*").eq("id",poseId).single()]);
    if(re||!report||pe||!pose)return json({error:"Rapportino o posa non accessibili"},403);
    const ts=new Date(),bytes=await makePdf(report,pose,signature,ts),name=`${safe(report.report_number)||report.id}_firmato.pdf`.replace(/[^a-zA-Z0-9._-]+/g,"-"),path=`poses/${poseId}/rapportini/${reportId}.pdf`;
    const up=await admin.storage.from(BUCKET).upload(path,bytes,{contentType:"application/pdf",upsert:true});if(up.error)throw up.error;
    const {error:ue}=await admin.from("daily_reports").update({pdf_storage_path:path,pdf_file_name:name,pdf_generated_at:ts.toISOString(),status:"submitted",submitted_at:ts.toISOString(),updated_at:ts.toISOString()}).eq("id",reportId);if(ue)throw ue;
    return json({ok:true,report_id:reportId,pose_id:poseId,path,name});
  }catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});