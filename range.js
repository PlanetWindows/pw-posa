(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  let decorateTimer=null;
  let extraDates=[];

  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)};
  const fmt=s=>{if(!s)return '—';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`};

  function ensureDatesUI(){
    const start=$('scheduledDate');
    const end=$('scheduledEndDate');
    if(!start||!end||$('poseExtraDatesWrap')) return;
    const endLabel=end.closest('label');
    if(endLabel){
      endLabel.style.display='none';
      end.required=false;
    }
    const wrap=document.createElement('div');
    wrap.id='poseExtraDatesWrap';
    wrap.className='span2';
    wrap.innerHTML=`
      <div style="font-weight:600;margin-bottom:8px">Giornate posa</div>
      <div class="muted" style="margin-bottom:10px">La data di inizio è la prima giornata. Aggiungi qui eventuali altre giornate, anche non consecutive.</div>
      <div id="poseDatesList" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="poseExtraDateInput" type="date" style="max-width:220px" />
        <button id="addPoseDateBtn" type="button" class="btn ghost">+ Aggiungi giornata</button>
      </div>`;
    endLabel?.insertAdjacentElement('afterend',wrap);
    $('addPoseDateBtn')?.addEventListener('click',()=>{
      const v=$('poseExtraDateInput')?.value;
      if(!v) return;
      const startDate=$('scheduledDate')?.value;
      if(v===startDate) return toast('Questa è già la data di inizio');
      if(!extraDates.includes(v)) extraDates.push(v);
      extraDates.sort();
      $('poseExtraDateInput').value='';
      renderDatesList();
    });
    wrap.addEventListener('click',e=>{
      const b=e.target.closest('[data-remove-pose-date]');
      if(!b) return;
      extraDates=extraDates.filter(x=>x!==b.dataset.removePoseDate);
      renderDatesList();
    });
    renderDatesList();
  }

  function allSelectedDates(){
    const start=$('scheduledDate')?.value;
    return [...new Set([start,...extraDates].filter(Boolean))].sort();
  }

  function renderDatesList(){
    const host=$('poseDatesList'); if(!host) return;
    const start=$('scheduledDate')?.value;
    const chips=[];
    if(start) chips.push(`<span class="badge orange" style="padding:8px 10px">${fmt(start)} · inizio</span>`);
    extraDates.filter(x=>x!==start).sort().forEach(d=>chips.push(`<span class="badge" style="padding:8px 10px;display:inline-flex;align-items:center;gap:7px">${fmt(d)} <button type="button" data-remove-pose-date="${esc(d)}" aria-label="Rimuovi ${fmt(d)}" style="border:0;background:transparent;cursor:pointer;font-size:16px;line-height:1">×</button></span>`));
    host.innerHTML=chips.join('')||'<span class="muted">Seleziona la data di inizio.</span>';
    const dates=allSelectedDates();
    if($('scheduledEndDate')) $('scheduledEndDate').value=dates.at(-1)||start||'';
  }

  async function hydratePoseDates(){
    ensureDatesUI();
    const dialog=$('poseDialog');
    if(!dialog?.open) return;
    const id=$('poseId')?.value;
    const start=$('scheduledDate')?.value;
    extraDates=[];
    if(id){
      const {data,error}=await sb.from('pose_dates').select('pose_date').eq('pose_id',id).order('pose_date');
      if(!error && data?.length){
        extraDates=data.map(x=>x.pose_date).filter(d=>d!==start);
      }else{
        const {data:p}=await sb.from('poses').select('scheduled_date,scheduled_end_date').eq('id',id).single();
        if(p?.scheduled_end_date && p.scheduled_end_date!==p.scheduled_date) extraDates=[p.scheduled_end_date];
      }
    }
    renderDatesList();
  }

  document.addEventListener('change',e=>{
    if(e.target?.id==='scheduledDate'){
      extraDates=extraDates.filter(d=>d!==e.target.value);
      renderDatesList();
    }
  });

  const poseDialog=$('poseDialog');
  if(poseDialog){
    ensureDatesUI();
    new MutationObserver(()=>{ if(poseDialog.open) setTimeout(()=>hydratePoseDates().catch(console.warn),60); }).observe(poseDialog,{attributes:true,attributeFilter:['open']});
  }

  async function syncPoseDates(poseId,dates){
    const {error:delErr}=await sb.from('pose_dates').delete().eq('pose_id',poseId);
    if(delErr) throw delErr;
    if(!dates.length) return;
    const {error:insErr}=await sb.from('pose_dates').insert(dates.map(pose_date=>({pose_id:poseId,pose_date})));
    if(insErr) throw insErr;
  }

  document.addEventListener('submit',async e=>{
    if(e.target?.id!=='poseForm') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const dates=allSelectedDates();
    if(!dates.length) return toast('Seleziona almeno una giornata di posa');
    const {data:{session}}=await sb.auth.getSession();
    if(!session) return toast('Sessione scaduta');
    const payload={
      job_number:$('jobNumber').value.trim(), client_name:$('clientName').value.trim(), client_phone:$('clientPhone').value.trim()||null,
      address:$('address').value.trim(), city:$('city').value.trim()||null, postal_code:$('postalCode').value.trim()||null,
      scheduled_date:dates[0], scheduled_end_date:dates.at(-1),
      start_time:$('startTime').value, end_time:$('endTime').value||null, team_id:$('teamId').value,
      financing:$('financing').value==='true', office_notes:$('officeNotes').value.trim()||null, updated_by:session.user.id
    };
    const existingId=$('poseId').value;
    let poseId=existingId;
    let error;
    if(existingId){
      ({error}=await sb.from('poses').update(payload).eq('id',existingId));
    } else {
      payload.created_by=session.user.id;
      const res=await sb.from('poses').insert(payload).select('id').single();
      error=res.error; poseId=res.data?.id;
    }
    if(error) return toast(error.message);
    try{
      await syncPoseDates(poseId,dates);
    }catch(err){
      console.error('PW Posa pose_dates:',err);
      return toast('Posa salvata, ma errore nelle giornate: '+err.message);
    }
    $('poseDialog').close();
    toast(existingId?'Posa aggiornata':'Posa salvata');
    setTimeout(()=>location.reload(),450);
  },true);

  function inferGridDates(){
    const cells=[...document.querySelectorAll('.calendar-grid.month-grid .calendar-day')];
    const title=document.querySelector('.calendar-toolbar h3')?.textContent?.trim().toLowerCase();
    if(!cells.length||!title) return [];
    const months=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
    const parts=title.split(/\s+/); const mi=months.indexOf(parts[0]); const year=Number(parts.at(-1));
    if(mi<0||!year) return [];
    const first=new Date(year,mi,1,12); const mondayIndex=(first.getDay()+6)%7; const start=new Date(first); start.setDate(first.getDate()-mondayIndex);
    return cells.map((el,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return {el,date:iso(d)}});
  }

  async function decorateCalendar(){
    const grid=inferGridDates(); if(!grid.length) return;
    const {data:poses,error}=await sb.from('poses').select('id,job_number,client_name,start_time,scheduled_date,scheduled_end_date');
    if(error) return;
    const ids=(poses||[]).map(p=>p.id);
    let dateRows=[];
    if(ids.length){
      const r=await sb.from('pose_dates').select('pose_id,pose_date').in('pose_id',ids);
      if(!r.error) dateRows=r.data||[];
    }
    const datesByPose={};
    dateRows.forEach(r=>(datesByPose[r.pose_id]||=[]).push(r.pose_date));
    grid.forEach(({el,date})=>{
      el.dataset.date=date;
      const host=el.querySelector('.calendar-day-poses'); if(!host) return;
      (poses||[]).forEach(p=>{
        let visibleDates=datesByPose[p.id];
        if(!visibleDates?.length){
          visibleDates=[];
          const end=p.scheduled_end_date||p.scheduled_date;
          let d=new Date(p.scheduled_date+'T12:00:00'); const last=new Date(end+'T12:00:00');
          while(d<=last){visibleDates.push(iso(d));d.setDate(d.getDate()+1)}
        }
        if(!visibleDates.includes(date)||date===p.scheduled_date) return;
        if(host.querySelector(`[data-range-pose="${CSS.escape(p.id)}"]`)) return;
        host.querySelector('.calendar-empty')?.remove();
        const chip=document.createElement('button');
        chip.type='button'; chip.className='pose-chip range-chip';
        chip.dataset.rangePose=p.id; chip.dataset.pose=p.id;
        chip.innerHTML=`<strong>${esc(String(p.start_time||'').slice(0,5))} · ${esc(p.job_number)}</strong><span>${esc(p.client_name)}</span><span class="range-label">giornata posa</span>`;
        host.appendChild(chip);
      });
    });
  }

  function scheduleDecorate(){clearTimeout(decorateTimer);decorateTimer=setTimeout(()=>decorateCalendar().catch(console.warn),140)}
  const content=$('content'); if(content) new MutationObserver(scheduleDecorate).observe(content,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('#calendarPrev,#calendarNext,#calendarToday,.nav-item[data-view="calendar"]')) scheduleDecorate();});
  scheduleDecorate();

  document.addEventListener('click',e=>{
    const rangeEl=e.target.closest('[data-range-pose]');
    if(!rangeEl) return;
    e.preventDefault(); e.stopPropagation();
    const id=rangeEl.dataset.rangePose;
    const source=[...document.querySelectorAll(`.pose-chip[data-pose="${CSS.escape(id)}"]`)].find(el=>!el.hasAttribute('data-range-pose'));
    if(source){source.click();return;}
    const poseRow=document.querySelector(`[data-pose="${CSS.escape(id)}"]`);
    if(poseRow) poseRow.click();
  },true);

  document.addEventListener('click',e=>{
    const poseEl=e.target.closest('[data-pose]'); if(!poseEl) return;
    setTimeout(async()=>{
      const grid=$('detailContent')?.querySelector('.detail-grid'); if(!grid||grid.querySelector('[data-end-date-card]')) return;
      const {data:rows}=await sb.from('pose_dates').select('pose_date').eq('pose_id',poseEl.dataset.pose).order('pose_date');
      let dates=(rows||[]).map(x=>x.pose_date);
      if(!dates.length){
        const {data}=await sb.from('poses').select('scheduled_date,scheduled_end_date').eq('id',poseEl.dataset.pose).single();
        if(data) dates=[data.scheduled_date,data.scheduled_end_date].filter(Boolean);
      }
      if(!dates.length) return;
      const card=document.createElement('div'); card.className='detail-card'; card.dataset.endDateCard='1';
      card.innerHTML=`<div class="k">Giornate posa</div><div class="v">${dates.map(fmt).join(' · ')}</div>`;
      grid.appendChild(card);
    },220);
  },true);
})();