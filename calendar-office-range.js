(() => {
  const cfg = window.PW_POSA_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const MONTHS = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  let running = false;

  const isoLocal = d => {
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };

  const parseIso = iso => {
    const [y,m,d]=String(iso||'').split('-').map(Number);
    if(!y||!m||!d) return null;
    return new Date(y,m-1,d,12,0,0,0);
  };

  function displayedMonth(){
    const raw = document.querySelector('.calendar-month-button')?.textContent || document.querySelector('.calendar-toolbar h3')?.textContent || '';
    const m = String(raw).trim().toLowerCase().match(/^([a-zàèéìòù]+)\s+(\d{4})$/i);
    if(!m) return null;
    const month = MONTHS.indexOf(m[1]);
    const year = Number(m[2]);
    return month >= 0 && year ? {month,year} : null;
  }

  function monthMatrix(month,year){
    const first=new Date(year,month,1,12);
    const last=new Date(year,month+1,0,12);
    const mondayIndex=(first.getDay()+6)%7;
    const start=new Date(first); start.setDate(first.getDate()-mondayIndex);
    const sundayIndex=(last.getDay()+6)%7;
    const end=new Date(last); end.setDate(last.getDate()+(6-sundayIndex));
    const out=[];
    for(const d=new Date(start);d<=end;d.setDate(d.getDate()+1)) out.push(new Date(d));
    return out;
  }

  async function isOffice(){
    const {data:{session}}=await sb.auth.getSession();
    if(!session) return false;
    const {data,error}=await sb.from('profiles').select('role').eq('id',session.user.id).single();
    if(error) return false;
    return ['office_scheduler','office_viewer'].includes(data?.role);
  }

  async function enhance(){
    if(running) return;
    const grid=document.querySelector('.calendar-grid.month-grid');
    if(!grid || grid.dataset.officeRangeReady==='1') return;
    if(!(await isOffice())) return;
    const shown=displayedMonth();
    if(!shown) return;

    running=true;
    try{
      const {data:poses,error}=await sb.from('poses').select('id,scheduled_date,scheduled_end_date');
      if(error) return;
      const days=monthMatrix(shown.month,shown.year);
      const cells=[...grid.querySelectorAll('.calendar-day')];
      const cellByIso=new Map();
      cells.forEach((cell,i)=>{ if(days[i]) cellByIso.set(isoLocal(days[i]),cell); });

      for(const p of poses||[]){
        const start=parseIso(p.scheduled_date);
        const end=parseIso(p.scheduled_end_date||p.scheduled_date);
        if(!start||!end) continue;
        const final=end<start?start:end;

        const source=[...grid.querySelectorAll(`.pose-chip[data-pose="${CSS.escape(String(p.id))}"]`)][0];
        if(!source) continue;

        for(const d=new Date(start);d<=final;d.setDate(d.getDate()+1)){
          const iso=isoLocal(d);
          if(iso===p.scheduled_date) continue;
          const cell=cellByIso.get(iso);
          const host=cell?.querySelector('.calendar-day-poses');
          if(!host || host.querySelector(`.pose-chip[data-pose="${CSS.escape(String(p.id))}"]`)) continue;

          host.querySelector('.calendar-empty')?.remove();
          const clone=source.cloneNode(true);
          clone.dataset.rangeOccurrence='1';
          clone.addEventListener('click',e=>{
            e.preventDefault();
            e.stopPropagation();
            source.click();
          });
          host.appendChild(clone);
        }
      }
      grid.dataset.officeRangeReady='1';
    } finally {
      running=false;
    }
  }

  const observer=new MutationObserver(()=>setTimeout(enhance,80));
  observer.observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(enhance,100));
  else setTimeout(enhance,100);
})();