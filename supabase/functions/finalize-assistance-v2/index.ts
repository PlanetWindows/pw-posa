import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!,ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!,SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET="pw-assistance-private";
const LOGO_PNG_B64="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";

const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:cors});
const safe=(v:unknown)=>String(v??"").trim();
const fmtDate=(v:unknown)=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(safe(v));return m?`${m[3]}/${m[2]}/${m[1]}`:safe(v)||"-"};
const fmtTime=(v:unknown)=>safe(v).slice(0,5)||"-";
function pngBytes(v:string){if(!v.startsWith("data:image/png;base64,"))throw new Error("Firma obbligatoria o formato non valido");return Uint8Array.from(atob(v.split(",")[1]),c=>c.charCodeAt(0));}
function b64Bytes(v:string){return Uint8Array.from(atob(v),c=>c.charCodeAt(0));}

async function makePdf(a:any,b:any,ts:Date){
  const pdf=await PDFDocument.create();
  let page=pdf.addPage([595.28,841.89]);
  const reg=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const gold=rgb(.824,.671,.404),black=rgb(.137,.122,.125),muted=rgb(.4,.38,.36),line=rgb(.86,.82,.74),soft=rgb(.99,.985,.97);
  const L=40,R=555,W=515;
  let y=762;
  const footer=()=>page.drawText(`PW Posa · Documento generato il ${new Date().toLocaleString("it-IT",{timeZone:"Europe/Rome"})}`,{x:L,y:28,size:7.5,font:reg,color:muted});

  // SOLO GRAFICA: logo ufficiale Planet Windows ricavato dal PDF vettoriale allegato.
  const logo=await pdf.embedPng(b64Bytes(LOGO_PNG_B64));
  const logoW=150,logoH=logoW*logo.height/logo.width;
  page.drawImage(logo,{x:L,y:783,width:logoW,height:logoH});
  page.drawLine({start:{x:L,y:754},end:{x:R,y:754},thickness:2.2,color:gold});

  page.drawText("RAPPORTINO DI ASSISTENZA",{x:L,y:722,size:20,font:bold,color:black});
  page.drawText(`Protocollo / ordine: ${safe(a.protocol_order)||"-"}`,{x:L,y:704,size:10,font:reg,color:muted});
  y=676;

  const lines=(t:string,n=88)=>{const out:string[]=[];for(const p of safe(t).split(/\n+/)){let s=p.trim();if(!s){out.push(" ");continue}while(s.length>n){let c=s.lastIndexOf(" ",n);if(c<25)c=n;out.push(s.slice(0,c));s=s.slice(c).trim()}out.push(s)}return out.length?out:["-"]};
  const ensure=(h:number)=>{if(y-h<58){footer();page=pdf.addPage([595.28,841.89]);page.drawLine({start:{x:L,y:806},end:{x:R,y:806},thickness:2,color:gold});y=780}};
  const row=(k:string,v:string)=>{const ls=lines(v,68),h=Math.max(22,ls.length*11+8);ensure(h);page.drawText(`${k}:`,{x:L,y,size:9.5,font:bold,color:black});let ty=y;for(const ln of ls){page.drawText(ln,{x:L+124,y:ty,size:9.5,font:reg,color:black});ty-=11}y-=h};
  const block=(k:string,v:string,min=50)=>{const ls=lines(v,96),h=Math.max(min,30+ls.length*11);ensure(h+9);page.drawRectangle({x:L,y:y-h+7,width:W,height:h,borderColor:line,borderWidth:.8,color:soft});page.drawText(k.toUpperCase(),{x:L+12,y:y-10,size:8,font:bold,color:gold});page.drawLine({start:{x:L+12,y:y-18},end:{x:L+W-12,y:y-18},thickness:.55,color:gold});let ty=y-31;for(const ln of ls){page.drawText(ln,{x:L+12,y:ty,size:9,font:reg,color:black});ty-=11}y-=h+9};

  row("Cliente",safe(a.client_name));
  row("Telefono",safe(a.client_phone)||"-");
  row("Email cliente",safe(a.client_email)||"-");
  row("Cantiere",[safe(a.address),safe(a.city),safe(a.postal_code)].filter(Boolean).join(", "));
  row("Data assistenza",`${fmtDate(a.scheduled_date)} · ${fmtTime(a.start_time)}${a.end_time?` - ${fmtTime(a.end_time)}`:""}`);
  row("Garanzia",a.warranty?"Si":"No");
  row("Pagamento",a.payment_required?`Si · ${Number(a.payment_amount||0).toFixed(2).replace(".",",")} EUR`:"No");
  y-=2;
  block("Problematica riscontrata",safe(a.issue_description),54);
  block("Come si e intervenuti",safe(b.intervention),58);
  row("Il problema e stato risolto?",b.problem_resolved?"Si":"No");
  if(!b.problem_resolved)block("Note / cosa rimane da segnalare",safe(b.final_notes)||"-",48);

  // FIRME: lasciate IDENTICHE.
  ensure(100);
  const gap=10,boxW=(W-gap)/2,boxH=84,sigY=y;
  const sigs=[
    {title:"FIRMA POSATORE",name:safe(b.installer_signer_name),data:safe(b.installer_signature_data_url)},
    {title:"FIRMA CLIENTE",name:safe(b.signer_name),data:safe(b.signature_data_url)}
  ];
  for(let i=0;i<sigs.length;i++){
    const s=sigs[i],x=L+i*(boxW+gap);
    page.drawRectangle({x,y:sigY-boxH+8,width:boxW,height:boxH,borderColor:gold,borderWidth:1});
    page.drawText(s.title,{x:x+10,y:sigY-10,size:8,font:bold,color:gold});
    const img=await pdf.embedPng(pngBytes(s.data)),sw=Math.min(104,img.width*.34),sh=Math.min(38,sw*img.height/img.width);
    page.drawImage(img,{x:x+10,y:sigY-60,width:sw,height:sh});
    page.drawText(s.name,{x:x+122,y:sigY-34,size:8.5,font:bold,color:black,maxWidth:boxW-132});
    page.drawText(ts.toLocaleString("it-IT",{timeZone:"Europe/Rome"}),{x:x+122,y:sigY-49,size:7.5,font:reg,color:muted,maxWidth:boxW-132});
  }
  y-=94;
  footer();
  return new Uint8Array(await pdf.save());
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    if(!auth)return json({error:"Sessione mancante"},401);
    const uc=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user}}=await uc.auth.getUser();
    if(!user)return json({error:"Utente non autenticato"},401);
    const {data:p}=await admin.from("profiles").select("role").eq("id",user.id).maybeSingle();
    if(p?.role!=="installer")return json({error:"Solo il posatore può completare il rapportino"},403);

    const b=await req.json(),id=safe(b.assistance_id),signer=safe(b.signer_name),installer=safe(b.installer_signer_name),intervention=safe(b.intervention);
    if(!id||!signer||!installer||!intervention||typeof b.problem_resolved!=="boolean")return json({error:"Dati rapportino incompleti"},400);

    const {data:a,error:ae}=await uc.from("assistances").select("*").eq("id",id).single();
    if(ae||!a)return json({error:"Assistenza non accessibile"},403);
    if(a.final_report_path)return json({ok:true,already_done:true,report_path:a.final_report_path,email_status:a.email_status||"pending"});

    const ts=new Date(),bytes=await makePdf(a,b,ts),protocol=safe(a.protocol_order).replace(/[^a-zA-Z0-9_-]+/g,"_")||"assistenza";
    const name=`Rapportino_Assistenza_${protocol}_firmato.pdf`,path=`${id}/reports/${Date.now()}-${name}`;
    const up=await admin.storage.from(BUCKET).upload(path,bytes,{contentType:"application/pdf",upsert:false});
    if(up.error)throw up.error;
    const {error:ue}=await admin.from("assistances").update({
      final_issue_description:a.issue_description,
      problem_resolved:b.problem_resolved,
      intervention,
      final_notes:safe(b.final_notes)||null,
      final_report_path:path,
      final_report_name:name,
      signed_document_path:path,
      signed_document_name:name,
      signer_name:signer,
      installer_signer_name:installer,
      installer_signed_at:ts.toISOString(),
      signed_at:ts.toISOString(),
      updated_by:user.id,
      email_status:"pending",
      email_last_error:null
    }).eq("id",id);
    if(ue)throw ue;
    return json({ok:true,report_path:path,email_status:"pending"});
  }catch(e){
    console.error(e);
    return json({ok:false,error:e instanceof Error?e.message:String(e)},500);
  }
});