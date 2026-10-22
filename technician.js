(() => {
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={survey:'Rilievo',site_visit:'Uscita in cantiere',note:'Nota / richiamata'};
  const fmt=d=>d?new Date(`${d}T12:00:00`).toLocaleDateString('it-IT'):'—';
  const time=t=>String(t||'').slice(0,5);
  const clean=s=>String(s||'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);
  const bucket='pw-technician-private';
  let active=null,pending=[],existingFiles=[],busy=false,listMode='activities';
  const app=()=>window.PWPosa;
  const editable=()=>app().isScheduler()||app().state.profile.role==='technician';
  const clientName=r=>`${r.first_name} ${r.last_name||''}`.trim();

  function ensureDialog() {
    if($('technicalDialog'))return;
    document.body.insertAdjacentHTML('beforeend',`<dialog id="technicalDialog" class="dialog wide pw-tech-dialog"><form id="technicalForm"><div class="dialog-head"><div><div class="eyebrow">TECNICO</div><h3 id="technicalTitle">Nuova attività</h3></div><button type="button" class="icon-btn" data-tech-close aria-label="Chiudi">×</button></div><div class="pw-tech-body"><p id="technicalError" class="form-error" role="alert"></p><div class="grid2"><label>Tipo di attività<select id="technicalType"><option value="survey">Rilievo</option><option value="site_visit">Uscita in cantiere</option><option value="note">Nota / richiamata</option></select></label><label id="technicalOwnerLabel">Assegnato a<select id="technicalOwner"></select></label><label>Nome *<input id="technicalFirst" autocomplete="given-name" required maxlength="120"></label><label id="technicalLastLabel">Cognome *<input id="technicalLast" autocomplete="family-name" maxlength="120"></label><label class="span2" data-tech-address>Via *<input id="technicalAddress" autocomplete="street-address" maxlength="300"></label><label data-tech-address>Provincia *<input id="technicalProvince" placeholder="Es. MO" maxlength="2" autocomplete="address-level1" pattern="[A-Za-z]{2}"></label><label data-tech-address>CAP *<input id="technicalPostal" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{5}" maxlength="5"></label><label><span id="technicalDateLabel">Data *</span><input id="technicalDate" type="date" required></label><label id="technicalTimeLabel">Ora *<input id="technicalTime" type="time"></label><label>Stato<select id="technicalStatus"><option value="todo">Da fare</option><option value="completed">Completata</option></select></label><label class="span2"><span id="technicalOfficeLabel">Note ufficio</span><textarea id="technicalOfficeNotes" rows="3" maxlength="20000"></textarea></label><label class="span2"><span id="technicalReportLabel">Note del rilievo (facoltative)</span><textarea id="technicalReport" rows="5" maxlength="20000"></textarea></label><div class="span2 pw-tech-files"><div class="pw-tech-files-head"><strong>Foto e documenti <small class="muted">facoltativi</small></strong><button type="button" id="technicalAddFiles" class="btn ghost">+ Aggiungi</button></div><input id="technicalFiles" type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.txt,.csv"><p class="muted">Fino a 25 MB per file. Puoi salvare anche senza allegati e senza rapportino.</p><div id="technicalFileList"></div></div></div></div><div class="dialog-actions pw-tech-actions"><button type="button" class="btn ghost" id="technicalExport">Esporta PDF</button><button type="button" class="btn ghost" id="technicalExportFolder">Esporta fascicolo</button><button type="button" class="btn ghost" id="technicalDelete">Elimina</button><button type="button" class="btn ghost" data-tech-close>Chiudi</button><button type="submit" class="btn primary" id="technicalSave">Salva</button></div></form></dialog>`);
    $('technicalForm').onsubmit=save;
    $('technicalDialog').querySelectorAll('[data-tech-close]').forEach(b=>b.onclick=()=>{if(!busy)$('technicalDialog').close();});
    $('technicalType').onchange=applyType;
    $('technicalAddFiles').onclick=()=>$('technicalFiles').click();
    $('technicalFiles').onchange=e=>{const errors=[];for(const f of e.target.files){if(f.size>25*1024*1024)errors.push(`${f.name}: supera 25 MB`);else if(!/^(image\/(jpeg|png|webp|gif|heic|heif)|application\/(pdf|msword|vnd\.|octet-stream)|text\/)/.test(f.type)&&!/[.](pdf|docx?|xlsx?|od[st]|txt|csv|heic|heif)$/i.test(f.name))errors.push(`${f.name}: formato non supportato`);else pending.push(f);}e.target.value='';renderFiles();$('technicalError').textContent=errors.join(' · ');};
    $('technicalExport').onclick=()=>runExport(false);
    $('technicalExportFolder').onclick=()=>runExport(true);
    $('technicalDelete').onclick=deleteActivity;
  }
  function applyType() {
    const kind=$('technicalType').value,note=kind==='note',canEdit=editable();
    $('technicalDateLabel').textContent=note?'Data della chiamata *':'Data *';
    $('technicalLast').required=!note;
    $('technicalLastLabel').firstChild.textContent=note?'Cognome':'Cognome *';
    $('technicalTimeLabel').classList.toggle('hidden',note);$('technicalTime').required=!note;
    $('technicalDialog').querySelectorAll('[data-tech-address]').forEach(label=>{label.classList.toggle('hidden',note);label.querySelector('input').required=!note;});
    $('technicalOfficeLabel').textContent=note?'Richiesta ricevuta *':'Note ufficio';
    $('technicalOfficeNotes').required=note;
    $('technicalReportLabel').textContent=kind==='site_visit'?'Attività svolta in cantiere (rapportino facoltativo)':note?'Esito / risposta del tecnico (facoltativo)':'Note del rilievo / richieste del cliente (facoltative)';
    $('technicalReport').placeholder=kind==='site_visit'?'Descrivi brevemente cosa sei andato a fare.':kind==='survey'?'Es. Il cliente desidera aggiungere una zanzariera…':'Es. Cliente richiamato, fissata uscita…';
    $('technicalOfficeNotes').readOnly=!app().isScheduler();
    if(active?.activity_type==='note'&&!app().isScheduler()) {
      for(const id of ['technicalType','technicalOwner','technicalFirst','technicalLast','technicalAddress','technicalProvince','technicalPostal','technicalDate','technicalTime'])$(id).disabled=true;
    }
    $('technicalSave').classList.toggle('hidden',!canEdit);
  }
  async function open(row=null,initialType='survey') {
    ensureDialog();active=row;pending=[];existingFiles=[];
    const {sb,state}=app(),office=app().isOffice(),canEdit=editable();
    $('technicalForm').reset();$('technicalError').textContent='';
    $('technicalForm').querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=!canEdit;});
    const owner=office?await sb.from('profiles').select('id,full_name,email').eq('role','technician').eq('active',true):{data:[state.profile]};
    if(owner.error)throw owner.error;
    $('technicalOwner').innerHTML=(owner.data||[]).map(p=>`<option value="${esc(p.id)}">${esc(p.full_name||p.email)}</option>`).join('');
    $('technicalOwnerLabel').classList.toggle('hidden',!office);
    $('technicalType').querySelector('option[value="note"]').hidden=!app().isScheduler()&&row?.activity_type!=='note';
    $('technicalType').value=row?.activity_type||initialType;
    $('technicalOwner').value=row?.technician_id||owner.data?.[0]?.id||'';
    if(!office)$('technicalOwner').disabled=true;
    if(row) {
      $('technicalFirst').value=row.first_name;$('technicalLast').value=row.last_name||'';
      $('technicalAddress').value=row.address||'';$('technicalProvince').value=row.province||'';$('technicalPostal').value=row.postal_code||'';
      $('technicalDate').value=row.scheduled_date;$('technicalTime').value=time(row.start_time);
      $('technicalStatus').value=row.status;$('technicalOfficeNotes').value=row.office_notes||'';$('technicalReport').value=row.technician_notes||'';
      const files=await sb.from('technician_attachments').select('*').eq('activity_id',row.id).order('created_at');if(files.error)throw files.error;existingFiles=files.data||[];
    } else {$('technicalDate').value=window.PWPlanner.selectedDay; $('technicalTime').value='09:00';}
    $('technicalTitle').textContent=row?`${labels[row.activity_type]} · ${clientName(row)}`:'Nuova attività tecnico';
    $('technicalDelete').classList.toggle('hidden',!row||!app().isScheduler());
    for(const id of ['technicalExport','technicalExportFolder'])$(id).classList.toggle('hidden',!row||!office);
    $('technicalAddFiles').classList.toggle('hidden',!canEdit);
    applyType();renderFiles();if(!$('technicalDialog').open)$('technicalDialog').showModal();
  }
  function renderFiles() {
    $('technicalFileList').innerHTML=existingFiles.map(f=>`<div class="pw-tech-file"><button type="button" class="pw-file-open" data-open-tech-file="${esc(f.id)}">${esc(f.file_name)}</button>${editable()&&(app().isScheduler()||f.uploaded_by===app().state.session.user.id)?`<button type="button" class="btn ghost" data-delete-tech-file="${esc(f.id)}">Rimuovi</button>`:''}</div>`).join('')+pending.map((f,i)=>`<div class="pw-tech-file"><span>${esc(f.name)} <small>da caricare</small></span><button type="button" class="btn ghost" data-remove-pending="${i}">Rimuovi</button></div>`).join('')||'<p class="muted">Nessun allegato.</p>';
    $('technicalFileList').querySelectorAll('[data-remove-pending]').forEach(b=>b.onclick=()=>{pending.splice(+b.dataset.removePending,1);renderFiles();});
    $('technicalFileList').querySelectorAll('[data-open-tech-file]').forEach(b=>b.onclick=async()=>{const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;try{const f=existingFiles.find(x=>x.id===b.dataset.openTechFile),r=await app().sb.storage.from(bucket).createSignedUrl(f.storage_path,300);if(r.error)throw r.error;if(popup)popup.location=r.data.signedUrl;else app().toast('Consenti l’apertura di una nuova scheda per visualizzare il file.');}catch(e){popup?.close();app().toast(e.message);}});
    $('technicalFileList').querySelectorAll('[data-delete-tech-file]').forEach(b=>b.onclick=()=>removeFile(b.dataset.deleteTechFile));
  }
  async function removeFile(id) {
    if(busy||!confirm('Rimuovere questo allegato?'))return;const f=existingFiles.find(x=>x.id===id);if(!f)return;
    try {const r=await app().sb.storage.from(bucket).remove([f.storage_path]);if(r.error)throw r.error;const d=await app().sb.from('technician_attachments').delete().eq('id',id);if(d.error)throw d.error;existingFiles=existingFiles.filter(x=>x.id!==id);renderFiles();}catch(e){$('technicalError').textContent=e.message;}
  }
  async function save(event) {
    event.preventDefault();if(busy||!editable())return;
    const {sb,state}=app(),kind=$('technicalType').value,note=kind==='note';
    const payload={activity_type:kind,technician_id:$('technicalOwner').value,first_name:$('technicalFirst').value.trim(),last_name:$('technicalLast').value.trim(),address:note?'':$('technicalAddress').value.trim(),province:note?'':$('technicalProvince').value.trim().toUpperCase(),postal_code:note?'':$('technicalPostal').value.trim(),scheduled_date:$('technicalDate').value,start_time:note?null:$('technicalTime').value,status:$('technicalStatus').value,office_notes:$('technicalOfficeNotes').value.trim()||null,technician_notes:$('technicalReport').value.trim()||null};
    if(!payload.technician_id){$('technicalError').textContent='Non è ancora presente un accesso tecnico attivo.';return;}
    if(!app().isScheduler()&&active?.activity_type==='note') {for(const key of Object.keys(payload))if(!['status','technician_notes'].includes(key))delete payload[key];}
    const requestedStatus=payload.status;
    if(pending.length&&requestedStatus==='completed')payload.status='todo';
    busy=true;$('technicalSave').disabled=true;$('technicalSave').textContent='Salvataggio…';$('technicalError').textContent='';
    try {
      const result=active?await sb.from('technician_activities').update(payload).eq('id',active.id).select('*').single():await sb.from('technician_activities').insert(payload).select('*').single();
      if(result.error)throw result.error;active=result.data;
      while(pending.length) {
        const file=pending[0],path=`${active.id}/${crypto.randomUUID()}/${clean(file.name)}`;
        const uploaded=await sb.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(uploaded.error)throw new Error(`Attività salvata. Caricamento di ${file.name} non riuscito: ${uploaded.error.message}`);
        const added=await sb.from('technician_attachments').insert({activity_id:active.id,storage_path:path,file_name:file.name,mime_type:file.type||null,size_bytes:file.size,uploaded_by:state.session.user.id}).select('*').single();
        if(added.error){await sb.storage.from(bucket).remove([path]);throw new Error(`Attività salvata. Allegato non registrato: ${added.error.message}`);}
        existingFiles.push(added.data);pending.shift();renderFiles();
      }
      if(requestedStatus==='completed'&&active.status!=='completed'){
        const completed=await sb.from('technician_activities').update({status:'completed'}).eq('id',active.id).select('*').single();
        if(completed.error)throw completed.error;active=completed.data;
      }
      $('technicalDialog').close();app().toast('Attività salvata.');window.dispatchEvent(new CustomEvent('pw:activity-saved'));await refreshView();
    } catch(error) {$('technicalError').textContent=error.message;}
    finally {busy=false;$('technicalSave').disabled=false;$('technicalSave').textContent='Salva';}
  }
  async function refreshView() {if(app().state.view==='calendar')await app().renderCalendar();else if(app().state.view?.startsWith('technical'))await renderList(listMode);}
  async function deleteActivity() {
    if(!active||busy||!app().isScheduler()||!confirm(`Eliminare ${labels[active.activity_type].toLowerCase()} di ${clientName(active)}?`))return;
    busy=true;try{const r=await app().sb.from('technician_activities').delete().eq('id',active.id);if(r.error)throw r.error;$('technicalDialog').close();app().toast('Attività eliminata.');await refreshView();}catch(e){$('technicalError').textContent=e.message;}finally{busy=false;}
  }
  async function openDetail(id) {try{const r=await app().sb.from('technician_activities').select('*').eq('id',id).single();if(r.error)throw r.error;await open(r.data);}catch(e){app().toast('Attività non disponibile: '+e.message);}}
  async function openNew() {try{await open();}catch(e){app().toast(e.message);}}

  async function renderList(which='activities') {
    listMode=which;const host=$('content'),{sb,state}=app(),office=app().isOffice();
    if(!office&&state.profile.role!=='technician')return;
    const title=which==='notes'?'Note e richiamate':which==='archive'?'Archivio tecnico':office?'Attività tecnico':'Le mie attività';
    $('pageTitle').textContent=title;host.innerHTML='<div class="panel"><p class="empty">Caricamento…</p></div>';
    try {
      let query=sb.from('technician_activities').select('*').order('scheduled_date',{ascending:which!=='archive'}).order('start_time');
      if(which==='notes')query=query.eq('activity_type','note');if(which==='archive')query=query.eq('status','completed');
      const r=await query;if(r.error)throw r.error;
      host.innerHTML=`<div class="panel"><div class="panel-head"><h3>${title}</h3><span>${(r.data||[]).length} attività</span></div><div class="pw-tech-list-toolbar"><input type="search" id="technicalSearch" placeholder="Cerca nome, cognome o indirizzo…"><label>Stato<select id="technicalStatusFilter"><option value="">Tutti</option><option value="todo"${which==='notes'?' selected':''}>Da fare</option><option value="completed">Completata</option></select></label></div><div id="technicalList"></div></div>`;
      function filterRows() {const q=$('technicalSearch').value.trim().toLocaleLowerCase('it-IT'),status=$('technicalStatusFilter').value;const rows=(r.data||[]).filter(x=>(!status||x.status===status)&&(!q||`${clientName(x)} ${x.address} ${x.office_notes||''}`.toLocaleLowerCase('it-IT').includes(q)));$('technicalList').innerHTML=rows.map(x=>`<button type="button" class="pw-tech-list-item pw-event-${x.activity_type}" data-tech-id="${esc(x.id)}"><div><strong>${esc(clientName(x))}</strong><span>${labels[x.activity_type]} · ${fmt(x.scheduled_date)}${x.start_time?' · '+time(x.start_time):''}</span>${x.activity_type==='note'?`<p>${esc(x.office_notes||'')}</p>`:`<span>${esc(x.address)} · ${esc(x.province)} ${esc(x.postal_code)}</span>`}</div><span class="badge">${x.status==='completed'?'Completata':'Da fare'}</span></button>`).join('')||'<p class="empty">Nessuna attività.</p>';$('technicalList').querySelectorAll('[data-tech-id]').forEach(b=>b.onclick=()=>openDetail(b.dataset.techId));}
      $('technicalSearch').oninput=filterRows;$('technicalStatusFilter').onchange=filterRows;filterRows();
    }catch(e){host.innerHTML=`<div class="panel"><p class="empty">${esc(e.message)}</p></div>`;}
  }
  function pdf(row,files) {
    if(!window.jspdf?.jsPDF)throw new Error('Esportazione PDF non disponibile. Aggiorna la pagina.');
    const doc=new window.jspdf.jsPDF(),width=180;let y=35;
    const header=()=>{doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('PLANET WINDOWS',15,17);doc.setDrawColor(176,139,75);doc.line(15,22,195,22);doc.setFontSize(12);doc.text(labels[row.activity_type],15,30);};header();
    function line(label,value){doc.setFont('helvetica','bold');doc.setFontSize(10);if(y>270){doc.addPage();header();y=40;}doc.text(label,15,y);y+=6;doc.setFont('helvetica','normal');for(const text of doc.splitTextToSize(String(value||'—'),width)){if(y>278){doc.addPage();header();y=40;}doc.text(text,15,y);y+=5;}y+=5;}
    line('Cliente',clientName(row));
    if(row.activity_type!=='note')line('Indirizzo',`${row.address} · ${row.province} ${row.postal_code}`);
    line(row.activity_type==='note'?'Data della chiamata':'Data e ora',`${fmt(row.scheduled_date)}${row.start_time?' · '+time(row.start_time):''}`);
    line('Stato',row.status==='completed'?'Completata':'Da fare');
    line(row.activity_type==='note'?'Richiesta ricevuta':'Note ufficio',row.office_notes);
    line(row.activity_type==='site_visit'?'Attività svolta in cantiere':row.activity_type==='survey'?'Note del rilievo / richieste del cliente':'Esito / risposta del tecnico',row.technician_notes);
    line('Allegati',files.length?files.map(f=>f.file_name).join('\n'):'Nessun allegato');
    const count=doc.getNumberOfPages();for(let p=1;p<=count;p++){doc.setPage(p);doc.setFontSize(8);doc.text(`${p} / ${count}`,190,289,{align:'right'});}
    return doc;
  }
  async function runExport(folder) {
    if(!active||busy||!app().isOffice())return;
    busy=true;try {
      const r=await app().sb.from('technician_activities').select('*').eq('id',active.id).single();if(r.error)throw r.error;
      const files=await app().sb.from('technician_attachments').select('*').eq('activity_id',active.id).order('created_at');if(files.error)throw files.error;
      const row=r.data,list=files.data||[],doc=pdf(row,list),name=clean(`${labels[row.activity_type]}_${clientName(row)}_${row.scheduled_date}`);
      if(!folder){doc.save(`${name}.pdf`);return;}
      if(!window.JSZip)throw new Error('Esportazione fascicolo non disponibile.');
      const zip=new window.JSZip();zip.file(`${name}.pdf`,doc.output('arraybuffer'));
      for(let i=0;i<list.length;i++){const f=list[i],download=await app().sb.storage.from(bucket).download(f.storage_path);if(download.error)throw new Error(`Impossibile esportare ${f.file_name}: ${download.error.message}`);zip.file(`Allegati/${String(i+1).padStart(2,'0')}_${clean(f.file_name)}`,await download.data.arrayBuffer());}
      const blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`Fascicolo_${name}.zip`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(e){$('technicalError').textContent=e.message;}finally{busy=false;}
  }
  window.PWTechnician={openNew,openDetail,renderList};
})();
