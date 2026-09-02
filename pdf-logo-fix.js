(() => {
  const OriginalJsPDF = window.jspdf?.jsPDF;
  if (!OriginalJsPDF) return;

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
  img.src = 'logo_planet.svg?v=20260902-official-logo2';

  function PatchedJsPDF(...args) {
    const doc = new OriginalJsPDF(...args);

    const originalText = doc.text?.bind(doc);
    if (originalText) {
      doc.text = function(text, x, y, ...rest) {
        if (text === 'PLANET WINDOWS' && Number(x) === 14 && Number(y) === 31 && logoDataUrl) {
          const width = 55;
          const height = width / logoRatio;
          doc.addImage(logoDataUrl, 'PNG', 14, 22.5, width, height);
          return doc;
        }
        return originalText(text, x, y, ...rest);
      };
    }

    const originalAddImage = doc.addImage?.bind(doc);
    if (originalAddImage) {
      doc.addImage = function(imageData, format, x, y, width, height, ...rest) {
        if (Number(x) === 14 && Number(y) === 10 && Number(width) === 55 && Number(height) === 18) {
          height = Number(width) / logoRatio;
        }
        return originalAddImage(imageData, format, x, y, width, height, ...rest);
      };
    }

    return doc;
  }

  Object.assign(PatchedJsPDF, OriginalJsPDF);
  PatchedJsPDF.API = OriginalJsPDF.API;
  window.jspdf.jsPDF = PatchedJsPDF;
})();
