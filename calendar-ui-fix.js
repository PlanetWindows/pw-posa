(() => {
  const MONTHS = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  let busy = false;
  let pickerYear = null;

  function parseDisplayedMonth(text){
    const normalized = String(text || '').trim().toLowerCase();
    const m = normalized.match(/^([a-zàèéìòù]+)\s+(\d{4})$/i);
    if(!m) return null;
    const month = MONTHS.indexOf(m[1]);
    const year = Number(m[2]);
    return month >= 0 && Number.isFinite(year) ? {month, year} : null;
  }

  function currentDisplayedMonth(){
    const title = document.querySelector('.calendar-month-button') || document.querySelector('.calendar-toolbar h3');
    return parseDisplayedMonth(title?.textContent);
  }

  function waitForMonthChange(beforeText){
    return new Promise(resolve => {
      const started = Date.now();
      const check = () => {
        const title = document.querySelector('.calendar-month-button') || document.querySelector('.calendar-toolbar h3');
        const nowText = String(title?.textContent || '').trim().toLowerCase();
        if(nowText && nowText !== beforeText) return resolve(true);
        if(Date.now() - started > 2500) return resolve(false);
        setTimeout(check, 60);
      };
      check();
    });
  }

  async function moveToMonth(targetYear, targetMonth){
    if(busy) return;
    const y = Number(targetYear);
    const m = Number(targetMonth);
    if(!Number.isFinite(y) || !Number.isFinite(m) || m < 0 || m > 11) return;

    busy = true;
    try{
      for(let guard=0; guard<120; guard++){
        const current = currentDisplayedMonth();
        if(!current) break;

        const currentIndex = current.year * 12 + current.month;
        const targetIndex = y * 12 + m;
        const diff = targetIndex - currentIndex;
        if(diff === 0) break;

        const control = document.getElementById(diff > 0 ? 'calendarNext' : 'calendarPrev');
        if(!control) break;

        const beforeText = String(
          (document.querySelector('.calendar-month-button') || document.querySelector('.calendar-toolbar h3'))?.textContent || ''
        ).trim().toLowerCase();

        control.click();
        const changed = await waitForMonthChange(beforeText);
        if(!changed) break;
      }
    } finally {
      busy = false;
    }
  }

  function ensurePicker(){
    let picker = document.getElementById('pwMonthPicker');
    if(picker) return picker;

    picker = document.createElement('div');
    picker.id = 'pwMonthPicker';
    picker.className = 'pw-month-picker hidden';
    picker.setAttribute('aria-hidden','true');
    picker.innerHTML = `
      <button type="button" class="pw-month-picker-backdrop" aria-label="Chiudi selezione mese"></button>
      <div class="pw-month-picker-card" role="dialog" aria-modal="true" aria-label="Seleziona mese e anno">
        <div class="pw-month-picker-head">
          <button type="button" class="pw-month-year-nav" data-year-step="-1" aria-label="Anno precedente">←</button>
          <strong class="pw-month-picker-year"></strong>
          <button type="button" class="pw-month-year-nav" data-year-step="1" aria-label="Anno successivo">→</button>
        </div>
        <div class="pw-month-grid">
          ${MONTHS.map((name, index)=>`<button type="button" class="pw-month-option" data-month="${index}">${name.charAt(0).toUpperCase()+name.slice(1)}</button>`).join('')}
        </div>
        <button type="button" class="pw-month-picker-close">Annulla</button>
      </div>
    `;
    document.body.appendChild(picker);

    const close = () => {
      picker.classList.add('hidden');
      picker.setAttribute('aria-hidden','true');
      document.body.classList.remove('pw-month-picker-open');
    };

    picker.querySelector('.pw-month-picker-backdrop')?.addEventListener('click', close);
    picker.querySelector('.pw-month-picker-close')?.addEventListener('click', close);

    picker.querySelectorAll('[data-year-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        pickerYear = Number(pickerYear || new Date().getFullYear()) + Number(btn.dataset.yearStep || 0);
        renderPickerYear();
      });
    });

    picker.querySelectorAll('[data-month]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const month = Number(btn.dataset.month);
        const year = Number(pickerYear);
        if(!Number.isFinite(year) || !Number.isFinite(month)) return;
        close();
        await moveToMonth(year, month);
      });
    });

    return picker;
  }

  function renderPickerYear(){
    const picker = ensurePicker();
    const yearLabel = picker.querySelector('.pw-month-picker-year');
    if(yearLabel) yearLabel.textContent = String(pickerYear || new Date().getFullYear());

    const current = currentDisplayedMonth();
    picker.querySelectorAll('[data-month]').forEach(btn => {
      const active = current && current.year === Number(pickerYear) && current.month === Number(btn.dataset.month);
      btn.classList.toggle('active', !!active);
      btn.setAttribute('aria-current', active ? 'date' : 'false');
    });
  }

  function openPicker(){
    const current = currentDisplayedMonth();
    pickerYear = current?.year || new Date().getFullYear();
    const picker = ensurePicker();
    renderPickerYear();
    picker.classList.remove('hidden');
    picker.setAttribute('aria-hidden','false');
    document.body.classList.add('pw-month-picker-open');
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

    const label = title.textContent.trim();
    title.innerHTML = `<button type="button" class="calendar-month-button" aria-label="Scegli mese e anno">${label}</button>`;

    const prev = document.getElementById('calendarPrev');
    const next = document.getElementById('calendarNext');
    if(prev) prev.classList.add('calendar-nav-hidden');
    if(next) next.classList.add('calendar-nav-hidden');

    title.querySelector('.calendar-month-button')?.addEventListener('click', openPicker);
  }

  const observer = new MutationObserver(enhanceCalendar);
  observer.observe(document.documentElement, {subtree:true, childList:true});
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceCalendar);
  else enhanceCalendar();
})();