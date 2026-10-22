const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),results=path.join(root,'test-results');fs.mkdirSync(results,{recursive:true});
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),p=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));if(!p.startsWith(root+path.sep)&&p!==root){res.writeHead(403);return res.end();}fs.readFile(p,(err,data)=>{if(err){res.writeHead(404);res.end();}else{res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(data);}});});
const reports=[];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;const bundled=process.env.PW_CHROMIUM_MODULE?(await import(process.env.PW_CHROMIUM_MODULE)).default:null;let browser;const launch=()=>chromium.launch({headless:true,executablePath:bundled?'/tmp/chromium':undefined,args:bundled?bundled.args:['--no-sandbox']});
try{
 for(const [role,width,height]of [['office_scheduler',1440,1000],['technician',390,844],['installer',390,844]]){
  browser=await launch();const context=await browser.newContext({viewport:{width,height},locale:'it-IT',timezoneId:'Europe/Rome',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(r=>{
   window.__PW_TEST_ROLE=r;try{localStorage.clear();sessionStorage.clear();}catch{}
   const subscription={endpoint:'https://push.example.invalid/device',toJSON:()=>({endpoint:'https://push.example.invalid/device',keys:{p256dh:'fixture-public-key',auth:'fixture-auth'}}),unsubscribe:async()=>true};
   const registration={scope:'/',active:{postMessage(){}},pushManager:{getSubscription:async()=>subscription}};
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve(registration),getRegistration:async()=>registration,register:async()=>registration}});
   Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'granted'}});
  },role);
  await page.route('**/supabase-js@2',route=>route.fulfill({path:path.join(__dirname,'mock-supabase.js'),contentType:'text/javascript'}));
  if(process.env.PW_TEST_VENDOR){
   await page.route('**/jspdf.umd.min.js',r=>r.fulfill({path:path.join(process.env.PW_TEST_VENDOR,'jspdf/dist/jspdf.umd.min.js'),contentType:'text/javascript'}));
   await page.route('**/jszip.min.js',r=>r.fulfill({path:path.join(process.env.PW_TEST_VENDOR,'jszip/dist/jszip.min.js'),contentType:'text/javascript'}));
  }
  await page.goto(origin,{waitUntil:'load',timeout:60000});await page.waitForSelector('.pw-planner');
  assert.equal(await page.locator('[data-pw-mode="month"]').getAttribute('aria-pressed'),'true','Calendar must open in month view on every device');
  for(const [day,week]of [['2026-10-22',43],['2026-10-26',44],['2021-01-01',53],['2021-01-04',1]]){
   await page.locator('#pwCalendarDate').fill(day);await page.locator('#pwCalendarDate').dispatchEvent('change');
   assert.equal(await page.locator('[data-pw-mode="week"]').innerText(),`Settimana ${week}`);
  }
  await page.locator('#pwCalendarDate').fill('2026-10-21');await page.locator('#pwCalendarDate').dispatchEvent('change');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'Calendar must fit the viewport');
  await page.screenshot({path:path.join(results,`calendar-month-${role}.png`),fullPage:true});
  await page.locator('[data-pw-mode="week"]').click();
  await page.locator('[data-pw-step="1"]').click();assert.equal(await page.locator('[data-pw-mode="week"]').innerText(),'Settimana 44');
  await page.locator('[data-pw-step="-1"]').click();assert.equal(await page.locator('[data-pw-mode="week"]').innerText(),'Settimana 43');
  await page.locator('[data-pw-mode="day"]').click();
  if(role==='office_scheduler'){
   await page.locator('[data-pw-mode="month"]').click();
   const day=page.locator('.pw-month-day').filter({has:page.locator('[data-pw-day="2026-10-21"]')});
   assert.equal(await day.locator('.pw-event').count(),2);assert.equal(await day.locator('.pw-more').innerText(),'+6 altre attività');
   await day.locator('.pw-more').click();assert.equal(await page.locator('.pw-time-column .pw-event').count(),8);
   const overlapping=await page.locator('.pw-time-column').evaluate(el=>{const cards=[...el.querySelectorAll('.pw-event')].map(e=>e.getBoundingClientRect());for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const a=cards[i],b=cards[j];if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)return true;}return false;});assert.equal(overlapping,false,'Appointments must not overlap visually');
   await page.screenshot({path:path.join(results,'calendar-day-desktop.png'),fullPage:true});
   await page.locator('#pwCalendarOwner').selectOption('technician:10000000-0000-4000-8000-000000000004');assert.equal(await page.locator('.pw-time-column .pw-event').count(),2);
   await page.locator('#newTechnicalBtn').click();assert.equal(await page.locator('#technicalDialog input[id*="ommesse"]').count(),0);
   await page.locator('#technicalType').selectOption('note');await page.locator('#technicalFirst').fill('Franco');await page.locator('#technicalDate').fill('2026-10-19');await page.locator('#technicalOfficeNotes').fill('Ha chiamato il 19: richiamare.');await page.locator('#technicalSave').click();await page.waitForFunction(()=>!document.getElementById('technicalDialog').open);
   assert.equal(await page.evaluate(()=>window.__PW_FIXTURE_DB.technician_activities.at(-1).scheduled_date),'2026-10-19');
   await page.locator('#pwInboxButton').click();assert.match(await page.locator('#pwInboxList').innerText(),/Da: Ufficio PW Posa/);await page.locator('#pwInboxReadAll').click();await page.waitForFunction(()=>document.getElementById('pwInboxCount').classList.contains('hidden'));await page.locator('#pwInboxClose').click();
   await page.evaluate(()=>PWTechnician.openDetail('50000000-0000-4000-8000-000000000001'));await page.waitForSelector('#technicalDialog[open]');
   assert.equal(await page.evaluate(()=>Boolean(window.jspdf?.jsPDF)),true,'PDF library is required for export verification');{const download=page.waitForEvent('download');await page.locator('#technicalExport').click();const file=await download;await file.saveAs(path.join(results,'technical-export.pdf'));assert.match(file.suggestedFilename(),/Luca_Verdi/);}
   await page.locator('#technicalFiles').setInputFiles({name:'note_cantiere.txt',mimeType:'text/plain',buffer:Buffer.from('Documento di prova')});
   await page.locator('#technicalSave').click();await page.waitForFunction(()=>!document.getElementById('technicalDialog').open);
   await page.evaluate(()=>PWTechnician.openDetail('50000000-0000-4000-8000-000000000001'));await page.waitForSelector('#technicalDialog[open]');
   const zipDownload=page.waitForEvent('download');await page.locator('#technicalExportFolder').click();const zipFile=await zipDownload;await zipFile.saveAs(path.join(results,'technical-folder.zip'));
   const JSZip=require(path.join(process.env.PW_TEST_VENDOR,'jszip'));const archive=await JSZip.loadAsync(fs.readFileSync(path.join(results,'technical-folder.zip')));assert(Object.keys(archive.files).some(n=>n.endsWith('.pdf')));assert(Object.keys(archive.files).some(n=>n.endsWith('note_cantiere.txt')));
   await page.locator('#technicalDialog [data-tech-close]').first().click();
  }else if(role==='technician'){
   assert.equal(await page.locator('.pw-event-pose,.pw-event-assistance').count(),0);
   assert.equal(await page.locator('#newPoseBtn').isVisible(),false);assert.equal(await page.locator('#technicianNav').isVisible(),true);
   await page.screenshot({path:path.join(results,'calendar-technician-mobile.png'),fullPage:true});
   await page.locator('#newTechnicalBtn').click();await page.locator('#technicalFirst').fill('Mario');await page.locator('#technicalLast').fill('Rossi');await page.locator('#technicalAddress').fill('Via Roma 2');await page.locator('#technicalProvince').fill('MO');await page.locator('#technicalPostal').fill('41037');await page.locator('#technicalSave').click();await page.waitForFunction(()=>!document.getElementById('technicalDialog').open);assert.equal(await page.evaluate(()=>window.__PW_FIXTURE_DB.technician_activities.at(-1).technician_notes),null);
   await page.evaluate(()=>PWTechnician.openDetail('50000000-0000-4000-8000-000000000001'));await page.waitForSelector('#technicalDialog[open]');await page.locator('#technicalDate').fill('2026-10-24');await page.locator('#technicalTime').fill('14:30');await page.locator('#technicalStatus').selectOption('completed');await page.locator('#technicalSave').click();await page.waitForFunction(()=>!document.getElementById('technicalDialog').open);assert.equal(await page.evaluate(()=>window.__PW_FIXTURE_DB.technician_activities[0].scheduled_date),'2026-10-24');
   await page.locator('#technicianNav [data-view="technical-notes"]').click();await page.waitForSelector('.pw-tech-list-item');await page.locator('.pw-tech-list-item').first().click();assert.equal(await page.locator('#technicalDate').isDisabled(),true);await page.locator('#technicalStatus').selectOption('completed');await page.locator('#technicalSave').click();await page.waitForFunction(()=>!document.getElementById('technicalDialog').open);assert.equal(await page.evaluate(()=>window.__PW_FIXTURE_DB.technician_activities[2].scheduled_date),'2026-10-20');
  }else{
   assert.equal(await page.locator('.pw-event-survey,.pw-event-site_visit,.pw-event-note').count(),0);assert.equal(await page.locator('.pw-event-pose').count(),1);assert.equal(await page.locator('.pw-event-assistance').count(),4);assert.equal(await page.locator('#newTechnicalBtn').isVisible(),false);assert.equal(await page.locator('#technicianNav').isVisible(),false);
   assert.equal(await page.getByText('Cliente squadra esterna',{exact:true}).count(),0);
   await page.screenshot({path:path.join(results,'calendar-installer-mobile.png'),fullPage:true});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'Page must not overflow horizontally');
  await page.waitForFunction(()=>window.__PW_FIXTURE_DB.push_subscriptions?.length===1);
  const binding=await page.evaluate(()=>window.__PW_FIXTURE_DB.push_subscriptions[0]);
  assert.equal(binding.user_id,role==='technician'?'10000000-0000-4000-8000-000000000004':role==='installer'?'10000000-0000-4000-8000-000000000002':'10000000-0000-4000-8000-000000000001');
  await page.evaluate(()=>PWPosaDetachPushBeforeLogout());assert.equal(await page.evaluate(()=>window.__PW_FIXTURE_DB.push_subscriptions.length),0);
  assert.deepEqual(errors,[],`Browser errors for ${role}`);reports.push({role,viewport:{width,height},status:'passed'});await context.close();await browser.close();
 }
 fs.writeFileSync(path.join(results,'browser-results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
