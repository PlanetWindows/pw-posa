(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let currentPoseId = null;
  let busy = false;

  const toast = msg => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 6000);
  };

  const fmtDate = v => {
    if (!v) return '—';
    const [y,m,d] = String(v).split('-');
    return `${d}/${m}/${y}`;
  };

  document.addEventListener('click', e => {
    const pose = e.target.closest('[data-pose]');
    if (pose?.dataset.pose) currentPoseId = pose.dataset.pose;
  }, true);

  async function getPose(id){
    const {data,error} = await sb.from('poses').select('*').eq('id',id).single();
    if (error) throw new Error(`Posa: ${error.message}`);
    return data;
  }

  async function getExistingReport(poseId,date){
    const {data:links,error:le} = await sb.from('daily_report_poses').select('report_id').eq('pose_id',poseId);
    if (le) throw new Error(`Collegamento rapportino: ${le.message}`);
    const ids=(links||[]).map(x=>x.report_id).filter(Boolean);
    if(!ids.length) return null;
    const {data,error}=await sb.from('daily_reports').select('*').in('id',ids).eq('report_date',date).order('created_at',{ascending:false}).limit(1);
    if(error) throw new Error(`Ricerca rapportino: ${error.message}`);
    return data?.[0]||null;
  }

  function makeNumber(pose,date){
    const job=String(pose.job_number||'POSA').replace(/[^a-zA-Z0-9]+/g,'').slice(0,12)||'POSA';
    const token=String(pose.id||'').replace(/-/g,'').slice(0,8).toUpperCase();
    return `RAP-${String(date).replaceAll('-','')}-${job}-${token}`;
  }

  async function ensureLink(reportId,poseId){
    const {data,error}=await sb.from('daily_report_poses').select('report_id').eq('report_id',reportId).eq('pose_id',poseId).limit(1);
    if(error) throw new Error(`Verifica collegamento: ${error.message}`);
    if(data?.length) return;
    const {error:ie}=await sb.from('daily_report_poses').insert({report_id:reportId,pose_id:poseId});
    if(ie) throw new Error(`Creazione collegamento: ${ie.message}`);
  }

  function buildPdf(report,pose){
    if(!window.jspdf?.jsPDF) throw new Error('PDF: libreria jsPDF non caricata');
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    const gold=[201,155,67], black=[33,29,30];
    doc.setDrawColor(...gold); doc.setLineWidth(1.2); doc.line(14,22,196,22);
    doc.setTextColor(...black); doc.setFont('helvetica','bold'); doc.setFontSize(18);
    doc.text('PLANET WINDOWS',14,15);
    doc.setFontSize(15); doc.text('RAPPORTINO DI FINE GIORNATA',14,34);
    let y=44; doc.setFontSize(10);
    const period=pose.scheduled_end_date&&pose.scheduled_end_date!==pose.scheduled_date?`${fmtDate(pose.scheduled_date)} - ${fmtDate(pose.scheduled_end_date)}`:fmtDate(pose.scheduled_date);
    const info=[['Numero',report.report_number||'—'],['Data',fmtDate(report.report_date)],['Commessa',pose.job_number||'—'],['Cliente',pose.client_name||'—'],['Periodo posa',period],['Cantiere',`${pose.address||''}${pose.city?', '+pose.city:''}${pose.postal_code?' '+pose.postal_code:''}`],['Ore lavorate',String(report.hours_worked??'—')]];
    for(const [k,v] of info){
      doc.setFont('helvetica','bold'); doc.text(`${k}:`,14,y);
      doc.setFont('helvetica','normal'); const lines=doc.splitTextToSize(String(v),145); doc.text(lines,45,y); y+=Math.max(7,lines.length*5);
    }
    y+=4;
    const sections=[['COSA È STATO FATTO',report.completed_work],['COSA NON È STATO FATTO / COSA RIMANE',report.remaining_work],['PERCHÉ NON È STATO FATTO',report.not_completed_reason],['PROBLEMI / ANOMALIE RISCONTRATE',report.issues_found],['MATERIALI / NOTE MATERIALI',report.materials_notes],['NOTE FINALI',report.final_notes]];
    for(const [title,text] of sections){
      if(y>258){doc.addPage();y=18}
      doc.setTextColor(...gold); doc.setFont('helvetica','bold'); doc.text(title,14,y); y+=5;
      doc.setTextColor(...black); doc.setFont('helvetica','normal'); const lines=doc.splitTextToSize(String(text||'—'),182); doc.text(lines,14,y); y+=lines.length*5+7;
    }
    if(y>272){doc.addPage();y=18}
    doc.setDrawColor(220,215,208); doc.line(14,y,196,y); y+=6;
    doc.setFontSize(8); doc.setTextColor(100,95,92); doc.text(`PW Posa · Generato ${new Date().toLocaleString('it-IT')}`,14,y);
    const blob=doc.output('blob');
    if(!blob || blob.size < 100) throw new Error('PDF: file generato vuoto');
    return blob;
  }

  async function archivePdf(report,pose){
    const blob=buildPdf(report,pose);
    const path=`poses/${pose.id}/rapportini/${report.id}-${Date.now()}.pdf`;
    const {data:uploadData,error:ue}=await sb.storage.from('pw-posa-documents').upload(path,blob,{contentType:'application/pdf',upsert:false});
    if(ue) throw new Error(`PDF upload Storage: ${ue.message}`);
    if(!uploadData?.path) throw new Error('PDF upload Storage: percorso file non restituito');
    const filename=`${report.report_number||report.id}.pdf`.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const generatedAt=new Date().toISOString();
    const {data,error:de}=await sb.from('daily_reports').update({pdf_storage_path:uploadData.path,pdf_file_name:filename,pdf_generated_at:generatedAt}).eq('id',report.id).select('*').single();
    if(de) throw new Error(`PDF collegamento DB: ${de.message}`);
    if(!data?.pdf_storage_path) throw new Error('PDF collegamento DB: pdf_storage_path non salvato');
    return data;
  }

  async function saveReportFromForm(form){
    const {data:{session}}=await sb.auth.getSession();
    if(!session) throw new Error('Sessione scaduta');
    if(!currentPoseId) throw new Error('Posa non identificata: chiudi e riapri la posa');
    const pose=await getPose(currentPoseId);
    const date=$('reportDate')?.value;
    if(!date) throw new Error('Seleziona la giornata');
    const payload={report_date:date,created_by:session.user.id,team_id:pose.team_id,hours_worked:Number($('reportHours')?.value||0),completed_work:($('reportCompleted')?.value||'').trim(),remaining_work:($('reportRemaining')?.value||'').trim()||null,not_completed_reason:($('reportReason')?.value||'').trim()||null,issues_found:($('reportIssues')?.value||'').trim()||null,materials_notes:($('reportMaterials')?.value||'').trim()||null,final_notes:($('reportNotes')?.value||'').trim()||null,status:'submitted',submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    let report=await getExistingReport(pose.id,date);
    if(report){
      const {data,error}=await sb.from('daily_reports').update(payload).eq('id',report.id).select('*').single();
      if(error) throw new Error(`Rapportino update: ${error.message}`);
      report=data;
    }else{
      const number=makeNumber(pose,date);
      const {data:byNum,error:qe}=await sb.from('daily_reports').select('*').eq('report_number',number).limit(1);
      if(qe) throw new Error(`Rapportino ricerca: ${qe.message}`);
      if(byNum?.length){
        const {data,error}=await sb.from('daily_reports').update(payload).eq('id',byNum[0].id).select('*').single();
        if(error) throw new Error(`Rapportino recupero: ${error.message}`);
        report=data;
      }else{
        const {data,error}=await sb.from('daily_reports').insert({...payload,report_number:number}).select('*').single();
        if(error) throw new Error(`Rapportino insert: ${error.message}`);
        report=data;
      }
    }
    await ensureLink(report.id,pose.id);
    form.dataset.reportId=report.id;
    return {report,pose};
  }

  document.addEventListener('submit',async e=>{
    if(e.target?.id!=='dailyReportForm') return;
    e.preventDefault(); e.stopImmediatePropagation();
    if(busy) return;
    busy=true;
    const form=e.target; const btn=form.querySelector('button[type="submit"]'); const state=$('reportState');
    if(btn){btn.disabled=true;btn.textContent='Salvataggio…'}
    try{
      const {report,pose}=await saveReportFromForm(form);
      if(state) state.textContent=`Rapportino salvato. PDF creato nel browser…`;
      const archived=await archivePdf(report,pose);
      if(state) state.innerHTML=`Rapportino salvato · <span class="pdf-ready">PDF archiviato</span>`;
      toast(`PDF archiviato: ${archived.pdf_file_name||'rapportino.pdf'}`);
      document.dispatchEvent(new CustomEvent('pw:pdf-archived',{detail:{reportId:archived.id,poseId:pose.id}}));
    }catch(err){
      const msg=err?.message||String(err); if(state) state.textContent=msg; toast(msg); console.error('PW Posa report/PDF',err);
    }finally{busy=false;if(btn){btn.disabled=false;btn.textContent='Salva rapportino'}}
  },true);
})();