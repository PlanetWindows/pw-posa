(() => {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF?.API) return;

  // Il file logo_planet.svg presente nel repository corrisponde al logo
  // vettoriale ufficiale Planet Windows (rapporto originale 798.8345 / 193.403).
  const OFFICIAL_RATIO = 798.8345 / 193.403;
  let logoDataUrl = null;
  let logoRatio = OFFICIAL_RATIO;

  const img = new Image();
  img.onload = () => {
    try {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (Number.isFinite(ratio) && ratio > 0) logoRatio = ratio;

      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = Math.max(1, Math.round(canvas.width / logoRatio));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      logoDataUrl = canvas.toDataURL('image/png');
    } catch (err) {
      console.warn('PW Posa: impossibile preparare il logo PDF', err);
    }
  };
  img.src = 'logo_planet.svg?v=20260902-official-logo1';

  const originalText = jsPDF.API.text;
  jsPDF.API.text = function(text, x, y, options, transform) {
    // Nel PDF automatico sostituisce SOLO la vecchia scritta PLANET WINDOWS
    // con il logo ufficiale, senza toccare nessun'altra parte del documento.
    if (text === 'PLANET WINDOWS' && Number(x) === 14 && Number(y) === 31 && logoDataUrl) {
      const width = 55;
      const height = width / logoRatio;
      this.addImage(logoDataUrl, 'PNG', 14, 22.5, width, height);
      return this;
    }
    return originalText.call(this, text, x, y, options, transform);
  };

  const originalAddImage = jsPDF.API.addImage;
  jsPDF.API.addImage = function(imageData, format, x, y, width, height, ...rest) {
    // Protezione per il vecchio percorso "Genera PDF": prima usava 55x18 mm,
    // deformando il logo. Mantiene la stessa larghezza e ricava l'altezza
    // esclusivamente dal rapporto originale.
    if (Number(x) === 14 && Number(y) === 10 && Number(width) === 55 && Number(height) === 18) {
      height = Number(width) / logoRatio;
    }
    return originalAddImage.call(this, imageData, format, x, y, width, height, ...rest);
  };
})();
