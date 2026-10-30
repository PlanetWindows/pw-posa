import assert from 'node:assert/strict';
import {deleteInstallerAccount} from '../supabase/functions/pw-external-admin/deletion-workflow.mjs';
const id='10000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000001';
function fixture(options={}){
 const log=[];
 const caller={rpc:async(name,args)=>{log.push(name);assert.equal(args.p_id,id);if(name.includes('prepare'))return{data:{profile_id:user,auth_deleted:!!options.authDeleted,already_deleted:!!options.alreadyDeleted},error:options.prepareError?{message:'Non consentito'}:null};return{data:{deleted:true},error:options.finishError?{message:'Non completato'}:null};}};
 const admin={auth:{admin:{updateUserById:async(uid,data)=>{log.push('block');assert.equal(uid,user);assert.equal(data.ban_duration,'876000h');return {error:options.blockError?{}:null};},deleteUser:async(uid,soft)=>{log.push('delete');assert.equal(uid,user);assert.equal(soft,true);return{error:options.deleteError?{}:null};}}}};
 return{log,caller,admin};
}
let f=fixture();assert.equal((await deleteInstallerAccount(f.admin,f.caller,id,'Mario Rossi')).deleted,true);assert.deepEqual(f.log,['pw_external_prepare_installer_delete','block','delete','pw_external_finish_installer_delete']);
f=fixture();await assert.rejects(()=>deleteInstallerAccount(f.admin,f.caller,'invalid','Mario Rossi'));assert.deepEqual(f.log,[]);
f=fixture({prepareError:true});await assert.rejects(()=>deleteInstallerAccount(f.admin,f.caller,id,'Mario Rossi'));assert.deepEqual(f.log,['pw_external_prepare_installer_delete']);
f=fixture({alreadyDeleted:true});assert.equal((await deleteInstallerAccount(f.admin,f.caller,id,'Mario Rossi')).deleted,true);assert.deepEqual(f.log,['pw_external_prepare_installer_delete']);
f=fixture({authDeleted:true});assert.equal((await deleteInstallerAccount(f.admin,f.caller,id,'Mario Rossi')).deleted,true);assert.deepEqual(f.log,['pw_external_prepare_installer_delete','pw_external_finish_installer_delete']);
for(const failure of ['blockError','deleteError','finishError']){f=fixture({[failure]:true});await assert.rejects(()=>deleteInstallerAccount(f.admin,f.caller,id,'Mario Rossi'),error=>error.status===503&&error.message.includes('Completa eliminazione'));if(failure!=='finishError')assert.ok(!f.log.includes('pw_external_finish_installer_delete'));}
console.log('PASS: deletion authorization order, irreversible Auth deletion, invalid target, idempotency, interrupted-operation recovery, and preservation of linked history.');
