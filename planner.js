/* One calendar for all roles. Database policies remain authoritative. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const date = value => new Date(`${value}T12:00:00`);
  const shift = (value, days) => {const d=date(value); d.setDate(d.getDate()+days); return iso(d);};
  const today = () => iso(new Date());
  const weekNumber = value => {
    const d = new Date(`${value}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  };
  const hhmm = value => String(value || '').slice(0,5);
  const minutes = value => {const [h,m]=String(value||'00:00').split(':').map(Number);return h*60+m;};
  const labels = {pose:'POSA',assistance:'ASSISTENZA',survey:'RILIEVO',site_visit:'CANTIERE',note:'NOTA / RICHIAMATA'};
  let mode = 'month';
  let cursor = today(), filter = '', events = [], choices = [], generation = 0, officeGroup = 'installation';
  const currentGroup = () => window.PWPosa.isOffice() ? officeGroup : window.PWPosa.state.profile.role === 'technician' ? 'technical' : 'installation';
  const belongsToGroup = kind => ['pose','assistance'].includes(kind) === (currentGroup() === 'installation');
  async function selectGroup(group) {
    if(!window.PWPosa.isOffice() || !['installation','technical'].includes(group))return;
    if(officeGroup !== group){officeGroup=group;filter='';}
    return render(false);
  }

  function daysInView() {
    if(mode==='day') return [cursor];
    const d=date(cursor);
    if(mode==='week') {d.setDate(d.getDate()-((d.getDay()+6)%7));return Array.from({length:7},(_,i)=>shift(iso(d),i));}
    d.setDate(1);const month=d.getMonth();d.setDate(d.getDate()-((d.getDay()+6)%7));
    const days=[]; do {days.push(iso(d));d.setDate(d.getDate()+1);} while(d.getMonth()===month || d.getDay()!==1 || days.length<28);
    return days;
  }
  function expandRows(rows, dateRows, parentKey, dateKey, kind) {
    const byId=new Map();
    for(const r of dateRows) {if(!byId.has(r[parentKey]))byId.set(r[parentKey],new Set());byId.get(r[parentKey]).add(r[dateKey]);}
    return rows.flatMap(row=>{
      let days=[...(byId.get(row.id)||[])];
      if(!days.length && row.scheduled_date) {
        const last=row.scheduled_end_date||row.scheduled_date;
        for(let d=row.scheduled_date;d<=last;d=shift(d,1)) {days.push(d);if(days.length>=730) break;}
      }
      return days.map(day=>({kind,id:row.id,date:day,start:hhmm(row.start_time),end:hhmm(row.end_time),client:row.client_name,number:row.job_number||row.protocol_order||'',owner:`team:${row.team_id}`,status:row.status||'',row}));
    });
  }
  async function readData() {
    const app=window.PWPosa,{sb,state}=app, office=app.isOffice(), technician=state.profile.role==='technician';
    let teamIds=[];
    if(!office && !technician) {
      const r=await sb.from('team_members').select('team_id').eq('user_id',state.session.user.id).eq('active',true);
      if(r.error)throw r.error;teamIds=(r.data||[]).map(x=>x.team_id);
    }
    const query = table => {
      if(technician||(!office&&!teamIds.length)) return Promise.resolve({data:[],error:null});
      let q=sb.from(table).select('*').order('scheduled_date').order('start_time');
      if(!office)q=q.in('team_id',teamIds);return q;
    };
    const results=await Promise.all([
      query('poses'),query('assistances'),
      office||technician ? sb.from('technician_activities').select('*').order('scheduled_date').order('start_time') : Promise.resolve({data:[]}),
      office ? sb.from('teams').select('id,name').eq('active',true).order('name') : Promise.resolve({data:[]}),
      office ? sb.from('profiles').select('id,full_name,email').eq('role','technician').eq('active',true) : Promise.resolve({data:[]})
    ]);
    for(const r of results)if(r.error)throw r.error;
    const [poses,assistances,technical,teams,technicians]=results.map(x=>x.data||[]);
    const dates=await Promise.all([
      poses.length?sb.from('pose_dates').select('pose_id,pose_date').in('pose_id',poses.map(x=>x.id)):Promise.resolve({data:[]}),
      assistances.length?sb.from('assistance_dates').select('assistance_id,assistance_date').in('assistance_id',assistances.map(x=>x.id)):Promise.resolve({data:[]})
    ]);
    for(const r of dates)if(r.error)throw r.error;
    choices=[...teams.map(t=>({value:`team:${t.id}`,label:t.name})),...technicians.map(t=>({value:`technician:${t.id}`,label:t.full_name||t.email}))];
    const ownerNames=new Map(choices.map(x=>[x.value,x.label]));
    const all=[...expandRows(poses,dates[0].data||[],'pose_id','pose_date','pose'),...expandRows(assistances,dates[1].data||[],'assistance_id','assistance_date','assistance'),...technical.map(row=>({kind:row.activity_type,id:row.id,date:row.scheduled_date,start:hhmm(row.start_time),end:'',client:`${row.first_name} ${row.last_name||''}`.trim(),number:'',owner:`technician:${row.technician_id}`,status:row.status,row}))];
    all.forEach(e=>e.ownerName=ownerNames.get(e.owner)||'');
    state.poses=poses;
    return all.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.client.localeCompare(b.client,'it'));
  }
  function selectedEvents() {return events.filter(e=>belongsToGroup(e.kind)&&(!filter||e.owner===filter));}
  function onDay(day) {return selectedEvents().filter(e=>e.date===day);}
  function attrs(e) {
    return e.kind==='pose'?`data-pose="${esc(e.id)}"`:e.kind==='assistance'?`data-assistance="${esc(e.id)}"`:`data-tech-activity="${esc(e.id)}"`;
  }
  function chip(e, extra='') {
    const time=e.start ? `${e.start}${e.end?`–${e.end}`:''}` : 'Chiamata / nota';
    const title=[labels[e.kind],time,e.client,e.number,e.ownerName].filter(Boolean).join(' · ');
    return `<button type="button" class="pw-event pw-event-${e.kind}${e.status==='completed'?' pw-event-done':''}" ${attrs(e)} title="${esc(title)}" ${extra}><span class="pw-event-type">${labels[e.kind]}${e.status==='completed'?' · ✓':''}</span><strong>${esc(time)}${e.number?` · ${esc(e.number)}`:''}</strong><span class="pw-event-client">${esc(e.client)}</span>${window.PWPosa.isOffice()&&e.ownerName?`<small>${esc(e.ownerName)}</small>`:''}</button>`;
  }
  // Label breve per tutte le attività: pose, assistenze, rilievi, cantieri e note.
  // L'etichetta completa rimane disponibile nella vista giorno / dettaglio.
  function mobileLabel(e) {
    const raw=String(e.client||labels[e.kind]||'Attività').trim().replace(/\s+/g,' ');
    const names=raw.split(' ');
    return names.length>2 ? names.slice(0,2).join(' ') : raw;
  }
  const mobileKinds={pose:'P',assistance:'A',survey:'R',site_visit:'C',note:'N'};
  function monthHtml(days) {
    const month=date(cursor).getMonth();
    return `<p class="pw-month-hint">Tocca un giorno per vedere orari e attività.</p><div class="pw-month-scroll"><div class="pw-month-grid" style="--pw-weeks:${days.length/7}">${['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(d=>`<div class="pw-weekday">${d}</div>`).join('')}${days.map(day=>{
      const items=onDay(day);
      return `<section class="pw-month-day${date(day).getMonth()!==month?' pw-outside':''}${day===today()?' pw-today':''}"><button type="button" class="pw-day-number" data-pw-day="${day}" aria-label="Apri la giornata del ${esc(date(day).toLocaleDateString('it-IT'))}">${date(day).getDate()}</button>${items.length?`<button type="button" class="pw-month-summary" data-pw-day="${day}" aria-label="${items.length} attività il ${esc(date(day).toLocaleDateString('it-IT'))}: apri la giornata"><span class="pw-month-dots" aria-hidden="true">${[...new Set(items.map(e=>e.kind))].map(kind=>`<i class="pw-legend-${kind}"></i>`).join('')}</span><span aria-hidden="true">${items.length>1?'+':''}${items.length}</span></button>`:''}<div class="pw-month-events">${items.slice(0,2).map(e=>chip(e)).join('')}${items.length>2?`<button type="button" class="pw-more" data-pw-day="${day}">+${items.length-2} altre attività</button>`:''}${!items.length?'<span class="muted">—</span>':''}</div><div class="pw-mobile-preview">${items.slice(0,2).map(e=>`<button type="button" class="pw-mobile-item pw-mobile-${e.kind}" ${attrs(e)} aria-label="${esc([labels[e.kind],e.client,e.start].filter(Boolean).join(' · '))}" title="${esc([labels[e.kind],e.client,e.start].filter(Boolean).join(' · '))}"><small aria-hidden="true">${mobileKinds[e.kind]||"•"}</small><span>${esc(mobileLabel(e))}</span></button>`).join('')}${items.length>2?`<button type="button" class="pw-mobile-more" data-pw-day="${day}">+${items.length-2}</button>`:''}</div></section>`;
    }).join('')}</div></div>`;
  }
  /* Interval partitioning uses the visible height too, so short cards cannot overlap. */
  function layout(items) {
    const rows=items.map(e=>({...e,from:minutes(e.start),to:Math.min(1440,Math.max(e.end?minutes(e.end):minutes(e.start)+60,minutes(e.start)+55))})).sort((a,b)=>a.from-b.from||a.to-b.to);
    let cluster=[],ends=[],until=-1;
    const finish=()=>{cluster.forEach(e=>e.columns=ends.length);cluster=[];ends=[];};
    for(const e of rows) {
      if(e.from>=until){finish();until=-1;}
      let col=ends.findIndex(end=>end<=e.from);if(col<0)col=ends.length;
      ends[col]=e.to;e.column=col;cluster.push(e);until=Math.max(until,e.to);
    }
    finish();return rows;
  }
  function timeHtml(days) {
    const timed=selectedEvents().filter(e=>days.includes(e.date)&&e.start&&e.kind!=='note');
    const first=Math.max(0,Math.min(7,...timed.map(e=>Math.floor(minutes(e.start)/60))));
    const last=Math.min(24,Math.max(19,...timed.map(e=>Math.ceil(Math.max(e.end?minutes(e.end):minutes(e.start)+60,minutes(e.start)+55)/60))));
    const hours=Array.from({length:last-first},(_,i)=>first+i),height=(last-first)*72;
    const allDay=days.map(day=>onDay(day).filter(e=>e.kind==='note'||!e.start));
    return `<div class="pw-time-scroll"><div class="pw-time-grid" style="--pw-days:${days.length};--pw-height:${height}px"><div class="pw-time-corner">Orario</div>${days.map(day=>`<button type="button" class="pw-time-heading${day===today()?' pw-today':''}" data-pw-day="${day}">${esc(date(day).toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'}))}</button>`).join('')}${allDay.some(a=>a.length)?`<div class="pw-note-heading">Note e<br>richiamate</div>${allDay.map(items=>`<div class="pw-note-cell">${items.map(e=>chip(e)).join('')||'—'}</div>`).join('')}`:''}<div class="pw-time-labels" style="height:${height}px">${hours.map((h,i)=>`<span style="top:${i*72}px">${String(h).padStart(2,'0')}:00</span>`).join('')}</div>${days.map(day=>`<div class="pw-time-column" style="height:${height}px">${layout(onDay(day).filter(e=>e.kind!=='note'&&e.start)).map(e=>chip(e,`style="position:absolute;top:${(e.from-first*60)*1.2}px;height:${(e.to-e.from)*1.2-3}px;left:calc(${100*e.column/e.columns}% + 2px);width:calc(${100/e.columns}% - 4px)"`)).join('')}</div>`).join('')}</div></div>`;
  }
  async function render(reload=true) {
    const app=window.PWPosa;if(!app?.state.profile)return;
    const token=++generation;app.state.view='calendar';$('pageTitle').textContent='Calendario';
    try {
      if(reload) {const rows=await readData();if(token!==generation||app.state.view!=='calendar')return;events=rows;}
      if(app.state.view!=='calendar')return;
      const days=daysInView(),range=mode==='month'?date(cursor).toLocaleDateString('it-IT',{month:'long',year:'numeric'}):mode==='day'?date(cursor).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):`${date(days[0]).toLocaleDateString('it-IT',{day:'numeric',month:'short'})} – ${date(days.at(-1)).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'})}`;
      const host=$('content'),group=currentGroup(),office=app.isOffice(),owners=choices.filter(x=>x.value.startsWith(group==='installation'?'team:':'technician:'));
      host.innerHTML=`<section class="pw-planner" aria-label="Calendario attività">
        ${office?`<div class="pw-calendar-kind-bar"><div class="pw-calendar-tabs" role="tablist" aria-label="Tipo di calendario">${[['installation','Pose e assistenze'],['technical','Rilievi, note e cantieri']].map(([value,label])=>`<button type="button" role="tab" id="pwCalendarTab-${value}" data-pw-group="${value}" aria-selected="${group===value}" aria-controls="pwCalendarPanel" tabindex="${group===value?0:-1}">${label}</button>`).join('')}</div>${group==='technical'&&app.isScheduler()?'<button type="button" class="btn ghost" data-pw-new-note>+ Nuova nota</button>':''}</div>`:''}
        <div id="pwCalendarPanel"${office?` role="tabpanel" aria-labelledby="pwCalendarTab-${group}"`:''}>
          <div class="pw-planner-toolbar"><div class="pw-calendar-navigation"><button class="btn ghost" type="button" data-pw-step="-1" aria-label="Periodo precedente">←</button><button class="btn ghost" type="button" data-pw-today>Oggi</button><button class="btn ghost" type="button" data-pw-step="1" aria-label="Periodo successivo">→</button><h3>${esc(range)}</h3></div><div class="pw-planner-options"><label class="pw-date-label">Vai al <input type="date" id="pwCalendarDate" value="${cursor}"></label><div class="pw-view-switch" aria-label="Vista calendario">${[['month','Mese'],['week',`Settimana ${weekNumber(cursor)}`],['day','Giorno']].map(([v,l])=>`<button type="button" data-pw-mode="${v}" aria-pressed="${mode===v}" class="${mode===v?'active':''}">${l}</button>`).join('')}</div>${office?`<label class="pw-owner-label">Assegnazione<select id="pwCalendarOwner"><option value="">${group==='installation'?'Tutte le squadre':'Tutti i tecnici'}</option>${owners.map(x=>`<option value="${esc(x.value)}"${filter===x.value?' selected':''}>${esc(x.label)}</option>`).join('')}</select></label>`:''}</div></div>
          <div class="pw-calendar-legend">${Object.entries(labels).filter(([kind])=>belongsToGroup(kind)).map(([kind,label])=>`<span><i class="pw-legend-${kind}"></i>${label}</span>`).join('')}</div>${mode!=='month'?'<p class="pw-time-hint">Senza ora di fine, la durata del riquadro è indicativa.</p>':''}${mode==='month'?monthHtml(days):timeHtml(days)}
        </div></section>`;
      host.querySelectorAll('[data-pw-group]').forEach(button=>{
        button.onclick=()=>selectGroup(button.dataset.pwGroup);
        button.onkeydown=async e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'installation':e.key==='End'?'technical':group==='installation'?'technical':'installation';await selectGroup(next);host.querySelector(`[data-pw-group="${next}"]`).focus();};
      });
      if(host.querySelector('[data-pw-new-note]'))host.querySelector('[data-pw-new-note]').onclick=()=>window.PWTechnician.openNewNote();
      host.querySelectorAll('[data-pw-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.pwMode;render(false);});
      host.querySelectorAll('[data-pw-day]').forEach(b=>b.onclick=()=>{cursor=b.dataset.pwDay;mode='day';render(false);});
      host.querySelectorAll('[data-pw-step]').forEach(b=>b.onclick=()=>{const step=+b.dataset.pwStep;if(mode==='month'){const d=date(cursor);d.setDate(1);d.setMonth(d.getMonth()+step);cursor=iso(d);}else cursor=shift(cursor,step*(mode==='week'?7:1));render(false);});
      host.querySelector('[data-pw-today]').onclick=()=>{cursor=today();render(false);};
      $('pwCalendarDate').onchange=e=>{if(e.target.value){cursor=e.target.value;render(false);}};
      if($('pwCalendarOwner'))$('pwCalendarOwner').onchange=e=>{filter=e.target.value;render(false);};
      host.querySelectorAll('[data-pose]').forEach(b=>b.onclick=()=>app.openPoseDetail(b.dataset.pose));
      // Assistances use the existing capture listener and retain their full workflow.
      host.querySelectorAll('[data-tech-activity]').forEach(b=>b.onclick=()=>window.PWTechnician.openDetail(b.dataset.techActivity));
      if(mode!=='month') {const scroller=host.querySelector('.pw-time-scroll');const startHour=Math.max(0,Math.min(7,...selectedEvents().filter(e=>days.includes(e.date)&&e.start).map(e=>Math.floor(minutes(e.start)/60))));scroller.scrollTop=Math.max(0,(7-startHour)*72);}
    } catch(error) {if(token===generation){$('content').innerHTML='<div class="panel"><p class="empty">Calendario non disponibile. <button type="button" class="btn ghost" id="pwCalendarRetry">Riprova</button></p></div>';$('pwCalendarRetry').onclick=()=>render();app.toast(error.message);}}
  }
  window.PWPlanner={render,selectGroup,get selectedDay(){return cursor;},layout,expandRows};
})();
