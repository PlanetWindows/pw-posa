const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../esterni/app.js'),'utf8');
const helper=source.slice(source.indexOf('async function changePassword(values)'),source.indexOf('function passwordForm()'));
const user={id:'installer-test',email:'installer@example.invalid'};
const input={current_password:'Temporary!27',new_password:'PersonalChoice!472',confirm_password:'PersonalChoice!472'};
function setup({verifyError=null,updateError=null,verifiedId=user.id,signedOut=false}={}){
 const calls=[],state={user:signedOut?null:{...user}};
 const sb={auth:{
  signInWithPassword:async values=>{calls.push(['verify',values]);return{data:{user:{...user,id:verifiedId}},error:verifyError};},
  updateUser:async values=>{calls.push(['update',values]);return{data:{user:{...user}},error:updateError};}
 }};
 return {change:vm.runInNewContext(helper+';changePassword',{sb,state}),calls};
}
(async()=>{
 for(const patch of [{current_password:''},{new_password:'short',confirm_password:'short'},{new_password:'x'.repeat(73),confirm_password:'x'.repeat(73)},{confirm_password:'DoesNotMatch!472'},{new_password:input.current_password,confirm_password:input.current_password}]){
  const t=setup();await assert.rejects(()=>t.change({...input,...patch}));assert.equal(t.calls.length,0,'Reject invalid form before any auth request');
 }
 const missing=setup({signedOut:true});await assert.rejects(()=>missing.change(input),/Accedi di nuovo/);assert.equal(missing.calls.length,0);
 const invalid=setup({verifyError:{code:'invalid_credentials'}});await assert.rejects(()=>invalid.change(input),/password attuale non è corretta/);assert.equal(invalid.calls.length,1,'Never update after wrong current password');
 const switched=setup({verifiedId:'different-user'});await assert.rejects(()=>switched.change(input),/account è cambiato/);assert.equal(switched.calls.length,1,'Never update a different user');
 const limited=setup({verifyError:{status:429}});await assert.rejects(()=>limited.change(input),/Troppi tentativi/);assert.equal(limited.calls.length,1);
 const weak=setup({updateError:{code:'weak_password'}});await assert.rejects(()=>weak.change(input),/password più sicura/);
 const failed=setup({updateError:{code:'unexpected_failure'}});await assert.rejects(()=>failed.change(input),/Cambio password non completato/);
 const ok=setup();await ok.change(input);assert.deepEqual(ok.calls.map(x=>x[0]),['verify','update']);
 assert.equal(ok.calls[0][1].email,user.email);assert.equal(ok.calls[0][1].password,input.current_password);
 assert.equal(ok.calls[1][1].password,input.new_password);assert.equal(ok.calls[1][1].current_password,input.current_password);
 assert.deepEqual(Object.keys(ok.calls[1][1]).sort(),['current_password','password'],'Do not send confirmation, email changes or profile data');
 // Whitespace is part of a password and must not be silently trimmed.
 const spaced=setup(),password='  PersonalChoice!472  ';await spaced.change({...input,new_password:password,confirm_password:password});assert.equal(spaced.calls[1][1].password,password);
 console.log('PASS: password change verifies the current account, rejects invalid confirmation and wrong current credentials, preserves password characters, and reports failures without claiming success.');
})().catch(error=>{console.error(error);process.exitCode=1;});
