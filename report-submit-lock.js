(() => {
  const nativeAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    try {
      if (
        type === 'submit' &&
        this instanceof HTMLFormElement &&
        this.id === 'dailyReportForm'
      ) {
        console.warn('[PW Posa] Bloccato submit handler duplicato su dailyReportForm');
        return;
      }
    } catch (_) {}
    return nativeAdd.call(this, type, listener, options);
  };

  window.__PW_REPORT_SINGLE_SUBMIT__ = true;
})();