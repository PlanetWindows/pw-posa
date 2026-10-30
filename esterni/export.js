(() => {
'use strict';
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function clean(value){return String(value??'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,120)||'allegato';}
function makePdf(title,lines){
 const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});doc.addFileToVFS('Poppins-Regular.ttf',window.PWExternalFont);doc.addFont('Poppins-Regular.ttf','Poppins','normal');doc.setFont('Poppins','normal');let y=39;
 const header=()=>{doc.setFillColor(25,63,52);doc.rect(0,0,210,23,'F');doc.setTextColor(255);doc.setFontSize(13);doc.text('PLANET WINDOWS | PW Posa Esterni',16,14);doc.setTextColor(30,40,32);doc.setFontSize(17);doc.text(title,16,32);};header();
 doc.setFontSize(10);doc.setFont('Poppins','normal');
 for(const line of lines){for(const part of doc.splitTextToSize(String(line??''),178)){if(y>279){doc.addPage();header();y=42;doc.setFontSize(10);}doc.text(part,16,y);y+=5.6;}y+=2;}
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(8);doc.setTextColor(120);doc.text(`${p} / ${pages}`,194,291,{align:'right'});}
 return doc.output('arraybuffer');
}
window.PWExternalExport=async(detail)=>{
 const app=window.PWExternalApp;if(!app.office())throw Error('Esportazione riservata all’ufficio.');if(!window.JSZip||!window.jspdf||!window.PWExternalFont)throw Error('Esportazione non disponibile. Ricarica la pagina.');
 const fresh=await app.details(detail.request.id),{request:r,files,reports,test,events}=fresh,i=app.installer(r.installer_id),zip=new window.JSZip();
 app.toast('Preparazione del fascicolo…');
 const row=(label,value)=>`${label}: ${value??'—'}`;
 zip.file('01_Riepilogo.pdf',makePdf('Riepilogo incarico',[row('Riferimento',r.reference||r.id),row('Cliente / lavoro',r.client_name),row('Posatore',i?.full_name),row('Azienda',i?.company),row('Email',i?.email),row('Telefono',i?.phone),'',row('Indirizzo',r.address),row('Piano',r.floor),row('Stato',({pending:'In attesa',counterproposed:'Controproposta',confirmed:'Confermata',in_progress:'In corso',incomplete:'Lavoro incompleto',completed:'Completata',rejected:'Rifiutata'})[r.status]),row('Giornate',r.work_dates.map(d=>app.fmt(d)).join(', ')),row('Orario',`${r.start_time.slice(0,5)} - ${r.end_time.slice(0,5)}`),row('Prezzo',app.money(r.price)),'','LAVORI RICHIESTI',r.description,'','CONDIZIONI',r.conditions,'È compresa la pulizia del cantiere.',r.conditions_accepted_at?row('Condizioni accettate',new Date(r.conditions_accepted_at).toLocaleString('it-IT',{timeZone:'Europe/Rome'})):'Condizioni non ancora accettate.',...(r.proposed_dates?['',row('Date proposte',r.proposed_dates.map(d=>app.fmt(d)).join(', ')),r.response_note]:[]),'','Per maggiori informazioni o chiarimenti contattare il numero 366 975 0942.']));
 zip.file('02_Rapportini_giornalieri.pdf',makePdf('Rapportini giornalieri',reports.length?reports.flatMap(a=>[app.fmt(a.report_date),row('Posatori',a.operators),row('Ore lavorate',a.hours),a.description,row('Lavoro incompleto',a.incomplete?'Sì':'No'),...(a.incomplete?[row('Motivo e lavori restanti',a.reason)]:[]),'----------------------------------------']):['Nessun rapportino compilato.']));
 zip.file('03_Collaudo.pdf',makePdf('Collaudo di fine lavori',test?[row('Data',app.fmt(test.test_date)),row('Posatore',test.operator_name),row('Esito',test.outcome==='conforme'?'Conforme - lavori completati':'Da completare'),row('Verifiche eseguite',test.checks),row('Pulizia',test.cleaned?'Eseguita':'Da eseguire'),row('Note',test.notes)]:['Collaudo non ancora compilato.']));
 zip.file('04_Storico_aggiornamenti.pdf',makePdf('Storico aggiornamenti',events.slice().reverse().flatMap(e=>[new Date(e.created_at).toLocaleString('it-IT',{timeZone:'Europe/Rome'}),e.message,''])));
 for(let n=0;n<files.length;n++){const f=files[n],result=await app.sb.storage.from('pw-external-private').download(f.storage_path);if(result.error)throw Error(`Fascicolo non esportato: impossibile scaricare “${f.file_name}”. Riprova per ottenere tutti gli allegati.`);const folder=({pdf:'PDF_allegati',before:'Foto_prima',after:'Foto_dopo'})[f.kind];zip.file(`${folder}/${String(n+1).padStart(3,'0')}_${clean(f.file_name)}`,result.data);}
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});download(blob,`Fascicolo_PW_Esterni_${clean(r.reference||r.client_name||r.id.slice(0,8))}.zip`);app.toast('Fascicolo esportato con tutti gli allegati.');
};
})();
