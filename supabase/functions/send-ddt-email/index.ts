import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const toBase64=(bytes:Uint8Array)=>{let s="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(s)};

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  try{
    const auth=req.headers.get('Authorization')||'';
    if(!auth.startsWith('Bearer ')) return json({error:'Non autorizzato'},401);
    const token=auth.slice(7);
    const url=Deno.env.get('SUPABASE_URL')!;
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey=Deno.env.get('RESEND_API_KEY');
    if(!resendKey) return json({error:'RESEND_API_KEY non configurata'},500);
    const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
    const {data:{user},error:userErr}=await admin.auth.getUser(token);
    if(userErr||!user) return json({error:'Sessione non valida'},401);
    const {ddt_id}=await req.json();
    if(!ddt_id) return json({error:'ddt_id obbligatorio'},400);
    const {data:profile}=await admin.from('profiles').select('role').eq('id',user.id).single();
    if(!profile||!['installer','office_scheduler','office_viewer'].includes(profile.role)) return json({error:'Permesso negato'},403);
    const {data:ddt,error:ddtErr}=await admin.from('ddt_documents').select('*').eq('id',ddt_id).single();
    if(ddtErr||!ddt) return json({error:'DDT non trovato'},404);
    if(!ddt.signed_path) return json({error:'DDT firmato non disponibile'},400);
    let clientEmail:string|null=null; let label='';
    if(ddt.pose_id){
      const {data:p}=await admin.from('poses').select('client_email,client_name,job_number,team_id').eq('id',ddt.pose_id).single();
      if(!p) return json({error:'Posa non trovata'},404);
      clientEmail=p.client_email;label=`Posa ${p.job_number||''} · ${p.client_name||''}`;
      if(profile.role==='installer'){
        const {data:tm}=await admin.from('team_members').select('user_id').eq('team_id',p.team_id).eq('user_id',user.id).maybeSingle();
        if(!tm) return json({error:'DDT non assegnato alla tua squadra'},403);
      }
    }else if(ddt.assistance_id){
      const {data:a}=await admin.from('assistances').select('client_email,client_name,protocol_order,team_id').eq('id',ddt.assistance_id).single();
      if(!a) return json({error:'Assistenza non trovata'},404);
      clientEmail=a.client_email;label=`Assistenza ${a.protocol_order||''} · ${a.client_name||''}`;
      if(profile.role==='installer'){
        const {data:tm}=await admin.from('team_members').select('user_id').eq('team_id',a.team_id).eq('user_id',user.id).maybeSingle();
        if(!tm) return json({error:'DDT non assegnato alla tua squadra'},403);
      }
    }
    if(!clientEmail) return json({error:'Email cliente mancante'},400);
    const {data:file,error:fileErr}=await admin.storage.from('pw-ddt-private').download(ddt.signed_path);
    if(fileErr||!file) throw fileErr||new Error('Download DDT firmato fallito');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const payload={from:'PW Posa <posapw@planetwindows.it>',to:[clientEmail],subject:`DDT firmato - ${label}`,html:`<p>Buongiorno,</p><p>in allegato trova la copia del documento di trasporto firmato relativo a <strong>${label}</strong>.</p><p>Planet Windows</p>`,attachments:[{filename:ddt.signed_name||'DDT_firmato.pdf',content:toBase64(bytes)}]};
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const text=await r.text();
    if(!r.ok){await admin.from('ddt_documents').update({email_status:'failed',email_last_error:text.slice(0,1000)}).eq('id',ddt.id);return json({error:'Invio email fallito',detail:text},502)}
    await admin.from('ddt_documents').update({email_status:'sent',email_last_error:null}).eq('id',ddt.id);
    return json({ok:true});
  }catch(e){console.error(e);return json({error:e instanceof Error?e.message:String(e)},500)}
});