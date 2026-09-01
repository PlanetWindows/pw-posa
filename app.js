(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("INCOLLA_QUI")) {
    console.warn("PW Posa: configurazione Supabase incompleta.");
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);
  const state = {
    session:null,
    profile:null,
    teams:[],
    poses:[],
    view:null,
    selectedPose:null,
    calendarCursor:new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  };

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2400);
  }

  function esc(v){
    return String(v ?? "").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  }
  function fmtDate(v){ if(!v) return "—"; const [y,m,d]=v.split("-"); return `${d}/${m}/${y}`; }
  function fmtTime(v){ return v ? String(v).slice(0,5) : "—"; }
  function roleName(role){
    return role === "office_scheduler" ? "Ufficio · Calendario" :
           role === "office_viewer" ? "Ufficio · Lettura" :
           role === "installer" ? "Posatore" : role || "Utente";
  }
  function isScheduler(){ return state.profile?.role === "office_scheduler"; }
  function isOffice(){ return ["office_scheduler","office_viewer"].includes(state.profile?.role); }
  function isoLocal(d){
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,"0");
    const day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function parseLocalDate(iso){
    const [y,m,d]=String(iso).split("-").map(Number);
    return new Date(y,m-1,d,12,0,0,0);
  }
  function checklistReadyDate(p){
    const d=parseLocalDate(p.scheduled_date);
    const daysBack=d.getDay()===1 ? 3 : 2;
    d.setDate(d.getDate()-daysBack);
    return d;
  }
  function checklistIsAvailable(p){
    const today=new Date(); today.setHours(0,0,0,0);
    const ready=checklistReadyDate(p); ready.setHours(0,0,0,0);
    return today>=ready;
  }

  async function signIn(email,password){
    const { data, error } = await sb.auth.signInWithPassword({email,password});
    if(error) throw error;
    state.session = data.session;
    await loadProfile();
    await bootApp();
  }

  async function loadProfile(){
    const uid = state.session?.user?.id;
    const { data, error } = await sb.from("profiles").select("*").eq("id", uid).single();
    if(error) throw new Error("Profilo utente non disponibile: " + error.message);
    state.profile = data;
  }

  async function bootApp(){
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    $("userEmail").textContent = state.session.user.email;
    $("roleLabel").textContent = roleName(state.profile.role);

    $("officeNav").classList.toggle("hidden", !isOffice());
    $("installerNav").classList.toggle("hidden", isOffice());
    $("newPoseBtn").classList.toggle("hidden", !isScheduler());

    if(isOffice()) await loadTeams();
    state.view = "calendar";
    await renderCalendar();
  }

  async function loadTeams(){
    const { data, error } = await sb.from("teams").select("*").eq("active", true).order("name");
    if(error) throw error;
    state.teams = data || [];
  }

  async function loadPoses(){
    const { data, error } = await sb.from("poses").select("*").order("scheduled_date").order("start_time");
    if(error) throw error;
    state.poses = data || [];
  }

  function monthMatrix(cursor){
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0);
    const mondayIndex = (first.getDay()+6)%7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate()-mondayIndex);
    const sundayIndex = (last.getDay()+6)%7;
    const tail = 6-sundayIndex;
    const gridEnd = new Date(last);
    gridEnd.setDate(last.getDate()+tail);
    const days=[];
    const cur=new Date(gridStart);
    while(cur<=gridEnd){ days.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
    return days;
  }

  async function renderCalendar(){
    $("pageTitle").textContent = "Calendario";
    await loadPoses();
    if(isOffice() && !state.teams.length) await loadTeams();

    const cursor = state.calendarCursor;
    const monthTitle = cursor.toLocaleDateString("it-IT", {month:"long", year:"numeric"});
    const days = monthMatrix(cursor);
    const byDate = state.poses.reduce((a,p)=>((a[p.scheduled_date] ||= []).push(p),a),{});
    const todayIso = isoLocal(new Date());

    const weekdayHeader = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].map(x=>`<div class="calendar-weekday">${x}</div>`).join("");
    const cells = days.map(d=>{
      const iso = isoLocal(d);
      const outside = d.getMonth() !== cursor.getMonth();
      const today = iso === todayIso;
      const items = (byDate[iso]||[]).map(p=>`
        <button type="button" class="pose-chip" data-pose="${esc(p.id)}">
          <strong>${esc(fmtTime(p.start_time))} · ${esc(p.job_number)}</strong>
          <span>${esc(p.client_name)}</span>
        </button>`).join("");
      return `<div class="calendar-day${outside ? " outside-month" : ""}${today ? " today" : ""}">
        <div class="date"><span>${d.getDate()}</span></div>
        <div class="calendar-day-poses">${items || '<span class="calendar-empty">—</span>'}</div>
      </div>`;
    }).join("");

    $("content").innerHTML = `
      <div class="calendar-toolbar">
        <div>
          <div class="eyebrow">PROGRAMMAZIONE</div>
          <h3>${esc(monthTitle.charAt(0).toUpperCase()+monthTitle.slice(1))}</h3>
        </div>
        <div class="calendar-controls">
          <button type="button" class="btn ghost" id="calendarPrev" aria-label="Mese precedente">←</button>
          <button type="button" class="btn ghost" id="calendarToday">Oggi</button>
          <button type="button" class="btn ghost" id="calendarNext" aria-label="Mese successivo">→</button>
        </div>
      </div>
      <div class="panel calendar-panel">
        <div class="calendar-month-wrap">
          <div class="calendar-weekdays">${weekdayHeader}</div>
          <div class="calendar-grid month-grid">${cells}</div>
        </div>
      </div>`;

    $("calendarPrev").addEventListener("click",()=>{ state.calendarCursor = new Date(cursor.getFullYear(), cursor.getMonth()-1, 1); renderCalendar(); });
    $("calendarNext").addEventListener("click",()=>{ state.calendarCursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1); renderCalendar(); });
    $("calendarToday").addEventListener("click",()=>{ const now=new Date(); state.calendarCursor = new Date(now.getFullYear(),now.getMonth(),1); renderCalendar(); });
    bindPoseOpeners();
  }

  async function renderPoses(){
    $("pageTitle").textContent = "Pose";
    await loadPoses();
    $("content").innerHTML = `<div class="panel">
      <div class="panel-head"><h3>Elenco pose</h3><span>${state.poses.length} pose</span></div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Ora</th><th>Commessa</th><th>Cliente</th><th>Indirizzo</th><th>Finanziamento</th></tr></thead>
      <tbody>${state.poses.map(p=>`<tr class="clickable" data-pose="${esc(p.id)}"><td>${fmtDate(p.scheduled_date)}</td><td>${fmtTime(p.start_time)}</td><td>${esc(p.job_number)}</td><td>${esc(p.client_name)}</td><td>${esc(p.address)}</td><td>${p.financing ? "Sì" : "No"}</td></tr>`).join("")}</tbody>
      </table></div></div>`;
    bindPoseOpeners();
  }

  async function renderMyPoses(){
    $("pageTitle").textContent = "Le mie pose";
    await loadPoses();
    $("content").innerHTML = `<div class="panel">
      <div class="panel-head"><h3>Pose assegnate alla mia squadra</h3><span class="badge orange">${state.poses.length}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Ora</th><th>Commessa</th><th>Cliente</th><th>Indirizzo</th><th>Telefono</th></tr></thead>
      <tbody>${state.poses.map(p=>`<tr class="clickable" data-pose="${esc(p.id)}"><td>${fmtDate(p.scheduled_date)}</td><td>${fmtTime(p.start_time)}</td><td>${esc(p.job_number)}</td><td>${esc(p.client_name)}</td><td>${esc(p.address)}</td><td>${esc(p.client_phone||"—")}</td></tr>`).join("")}</tbody>
      </table></div></div>`;
    bindPoseOpeners();
  }

  async function renderTeams(){
    $("pageTitle").textContent = "Squadre";
    await loadTeams();
    $("content").innerHTML = `<div class="panel">
      <div class="panel-head"><h3>Squadre attive</h3><span>${state.teams.length}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Squadra</th><th>Stato</th></tr></thead>
      <tbody>${state.teams.map(t=>`<tr><td><strong>${esc(t.name)}</strong></td><td><span class="badge green">Attiva</span></td></tr>`).join("")}</tbody></table></div>
    </div>`;
  }

  async function renderIssues(){
    $("pageTitle").textContent = "Segnalazioni";
    const { data, error } = await sb.from("issues").select("*").order("created_at",{ascending:false});
    if(error) throw error;
    const rows = data || [];
    $("content").innerHTML = `<div class="panel">
      <div class="panel-head"><h3>Problemi e segnalazioni</h3><span>${rows.length}</span></div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo/Stato</th><th>Descrizione</th></tr></thead><tbody>
      ${rows.map(x=>`<tr><td>${esc((x.created_at||"").slice(0,10))}</td><td>${esc(x.status||x.type||"Segnalazione")}</td><td>${esc(x.description||x.notes||x.note||"—")}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Nessuna segnalazione visibile.</div>`}
    </div>`;
  }

  function bindPoseOpeners(){
    document.querySelectorAll("[data-pose]").forEach(el=>el.addEventListener("click",()=>openPoseDetail(el.dataset.pose)));
  }

  async function loadChecklist(poseId){
    const {data,error}=await sb.from("pose_checklists").select("*").eq("pose_id",poseId).maybeSingle();
    if(error) throw error;
    return data;
  }

  async function saveChecklist(p, root){
    const val=(name)=>!!root.querySelector(`[data-check="${name}"]`)?.checked;
    const payload={
      pose_id:p.id,
      van_loaded:val("van_loaded"),
      delivery_report:val("delivery_report"),
      tax_deduction_form:p.financing ? val("tax_deduction_form") : false,
      ddt:val("ddt"),
      client_area_cleaning:val("client_area_cleaning"),
      updated_by:state.session.user.id,
      updated_at:new Date().toISOString()
    };
    const {error}=await sb.from("pose_checklists").upsert(payload,{onConflict:"pose_id"});
    if(error) throw error;
    toast("Checklist aggiornata");
  }

  async function renderChecklistSection(p){
    const root=$("checklistSection");
    if(!root) return;
    const ready=checklistReadyDate(p);
    if(!checklistIsAvailable(p)){
      root.innerHTML=`<div class="action-card"><strong>Checklist preparazione</strong><p class="muted">Disponibile dal ${fmtDate(isoLocal(ready))}${ready.getDay()===5 ? " (venerdì precedente)" : ""}.</p></div>`;
      return;
    }
    try{
      const c=await loadChecklist(p.id) || {};
      const item=(field,label)=>`<label style="display:flex;flex-direction:row;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px;font-weight:600"><input data-check="${field}" type="checkbox" style="width:auto;margin-top:2px" ${c[field] ? "checked" : ""}><span>${label}</span></label>`;
      root.innerHTML=`
        <div class="action-card" style="background:#fff">
          <strong>Checklist preparazione</strong>
          <p class="muted">Attiva da ${fmtDate(isoLocal(ready))}. Le modifiche vengono salvate automaticamente.</p>
          ${item("van_loaded","Caricare il furgone")}
          ${item("delivery_report","Emettere verbale di consegna")}
          ${p.financing ? item("tax_deduction_form","Modulo detrazioni fiscali (Banca Sella)") : ""}
          ${item("ddt","DDT")}
          ${item("client_area_cleaning","Ricordare al cliente di pulire la zona di posa")}
        </div>`;
      root.querySelectorAll("[data-check]").forEach(ch=>ch.addEventListener("change",async()=>{
        try{ await saveChecklist(p,root); }
        catch(err){ toast(err.message); }
      }));
    }catch(err){
      root.innerHTML=`<div class="action-card"><strong>Checklist preparazione</strong><p class="muted">${esc(err.message)}</p></div>`;
    }
  }

  async function renderPhotoSummary(p){
    const root=$("photoSection");
    if(!root) return;
    const {data,error}=await sb.from("pose_photos").select("phase").eq("pose_id",p.id);
    if(error){ root.innerHTML=`<div class="action-card"><strong>Foto posa</strong><p class="muted">${esc(error.message)}</p></div>`; return; }
    const phases=(data||[]).map(x=>String(x.phase||"").toLowerCase());
    const count=(names)=>phases.filter(x=>names.includes(x)).length;
    root.innerHTML=`
      <div class="action-card"><strong>Prima della posa</strong><p class="muted">${count(["before","prima","pre","pre_pose"])} foto presenti</p></div>
      <div class="action-card"><strong>Durante la posa</strong><p class="muted">${count(["during","durante","work","in_progress"])} foto presenti</p></div>
      <div class="action-card"><strong>Dopo la posa</strong><p class="muted">${count(["after","dopo","post","post_pose"])} foto presenti</p></div>`;
  }

  async function openPoseDetail(id){
    let p = state.poses.find(x=>x.id===id);
    if(!p){
      const { data, error } = await sb.from("poses").select("*").eq("id",id).single();
      if(error) return toast(error.message);
      p = data;
    }
    state.selectedPose = p;
    $("detailTitle").textContent = `${p.job_number} · ${p.client_name}`;
    $("editPoseBtn").classList.toggle("hidden", !isScheduler());
    $("detailContent").innerHTML = `
      <div class="detail-grid">
        ${detail("Cliente",p.client_name)}
        ${detail("Telefono",p.client_phone||"—")}
        ${detail("Indirizzo",`${p.address}${p.city ? ", "+p.city : ""}${p.postal_code ? " "+p.postal_code : ""}`)}
        ${detail("Data / Ora",`${fmtDate(p.scheduled_date)} · ${fmtTime(p.start_time)}${p.end_time ? "–"+fmtTime(p.end_time):""}`)}
        ${detail("Commessa",p.job_number)}
        ${detail("Finanziamento",p.financing ? "Sì" : "No")}
        ${detail("Note ufficio",p.office_notes||"—")}
      </div>
      <div style="padding:0 24px 24px"><div id="checklistSection"></div></div>
      <div id="photoSection" class="installer-actions"></div>
      ${state.profile.role==="installer" ? `
      <div class="installer-actions">
        <div class="action-card"><strong>Note posa</strong><p class="muted">La compilazione operativa verrà collegata alla tabella pose_execution nel prossimo passaggio.</p></div>
        <div class="action-card"><strong>Problemi</strong><p class="muted">Le segnalazioni sono presenti nel database; manca ancora il form di inserimento dedicato.</p></div>
      </div>` : ""}
    `;
    $("detailDialog").showModal();
    await renderChecklistSection(p);
    await renderPhotoSummary(p);
  }

  function detail(k,v){
    return `<div class="detail-card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;
  }

  async function populatePoseForm(p=null){
    if(!isScheduler()) return;
    if(!state.teams.length) await loadTeams();
    $("teamId").innerHTML=state.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");

    if(!p){
      $("poseForm").reset();
      $("poseId").value="";
      $("poseDialogTitle").textContent="Nuova posa";
      $("scheduledDate").value=isoLocal(new Date());
      $("startTime").value="08:00";
      $("financing").value="false";
      if(state.teams[0]) $("teamId").value=state.teams[0].id;
      return;
    }

    $("poseId").value=p.id;
    $("poseDialogTitle").textContent=`Modifica posa ${p.job_number}`;
    $("jobNumber").value=p.job_number||"";
    $("clientName").value=p.client_name||"";
    $("clientPhone").value=p.client_phone||"";
    $("address").value=p.address||"";
    $("city").value=p.city||"";
    $("postalCode").value=p.postal_code||"";
    $("scheduledDate").value=p.scheduled_date||"";
    $("startTime").value=fmtTime(p.start_time)==="—" ? "" : fmtTime(p.start_time);
    $("endTime").value=fmtTime(p.end_time)==="—" ? "" : fmtTime(p.end_time);
    $("teamId").value=p.team_id||"";
    $("financing").value=p.financing ? "true" : "false";
    $("officeNotes").value=p.office_notes||"";
  }

  async function openNewPose(){
    if(!isScheduler()) return;
    await populatePoseForm(null);
    $("poseDialog").showModal();
  }

  async function openEditPose(){
    if(!isScheduler() || !state.selectedPose) return;
    const p=state.selectedPose;
    $("detailDialog").close();
    await populatePoseForm(p);
    $("poseDialog").showModal();
  }

  async function savePose(e){
    e.preventDefault();
    if(!isScheduler()) return;
    const payload={
      job_number:$("jobNumber").value.trim(),
      client_name:$("clientName").value.trim(),
      client_phone:$("clientPhone").value.trim()||null,
      address:$("address").value.trim(),
      city:$("city").value.trim()||null,
      postal_code:$("postalCode").value.trim()||null,
      scheduled_date:$("scheduledDate").value,
      start_time:$("startTime").value,
      end_time:$("endTime").value||null,
      team_id:$("teamId").value,
      financing:$("financing").value==="true",
      office_notes:$("officeNotes").value.trim()||null,
      updated_by:state.session.user.id
    };
    const id=$("poseId").value;
    let error;
    if(id){
      ({error}=await sb.from("poses").update(payload).eq("id",id));
    } else {
      payload.created_by=state.session.user.id;
      ({error}=await sb.from("poses").insert(payload));
    }
    if(error){ toast(error.message); return; }
    $("poseDialog").close();
    toast(id ? "Posa aggiornata" : "Posa salvata");
    state.selectedPose=null;
    await loadPoses();
    if(state.view==="calendar") await renderCalendar();
    else if(state.view==="poses") await renderPoses();
    else if(state.view==="myposes") await renderMyPoses();
  }

  async function logout(){
    await sb.auth.signOut();
    location.reload();
  }

  document.addEventListener("click", async (e)=>{
    const nav=e.target.closest(".nav-item");
    if(nav){
      document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
      nav.classList.add("active");
      state.view=nav.dataset.view;
      try{
        if(state.view==="calendar") await renderCalendar();
        else if(state.view==="poses") await renderPoses();
        else if(state.view==="myposes") await renderMyPoses();
        else if(state.view==="teams") await renderTeams();
        else if(state.view==="issues") await renderIssues();
      }catch(err){ toast(err.message); }
    }
  });

  $("loginForm").addEventListener("submit", async e=>{
    e.preventDefault();
    $("loginError").textContent="";
    try{ await signIn($("email").value.trim(),$("password").value); }
    catch(err){ $("loginError").textContent=err.message; }
  });
  $("logoutBtn").addEventListener("click",logout);
  $("topLogoutBtn").addEventListener("click",logout);
  $("newPoseBtn").addEventListener("click",openNewPose);
  $("editPoseBtn").addEventListener("click",openEditPose);
  $("poseForm").addEventListener("submit",savePose);
  $("closePoseDialog").addEventListener("click",()=>$("poseDialog").close());
  $("cancelPoseBtn").addEventListener("click",()=>$("poseDialog").close());
  $("closeDetailDialog").addEventListener("click",()=>$("detailDialog").close());

  (async ()=>{
    const {data}=await sb.auth.getSession();
    if(data.session){
      state.session=data.session;
      try{ await loadProfile(); await bootApp(); }
      catch(err){ console.error(err); await sb.auth.signOut(); }
    }
  })();
})();