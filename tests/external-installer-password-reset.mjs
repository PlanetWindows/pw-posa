import assert from 'node:assert/strict';
import {resetInstallerPassword} from '../supabase/functions/pw-external-admin/reset-workflow.mjs';
const actor={id:'10000000-0000-4000-8000-000000000001',role:'office_scheduler',active:true};
const installerId='20000000-0000-4000-8000-000000000001',profileId='30000000-0000-4000-8000-000000000001';
const password='Personal phrase!47';
function setup(options={}){
 const calls=[],rows={external_installers:{id:installerId,profile_id:profileId,email:'installer@example.invalid',active:true,deleted_at:null,deletion_started_at:null,...options.installer},profiles:{role:'installer',active:true,...options.profile}};
 const admin={from(table){calls.push(['select',table]);return{select(){return this;},eq(key,value){assert.equal(key,'id');assert.equal(value,table==='external_installers'?installerId:rows.external_installers.profile_id);return this;},async maybeSingle(){return{data:options.missing?null:rows[table],error:options.queryError};}};},auth:{admin:{
  async getUserById(id){calls.push(['get_user',id]);return{data:{user:{id,email:'installer@example.invalid',...options.authUser}},error:options.authError};},
  async updateUserById(id,data){calls.push(['password',id,data]);return{data:{user:{id}},error:options.updateError};}
 }}};
 return {admin,calls};
}
async function denied(options={},who=actor,id=installerId,pw=password,pattern=/./){const t=setup(options);await assert.rejects(()=>resetInstallerPassword(t.admin,who,id,pw),pattern);assert.ok(!t.calls.some(x=>x[0]==='password'),'Denied requests cannot change any credentials');return t;}
for(const who of [null,{...actor,role:'installer'},{...actor,role:'office_viewer'},{...actor,active:false}]){const t=await denied({},who);assert.equal(t.calls.length,0);}
for(const id of ['invalid','',null])await denied({},actor,id);
for(const pw of ['short','x'.repeat(73),'😀'.repeat(24),null,{}])await denied({},actor,installerId,pw);
for(const options of [{missing:true},{installer:{active:false}},{installer:{deleted_at:'2026-10-01'}},{installer:{deletion_started_at:'2026-10-01'}},{installer:{profile_id:actor.id}},{profile:{role:'office_scheduler'}},{profile:{active:false}},{authUser:{email:'different@example.invalid'}},{authUser:{deleted_at:'2026-10-01'}},{authUser:{banned_until:'2099-01-01T00:00:00Z'}},{authError:{code:'user_not_found'}},{queryError:{message:'database error'}}])await denied(options);
// Once Auth Admin is attempted, an API failure must still be reported as failure.
for(const [error,message] of [[{code:'weak_password'},/password più sicura/],[{status:429},/Troppi tentativi/]]){
 const failed=setup({updateError:error});await assert.rejects(()=>resetInstallerPassword(failed.admin,actor,installerId,password),message);assert.equal(failed.calls.filter(x=>x[0]==='password').length,1);
}
const failing=setup({updateError:{message:password}});await assert.rejects(()=>resetInstallerPassword(failing.admin,actor,installerId,password),error=>error.message==='Password non reimpostata. Riprova.'&&!error.message.includes(password));
const ok=setup();const result=await resetInstallerPassword(ok.admin,actor,installerId,password);
assert.equal(result.ok,true);assert.deepEqual(ok.calls.find(x=>x[0]==='password'),['password',profileId,{password}]);
assert.equal(ok.calls.filter(x=>x[0]==='password').length,1);
assert.ok(ok.calls.every(x=>['select','get_user','password'].includes(x[0])),'No operational data writes');
console.log('PASS: office-only reset, target and account-state checks, password validation, Auth Admin password-only update, and safe error messages.');
