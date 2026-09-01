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
    setTimeout(()=>el.classList.remove("show"),2600);
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
        $("reportState").textContent=r ? `Rapportino già salvato · ${r.status||"registrato"}` : "Nuovo rapportino";
        $("dailyReportForm").dataset.reportId=r?.id||"";
      }catch(err){ $("reportState").textContent=err.message; }
    }
    await loadExisting();
    dateInput.addEventListener("change",loadExisting);

    $("dailyReportForm").addEventListener("submit",async(e)=>{
      e.preventDefault();
      const {data:{session}}=await sbReports.auth.getSession();
      if(!session) return toast("Sessione scaduta");
      const reportId=e.currentTarget.dataset.reportId;
      const reportDate=$("reportDate").value;
      const payload={
        report_date:reportDate,
        created_by:session.user.id,
        team_id:pose.team_id,
        hours_worked:Number($("reportHours").value),
        completed_work:$("reportCompleted").value.trim(),
        remaining_work:$("reportRemaining").value.trim()||null,
        not_completed_reason:$("reportReason").value.trim()||null,
        issues_found:$("reportIssues").value.trim()||null,
        materials_notes:$("reportMaterials").value.trim()||null,
        final_notes:$("reportNotes").value.trim()||null,
        status:"submitted",
        submitted_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
        report_number:`RAP-${reportDate.replaceAll('-','')}-${String(pose.job_number||'POSA').replace(/\s+/g,'').slice(0,18)}`
      };
      let saved;
      let error;
      if(reportId){
        ({data:saved,error}=await sbReports.from("daily_reports").update(payload).eq("id",reportId).select("*").single());
      }else{
        ({data:saved,error}=await sbReports.from("daily_reports").insert(payload).select("*").single());
      }
      if(error){ toast(error.message); return; }
      if(!reportId){
        const {error:linkError}=await sbReports.from("daily_report_poses").insert({report_id:saved.id,pose_id:pose.id});
        if(linkError){ toast(linkError.message); return; }
        e.currentTarget.dataset.reportId=saved.id;
      }
      $("reportState").textContent="Rapportino salvato";
      toast("Rapportino salvato");
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

  async function renderDocuments(){
    const content=$("content");
    if(!content) return;
    $("pageTitle").textContent="Documenti";
    content.innerHTML=`<div class="panel"><div class="panel-head"><h3>Documenti</h3><span class="muted">Caricamento…</span></div></div>`;
    try{
      const items=await loadDocuments();
      content.innerHTML=`
        <div class="panel documents-panel">
          <div class="panel-head"><div><div class="eyebrow">ARCHIVIO</div><h3>Documenti</h3></div><span>${items.length} documenti</span></div>
          ${items.length?`<div class="documents-list">${items.map(({report:r,pose:p},i)=>`
            <div class="document-row">
              <div class="document-icon">PDF</div>
              <div class="document-main">
                <strong>${esc(r.report_number||`Rapportino ${i+1}`)}</strong>
                <span>${esc(fmtDate(r.report_date))} · ${esc(p?.job_number||"Commessa")}${p?.client_name?` · ${esc(p.client_name)}`:""}</span>
              </div>
              <span class="badge orange">${esc(r.status||"registrato")}</span>
              <button class="btn ghost" data-report-pdf="${esc(r.id)}">Apri PDF</button>
            </div>`).join("")}</div>`:`<div class="empty">Nessun rapportino presente.</div>`}
        </div>`;
      content.querySelectorAll("[data-report-pdf]").forEach(btn=>btn.addEventListener("click",()=>generatePdf(btn.dataset.reportPdf)));
    }catch(err){
      content.innerHTML=`<div class="panel"><div class="empty">${esc(err.message)}</div></div>`;
    }
  }

  async function logoDataUrl(){
    return new Promise((resolve)=>{
      const img=new Image();
      img.onload=()=>{
        try{
          const canvas=document.createElement("canvas");
          const ratio=img.naturalWidth/img.naturalHeight||3;
          canvas.width=900; canvas.height=Math.max(180,Math.round(900/ratio));
          const ctx=canvas.getContext("2d");
          ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/png"));
        }catch(_){ resolve(null); }
      };
      img.onerror=()=>resolve(null);
      img.src="logo_planet.svg?v=pdf1";
    });
  }

  async function generatePdf(reportId){
    if(!window.jspdf?.jsPDF) return toast("Modulo PDF non disponibile");
    try{
      const items=await loadDocuments();
      const item=items.find(x=>x.report.id===reportId);
      if(!item) return toast("Rapportino non trovato");
      const {report:r,pose:p}=item;
      const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"});
      const gold=[201,155,67], black=[33,29,30];
      const logo=await logoDataUrl();
      if(logo) doc.addImage(logo,"PNG",14,10,55,18);
      doc.setDrawColor(...gold); doc.setLineWidth(1); doc.line(14,34,196,34);
      doc.setTextColor(...black); doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.text("RAPPORTINO DI FINE GIORNATA",14,45);
      doc.setFontSize(10); doc.setFont("helvetica","normal");
      const info=[
        [`Numero`,r.report_number||"—"],[`Data`,fmtDate(r.report_date)],[`Commessa`,p?.job_number||"—"],[`Cliente`,p?.client_name||"—"],
        [`Cantiere`,p?`${p.address||""}${p.city?", "+p.city:""}${p.postal_code?" "+p.postal_code:""}`:"—"],[`Ore lavorate`,String(r.hours_worked??"—")],[`Stato`,r.status||"—"]
      ];
      let y=54;
      info.forEach(([k,v])=>{ doc.setFont("helvetica","bold"); doc.text(`${k}:`,14,y); doc.setFont("helvetica","normal"); doc.text(String(v),45,y,{maxWidth:145}); y+=7; });
      y+=3;
      const sections=[
        ["COSA È STATO FATTO",r.completed_work],
        ["COSA NON È STATO FATTO / COSA RIMANE",r.remaining_work],
        ["PERCHÉ NON È STATO FATTO",r.not_completed_reason],
        ["PROBLEMI / ANOMALIE RISCONTRATE",r.issues_found],
        ["MATERIALI / NOTE MATERIALI",r.materials_notes],
        ["NOTE FINALI",r.final_notes]
      ];
      for(const [title,text] of sections){
        if(y>265){ doc.addPage(); y=18; }
        doc.setTextColor(...gold); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text(title,14,y); y+=5;
        doc.setTextColor(...black); doc.setFont("helvetica","normal"); doc.setFontSize(10);
        const lines=doc.splitTextToSize(String(text||"—"),182);
        doc.text(lines,14,y); y+=lines.length*5+7;
      }
      if(y>272){doc.addPage();y=18;}
      doc.setDrawColor(220,215,208); doc.line(14,y,196,y); y+=6;
      doc.setFontSize(8); doc.setTextColor(100,95,92); doc.text(`Generato da PW Posa · ${new Date().toLocaleString("it-IT")}`,14,y);
      doc.save(`${r.report_number||"rapportino"}.pdf`);
    }catch(err){ toast(err.message); }
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
