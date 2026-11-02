const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../esterni/app.js'),'utf8');
const display=source.slice(source.indexOf('const displayRequest='),source.indexOf('const locked='));
const filtering=source.slice(source.indexOf('function filtered()'),source.indexOf('function filterHtml()'));
const state={requests:[],status:'',search:'',filter:''};
const logic=vm.runInNewContext(display+filtering+';({displayRequest,filtered})',{state,installer:()=>({})});
state.requests=[{id:'active',status:'confirmed'},{id:'deleted',status:'confirmed',cancelled_at:'2026-11-02T10:00:00Z'}].map(logic.displayRequest);
assert.deepEqual(Array.from(logic.filtered(),r=>r.id),['active']);state.status='cancelled';assert.deepEqual(Array.from(logic.filtered(),r=>r.id),['deleted']);
const formSource=source.slice(source.indexOf('function cancelRequestForm()'),source.indexOf('async function openRequest(id)'));
function setup({office=true,confirmed=true,archived=false,fail=false}={}){
 const calls=[],request={id:'request-qa',version:8,client_name:'Cliente QA',address:'Via QA',work_dates:['2026-11-02'],cancelled_at:archived?'2026-11-02':null};let pending;
 const form={elements:{confirmation:{checked:confirmed},reason:{value:'  Motivo QA  '}}},body={innerHTML:''},title={textContent:''};
 const context={state:{selected:{request}},scheduler:()=>office,$:id=>id==='cancelRequestForm'?form:id==='modalTitle'?title:body,esc:x=>x,datesLabel:()=> '02/11/2026',safe:fn=>{pending=Promise.resolve().then(fn);},call:async(name,args)=>{calls.push([name,JSON.parse(JSON.stringify(args))]);if(fail)throw Error('La posa è cambiata.');},refresh:async()=>calls.push('refresh'),changed:()=>calls.push('changed'),closeModal:()=>calls.push('close'),toast:()=>calls.push('toast')};
 vm.runInNewContext(formSource+';cancelRequestForm',context)();
 return{calls,body,submit:()=>{form.onsubmit({preventDefault(){},currentTarget:form});return pending;}};
}
(async()=>{
 for(const options of [{office:false},{archived:true}])assert.equal(setup(options).body.innerHTML,'');
 const missing=setup({confirmed:false});await assert.rejects(()=>missing.submit(),/Conferma/);assert.equal(missing.calls.length,0);
 const ok=setup();assert.ok(ok.body.innerHTML.includes('Eliminate (storico)'));assert.ok(ok.body.innerHTML.includes('Via QA'));await ok.submit();assert.deepEqual(ok.calls[0],['pw_external_cancel_request',{p_id:'request-qa',p_version:8,p_confirm:true,p_reason:'Motivo QA'}]);assert.ok(ok.calls.includes('refresh')&&ok.calls.includes('changed')&&ok.calls.includes('close'));
 const failed=setup({fail:true});await assert.rejects(()=>failed.submit(),/è cambiata/);assert.ok(!failed.calls.includes('close'));
 console.log('PASS: archive-aware list filtering, office-only confirmation, versioned cancellation request, shared-calendar refresh, and no success on a server failure.');
})().catch(error=>{console.error(error);process.exitCode=1;});
