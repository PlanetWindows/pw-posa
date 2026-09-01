(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("INCOLLA_QUI")) {
    console.warn("PW Posa: configurazione Supabase incompleta.");
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const $ = (id) => document.getElementById(id);
  const state = { session:null, profile:null, teams:[], poses:[], view:null };

  function toast(msg) {
    const el = $("toast"); el.textContent = msg; el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2400);
  }
  function esc(v){ return String(v ?? "").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s])); }
  function fmtDate(v){ if(!v) return "—"; const [y,m,d]=v.split("-"); return `${d}/${m}/${y}`; }
  function fmtTime(v){ return v ? String(v).slice(0,5) : "—"; }
  function roleName(role){
    return role === "office_scheduler" ? "Ufficio · Calendario" :
           role === "office_viewer" ? "Ufficio · Lettura" :
           role === "installer" ? "Posatore" : role || "Utente";
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

    const office = ["office_scheduler","office_viewer"].includes(state.profile.role);
    $("officeNav").classList.toggle("hidden", !office);
    $("installerNav").classList.toggle("hidden", office);
    $("newPoseBtn").classList.toggle("hidden", state.profile.role !== "office_scheduler");

    if(office){
      await loadTeams();
      state.view = "calendar";
      await renderCalendar();
    }else{
      state.view = "myposes";
      await renderMyPoses();
    }
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

  async function renderCalendar(){
    $("pageTitle").textContent = "Calendario";
    await loadPoses();

    const today = new Date();
    const monday = new Date(today);
    const day = (today.getDay()+6)%7;
    monday.setDate(today.getDate()-day);
    monday.setHours(0,0,0,0);

    const days = Array.from({length:14},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d;});
    const byDate = Object.groupBy ? Object.groupBy(state.poses, p=>p.scheduled_date) :
      state.poses.reduce((a,p)=>((a[p.scheduled_date] ||= []).push(p),a),{});

    const cells = days.map(d=>{
      const iso = d.toISOString().slice(0,10);
      const items = (byDate[iso]||[]).map(p=>`
        <div class="pose-chip" data-pose="${esc(p.id)}">
          <strong>${esc(fmtTime(p.start_time))} · ${esc(p.client_name)}</strong>
          <span>${esc(p.job_number)} · ${esc(p.city || p.address)}</span>
        </div>`).join("");
      return `<div class="calendar-day">
        <div class="date">${d.toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"2-digit"})}</div>
        ${items || '<div class="muted">Nessuna posa</div>'}
      </div>`;
    }).join("");

    $("content").innerHTML = `
      <div class="stats">
        <div class="stat"><span class="muted">Pose visibili</span><strong>${state.poses.length}</strong></div>
        <div class="stat"><span class="muted">Oggi</span><strong>${state.poses.filter(p=>p.scheduled_date===new Date().toISOString().slice(0,10)).length}</strong></div>
        <div class="stat"><span class="muted">Squadre</span><strong>${state.teams.length}</strong></div>
        <div class="stat"><span class="muted">Ruolo</span><strong style="font-size:18px">${esc(roleName(state.profile.role))}</strong></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Programmazione · 2 settimane</h3><span class="muted">Clicca una posa per aprirla</span></div>
        <div class="table-wrap" style="padding:14px"><div class="calendar-grid">${cells}</div></div>
      </div>`;
    bindPoseOpeners();
  }

  async function renderPoses(){
    $("pageTitle").textContent = "Pose";
    await loadPoses();
    $("content").innerHTML = `<div class="panel">
      <div class="panel-head"><h3>Elenco pose</h3><span>${state.poses.length} pose</span></div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Ora</th><th>Commessa</th><th>Cliente</th><th>Indirizzo</th></tr></thead>
      <tbody>${state.poses.map(p=>`<tr class="clickable" data-pose="${esc(p.id)}"><td>${fmtDate(p.scheduled_date)}</td><td>${fmtTime(p.start_time)}</td><td>${esc(p.job_number)}</td><td>${esc(p.client_name)}</td><td>${esc(p.address)}</td></tr>`).join("")}</tbody>
      </table></div></div>`;
    bindPoseOpeners();
  }

  async function renderMyPoses(){
    $("pageTitle").textContent = "Le mie pose";
    await loadPoses(); // RLS mostra solo le pose accessibili all'utente
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

  async function openPoseDetail(id){
    let p = state.poses.find(x=>x.id===id);
    if(!p){
      const { data, error } = await sb.from("poses").select("*").eq("id",id).single();
      if(error) return toast(error.message);
      p = data;
    }
    $("detailTitle").textContent = `${p.job_number} · ${p.client_name}`;
    $("detailContent").innerHTML = `
      <div class="detail-grid">
        ${detail("Cliente",p.client_name)}
        ${detail("Telefono",p.client_phone||"—")}
        ${detail("Indirizzo",`${p.address}${p.city ? ", "+p.city : ""}${p.postal_code ? " "+p.postal_code : ""}`)}
        ${detail("Data / Ora",`${fmtDate(p.scheduled_date)} · ${fmtTime(p.start_time)}${p.end_time ? "–"+fmtTime(p.end_time):""}`)}
        ${detail("Commessa",p.job_number)}
        ${detail("Note ufficio",p.office_notes||"—")}
      </div>
      ${state.profile.role==="installer" ? `
      <div class="installer-actions">
        <div class="action-card"><strong>Foto</strong><p class="muted">Caricamento foto prima, durante e dopo: attivabile nel prossimo step.</p></div>
        <div class="action-card"><strong>Note posa</strong><p class="muted">Compilazione avanzamento e note operative: prossimo step.</p></div>
        <div class="action-card"><strong>Problemi</strong><p class="muted">Segnalazione danni o pezzi mancanti: prossimo step.</p></div>
      </div>` : ""}
    `;
    $("detailDialog").showModal();
  }
  function detail(k,v){return `<div class="detail-card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`}

  async function openNewPose(){
    if(state.profile.role!=="office_scheduler") return;
    await loadTeams();
    $("poseForm").reset(); $("poseId").value="";
    $("poseDialogTitle").textContent="Nuova posa";
    $("teamId").innerHTML=state.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
    $("scheduledDate").value=new Date().toISOString().slice(0,10);
    $("startTime").value="08:00";
    $("poseDialog").showModal();
  }

  async function savePose(e){
    e.preventDefault();
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
    $("poseDialog").close(); toast("Posa salvata");
    if(state.view==="calendar") await renderCalendar(); else await renderPoses();
  }

  document.addEventListener("click", async (e)=>{
    const nav=e.target.closest(".nav-item");
    if(nav){
      document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active")); nav.classList.add("active");
      state.view=nav.dataset.view;
      try{
        if(state.view==="calendar") await renderCalendar();
        else if(state.view==="poses") await renderPoses();
        else if(state.view==="myposes") await renderMyPoses();
        else if(state.view==="teams") await renderTeams();
        else if(state.view==="issues") await renderIssues();
      }catch(err){toast(err.message)}
    }
  });

  $("loginForm").addEventListener("submit", async e=>{
    e.preventDefault(); $("loginError").textContent="";
    try{ await signIn($("email").value.trim(),$("password").value); }
    catch(err){ $("loginError").textContent=err.message; }
  });
  $("logoutBtn").addEventListener("click",async()=>{ await sb.auth.signOut(); location.reload(); });
  $("newPoseBtn").addEventListener("click",openNewPose);
  $("poseForm").addEventListener("submit",savePose);
  $("closePoseDialog").addEventListener("click",()=>$("poseDialog").close());
  $("cancelPoseBtn").addEventListener("click",()=>$("poseDialog").close());
  $("closeDetailDialog").addEventListener("click",()=>$("detailDialog").close());

  (async ()=>{
    const {data}=await sb.auth.getSession();
    if(data.session){
      state.session=data.session;
      try{await loadProfile();await bootApp();}catch(err){console.error(err);await sb.auth.signOut();}
    }
  })();
})();
