(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return;

  const sbReports = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);
  let currentPoseId = null;
  let currentProfile = null;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const fmtDate = (v) => { if(!v) return "—"; const [y,m,d]=String(v).split("-"); return `${d}/${m}/${y}`; };
  const todayIso = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const toast = (msg) => {
    const el=$("toast");
    if(!el) return;
    el.textContent=msg;
    el.classList.add("show");
    setTimeout(()=>el.classList.remove("show"),3000);
  };

  async function getProfile(){
    if(currentProfile) return currentProfile;
    const {data:{session}}=await sbReports.auth.getSession();
    if(!session) return null;
    const {data,error}=await sbReports.from("profiles").select("*").eq("id",session.user.id).single();
    if(error) throw error;
    currentProfile=data;
    return data;
  }

  async function getPose(poseId){
    const {data,error}=await sbReports.from("poses").select("*").eq("id",poseId).single();
    if(error) throw error;
    return data;
  }

  async function findReportForDay(poseId, reportDate){
    const {data:links,error:linkError}=await sbReports.from("daily_report_poses").select("report_id").eq("pose_id",poseId);
    if(linkError) throw linkError;
    const ids=(links||[]).map(x=>x.report_id).filter(Boolean);
    if(!ids.length) return null;
    const {data,error}=await sbReports.from("daily_reports").select("*").in("id",ids).eq("report_date",reportDate).order("created_at",{ascending:false}).limit(1);
    if(error) throw error;
    return data?.[0] || null;
  }

  function makeReportNumber(pose, reportDate){
    const job=String(pose.job_number||"POSA").replace(/[^a-zA-Z0-9]+/g,"").slice(0,14) || "POSA";
    const poseToken=String(pose.id||"").replace(/-/g,"").slice(0,8).toUpperCase();
    return `RAP-${String(reportDate).replaceAll("-","")}-${job}-${poseToken}`;
  }

  async function findReportByNumber(reportNumber){
    const {data,error}=await sbReports.from("daily_reports").select("*").eq("report_number",reportNumber).limit(1);
    if(error) throw error;
    return data?.[0] || null;
  }

  async function ensureReportLink(reportId,poseId){
    const {data,error}=await sbReports.from("daily_report_poses").select("report_id,pose_id").eq("report_id",reportId).eq("pose_id",poseId).limit(1);
    if(error) throw error;
    if(data?.length) return;
    const {error:insertError}=await sbReports.from("daily_report_poses").insert({report_id:reportId,pose_id:poseId});
    if(insertError) throw insertError;
  }

  async function logoDataUrl(){
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{
        try{
          const canvas=document.createElement("canvas");
          const ratio=img.naturalWidth/img.naturalHeight||3;
          canvas.width=900;
          canvas.height=Math.max(180,Math.round(900/ratio));
          const ctx=canvas.getContext("2d");
          ctx.fillStyle="#fff";
          ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/png"));
        }catch(_){ resolve(null); }
      };
      img.onerror=()=>resolve(null);
      img.src="logo_planet.svg?v=report-pdf4";
    });
  }

  async function buildPdfBlob(report,pose){
    if(!window.jspdf?.jsPDF) throw new Error("Modulo PDF non disponibile");
    const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"});
    const gold=[201,155,67], black=[33,29,30];
    const logo=await logoDataUrl();
    if(logo) doc.addImage(logo,"PNG",14,10,55,18);
    doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(14,34,196,34);
    doc.setTextColor(...black); doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.text("RAPPORTINO DI FINE GIORNATA",14,45);
    doc.setFontSize(10); doc.setFont("helvetica","normal");
    const period=pose?.scheduled_end_date && pose.scheduled_end_date!==pose.scheduled_date ? `${fmtDate(pose.scheduled_date)} - ${fmtDate(pose.scheduled_end_date)}` : fmtDate(pose?.scheduled_date);
    const info=[
      ["Numero",report.report_number||"—"],["Data rapportino",fmtDate(report.report_date)],["Commessa",pose?.job_number||"—"],["Cliente",pose?.client_name||"—"],
      ["Periodo posa",period],["Cantiere",pose?`${pose.address||""}${pose.city?", "+pose.city:""}${pose.postal_code?" "+pose.postal_code:""}`:"—"],["Ore lavorate",String(report.hours_worked??"—")],["Stato",report.status||"—"]
    ];
    let y=54;
    for(const [k,v] of info){
      doc.setFont("helvetica","bold"); doc.text(`${k}:`,14,y);
      doc.setFont("helvetica","normal");
      const lines=doc.splitTextToSize(String(v),145);
      doc.text(lines,45,y); y+=Math.max(7,lines.length*5);
    }
    y+=3;
    const sections=[
      ["COSA È STATO FATTO",report.completed_work],
      ["COSA NON È STATO FATTO / COSA RIMANE",report.remaining_work],
      ["PERCHÉ NON È STATO FATTO",report.not_completed_reason],
      ["PROBLEMI / ANOMALIE RISCONTRATE",report.issues_found],
      ["MATERIALI / NOTE MATERIALI",report.materials_notes],
      ["NOTE FINALI",report.final_notes]
    ];
    for(const [title,text] of sections){
      if(y>265){ doc.addPage(); y=18; }
      doc.setTextColor(...gold); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text(title,14,y); y+=5;
      doc.setTextColor(...black); doc.setFont("helvetica","normal");
      const lines=doc.splitTextToSize(String(text||"—"),182);
      doc.text(lines,14,y); y+=lines.length*5+7;
    }
    if(y>272){doc.addPage();y=18;}
    doc.setDrawColor(220,215,208); doc.line(14,y,196,y); y+=6;
    doc.setFontSize(8); doc.setTextColor(100,95,92);
    doc.text(`PW Posa · Documento generato il ${new Date().toLocaleString("it-IT")}`,14,y);
    return doc.output("blob");
  }

  async function persistPdf(report,pose){
    const blob=await buildPdfBlob(report,pose);
    const filename=`${report.report_number||report.id}.pdf`.replace(/[^a-zA-Z0-9._-]+/g,"-");
    const path=report.pdf_storage_path || `poses/${pose.id}/rapportini/${report.id}.pdf`;
    const {error:uploadError}=await sbReports.storage.from("pw-posa-documents").upload(path,blob,{contentType:"application/pdf",upsert:true});
    if(uploadError) throw new Error(`PDF non archiviato: ${uploadError.message}`);
    const generatedAt=new Date().toISOString();
    const {error:updateError}=await sbReports.from("daily_reports").update({pdf_storage_path:path,pdf_file_name:filename,pdf_generated_at:generatedAt}).eq("id",report.id);
    if(updateError) throw new Error(`PDF caricato ma collegamento non salvato: ${updateError.message}`);
    return {path,filename,generatedAt};
  }

  async function openStoredPdf(reportId){
    const {data:report,error}=await sbReports.from("daily_reports").select("id,pdf_storage_path").eq("id",reportId).single();
    if(error) throw error;
    if(!report.pdf_storage_path) throw new Error("PDF non ancora archiviato per questo rapportino");
    const {data,error:urlError}=await sbReports.storage.from("pw-posa-documents").createSignedUrl(report.pdf_storage_path,300);
    if(urlError) throw urlError;
    window.open(data.signedUrl,"_blank","noopener");
  }

  async function injectDailyReport(poseId){
    const detail=$("detailContent");
    const dialog=$("detailDialog");
    if(!detail || !dialog?.open) return;
    const profile=await getProfile();
    if(profile?.role!=="installer") return;
    if($("dailyReportSection")) return;

    const pose=await getPose(poseId);
    const wrap=document.createElement("div");
    wrap.id="dailyReportSection";
    wrap.className="daily-report-wrap";
    wrap.innerHTML=`
      <div class="report-card">
        <div class="report-card-head">
          <div><div class="eyebrow">FINE GIORNATA</div><h4>Rapportino giornaliero</h4></div>
          <span class="badge orange">${esc(pose.job_number)}</span>
        </div>
        <div class="report-destination"><strong>Dove va:</strong> ${esc(pose.address)}${pose.city?`, ${esc(pose.city)}`:""}${pose.postal_code?` ${esc(pose.postal_code)}`:""}</div>
        <form id="dailyReportForm" class="report-form">
          <div class="report-grid">
            <label>Giornata *<input id="reportDate" type="date" required value="${todayIso()}"></label>
            <label>Ore lavorate *<input id="reportHours" type="number" min="0" max="24" step="0.25" required placeholder="Es. 8"></label>
            <label class="span2">Cosa è stato fatto *<textarea id="reportCompleted" rows="4" required placeholder="Descrivi le attività completate..."></textarea></label>
            <label class="span2">Cosa non è stato fatto / cosa rimane<textarea id="reportRemaining" rows="3" placeholder="Indica ciò che resta da completare..."></textarea></label>
            <label class="span2">Perché non è stato fatto<textarea id="reportReason" rows="3" placeholder="Motivo del mancato completamento..."></textarea></label>
            <label class="span2">Problemi / anomalie riscontrate<textarea id="reportIssues" rows="3" placeholder="Problemi, non conformità o imprevisti..."></textarea></label>
            <label class="span2">Materiali mancanti, danneggiati o note materiali<textarea id="reportMaterials" rows="3"></textarea></label>
            <label class="span2">Note finali<textarea id="reportNotes" rows="3"></textarea></label>
          </div>
          <div class="report-actions">
            <span id="reportState" class="muted"></span>
            <button class="btn primary" type="submit">Salva rapportino</button>
          </div>
        </form>
      </div>`;
    detail.appendChild(wrap);

    const dateInput=$("reportDate");
    async function loadExisting(){
      try{
        const r=await findReportForDay(poseId,dateInput.value);
        $("reportHours").value=r?.hours_worked ?? "";
        $("reportCompleted").value=r?.completed_work ?? "";
        $("reportRemaining").value=r?.remaining_work ?? "";
        $("reportReason").value=r?.not_completed_reason ?? "";
        $("reportIssues").value=r?.issues_found ?? "";
        $("reportMaterials").value=r?.materials_notes ?? "";
        $("reportNotes").value=r?.final_notes ?? "";
        $("reportState").innerHTML=r ? `Rapportino già salvato${r.pdf_storage_path?' · <span class="pdf-ready">PDF archiviato</span>':" · PDF da generare"}` : "Nuovo rapportino";
        $("dailyReportForm").dataset.reportId=r?.id||"";
      }catch(err){ $("reportState").textContent=err.message; }
    }
    await loadExisting();
    dateInput.addEventListener("change",loadExisting);

    $("dailyReportForm").addEventListener("submit",async(e)=>{
      e.preventDefault();
      const form=e.currentTarget;
      if(form.dataset.saving==="1") return;
      form.dataset.saving="1";
      const btn=form.querySelector('button[type="submit"]');
      if(btn){btn.disabled=true;btn.textContent="Salvataggio…";}
      try{
        const {data:{session}}=await sbReports.auth.getSession();
        if(!session) throw new Error("Sessione scaduta");
        const reportDate=$("reportDate").value;
        const reportNumber=makeReportNumber(pose,reportDate);
        const payload={
          report_date:reportDate, created_by:session.user.id, team_id:pose.team_id,
          hours_worked:Number($("reportHours").value), completed_work:$("reportCompleted").value.trim(),
          remaining_work:$("reportRemaining").value.trim()||null, not_completed_reason:$("reportReason").value.trim()||null,
          issues_found:$("reportIssues").value.trim()||null, materials_notes:$("reportMaterials").value.trim()||null,
          final_notes:$("reportNotes").value.trim()||null, status:"submitted", submitted_at:new Date().toISOString(),
          updated_at:new Date().toISOString(), report_number:reportNumber
        };

        let saved=null;
        let reportId=form.dataset.reportId||"";

        if(!reportId){
          const alreadyForDay=await findReportForDay(pose.id,reportDate);
          if(alreadyForDay){
            reportId=alreadyForDay.id;
            form.dataset.reportId=reportId;
          }
        }

        if(!reportId){
          const orphanOrExisting=await findReportByNumber(reportNumber);
          if(orphanOrExisting){
            reportId=orphanOrExisting.id;
            form.dataset.reportId=reportId;
            await ensureReportLink(reportId,pose.id);
          }
        }

        if(reportId){
          const {data,error}=await sbReports.from("daily_reports").update(payload).eq("id",reportId).select("*").single();
          if(error) throw error;
          saved=data;
          await ensureReportLink(saved.id,pose.id);
        }else{
          let {data,error}=await sbReports.from("daily_reports").insert(payload).select("*").single();
          if(error && (error.code==="23505" || String(error.message||"").includes("daily_reports_report_number_key"))){
            const existing=await findReportByNumber(reportNumber);
            if(!existing) throw error;
            const retry=await sbReports.from("daily_reports").update(payload).eq("id",existing.id).select("*").single();
            if(retry.error) throw retry.error;
            data=retry.data;
            error=null;
          }
          if(error) throw error;
          saved=data;
          form.dataset.reportId=saved.id;
          await ensureReportLink(saved.id,pose.id);
        }

        $("reportState").textContent="Rapportino salvato. Generazione PDF…";
        const pdf=await persistPdf(saved,pose);
        saved={...saved,pdf_storage_path:pdf.path,pdf_file_name:pdf.filename,pdf_generated_at:pdf.generatedAt};
        $("reportState").innerHTML='Rapportino salvato · <span class="pdf-ready">PDF archiviato</span>';
        toast("Rapportino salvato e PDF archiviato");
      }catch(err){
        $("reportState").textContent=err.message;
        toast(err.message);
      }finally{
        form.dataset.saving="0";
        if(btn){btn.disabled=false;btn.textContent="Salva rapportino";}
      }
    });
  }

  async function loadDocuments(){
    const {data:links,error:linkError}=await sbReports.from("daily_report_poses").select("report_id,pose_id");
    if(linkError) throw linkError;
    if(!links?.length) return [];
    const reportIds=[...new Set(links.map(x=>x.report_id).filter(Boolean))];
    const poseIds=[...new Set(links.map(x=>x.pose_id).filter(Boolean))];
    const [{data:reports,error:reportError},{data:poses,error:poseError}]=await Promise.all([
      sbReports.from("daily_reports").select("*").in("id",reportIds).order("report_date",{ascending:false}),
      sbReports.from("poses").select("*").in("id",poseIds)
    ]);
    if(reportError) throw reportError;
    if(poseError) throw poseError;
    const poseMap=new Map((poses||[]).map(p=>[p.id,p]));
    const linkMap=new Map();
    (links||[]).forEach(l=>{ if(!linkMap.has(l.report_id)) linkMap.set(l.report_id,l.pose_id); });
    return (reports||[]).map(r=>({report:r,pose:poseMap.get(linkMap.get(r.id))||null}));
  }

  async function regeneratePdf(reportId,poseId){
    const [{data:r,error:re},{data:p,error:pe}]=await Promise.all([
      sbReports.from("daily_reports").select("*").eq("id",reportId).single(),
      sbReports.from("poses").select("*").eq("id",poseId).single()
    ]);
    if(re) throw re;
    if(pe) throw pe;
    await persistPdf(r,p);
  }

  async function renderDocuments(){
    const content=$("content");
    if(!content) return;
    $("pageTitle").textContent="Documenti";
    content.innerHTML=`<div class="panel"><div class="panel-head"><h3>Documenti</h3><span class="muted">Caricamento…</span></div></div>`;
    try{
      const items=await loadDocuments();
      content.innerHTML=`
        <div class="panel documents-panel">
          <div class="panel-head"><div><div class="eyebrow">DOCUMENTI</div><h3>Rapportini archiviati</h3></div><span>${items.filter(x=>x.report.pdf_storage_path).length} PDF</span></div>
          ${items.length?`<div class="documents-list">${items.map(({report:r,pose:p},i)=>`
            <div class="document-row">
              <div class="document-icon">PDF</div>
              <div class="document-main"><strong>${esc(r.report_number||`Rapportino ${i+1}`)}</strong><span>${esc(fmtDate(r.report_date))} · ${esc(p?.job_number||"Commessa")}${p?.client_name?` · ${esc(p.client_name)}`:""}</span></div>
              <span class="badge orange">${r.pdf_storage_path?'Archiviato':'PDF mancante'}</span>
              ${r.pdf_storage_path?`<button class="btn ghost" data-report-pdf="${esc(r.id)}">Apri PDF</button>`:`<button class="btn ghost" data-generate-pdf="${esc(r.id)}" data-pose-id="${esc(p?.id||'')}">Genera PDF</button>`}
            </div>`).join("")}</div>`:`<div class="empty">Nessun rapportino presente.</div>`}
        </div>`;
      content.querySelectorAll("[data-report-pdf]").forEach(btn=>btn.addEventListener("click",async()=>{try{await openStoredPdf(btn.dataset.reportPdf)}catch(err){toast(err.message)}}));
      content.querySelectorAll("[data-generate-pdf]").forEach(btn=>btn.addEventListener("click",async()=>{
        const old=btn.textContent; btn.disabled=true; btn.textContent="Generazione…";
        try{
          await regeneratePdf(btn.dataset.generatePdf,btn.dataset.poseId);
          toast("PDF archiviato");
          await renderDocuments();
        }catch(err){
          toast(err.message); btn.disabled=false; btn.textContent=old;
        }
      }));
    }catch(err){ content.innerHTML=`<div class="panel"><div class="empty">${esc(err.message)}</div></div>`; }
  }

  document.addEventListener("click",(e)=>{
    const poseEl=e.target.closest("[data-pose]");
    if(poseEl){ currentPoseId=poseEl.dataset.pose; setTimeout(()=>injectDailyReport(currentPoseId).catch(err=>console.warn(err)),180); }
    const nav=e.target.closest('.nav-item[data-view="documents"]');
    if(nav){ setTimeout(()=>renderDocuments(),0); }
  });

  const detailDialog=$("detailDialog");
  if(detailDialog){
    new MutationObserver(()=>{
      if(detailDialog.open && currentPoseId) setTimeout(()=>injectDailyReport(currentPoseId).catch(err=>console.warn(err)),80);
    }).observe(detailDialog,{attributes:true,attributeFilter:["open"]});
  }
})();