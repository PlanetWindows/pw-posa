(()=>{
  if(window.__PW_POSE_CLOSE_DAY_RULE_20260929)return;window.__PW_POSE_CLOSE_DAY_RULE_20260929=true;
  const cfg=window.PW_POSA_CONFIG||{};if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY),$=id=>document.getElementById(id);let activePoseId=null,role=null,busy=false;
  const toast=m=>{const e=$('toast');if(!e)return alert(m);e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),4200)};
  async function profile(){if(role)return role;const {data:{session}}=await sb.auth.getSession();if(!session)return null;const {data,error}=await sb.from('profiles').select('role').eq('id',session.user.id).limit(1);if(error)throw error;return role=data?.[0]?.role||null}
  async function getPose(id){const {data,error}=await sb.from('poses').select('*').eq('id',id).limit(1);if(error)throw error;if(!data?.length)throw Error('Posa non accessibile');return data[0]}
  async function getDdt(id){const {data,error}=await sb.from('ddt_documents').select('*').eq('pose_id',id).order('created_at',{ascending:false}).limit(1);if(error)throw error;return data?.[0]||null}

  async function getPoseDates(id,pose){
    const {data,error}=await sb.from('pose_dates').select('pose_date').eq('pose_id',id).order('pose_date');
    if(error){console.warn('PW Posa pose_dates:',error);return pose?.scheduled_date?[pose.scheduled_date]:[]}
    const dates=[...new Set((data||[]).map(x=>x.pose_date).filter(Boolean))].sort();
    if(!dates.length&&pose?.scheduled_date)dates.push(pose.scheduled_date);
    return dates;
  }
  async function getDayMode(pose,ddt){
    const date=$('reportDate')?.value||pose.scheduled_date||'';
    const dates=await getPoseDates(pose.id,pose);
    const firstDay=dates[0]||pose.scheduled_date||date;
    const isFirstDay=!date||date===firstDay;
    const pendingDdt=!!ddt&&ddt.email_status!=='sent';
    return {date,firstDay,isFirstDay,useDdt:isFirstDay||pendingDdt};
  }
  function hideLegacyDdt(){const root=$('detailContent');if(!root)return;root.querySelectorAll('[data-ddt-card],.ddt-sign-grid').forEach(x=>{if(!x.closest('[data-pose-unified-close]'))x.style.display='none'});[...root.querySelectorAll('button')].forEach(b=>{if(b.closest('[data-pose-unified-close]'))return;const t=(b.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();if(t.includes('firma ddt')||t.includes('firma documento di trasporto')||t.includes('conferma firme')||t.includes('firma e invia')){const card=b.closest('.report-card,.detail-card,.ddt-card,.ass-detail-section')||b;card.style.display='none'}});const dlg=$('ddtSignDialog');if(dlg?.open)dlg.close()}
  function makeCanvas(c,clear){if(!c)return;const x=c.getContext('2d');x.lineWidth=3;x.lineCap='round';x.strokeStyle='#111';let on=false,last;const pt=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height}};c.onpointerdown=e=>{on=true;last=pt(e);c.dataset.signed='1';e.preventDefault()};c.onpointermove=e=>{if(!on)return;const p=pt(e);x.beginPath();x.moveTo(last.x,last.y);x.lineTo(p.x,p.y);x.stroke();last=p;e.preventDefault()};c.onpointerup=c.onpointercancel=()=>on=false;if(clear)clear.onclick=()=>{x.clearRect(0,0,c.width,c.height);c.dataset.signed='0'}}
  function uniqueNumber(pose,date){const job=String(pose.job_number||'POSA').replace(/[^a-zA-Z0-9]+/g,'').slice(0,12)||'POSA';const t=(crypto.randomUUID?.()||String(Date.now())).replace(/-/g,'').slice(0,8).toUpperCase();return `RAP-${String(date).replaceAll('-','')}-${job}-${t}`}
  async function findReport(poseId,date){const {data:links,error:le}=await sb.from('daily_report_poses').select('report_id').eq('pose_id',poseId);if(le)throw le;const ids=[...new Set((links||[]).map(x=>x.report_id).filter(Boolean))];if(!ids.length)return null;const {data,error}=await sb.from('daily_reports').select('*').in('id',ids).eq('report_date',date).order('created_at',{ascending:false}).limit(1);if(error)throw error;return data?.[0]||null}
  async function saveDraft(pose){const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Sessione scaduta');const date=$('reportDate')?.value,hours=Number($('reportHours')?.value||0),completed=String(pose.office_notes||'').trim(),finished=document.querySelector('input[name="pwFinished"]:checked')?.value;if(!date)throw Error('Seleziona la giornata');if(!hours)throw Error('Inserisci le ore lavorate');if(!finished)throw Error('Indica se il lavoro è stato finito');const payload={report_date:date,created_by:session.user.id,team_id:pose.team_id,hours_worked:hours,completed_work:completed||null,remaining_work:null,not_completed_reason:null,issues_found:finished==='no'?(($('reportIssues')?.value||'').trim()||null):null,materials_notes:finished==='no'?(($('reportMaterials')?.value||'').trim()||null):null,final_notes:($('reportNotes')?.value||'').trim()||null,status:'draft',submitted_at:null,updated_at:new Date().toISOString()};let r=await findReport(pose.id,date);if(r){const {data,error}=await sb.from('daily_reports').update(payload).eq('id',r.id).select('*').limit(1);if(error)throw error;if(data?.length)r=data[0];else if(r.pdf_storage_path){r={...r,...payload}}else throw Error('Rapportino non aggiornabile')}else{const {data,error}=await sb.from('daily_reports').insert({...payload,report_number:uniqueNumber(pose,date)}).select('*').limit(1);if(error)throw error;r=data?.[0];if(!r)throw Error('Rapportino non creato');const {error:linkError}=await sb.from('daily_report_poses').insert({report_id:r.id,pose_id:pose.id});if(linkError)throw linkError}return r}

  async function renderClose(form,pose,ddt){
    form.querySelector('[data-pose-unified-close]')?.remove();
    form.querySelectorAll('button[type="submit"]').forEach(b=>{b.type='button';b.style.display='none'});
    const mode=await getDayMode(pose,ddt);
    const sent=ddt?.email_status==='sent';

    if(mode.isFirstDay&&sent){
      const done=document.createElement('div');
      done.dataset.poseUnifiedClose='1';
      done.className='report-card';
      done.style.marginTop='18px';
      done.innerHTML='<div class="completion-ok"><strong>Primo giorno già chiuso: DDT già inviato al cliente.</strong></div>';
      form.appendChild(done);
      return;
    }

    const useDdt=mode.isFirstDay?!!ddt:(!!ddt&&!sent);
    const box=document.createElement('div');
    box.dataset.poseUnifiedClose='1';
    box.className='report-card';
    box.style.marginTop='18px';

    const intro=mode.isFirstDay
      ? 'Primo giorno di posa: il DDT è obbligatorio. Il rapportino viene firmato e salvato in archivio; al cliente viene inviato il DDT firmato.'
      : useDdt
        ? 'Dal secondo giorno il DDT è facoltativo. È presente un nuovo DDT: verrà firmato e inviato al cliente.'
        : 'Dal secondo giorno il DDT è facoltativo. Se non ci sono nuovi materiali da trasportare, puoi chiudere la giornata salvando solo il rapportino.';

    let ddtPart='';
    if(useDdt){
      ddtPart='<div style="height:1px;background:var(--line);margin:20px 0"></div>'
        +'<h4>Firme DDT</h4>'
        +'<p class="muted">'+String(ddt?.original_name||'DDT associato')+'</p>'
        +'<div class="ddt-sign-grid">'
        +'<div class="ddt-sign-box"><strong>Firma Posatore – DDT</strong><canvas id="poseDdtInstaller" width="700" height="220"></canvas><button type="button" class="btn ghost" id="poseDdtInstallerClear">Cancella firma</button></div>'
        +'<div class="ddt-sign-box"><strong>Firma Cliente – DDT</strong><canvas id="poseDdtClient" width="700" height="220"></canvas><button type="button" class="btn ghost" id="poseDdtClientClear">Cancella firma</button></div>'
        +'</div>';
    }else if(mode.isFirstDay){
      ddtPart='<div class="form-error">DDT non presente. Nel primo giorno l’Ufficio deve associare il DDT prima della chiusura.</div>';
    }else{
      ddtPart='<div class="completion-ok"><strong>DDT facoltativo per questa giornata.</strong><div class="muted">'
        +(sent?'Il DDT precedente risulta già inviato.':'Nessun nuovo DDT da firmare.')
        +'</div></div>';
    }

    box.innerHTML='<div class="eyebrow">CHIUSURA POSA</div>'
      +'<h4>'+(useDdt?'Rapportino + DDT':'Rapportino di fine giornata')+'</h4>'
      +'<p class="muted">'+intro+'</p>'
      +'<div id="poseUnifiedError" class="form-error"></div>'
      +'<h4>Firma Posatore – Rapportino</h4>'
      +'<div class="signature-wrap"><canvas id="poseReportInstaller" width="900" height="300" style="touch-action:none;width:100%;background:#fff"></canvas></div>'
      +'<button type="button" class="btn ghost" id="poseReportClear">Cancella firma</button>'
      +ddtPart
      +'<button type="button" class="btn primary" id="poseUnifiedSend" style="width:100%;margin-top:24px" '+(mode.isFirstDay&&!ddt?'disabled':'')+'>'
      +(useDdt?'SALVA RAPPORTINO E INVIA DDT':'SALVA RAPPORTINO')
      +'</button><div id="poseUnifiedProgress" class="muted" style="margin-top:10px"></div>';

    form.appendChild(box);
    hideLegacyDdt();
    makeCanvas($('poseReportInstaller'),$('poseReportClear'));
    if(useDdt){
      makeCanvas($('poseDdtInstaller'),$('poseDdtInstallerClear'));
      makeCanvas($('poseDdtClient'),$('poseDdtClientClear'));
    }
    $('poseUnifiedSend').onclick=()=>finalize(pose,ddt,{useDdt,isFirstDay:mode.isFirstDay});
  }

  async function enhance(){
    hideLegacyDdt();
    const form=$('dailyReportForm');
    if(!form||await profile()!=='installer')return;
    const poseId=activePoseId;
    if(!poseId||form.dataset.poseUnified==='1')return;
    const [pose,ddt]=await Promise.all([getPose(poseId),getDdt(poseId)]);
    form.dataset.poseUnified='1';
    await renderClose(form,pose,ddt);
    const dateInput=$('reportDate');
    if(dateInput&&dateInput.dataset.poseCloseDayRule!=='1'){
      dateInput.dataset.poseCloseDayRule='1';
      dateInput.addEventListener('change',()=>renderClose(form,pose,ddt).catch(console.warn));
    }
  }

  async function finalize(pose,ddt,opts={}){
    if(busy)return;
    const er=$('poseUnifiedError'),pr=$('poseUnifiedProgress'),useDdt=!!opts.useDdt;
    if(er)er.textContent='';
    const required=[['poseReportInstaller','Firma Posatore – Rapportino']];
    if(useDdt)required.push(['poseDdtInstaller','Firma Posatore – DDT'],['poseDdtClient','Firma Cliente – DDT']);
    for(const [id,label] of required){
      if($(id)?.dataset.signed!=='1'){if(er)er.textContent=label+' obbligatoria.';return}
    }
    if(opts.isFirstDay&&!ddt){if(er)er.textContent='DDT non presente: nel primo giorno è obbligatorio.';return}
    if(useDdt&&!ddt){if(er)er.textContent='DDT non presente.';return}

    busy=true;
    const btn=$('poseUnifiedSend');
    btn.disabled=true;
    try{
      if(pr)pr.textContent=useDdt?'1/3 · Preparazione Rapportino…':'1/2 · Preparazione Rapportino…';
      const report=await saveDraft(pose);
      if(pr)pr.textContent=useDdt?'1/3 · Generazione e archiviazione Rapportino firmato…':'2/2 · Generazione e archiviazione Rapportino firmato…';
      let r=await sb.functions.invoke('finalize-pose-report',{body:{pose_id:pose.id,report_id:report.id,installer_signature_data_url:$('poseReportInstaller').toDataURL('image/png')}});
      if(r.error||!r.data?.ok)throw Error('Rapportino: '+(r.data?.error||r.error?.message||'errore sconosciuto'));

      if(!useDdt){
        toast('Rapportino salvato in archivio. DDT non richiesto per questa giornata.');
        if(pr)pr.textContent='Rapportino archiviato. Nessun DDT previsto per questa giornata.';
        btn.remove();
        setTimeout(()=>{const dlg=$('detailDialog');if(dlg?.open)dlg.close()},700);
        return;
      }

      if(pr)pr.textContent='2/3 · Generazione DDT firmato…';
      r=await sb.functions.invoke('finalize-ddt',{body:{ddt_id:ddt.id,installer_signature_data_url:$('poseDdtInstaller').toDataURL('image/png'),client_signature_data_url:$('poseDdtClient').toDataURL('image/png')}});
      if(r.error||!r.data?.ok)throw Error('DDT: '+(r.data?.error||r.error?.message||'errore sconosciuto'));
      if(pr)pr.textContent='3/3 · Invio DDT al cliente…';
      r=await sb.functions.invoke('send-pose-package',{body:{pose_id:pose.id,report_id:report.id}});
      if(r.error||!r.data?.ok)throw Error('Invio email: '+(r.data?.error||r.error?.message||'errore sconosciuto'));
      toast('Rapportino salvato in archivio. DDT inviato al cliente.');
      if(er)er.textContent='';
      if(pr)pr.textContent='Rapportino archiviato e DDT inviato al cliente.';
      btn.remove();
      setTimeout(()=>{const dlg=$('detailDialog');if(dlg?.open)dlg.close()},700);
    }catch(e){
      console.error(e);
      if(er)er.textContent=e.message||String(e);
      if(pr)pr.textContent='Operazione non confermata. Controlla il messaggio sopra e riprova.';
      btn.disabled=false;
    }finally{busy=false}
  }
  document.addEventListener('click',e=>{const p=e.target.closest('[data-pose]');if(p?.dataset.pose){activePoseId=p.dataset.pose;setTimeout(()=>enhance().catch(console.warn),250)}},true);
  document.addEventListener('click',e=>{if(!activePoseId)return;const b=e.target.closest('button');if(!b||b.closest('[data-pose-unified-close]'))return;const t=(b.textContent||'').toLowerCase();if(t.includes('firma ddt')||t.includes('firma documento di trasporto')||t.includes('conferma firme')){e.preventDefault();e.stopImmediatePropagation();hideLegacyDdt()}},true);
  new MutationObserver(()=>enhance().catch(()=>{})).observe(document.body,{childList:true,subtree:true});
})();