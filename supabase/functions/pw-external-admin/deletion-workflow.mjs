// Auth deletion is irreversible; history and private attachments are retained.
// Both RPCs run with the verified office caller's JWT. The privileged client is
// used only for Auth Admin, never to authorize the office or select a target.
export class DeletionError extends Error {
  constructor(message,status=409){super(message);this.status=status;}
}
export async function deleteInstallerAccount(admin,caller,installerId,confirmationName){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(installerId))throw new DeletionError('Posatore non valido.',400);
 const prepared=await caller.rpc('pw_external_prepare_installer_delete',{p_id:installerId,p_confirm_name:confirmationName});
 if(prepared.error)throw new DeletionError(prepared.error.message||'Eliminazione non consentita.');
 const target=Array.isArray(prepared.data)?prepared.data[0]:prepared.data;
 if(target?.already_deleted)return {ok:true,deleted:true,installer_id:installerId};
 if(!target?.profile_id)throw new DeletionError('Impossibile individuare l’accesso del posatore.');
 const pending='L’accesso è già bloccato. L’eliminazione non è ancora completata: aggiorna l’elenco e premi “Completa eliminazione”.';
 if(!target.auth_deleted){
  const blocked=await admin.auth.admin.updateUserById(target.profile_id,{ban_duration:'876000h'});
  if(blocked.error)throw new DeletionError(pending,503);
  const deleted=await admin.auth.admin.deleteUser(target.profile_id,true);
  if(deleted.error)throw new DeletionError(pending,503);
 }
 const finished=await caller.rpc('pw_external_finish_installer_delete',{p_id:installerId});
 if(finished.error)throw new DeletionError(pending,503);
 return {...finished.data,ok:true,deleted:true};
}
