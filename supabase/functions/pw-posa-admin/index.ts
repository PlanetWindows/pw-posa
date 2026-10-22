import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// This endpoint authenticates the caller itself before using Admin Auth.
// It only provisions the technician requested for PW Posa; no password resets.
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return reply({ok:true});
 if(req.method!=="POST")return reply({error:"Metodo non consentito"},405);
 const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"")||"";
 const auth=await admin.auth.getUser(token);
 if(auth.error||!auth.data.user)return reply({error:"Accesso richiesto"},401);
 const profile=await admin.from("profiles").select("role,active").eq("id",auth.data.user.id).single();
 if(profile.error||profile.data?.role!=="office_scheduler"||!profile.data.active)return reply({error:"Accesso riservato all’ufficio"},403);
 try{
  const body=await req.json();const password=String(body.password||"");
  if(body.action!=="create_technician"||password.length<14||password.length>128)return reply({error:"Azione non valida o password troppo breve"},400);
  const existing=await admin.from("profiles").select("id").eq("email","cantieri@planetwindows.it").maybeSingle();if(existing.error)throw existing.error;
  if(existing.data)return reply({error:"Utenza già presente: la password non è stata modificata"},409);
  const created=await admin.auth.admin.createUser({email:"cantieri@planetwindows.it",password,email_confirm:true,user_metadata:{full_name:"Tecnico cantieri"}});
  if(created.error)throw created.error;
  const userId=created.data.user.id;
  const updated=await admin.from("profiles").update({role:"technician",full_name:"Tecnico cantieri",active:true}).eq("id",userId).select("id,email,role").single();
  if(updated.error){await admin.auth.admin.deleteUser(userId);throw updated.error;}
  return reply({ok:true,user:updated.data});
 }catch(error:unknown){console.error("PW Posa: creazione tecnico",error instanceof Error?error.message:"errore");return reply({error:"Creazione dell’utenza non riuscita"},500);}
});
