(() => {
  const cfg=window.PW_POSA_CONFIG||{};
  if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY) return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id);
  let decorateTimer=null;

  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const parse=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d,12)};
  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)};

  function validateRange(){
    const start=$('scheduledDate')?.value;
    const end=$('scheduledEndDate')?.value;
    if(start&&end&&end<start){ $('scheduledEndDate').setCustomValidity('La data fine non può precedere la data inizio.'); return false; }
    $('scheduledEndDate')?.setCustomValidity('');
    return true;
  }

  async function hydrateEndDate(){
    const dialog=$('poseDialog');
    if(!dialog?.open||!$('scheduledEndDate')) return;
    const id=$('poseId')?.value;
    if(!id){ $('scheduledEndDate').value=$('scheduledDate')?.value||iso(new Date()); return; }
    const {data,error}=await sb.from('poses').select('scheduled_date,scheduled_end_date').eq('id',id).single();
    if(error) return;
    $('scheduledEndDate').value=data.scheduled_end_date||data.scheduled_date||'';
    validateRange();
  }

  document.addEventListener('change',e=>{
    if(e.target?.id==='scheduledDate'){
      const end=$('scheduledEndDate');
      if(end && (!end.value || end.value<e.target.value)) end.value=e.target.value;
      validateRange();
    }
    if(e.target?.id==='scheduledEndDate') validateRange();
  });

  const poseDialog=$('poseDialog');
  if(poseDialog){
    new MutationObserver(()=>{ if(poseDialog.open) setTimeout(()=>hydrateEndDate().catch(console.warn),30); }).observe(poseDialog,{attributes:true,attributeFilter:['open']});
  }

  document.addEventListener('submit',async e=>{
    if(e.target?.id!=='poseForm') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(!validateRange()){ $('scheduledEndDate')?.reportValidity(); return; }
    const {data:{session}}=await sb.auth.getSession();
    if(!session) return toast('Sessione scaduta');
    const payload={
      job_number:$('jobNumber').value.trim(), client_name:$('clientName').value.trim(), client_phone:$('clientPhone').value.trim()||null,
      address:$('address').value.trim(), city:$('city').value.trim()||null, postal_code:$('postalCode').value.trim()||null,
      scheduled_date:$('scheduledDate').value, scheduled_end_date:$('scheduledEndDate').value,
      start_time:$('startTime').value, end_time:$('endTime').value||null, team_id:$('teamId').value,
      financing:$('financing').value==='true', office_notes:$('officeNotes').value.trim()||null, updated_by:session.user.id
    };
    const id=$('poseId').value;
    let error;
    if(id) ({error}=await sb.from('poses').update(payload).eq('id',id));
    else { payload.created_by=session.user.id; ({error}=await sb.from('poses').insert(payload)); }
    if(error) return toast(error.message);
    $('poseDialog').close();
    toast(id?'Posa aggiornata':'Posa salvata');
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
    grid.forEach(({el,date})=>{
      el.dataset.date=date;
      const host=el.querySelector('.calendar-day-poses'); if(!host) return;
      (poses||[]).forEach(p=>{
        const end=p.scheduled_end_date||p.scheduled_date;
        if(date<p.scheduled_date||date>end||date===p.scheduled_date) return;
        if(host.querySelector(`[data-range-pose="${CSS.escape(p.id)}"]`)) return;
        const chip=document.createElement('div'); chip.className='pose-chip range-chip'; chip.dataset.rangePose=p.id;
        chip.innerHTML=`<strong>${esc(String(p.start_time||'').slice(0,5))} · ${esc(p.job_number)}</strong><span>${esc(p.client_name)}</span><span class="range-label">giorno successivo</span>`;
        host.appendChild(chip);
      });
    });
  }

  function scheduleDecorate(){clearTimeout(decorateTimer);decorateTimer=setTimeout(()=>decorateCalendar().catch(console.warn),140)}
  const content=$('content'); if(content) new MutationObserver(scheduleDecorate).observe(content,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('#calendarPrev,#calendarNext,#calendarToday,.nav-item[data-view="calendar"]')) scheduleDecorate();});
  scheduleDecorate();

  document.addEventListener('click',e=>{
    const poseEl=e.target.closest('[data-pose]'); if(!poseEl) return;
    setTimeout(async()=>{
      const grid=$('detailContent')?.querySelector('.detail-grid'); if(!grid||grid.querySelector('[data-end-date-card]')) return;
      const {data}=await sb.from('poses').select('scheduled_date,scheduled_end_date').eq('id',poseEl.dataset.pose).single();
      if(!data) return;
      const card=document.createElement('div'); card.className='detail-card'; card.dataset.endDateCard='1';
      const fmt=s=>{if(!s)return '—';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`};
      card.innerHTML=`<div class="k">Periodo posa</div><div class="v">${fmt(data.scheduled_date)} → ${fmt(data.scheduled_end_date||data.scheduled_date)}</div>`;
      grid.appendChild(card);
    },220);
  },true);
})();
