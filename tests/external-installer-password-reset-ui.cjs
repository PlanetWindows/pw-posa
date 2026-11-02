const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../esterni/app.js'),'utf8');
const formSource=source.slice(source.indexOf('function resetInstallerPasswordForm(id)'),source.indexOf('function render()'));
const id='20000000-0000-4000-8000-000000000001';
function setup(values,options={}){
 const calls=[],target={id,full_name:'Test Installer',email:'installer@example.invalid',active:true,...options.target};let pending,html='',title='';
 const error={textContent:''},form={querySelector:()=>error,reset:()=>calls.push('clear')},body={replaceChildren:()=>calls.push('remove_fields')};
 const context={state:{selected:null},scheduler:()=>options.office!==false,installer:()=>target,esc:s=>s,showModal:(a,b)=>{title=a;html=b;},$:key=>key==='modalBody'?body:form,dataOf:()=>values,closeModal:()=>calls.push('close'),toast:message=>calls.push(['toast',message]),safe:fn=>{pending=Promise.resolve().then(fn);},adminAction:async payload=>{calls.push(['request',JSON.parse(JSON.stringify(payload))]);if(options.failure)throw Error('Password non reimpostata. Riprova.');}};
 vm.runInNewContext(formSource+';resetInstallerPasswordForm',context)(id);
 return{form,calls,submit:()=>{form.onsubmit({preventDefault(){},currentTarget:form});return pending;},get html(){return html;},get title(){return title;}};
}
(async()=>{
 const mismatch=setup({new_password:'Personal phrase!47',confirm_password:'Different phrase!47'});await assert.rejects(()=>mismatch.submit(),/non coincidono/);assert.ok(!mismatch.calls.some(x=>Array.isArray(x)&&x[0]==='request'));
 const ok=setup({new_password:'Personal phrase!47',confirm_password:'Personal phrase!47'});assert.equal(ok.title,'Reimposta password');assert.ok(!ok.html.includes('current_password'));assert.ok(ok.html.includes('installer@example.invalid'));await ok.submit();
 assert.deepEqual(ok.calls.find(x=>Array.isArray(x)&&x[0]==='request'),['request',{action:'reset_installer_password',installer_id:id,password:'Personal phrase!47'}]);
 assert.ok(ok.calls.includes('clear')&&ok.calls.includes('close')&&ok.calls.includes('remove_fields'));
 const failed=setup({new_password:'Personal phrase!47',confirm_password:'Personal phrase!47'},{failure:true});await assert.rejects(()=>failed.submit(),/non reimpostata/);assert.ok(!failed.calls.includes('close'),'Keep the form open on a server failure');
 for(const options of [{office:false},{target:{active:false}},{target:{deleted_at:'2026-10-01'}},{target:{deletion_started_at:'2026-10-01'}}])assert.equal(setup({},options).html,'');
 console.log('PASS: office reset form confirms the new password, sends the selected installer only, clears credentials on success, and preserves errors without claiming success.');
})().catch(error=>{console.error(error);process.exitCode=1;});
