const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../esterni/app.js'),'utf8');
const helper=source.slice(source.indexOf('async function adminAction(body)'),source.indexOf('function deleteInstallerForm(id)'));
function action(response){return vm.runInNewContext(helper+';adminAction',{sb:{functions:{invoke:async(_,{body})=>{assert.equal(body.action,'create_installer');return response;}}}});}
const input={action:'create_installer'};
(async()=>{
 const provision='Non è stato possibile completare l’anagrafica del posatore. Riprova.';
 for(const [status,message] of [[500,provision],[409,'Questa email è già utilizzata per un account.'],[403,'Accesso riservato all’ufficio']]){
  const invoke=action({data:null,error:{context:new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':'application/json'}})}});
  await assert.rejects(()=>invoke(input),e=>e.message===message);
 }
 await assert.rejects(()=>action({data:null,error:{message:'Network error'}})(input),e=>e.message==='Operazione non riuscita. Riprova.');
 const invoke=action({data:null,error:{context:new Response('<html>Gateway failure</html>',{status:502})}});
 await assert.rejects(()=>invoke(input),e=>e.message==='Operazione non riuscita. Riprova.');
 assert.equal((await action({data:{ok:true},error:null})(input)).ok,true);
 console.log('PASS: creation errors retain their actual cause; database, permission and network errors are not mislabeled as duplicate email.');
})();
