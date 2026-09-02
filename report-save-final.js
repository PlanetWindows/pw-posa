(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let lastPoseId = null;
  let busy = false;

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-pose]');
    if (el?.dataset.pose) lastPoseId = el.dataset.pose;
  }, true);

  const toast = msg => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 6000);
  };

  async function poseById(id){
    const {data,error} = await sb.from('poses').select('*').eq('id', id).single();
    if(error) throw new Error(`Posa: ${error.message}`);
    return data;
  }

  async function linkedReportForDay(poseId, date){
    const {data:links,error:le} = await sb.from('daily_report_poses').select('report_id').eq('pose_id', poseId);
    if(le) throw new Error(`Collegamento rapportino: ${le.message}`);
    const ids = (links || []).map(x => x.report_id).filter(Boolean);
    if(!ids.length) return null;
    const {data,error} = await sb.from('daily_reports').select('*').in('id', ids).eq('report_date', date).order('created_at',{ascending:false}).limit(1);
    if(error) throw new Error(`Ricerca rapportino: ${error.message}`);
    return data?.[0] || null;
  }

  function uniqueReportNumber(pose,date){
    const job = String(pose.job_number || 'POSA').replace(/[^a-zA-Z0-9]+/g,'').slice(0,12) || 'POSA';
    const poseToken = String(pose.id || '').replace(/-/g,'').slice(0,6).toUpperCase();
    const randomToken = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
      .replace(/[^a-zA-Z0-9]/g,'').slice(-10).toUpperCase();
    return `RAP-${String(date).replaceAll('-','')}-${job}-${poseToken}-${randomToken}`;
  }

  async function ensureLink(reportId,poseId){
    const {data,error} = await sb.from('daily_report_poses').select('report_id').eq('report_id',reportId).eq('pose_id',poseId).limit(1);
    if(error) throw new Error(`Verifica collegamento: ${error.message}`);
    if(data?.length) return;
    const {error:ie} = await sb.from('daily_report_poses').insert({report_id:reportId,pose_id:poseId});
    if(ie && ie.code !== '23505') throw new Error(`Collegamento posa/rapportino: ${ie.message}`);
  }

  async function finalizeReport(reportId){
    const {data,error} = await sb.from('daily_reports')
      .update({status:'submitted',submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq('id',reportId)
      .select('*')
      .single();
    if(error) throw new Error(`Invio rapportino: ${error.message}`);
    return data;
  }

  async function makePdf(report,pose){
    if(!window.jspdf?.jsPDF) throw new Error('PDF: libreria jsPDF non disponibile');
    const doc = new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
    const gold=[201,155,67], black=[33,29,30];
    doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(14,20,196,20);
    doc.setTextColor(...black); doc.setFont('helvetica','bold'); doc.setFontSize(17);
    doc.text('PLANET WINDOWS',14,31);
    doc.setFontSize(15); doc.text('RAPPORTINO DI FINE GIORNATA',14,40);
    let y=51; doc.setFontSize(10);
    const add=(k,v)=>{
      doc.setFont('helvetica','bold'); doc.text(`${k}:`,14,y);
      doc.setFont('helvetica','normal');
      const lines=doc.splitTextToSize(String(v ?? '—'),142);
      doc.text(lines,50,y); y+=Math.max(7,lines.length*5);
    };
    add('Numero',report.report_number);
    add('Data',report.report_date);
    add('Commessa',pose.job_number);
    add('Cliente',pose.client_name);
    add('Indirizzo',`${pose.address||''}${pose.city?', '+pose.city:''}${pose.postal_code?' '+pose.postal_code:''}`);
    add('Ore lavorate',report.hours_worked);

    const sections=[
      ['COSA È STATO FATTO',report.completed_work],
      ['COSA NON È STATO FATTO / COSA RIMANE',report.remaining_work],
      ['PERCHÉ NON È STATO FATTO',report.not_completed_reason],
      ['PROBLEMI / ANOMALIE',report.issues_found],
      ['MATERIALI / NOTE',report.materials_notes],
      ['NOTE FINALI',report.final_notes]
    ];
    for(const [title,text] of sections){
      if(y>258){doc.addPage();y=20;}
      doc.setTextColor(...gold); doc.setFont('helvetica','bold'); doc.text(title,14,y); y+=5;
      doc.setTextColor(...black); doc.setFont('helvetica','normal');
      const lines=doc.splitTextToSize(String(text||'—'),182);
      doc.text(lines,14,y); y+=lines.length*5+8;
    }
    if(y>272){doc.addPage();y=20;}
    doc.setDrawColor(220,215,208); doc.line(14,y,196,y); y+=6;
    doc.setFontSize(8); doc.setTextColor(100,95,92);
    doc.text(`PW Posa · Generato il ${new Date().toLocaleString('it-IT')}`,14,y);

    const blob = doc.output('blob');
    if(!blob || blob.size < 500) throw new Error(`PDF: file generato non valido (${blob?.size || 0} byte)`);
    return blob;
  }

  async function savePdf(report,pose){
    const blob = await makePdf(report,pose);
    const path = `poses/${pose.id}/rapportini/${report.id}-${Date.now()}.pdf`;
    const {data:uploadData,error:ue} = await sb.storage.from('pw-posa-documents').upload(path,blob,{contentType:'application/pdf',upsert:false});
    if(ue) throw new Error(`PDF upload Storage: ${ue.message}`);
    if(!uploadData?.path) throw new Error('PDF upload Storage: nessun percorso restituito');

    const filename = `${report.report_number || report.id}.pdf`.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const generatedAt = new Date().toISOString();
    const {data,error:de} = await sb.from('daily_reports')
      .update({pdf_storage_path:uploadData.path,pdf_file_name:filename,pdf_generated_at:generatedAt})
      .eq('id',report.id).select('*').single();
    if(de) throw new Error(`PDF collegamento DB: ${de.message}`);
    if(!data?.pdf_storage_path) throw new Error('PDF collegamento DB: percorso PDF non salvato');
    return data;
  }

  async function saveCanonicalReport(pose,date,basePayload){
    const existing = await linkedReportForDay(pose.id,date);

    if(existing){
      const {data,error} = await sb.from('daily_reports').update({...basePayload,status:'draft',submitted_at:null}).eq('id',existing.id).select('*').single();
      if(error) throw new Error(`Rapportino update: ${error.message}`);
      await ensureLink(data.id,pose.id);
      return data;
    }

    for(let attempt=0; attempt<3; attempt++){
      const report_number = uniqueReportNumber(pose,date);
      const {data,error} = await sb.from('daily_reports')
        .insert({...basePayload,status:'draft',submitted_at:null,report_number})
        .select('*').single();
      if(!error){
        await ensureLink(data.id,pose.id);
        return data;
      }

      const message = String(error.message || '');
      const isReportNumberDuplicate = error.code === '23505' && message.includes('daily_reports_report_number_key');
      if(isReportNumberDuplicate) continue;

      if(error.code === '23505' && message.includes('daily_reports_report_date_created_by_key')){
        throw new Error('Rapportino insert: vincolo database errato daily_reports_report_date_created_by_key. Esegui la query SQL indicata in chat per rimuoverlo.');
      }

      throw new Error(`Rapportino insert: ${message}`);
    }
    throw new Error('Rapportino insert: impossibile creare un report_number univoco dopo 3 tentativi');
  }

  async function handleSubmit(e){
    if(e.target?.id !== 'dailyReportForm') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(busy) return;
    busy = true;

    const form = e.target;
    const btn=form.querySelector('button[type="submit"]');
    const state=$('reportState');
    if(btn){btn.disabled=true;btn.textContent='Salvataggio…';}

    try{
      const {data:{session}} = await sb.auth.getSession();
      if(!session) throw new Error('Sessione scaduta');

      const poseId = lastPoseId || form.closest('[data-pose-id]')?.dataset.poseId || null;
      if(!poseId) throw new Error('Posa non identificata: chiudi e riapri la posa');
      const pose = await poseById(poseId);
      const date = $('reportDate')?.value;
      if(!date) throw new Error('Seleziona la giornata');

      const completed = ($('reportCompleted')?.value || '').trim();
      if(!completed) throw new Error('Compila "Cosa è stato fatto"');

      const basePayload = {
        report_date:date,
        created_by:session.user.id,
        team_id:pose.team_id,
        hours_worked:Number($('reportHours')?.value || 0),
        completed_work:completed,
        remaining_work:($('reportRemaining')?.value || '').trim() || null,
        not_completed_reason:($('reportReason')?.value || '').trim() || null,
        issues_found:($('reportIssues')?.value || '').trim() || null,
        materials_notes:($('reportMaterials')?.value || '').trim() || null,
        final_notes:($('reportNotes')?.value || '').trim() || null,
        updated_at:new Date().toISOString()
      };

      if(state) state.textContent='1/4 Salvataggio bozza…';
      const draft = await saveCanonicalReport(pose,date,basePayload);
      form.dataset.reportId=draft.id;

      if(state) state.textContent='2/4 Collegamento posa completato…';
      const submitted = await finalizeReport(draft.id);

      if(state) state.textContent='3/4 Creazione PDF leggero…';
      const withPdf = await savePdf(submitted,pose);

      if(state) state.innerHTML=`4/4 Completato · <span class="pdf-ready">PDF archiviato</span>`;
      form.dataset.reportId=withPdf.id;
      toast('Rapportino salvato e PDF archiviato');
    } catch(err){
      const msg=err?.message || String(err);
      if(state) state.textContent=`ERRORE: ${msg}`;
      toast(msg);
      console.error('PW Posa report/PDF',err);
    } finally {
      busy=false;
      if(btn){btn.disabled=false;btn.textContent='Salva rapportino';}
    }
  }

  document.addEventListener('submit',handleSubmit,true);
})();