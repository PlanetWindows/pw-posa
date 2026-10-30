import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { deleteInstallerAccount, DeletionError } from './deletion-workflow.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return reply({ok:true});
 if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
 const auth=await admin.auth.getUser(token);
 if(auth.error||!auth.data.user)return reply({error:'Accesso richiesto'},401);
 const profile=await admin.from('profiles').select('role,active').eq('id',auth.data.user.id).single();
 if(profile.error||!profile.data.active||profile.data.role!=='office_scheduler')return reply({error:'Accesso riservato all’ufficio'},403);
 try{
  const body=await req.json();
  if(body.action==='delete_installer'){
   const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
   return reply(await deleteInstallerAccount(admin,caller,String(body.installer_id||''),String(body.confirmation_name||'').trim()));
  }
  if(body.action&&body.action!=='create_installer')return reply({error:'Azione non valida'},400);
  const name=String(body.full_name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
  if(!name||name.length>150||!/^\S+@\S+\.\S+$/.test(email)||password.length<14||password.length>128)return reply({error:'Nome, email o password non validi'},400);
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name}});
  if(created.error){
   console.error('PW Esterni: creazione accesso',{stage:'auth_create',code:created.error.code,status:created.error.status,message:created.error.message});
   const duplicate=['email_exists','user_already_exists'].includes(created.error.code||'');
   return reply({error:duplicate?'Questa email è già utilizzata per un account.':'Non è stato possibile creare l’accesso. Riprova.'},duplicate?409:500);
  }
  const userId=created.data.user.id;
  const provision=await admin.rpc('pw_external_provision',{p_user:userId,p_name:name,p_company:String(body.company||'').slice(0,200),p_email:email,p_phone:String(body.phone||'').slice(0,60),p_notes:String(body.notes||'').slice(0,5000)});
  if(provision.error){
   console.error('PW Esterni: collegamento posatore',{stage:'installer_provision',code:provision.error.code,message:provision.error.message,hint:provision.error.hint});
   const cleanup=await admin.auth.admin.deleteUser(userId);
   if(cleanup.error)console.error('PW Esterni: rimozione utenza non completata',{code:cleanup.error.code,status:cleanup.error.status});
   return reply({error:'Non è stato possibile completare l’anagrafica del posatore. Riprova.'},500);
  }
  return reply({ok:true,installer_id:provision.data});
 }catch(error){if(error instanceof DeletionError)return reply({error:error.message},error.status);console.error('PW Esterni: creazione posatore non riuscita',error instanceof Error?error.message:'errore');return reply({error:'Creazione del posatore non riuscita. Riprova.'},500);}
});
