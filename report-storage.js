(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!window.jspdf?.jsPDF||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  let currentPoseId=null;

  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)};
  const fmtDate=v=>{if(!v)return '—';const [y,m,d]=String(v).split('-');return `${d}/${m}/${y}`};

  async function logoDataUrl(){
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{try{const c=document.createElement('canvas');const ratio=img.naturalWidth/img.naturalHeight||3;c.width=900;c.height=Math.max(180,Math.round(900/ratio));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/png'))}catch(_){resolve(null)}};
      img.onerror=()=>resolve(null); img.src='logo_planet.svg?v=pdf-storage2';
    });
  }

  async function buildPdfBlob(report,pose){
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'}); const gold=[201,155,67],black=[33,29,30];
    const logo=await logoDataUrl(); if(logo) doc.addImage(logo,'PNG',14,10,55,18);
    doc.setDrawColor(...gold);doc.setLineWidth(1);doc.line(14,34,196,34);
    doc.setTextColor(...black);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text('RAPPORTINO DI FINE GIORNATA',14,45);
    doc.setFontSize(10);doc.setFont('helvetica','normal');
    const info=[['Numero',report.report_number||'—'],['Data',fmtDate(report.report_date)],['Commessa',pose?.job_number||'—'],['Cliente',pose?.client_name||'—'],['Cantiere',pose?`${pose.address||''}${pose.city?', '+pose.city:''}${pose.postal_code?' '+pose.postal_code:''}`:'—'],['Ore lavorate',String(report.hours_worked??'—')],['Stato',report.status||'—']];
    let y=54; for(const [k,v] of info){doc.setFont('helvetica','bold');doc.text(`${k}:`,14,y);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(String(v),145);doc.text(lines,45,y);y+=Math.max(7,lines.length*5)}
    y+=3;
    const sections=[['COSA È STATO FATTO',report.completed_work],['COSA NON È STATO FATTO / COSA RIMANE',report.remaining_work],['PERCHÉ NON È STATO FATTO',report.not_completed_reason],['PROBLEMI / ANOMALIE RISCONTRATE',report.issues_found],['MATERIALI / NOTE MATERIALI',report.materials_notes],['NOTE FINALI',report.final_notes]];
    for(const [title,text] of sections){if(y>265){doc.addPage();y=18}doc.setTextColor(...gold);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(title,14,y);y+=5;doc.setTextColor(...black);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(String(text||'—'),182);doc.text(lines,14,y);y+=lines.length*5+7}
    if(y>272){doc.addPage();y=18}doc.setDrawColor(220,215,208);doc.line(14,y,196,y);y+=6;doc.setFontSize(8);doc.setTextColor(100,95,92);doc.text(`PW Posa · Generato il ${new Date().toLocaleString('it-IT')}`,14,y);
    return doc.output('blob');
  }

  async function persistPdf(report,pose){
    const blob=await buildPdfBlob(report,pose);
    const filename=`${report.report_number||report.id}.pdf`.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const path=`poses/${pose.id}/${report.id}.pdf`;
    const {error:upErr}=await sb.storage.from('pw-posa-documents').upload(path,blob,{contentType:'application/pdf',upsert:true}); if(upErr) throw upErr;
    const generatedAt=new Date().toISOString();
    const {error:updateErr}=await sb.from('daily_reports').update({pdf_storage_path:path,pdf_file_name:filename,pdf_generated_at:generatedAt}).eq('id',report.id); if(updateErr) throw updateErr;
    return path;
  }

  async function saveReport(form){
    if(!currentPoseId) throw new Error('Posa non identificata');
    const {data:{session}}=await sb.auth.getSession(); if(!session) throw new Error('Sessione scaduta');
    const {data:pose,error:poseErr}=await sb.from('poses').select('*').eq('id',currentPoseId).single(); if(poseErr) throw poseErr;
    const reportId=form.dataset.reportId||''; const reportDate=$('reportDate').value;
    const payload={report_date:reportDate,created_by:session.user.id,team_id:pose.team_id,hours_worked:Number($('reportHours').value),completed_work:$('reportCompleted').value.trim(),remaining_work:$('reportRemaining').value.trim()||null,not_completed_reason:$('reportReason').value.trim()||null,issues_found:$('reportIssues').value.trim()||null,materials_notes:$('reportMaterials').value.trim()||null,final_notes:$('reportNotes').value.trim()||null,status:'submitted',submitted_at:new Date().toISOString(),updated_at:new Date().toISOString(),report_number:`RAP-${reportDate.replaceAll('-','')}-${String(pose.job_number||'POSA').replace(/\s+/g,'').slice(0,18)}`};
    let saved,error; if(reportId)({data:saved,error}=await sb.from('daily_reports').update(payload).eq('id',reportId).select('*').single());else({data:saved,error}=await sb.from('daily_reports').insert(payload).select('*').single());
    if(error) throw error;
    if(!reportId){const {error:linkErr}=await sb.from('daily_report_poses').insert({report_id:saved.id,pose_id:pose.id});if(linkErr) throw linkErr;form.dataset.reportId=saved.id}
    const state=$('reportState'); if(state) state.textContent='Generazione PDF…';
    await persistPdf(saved,pose);
    const {data:fresh}=await sb.from('daily_reports').select('*').eq('id',saved.id).single();
    if(state) state.innerHTML='Rapportino salvato · <span class="pdf-ready">PDF archiviato</span>';
    return fresh||saved;
  }

  async function openStoredPdf(reportId){
    const {data:report,error}=await sb.from('daily_reports').select('id,pdf_storage_path').eq('id',reportId).single(); if(error) throw error;
    if(!report.pdf_storage_path) throw new Error('PDF non ancora archiviato per questo rapportino');
    const {data,error:urlErr}=await sb.storage.from('pw-posa-documents').createSignedUrl(report.pdf_storage_path,300); if(urlErr) throw urlErr;
    window.open(data.signedUrl,'_blank','noopener');
  }

  document.addEventListener('click',e=>{const pose=e.target.closest('[data-pose]');if(pose)currentPoseId=pose.dataset.pose;},true);

  document.addEventListener('submit',async e=>{
    if(e.target?.id!=='dailyReportForm') return;
    e.preventDefault();e.stopImmediatePropagation();
    const btn=e.target.querySelector('button[type="submit"]'); if(btn){btn.disabled=true;btn.textContent='Salvataggio…'}
    try{await saveReport(e.target);toast('Rapportino salvato e PDF archiviato')}
    catch(err){toast(err.message);const state=$('reportState');if(state)state.textContent=err.message}
    finally{if(btn){btn.disabled=false;btn.textContent='Salva rapportino'}}
  },true);

  document.addEventListener('click',async e=>{
    const btn=e.target.closest('[data-report-pdf]'); if(!btn) return;
    e.preventDefault();e.stopImmediatePropagation();
    try{await openStoredPdf(btn.dataset.reportPdf)}catch(err){toast(err.message)}
  },true);
})();
