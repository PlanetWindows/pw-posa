(() => {
  const MONTHS = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  let busy = false;

  function parseDisplayedMonth(text){
    const normalized = String(text || '').trim().toLowerCase();
    const m = normalized.match(/^([a-zàèéìòù]+)\s+(\d{4})$/i);
    if(!m) return null;
    const month = MONTHS.indexOf(m[1]);
    const year = Number(m[2]);
    return month >= 0 && Number.isFinite(year) ? {month, year} : null;
  }

  async function moveToMonth(targetValue){
    if(busy || !targetValue) return;
    const [targetYear, targetMonth1] = targetValue.split('-').map(Number);
    if(!targetYear || !targetMonth1) return;
    busy = true;
    try{
      for(let guard=0; guard<120; guard++){
        const title = document.querySelector('.calendar-month-button');
        const current = parseDisplayedMonth(title?.textContent);
        if(!current) break;
        const currentIndex = current.year * 12 + current.month;
        const targetIndex = targetYear * 12 + (targetMonth1 - 1);
        const diff = targetIndex - currentIndex;
        if(diff === 0) break;
        const control = document.getElementById(diff > 0 ? 'calendarNext' : 'calendarPrev');
        if(!control) break;
        control.click();
        await new Promise(resolve => setTimeout(resolve, 80));
      }
    } finally {
      busy = false;
    }
  }

  function enhanceCalendar(){
    const toolbar = document.querySelector('.calendar-toolbar');
    if(!toolbar || toolbar.dataset.monthPickerReady === '1') return;
    const title = toolbar.querySelector('h3');
    const controls = toolbar.querySelector('.calendar-controls');
    if(!title || !controls) return;

    const parsed = parseDisplayedMonth(title.textContent);
    if(!parsed) return;

    toolbar.dataset.monthPickerReady = '1';
    title.classList.add('calendar-month-title');
    title.innerHTML = `
      <button type="button" class="calendar-month-button" aria-label="Cambia mese">${title.textContent.trim()}</button>
      <input class="calendar-month-picker" type="month" value="${parsed.year}-${String(parsed.month+1).padStart(2,'0')}" aria-label="Seleziona mese e anno">
    `;

    const prev = document.getElementById('calendarPrev');
    const next = document.getElementById('calendarNext');
    if(prev) prev.classList.add('calendar-nav-hidden');
    if(next) next.classList.add('calendar-nav-hidden');

    const monthButton = title.querySelector('.calendar-month-button');
    const monthPicker = title.querySelector('.calendar-month-picker');
    monthButton?.addEventListener('click', () => {
      if(typeof monthPicker.showPicker === 'function') monthPicker.showPicker();
      else monthPicker.click();
    });
    monthPicker?.addEventListener('change', () => moveToMonth(monthPicker.value));
  }

  const observer = new MutationObserver(enhanceCalendar);
  observer.observe(document.documentElement, {subtree:true, childList:true});
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceCalendar);
  else enhanceCalendar();
})();