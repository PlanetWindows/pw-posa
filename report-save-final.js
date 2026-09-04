(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let lastPoseId = null, busy = false;

  document.addEventListener('click', e => { const el=e.target.closest('[data-pose]'); if(el?.dataset.pose) lastPoseId=el.dataset.pose; }, true);
  const toast = msg => { const el=$('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),6000); };
  const fmt = v => { if(!v)return '—'; const [y,m,d]=String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; };
  const imgData = src => new Promise(resolve=>{ const img=new Image(); img.onload=()=>{ try{ const c=document.createElement('canvas'), ratio=img.naturalWidth/img.naturalHeight||3; c.width=900; c.height=Math.max(180,Math.round(900/ratio)); const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height); g.drawImage(img,0,0,c.width,c.height); resolve(c.toDataURL('image/png')); }catch{resolve(null)} }; img.onerror=()=>resolve(null); img.src=src; });

  async function poseById(id){ const {data,error}=await sb.from('poses').select('*').eq('id',id).single(); if(error)throw new Error(`Posa: ${error.message}`); return data; }
  async function linkedReportForDay(poseId,date){ const {data:links,error:le}=await sb.from('daily_report_poses').select('report_id').eq('pose_id',poseId); if(le)throw new Error(`Collegamento rapportino: ${le.message}`); const ids=(links||[]).map(x=>x.report_id).filter(Boolean); if(!ids.length)return null; const {data,error}=await sb.from('daily_reports').select('*').in('id',ids).eq('report_date',date).order('created_at',{ascending:false}).limit(1); if(error)throw new Error(`Ricerca rapportino: ${error.message}`); return data?.[0]||null; }
  function uniqueReportNumber(pose,date){ const job=String(pose.job_number||'POSA').replace(/[^a-zA-Z0-9]+/g,'').slice(0,12)||'POSA'; const poseToken=String(pose.id||'').replace(/-/g,'').slice(0,6).toUpperCase(); const randomToken=(window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9]/g,'').slice(-10).toUpperCase(); return `RAP-${String(date).replaceAll('-','')}-${job}-${poseToken}-${randomToken}`; }
  async function ensureLink(reportId,poseId){ const {data,error}=await sb.from('daily_report_poses').select('report_id').eq('report_id',reportId).eq('pose_id',poseId).limit(1); if(error)throw new Error(`Verifica collegamento: ${error.message}`); if(data?.length)return; const {error:ie}=await sb.from('daily_report_poses').insert({report_id:reportId,pose_id:poseId}); if(ie&&ie.code!=='23505')throw new Error(`Collegamento posa/rapportino: ${ie.message}`); }

  async function makePdf(report,pose){
    if(!window.jspdf?.jsPDF) throw new Error('PDF: libreria jsPDF non disponibile');
    const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
    const gold=[210,171,103], black=[35,31,32], muted=[102,97,92], line=[219,209,189], soft=[252,251,247];
    const left=14,right=196,width=182;
    const logo=await imgData('logo_planet.svg?v=single-pose-report1');
    if(logo) doc.addImage(logo,'PNG',14,8,58,18);
    doc.setDrawColor(...gold); doc.setLineWidth(.8); doc.line(left,32,right,32);
    doc.setTextColor(...black); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text('RAPPORTINO DI FINE GIORNATA',left,43);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...muted); doc.text(`Numero: ${report.report_number||'—'}`,left,49);
    let y=57;
    const newPage=()=>{ doc.addPage(); doc.setDrawColor(...gold); doc.setLineWidth(.7); doc.line(left,16,right,16); y=24; };
    const ensure=n=>{ if(y+n>278)newPage(); };
    const textLines=(v,w=122)=>doc.splitTextToSize(String(v||'—'),w);
    const row=(k,v)=>{ const ls=textLines(v,125),h=Math.max(10,ls.length*4.5+5); ensure(h); doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...black); doc.text(`${k}:`,left,y); doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.text(ls,left+41,y); doc.setDrawColor(...line); doc.line(left,y+4+Math.max(0,(ls.length-1)*4.5),right,y+4+Math.max(0,(ls.length-1)*4.5)); y+=h; };
    const block=(title,text,minH=20)=>{ const ls=textLines(text,170),h=Math.max(minH,10+ls.length*4.7); ensure(h+5); doc.setFillColor(...soft); doc.setDrawColor(...line); doc.setLineWidth(.3); doc.roundedRect(left,y,width,h,1.5,1.5,'FD'); doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...gold); doc.text(title.toUpperCase(),left+4,y+7); doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.setTextColor(...black); doc.text(ls,left+4,y+14); y+=h+5; };

    row('Data rapportino',fmt(report.report_date));
    row('Commessa',pose.job_number);
    row('Cliente',pose.client_name);
    row('Cantiere',[pose.address,pose.city,pose.postal_code].filter(Boolean).join(', '));
    row('Ore lavorate',String(report.hours_worked??'—'));
    y+=2;
    block('Descrizione',report.completed_work,23);
    const unfinished=!!(report.issues_found||report.materials_notes);
    row('Il lavoro è stato finito?',unfinished?'NO':'SI');
    if(unfinished){ block('Non conformità',report.issues_found,20); block('Materiali mancanti',report.materials_notes,20); }
    block('Note finali',report.final_notes,20);

    ensure(48);
    doc.setDrawColor(...gold); doc.setLineWidth(.35); doc.rect(left,y,width,42);
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...gold); doc.text('FIRMA POSATORE',left+4,y+7);
    const sig=await imgData('signature-angelo.svg?v=1');
    if(sig) doc.addImage(sig,'PNG',left+4,y+10,55,23); else { doc.setTextColor(...black); doc.setFontSize(13); doc.text('Angelo Idone',left+4,y+23); }
    doc.setTextColor(...black); doc.setFontSize(10); doc.text('Angelo Idone',left+70,y+18);
    const dt=new Date(`${report.report_date}T12:00:00`), giorno=dt.toLocaleDateString('it-IT',{weekday:'long'});
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...muted); doc.text(`${giorno.charAt(0).toUpperCase()+giorno.slice(1)} · ${fmt(report.report_date)}`,left+70,y+25);

    const pages=doc.getNumberOfPages();
    for(let p=1;p<=pages;p++){ doc.setPage(p); doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...muted); doc.text(`PW Posa · Documento generato il ${new Date().toLocaleString('it-IT')}`,left,289); }
    const blob=doc.output('blob'); if(!blob||blob.size<500)throw new Error(`PDF: file generato non valido (${blob?.size||0} byte)`); return blob;
  }

  async function uploadPdfWhileDraft(report,pose){ const blob=await makePdf(report,pose); const path=`poses/${pose.id}/rapportini/${report.id}.pdf`; const {data:uploadData,error:ue}=await sb.storage.from('pw-posa-documents').upload(path,blob,{contentType:'application/pdf',upsert:true}); if(ue)throw new Error(`PDF upload Storage: ${ue.message}`); if(!uploadData?.path)throw new Error('PDF upload Storage: nessun percorso restituito'); const {data:checkBlob,error:checkErr}=await sb.storage.from('pw-posa-documents').download(path); if(checkErr||!checkBlob||checkBlob.size<500)throw new Error(`PDF verifica Storage: ${checkErr?.message||'file non trovato dopo upload'}`); const filename=`${report.report_number||report.id}.pdf`.replace(/[^a-zA-Z0-9._-]+/g,'-'); const patch={pdf_storage_path:path,pdf_file_name:filename,pdf_generated_at:new Date().toISOString(),updated_at:new Date().toISOString()}; const {error:de}=await sb.from('daily_reports').update(patch).eq('id',report.id); if(de)console.warn('PW Posa: PDF nello Storage ma percorso DB non aggiornato',de); return {...report,...patch}; }
  async function finalizeReport(report){ const patch={status:'submitted',submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()}; const {error}=await sb.from('daily_reports').update(patch).eq('id',report.id); if(error)throw new Error(`Invio rapportino: ${error.message}`); return {...report,...patch}; }
  async function saveCanonicalReport(pose,date,basePayload){ const existing=await linkedReportForDay(pose.id,date); if(existing){ const {data,error}=await sb.from('daily_reports').update({...basePayload,status:'draft',submitted_at:null}).eq('id',existing.id).select('*').maybeSingle(); if(error)throw new Error(`Rapportino update: ${error.message}`); const result=data||{...existing,...basePayload,status:'draft',submitted_at:null}; await ensureLink(result.id,pose.id); return result; } for(let attempt=0;attempt<3;attempt++){ const report_number=uniqueReportNumber(pose,date); const {data,error}=await sb.from('daily_reports').insert({...basePayload,status:'draft',submitted_at:null,report_number}).select('*').single(); if(!error){await ensureLink(data.id,pose.id);return data;} const message=String(error.message||''); if(error.code==='23505'&&message.includes('daily_reports_report_number_key'))continue; throw new Error(`Rapportino insert: ${message}`); } throw new Error('Rapportino insert: impossibile creare un report_number univoco dopo 3 tentativi'); }

  async function handleSubmit(e){ if(e.target?.id!=='dailyReportForm')return; e.preventDefault(); e.stopImmediatePropagation(); if(busy)return; busy=true; const form=e.target,btn=form.querySelector('button[type="submit"]'),state=$('reportState'); if(btn){btn.disabled=true;btn.textContent='Salvataggio…';} try{ const {data:{session}}=await sb.auth.getSession(); if(!session)throw new Error('Sessione scaduta'); const poseId=lastPoseId||form.closest('[data-pose-id]')?.dataset.poseId||null; if(!poseId)throw new Error('Posa non identificata: chiudi e riapri la posa'); const pose=await poseById(poseId),date=$('reportDate')?.value; if(!date)throw new Error('Seleziona la giornata'); const completed=($('reportCompleted')?.value||'').trim(); if(!completed)throw new Error('Compila la descrizione'); const basePayload={report_date:date,created_by:session.user.id,team_id:pose.team_id,hours_worked:Number($('reportHours')?.value||0),completed_work:completed,remaining_work:null,not_completed_reason:null,issues_found:($('reportIssues')?.value||'').trim()||null,materials_notes:($('reportMaterials')?.value||'').trim()||null,final_notes:($('reportNotes')?.value||'').trim()||null,updated_at:new Date().toISOString()}; if(state)state.textContent='1/4 Salvataggio bozza…'; const draft=await saveCanonicalReport(pose,date,basePayload); form.dataset.reportId=draft.id; if(state)state.textContent='2/4 Creazione e verifica PDF…'; const withPdf=await uploadPdfWhileDraft(draft,pose); if(state)state.textContent='3/4 Chiusura rapportino…'; const submitted=await finalizeReport(withPdf); if(state)state.innerHTML='4/4 Completato · <span class="pdf-ready">PDF verificato e archiviato</span>'; form.dataset.reportId=submitted.id; toast('PDF verificato nello Storage e rapportino salvato'); window.dispatchEvent(new CustomEvent('pwposa:pdf-saved',{detail:{reportId:submitted.id,poseId:pose.id,path:withPdf.pdf_storage_path}})); }catch(err){const msg=err?.message||String(err);if(state)state.textContent=`ERRORE: ${msg}`;toast(msg);console.error('PW Posa report/PDF',err);} finally{busy=false;if(btn){btn.disabled=false;btn.textContent='Salva rapportino';}} }
  document.addEventListener('submit',handleSubmit,true);
})();