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
    setTimeout(() => el.classList.remove('show'), 5000);
  };

  async function poseById(id){
    const {data,error} = await sb.from('poses').select('*').eq('id', id).single();
    if(error) throw error;
    return data;
  }

  async function linkedReportForDay(poseId, date){
    const {data:links,error:le} = await sb.from('daily_report_poses').select('report_id').eq('pose_id', poseId);
    if(le) throw le;
    const ids = (links || []).map(x => x.report_id).filter(Boolean);
    if(!ids.length) return null;
    const {data,error} = await sb.from('daily_reports').select('*').in('id', ids).eq('report_date', date).order('created_at',{ascending:false}).limit(1);
    if(error) throw error;
    return data?.[0] || null;
  }

  function numberFor(pose,date){
    const job = String(pose.job_number || 'POSA').replace(/[^a-zA-Z0-9]+/g,'').slice(0,14) || 'POSA';
    const token = String(pose.id || '').replace(/-/g,'').slice(0,8).toUpperCase();
    return `RAP-${String(date).replaceAll('-','')}-${job}-${token}`;
  }

  async function reportByNumber(n){
    const {data,error} = await sb.from('daily_reports').select('*').eq('report_number',n).limit(1);
    if(error) throw error;
    return data?.[0] || null;
  }

  async function ensureLink(reportId,poseId){
    const {data,error} = await sb.from('daily_report_poses').select('report_id').eq('report_id',reportId).eq('pose_id',poseId).limit(1);
    if(error) throw error;
    if(data?.length) return;
    const {error:ie} = await sb.from('daily_report_poses').insert({report_id:reportId,pose_id:poseId});
    if(ie && ie.code !== '23505') throw ie;
  }

  async function makePdf(report,pose){
    if(!window.jspdf?.jsPDF) throw new Error('PDF: libreria jsPDF non disponibile');
    const doc = new window.jspdf.jsPDF({unit:'mm',format:'a4'});
    const gold=[201,155,67], black=[33,29,30];
    doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(14,20,196,20);
    doc.setTextColor(...black); doc.setFont('helvetica','bold'); doc.setFontSize(18);
    doc.text('PLANET WINDOWS - RAPPORTINO DI FINE GIORNATA',14,32);
    let y=44; doc.setFontSize(10);
    const add=(k,v)=>{doc.setFont('helvetica','bold');doc.text(`${k}:`,14,y);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(String(v ?? '—'),145);doc.text(lines,48,y);y+=Math.max(7,lines.length*5);};
    add('Numero',report.report_number); add('Data',report.report_date); add('Commessa',pose.job_number); add('Cliente',pose.client_name); add('Indirizzo',`${pose.address||''}${pose.city?', '+pose.city:''}${pose.postal_code?' '+pose.postal_code:''}`); add('Ore lavorate',report.hours_worked);
    const sections=[['COSA È STATO FATTO',report.completed_work],['COSA NON È STATO FATTO / COSA RIMANE',report.remaining_work],['PERCHÉ NON È STATO FATTO',report.not_completed_reason],['PROBLEMI / ANOMALIE',report.issues_found],['MATERIALI / NOTE',report.materials_notes],['NOTE FINALI',report.final_notes]];
    for(const [title,text] of sections){ if(y>260){doc.addPage();y=20;} doc.setTextColor(...gold);doc.setFont('helvetica','bold');doc.text(title,14,y);y+=5;doc.setTextColor(...black);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(String(text||'—'),182);doc.text(lines,14,y);y+=lines.length*5+8; }
    const blob = doc.output('blob');
    if(!blob || blob.size < 100) throw new Error('PDF: file generato vuoto');
    return blob;
  }

  async function savePdf(report,pose){
    const blob = await makePdf(report,pose);
    const path = `poses/${pose.id}/rapportini/${report.id}.pdf`;
    const {error:ue} = await sb.storage.from('pw-posa-documents').upload(path,blob,{contentType:'application/pdf',upsert:true});
    if(ue) throw new Error(`PDF upload Storage: ${ue.message}`);
    const filename = `${report.report_number || report.id}.pdf`.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const generatedAt = new Date().toISOString();
    const {data,error:de} = await sb.from('daily_reports').update({pdf_storage_path:path,pdf_file_name:filename,pdf_generated_at:generatedAt}).eq('id',report.id).select('*').single();
    if(de) throw new Error(`PDF collegamento DB: ${de.message}`);
    return data;
  }

  async function saveCanonicalReport(pose,date,basePayload){
    const targetNumber = numberFor(pose,date);
    const linked = await linkedReportForDay(pose.id,date);
    const byNumber = await reportByNumber(targetNumber);

    // Se il numero univoco esiste, QUEL record è sempre il canonico.
    // Altrimenti usiamo il record già collegato alla posa/giornata.
    let canonical = byNumber || linked || null;

    if(canonical){
      const payload = {...basePayload};
      // Non riscriviamo mai report_number su un record esistente: evita qualsiasi conflitto UNIQUE.
      const {data,error} = await sb.from('daily_reports').update(payload).eq('id',canonical.id).select('*').single();
      if(error) throw new Error(`Rapportino update: ${error.message}`);
      await ensureLink(data.id,pose.id);
      return data;
    }

    const insertPayload = {...basePayload, report_number:targetNumber};
    let {data,error} = await sb.from('daily_reports').insert(insertPayload).select('*').single();

    // Protezione anche contro race/doppio tap: se nel frattempo qualcuno ha creato lo stesso numero,
    // recuperiamo quel record e lo aggiorniamo invece di fallire.
    if(error && (error.code === '23505' || String(error.message||'').includes('daily_reports_report_number_key'))){
      const existing = await reportByNumber(targetNumber);
      if(!existing) throw new Error(`Rapportino insert: ${error.message}`);
      const retry = await sb.from('daily_reports').update(basePayload).eq('id',existing.id).select('*').single();
      if(retry.error) throw new Error(`Rapportino recupero duplicato: ${retry.error.message}`);
      data = retry.data;
      error = null;
    }
    if(error) throw new Error(`Rapportino insert: ${error.message}`);
    await ensureLink(data.id,pose.id);
    return data;
  }

  async function handleSubmit(e){
    if(e.target?.id !== 'dailyReportForm') return;

    // IMPORTANTE: questo listener è sul document in CAPTURE, quindi blocca prima di tutto
    // i vecchi handler presenti in reports.js. In questo modo esiste UN SOLO salvataggio.
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

      const basePayload = {
        report_date:date,
        created_by:session.user.id,
        team_id:pose.team_id,
        hours_worked:Number($('reportHours')?.value || 0),
        completed_work:($('reportCompleted')?.value || '').trim(),
        remaining_work:($('reportRemaining')?.value || '').trim() || null,
        not_completed_reason:($('reportReason')?.value || '').trim() || null,
        issues_found:($('reportIssues')?.value || '').trim() || null,
        materials_notes:($('reportMaterials')?.value || '').trim() || null,
        final_notes:($('reportNotes')?.value || '').trim() || null,
        status:'submitted',
        submitted_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      };

      const saved = await saveCanonicalReport(pose,date,basePayload);
      form.dataset.reportId=saved.id;

      if(state) state.textContent='Rapportino salvato. Generazione PDF…';
      await savePdf(saved,pose);
      if(state) state.innerHTML='Rapportino salvato · <span class="pdf-ready">PDF archiviato</span>';
      toast('Rapportino salvato e PDF archiviato');
    } catch(err){
      const msg=err?.message || String(err);
      if(state) state.textContent=msg;
      toast(msg);
      console.error('PW Posa authoritative report save',err);
    } finally {
      busy=false;
      if(btn){btn.disabled=false;btn.textContent='Salva rapportino';}
    }
  }

  document.addEventListener('submit',handleSubmit,true);
})();