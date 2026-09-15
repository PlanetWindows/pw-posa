(()=>{
  const isIOS=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  if(!isIOS)return;

  const $=id=>document.getElementById(id);

  function installStyle(){
    if($('iosTouchHardfixStyle'))return;
    const s=document.createElement('style');
    s.id='iosTouchHardfixStyle';
    s.textContent=`
      @supports (-webkit-touch-callout:none){
        html.ios-assistance-open,body.ios-assistance-open{overflow:hidden!important;touch-action:none!important}
        #assistanceDetailDialog.ios-assistance-fixed[open]{
          position:fixed!important;
          inset:8px!important;
          width:auto!important;
          max-width:none!important;
          height:auto!important;
          max-height:none!important;
          margin:0!important;
          display:block!important;
          overflow-y:auto!important;
          overflow-x:hidden!important;
          -webkit-overflow-scrolling:touch!important;
          touch-action:pan-y!important;
          z-index:2147483000!important;
          pointer-events:auto!important;
          border-radius:18px!important;
        }
        #assistanceDetailDialog.ios-assistance-fixed .dialog-head{
          position:sticky!important;
          top:0!important;
          z-index:50!important;
          pointer-events:auto!important;
        }
        #assistanceDetailDialog.ios-assistance-fixed #assClose{
          position:relative!important;
          z-index:60!important;
          pointer-events:auto!important;
          touch-action:manipulation!important;
        }
        #assistanceDetailDialog.ios-assistance-fixed canvas{
          pointer-events:auto!important;
          touch-action:none!important;
          -webkit-user-select:none!important;
          user-select:none!important;
        }
      }`;
    document.head.appendChild(s);
  }

  function patchDialog(){
    const dlg=$('assistanceDetailDialog');
    if(!dlg||dlg.dataset.iosHardfixDialog==='1')return;
    dlg.dataset.iosHardfixDialog='1';

    const originalClose=HTMLDialogElement.prototype.close;

    dlg.showModal=function(){
      if(this.open)return;
      this.classList.add('ios-assistance-fixed');
      this.setAttribute('open','');
      document.documentElement.classList.add('ios-assistance-open');
      document.body.classList.add('ios-assistance-open');
      this.scrollTop=0;
      setTimeout(patchCanvases,0);
      setTimeout(patchCanvases,120);
    };

    dlg.close=function(returnValue=''){
      if(!this.open)return;
      this.returnValue=String(returnValue??'');
      this.removeAttribute('open');
      this.classList.remove('ios-assistance-fixed');
      document.documentElement.classList.remove('ios-assistance-open');
      document.body.classList.remove('ios-assistance-open');
      try{this.dispatchEvent(new Event('close'))}catch(_){ }
    };

    // If the dialog was already opened natively before this file attached,
    // move it out of the modal top layer and reopen it with the fixed iOS mode.
    if(dlg.open){
      try{originalClose.call(dlg)}catch(_){ }
      dlg.showModal();
    }
  }

  function closeDialog(e){
    const close=e.target?.closest?.('#assClose');
    if(!close)return false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    const dlg=$('assistanceDetailDialog');
    if(dlg?.open)dlg.close();
    return true;
  }

  function bindCanvas(c){
    if(!c||c.dataset.iosHardfixCanvas==='1')return;
    c.dataset.iosHardfixCanvas='1';
    c.style.touchAction='none';
    c.style.webkitUserSelect='none';
    c.style.userSelect='none';

    const ctx=c.getContext('2d');
    if(!ctx)return;
    ctx.lineWidth=3;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.strokeStyle='#111';

    let drawing=false,last=null;
    const pt=t=>{const r=c.getBoundingClientRect();return{x:(t.clientX-r.left)*c.width/Math.max(r.width,1),y:(t.clientY-r.top)*c.height/Math.max(r.height,1)}};

    c.addEventListener('touchstart',e=>{
      const t=e.touches?.[0]; if(!t)return;
      e.preventDefault(); e.stopImmediatePropagation();
      drawing=true; last=pt(t); c.dataset.signed='1';
      // The legacy assistance signature keeps a local `signed` variable.
      // Calling its original pointer handler keeps that state in sync.
      if(c.id==='assCanvas'&&typeof c.onpointerdown==='function'){
        try{c.onpointerdown({clientX:t.clientX,clientY:t.clientY})}catch(_){ }
      }
    },{capture:true,passive:false});

    c.addEventListener('touchmove',e=>{
      const t=e.touches?.[0]; if(!t||!drawing)return;
      e.preventDefault(); e.stopImmediatePropagation();
      if(c.id==='assCanvas'&&typeof c.onpointermove==='function'){
        try{c.onpointermove({clientX:t.clientX,clientY:t.clientY})}catch(_){ }
      }else{
        const p=pt(t); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; c.dataset.signed='1';
      }
    },{capture:true,passive:false});

    const end=e=>{
      if(e){e.preventDefault();e.stopImmediatePropagation();}
      drawing=false;last=null;
      if(c.id==='assCanvas'){
        try{window.dispatchEvent(new Event('pointerup'))}catch(_){ }
      }
    };
    c.addEventListener('touchend',end,{capture:true,passive:false});
    c.addEventListener('touchcancel',end,{capture:true,passive:false});
  }

  function patchCanvases(){
    const dlg=$('assistanceDetailDialog');
    if(!dlg)return;
    dlg.querySelectorAll('canvas').forEach(bindCanvas);
    // DDT signature dialog can also be opened from the assistance flow.
    $('ddtSignDialog')?.querySelectorAll('canvas').forEach(bindCanvas);
  }

  installStyle();
  patchDialog();
  patchCanvases();

  document.addEventListener('touchstart',e=>{ if(closeDialog(e))return; },{capture:true,passive:false});
  document.addEventListener('click',e=>{ if(closeDialog(e))return; },true);

  new MutationObserver(()=>{
    patchDialog();
    patchCanvases();
  }).observe(document.body,{subtree:true,childList:true});

  window.addEventListener('load',()=>{
    patchDialog();
    patchCanvases();
    setTimeout(()=>{patchDialog();patchCanvases()},500);
  });
})();
