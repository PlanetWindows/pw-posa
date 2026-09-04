(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const months = {gennaio:0,febbraio:1,marzo:2,aprile:3,maggio:4,giugno:5,luglio:6,agosto:7,settembre:8,ottobre:9,novembre:10,dicembre:11};
  let busy = false;

  function currentGridDates(){
    const title = document.querySelector('.calendar-toolbar h3')?.textContent?.trim().toLowerCase();
    const cells = [...document.querySelectorAll('.calendar-grid .calendar-day')];
    if (!title || !cells.length) return [];
    const m = title.match(/^([a-zàèéìòù]+)\s+(\d{4})$/i);
    if (!m || months[m[1]] == null) return [];
    const year = Number(m[2]), month = months[m[1]];
    const first = new Date(year, month, 1, 12);
    const mondayIndex = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(first.getDate() - mondayIndex);
    return cells.map((cell,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return {cell,date:isoLocal(d)}; });
  }

  async function renderAssistances(){
    if (busy || document.getElementById('pageTitle')?.textContent !== 'Calendario') return;
    const grid = currentGridDates();
    if (!grid.length) return;
    busy = true;
    try {
      const start = grid[0].date, end = grid[grid.length-1].date;
      const ar = await sb.from('assistances').select('id,protocol_order,client_name,start_time,scheduled_date,scheduled_end_date').lte('scheduled_date', end).gte('scheduled_end_date', start).order('start_time');
      if (ar.error) return;
      const ids = (ar.data||[]).map(x=>x.id);
      let dateRows = [];
      if (ids.length) {
        const dr = await sb.from('assistance_dates').select('assistance_id,assistance_date').in('assistance_id', ids);
        if (!dr.error) dateRows = dr.data || [];
      }
      const datesById = new Map();
      for (const d of dateRows) {
        if (!datesById.has(d.assistance_id)) datesById.set(d.assistance_id, new Set());
        datesById.get(d.assistance_id).add(d.assistance_date);
      }
      document.querySelectorAll('.calendar-assistance-injected').forEach(x=>x.remove());
      const cellMap = new Map(grid.map(x=>[x.date,x.cell]));
      for (const a of ar.data || []) {
        const dates = datesById.get(a.id) || new Set([a.scheduled_date]);
        if (!dates.size) dates.add(a.scheduled_date);
        for (const date of dates) {
          const cell = cellMap.get(date); if (!cell) continue;
          const host = cell.querySelector('.calendar-day-poses'); if (!host) continue;
          host.querySelector('.calendar-empty')?.remove();
          if (host.querySelector(`[data-assistance="${CSS.escape(a.id)}"]`)) continue;
          const btn = document.createElement('button');
          btn.type='button';
          btn.className='pose-chip assistance-chip pw-calendar-assistance calendar-assistance-injected';
          btn.dataset.assistance=a.id;
          btn.innerHTML=`<span class="pw-type-label assistenza">ASSISTENZA</span><strong>${esc(String(a.start_time||'').slice(0,5))} · ${esc(a.protocol_order)}</strong><span>${esc(a.client_name)}</span>`;
          host.appendChild(btn);
        }
      }
    } finally { busy = false; }
  }

  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(renderAssistances, 120); };
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click', e => {
    if (e.target.closest('#calendarPrev,#calendarNext,#calendarToday,[data-view="calendar"]')) setTimeout(renderAssistances, 180);
  }, true);
  window.addEventListener('load', ()=>setTimeout(renderAssistances, 500));
})();