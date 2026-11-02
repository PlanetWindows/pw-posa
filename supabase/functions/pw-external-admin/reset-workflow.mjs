// Only the verified office caller may reset an active external installer's access.
// Auth Admin updates only the password and revokes the target's refresh sessions.
export class PasswordResetError extends Error {
 constructor(message,status=400){super(message);this.status=status;}
}
export async function resetInstallerPassword(admin,actor,installerId,password){
 if(!actor?.id||!actor.active||actor.role!=='office_scheduler')throw new PasswordResetError('Accesso riservato all’ufficio.',403);
 if(typeof installerId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(installerId))throw new PasswordResetError('Posatore non valido.');
 if(typeof password!=='string'||password.length<12||password.length>72||new TextEncoder().encode(password).length>72)throw new PasswordResetError('Scegli una password da 12 a 72 caratteri; se contiene molti caratteri speciali, accorciala.');
 const selected=await admin.from('external_installers').select('id,profile_id,email,active,deleted_at,deletion_started_at').eq('id',installerId).maybeSingle();
 if(selected.error)throw new PasswordResetError('Impossibile verificare il posatore. Riprova.',503);
 const target=selected.data;
 if(!target?.active||target.deleted_at||target.deletion_started_at||!target.profile_id||target.profile_id===actor.id)throw new PasswordResetError('Il posatore non ha un accesso attivo da reimpostare.',409);
 const profile=await admin.from('profiles').select('role,active').eq('id',target.profile_id).maybeSingle();
 if(profile.error)throw new PasswordResetError('Impossibile verificare l’accesso. Riprova.',503);
 if(!profile.data?.active||profile.data.role!=='installer')throw new PasswordResetError('Questo accesso non appartiene a un posatore esterno attivo.',409);
 const auth=await admin.auth.admin.getUserById(target.profile_id),user=auth.data?.user;
 if(auth.error||!user||user.deleted_at||(user.banned_until&&new Date(user.banned_until).getTime()>Date.now())||String(user.email||'').toLowerCase()!==String(target.email||'').toLowerCase())throw new PasswordResetError('L’accesso del posatore non è disponibile. Contatta l’ufficio.',409);
 const result=await admin.auth.admin.updateUserById(target.profile_id,{password});
 if(result.error){
  if(result.error.code==='weak_password')throw new PasswordResetError('Scegli una password più sicura, con maiuscole, minuscole, numeri e simboli.');
  if(result.error.status===429)throw new PasswordResetError('Troppi tentativi. Attendi qualche minuto e riprova.',429);
  throw new PasswordResetError('Password non reimpostata. Riprova.',503);
 }
 if(result.data?.user?.id!==target.profile_id)throw new PasswordResetError('Non è stato possibile verificare il cambio password. Contatta l’ufficio.',503);
 console.info('PW Esterni: password posatore reimpostata',{actor_id:actor.id,installer_id:installerId});
 return {ok:true,installer_id:installerId};
}
