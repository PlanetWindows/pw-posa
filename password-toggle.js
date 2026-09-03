(() => {
  function initPasswordToggle() {
    const input = document.getElementById('password');
    const button = document.getElementById('passwordToggle');
    if (!input || !button || button.dataset.ready === '1') return;
    button.dataset.ready = '1';
    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-label', show ? 'Nascondi password' : 'Mostra password');
      button.setAttribute('aria-pressed', show ? 'true' : 'false');
      button.title = show ? 'Nascondi password' : 'Mostra password';
      button.innerHTML = show
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.3A10.8 10.8 0 0 1 12 4c5.2 0 9 4.4 10 8a12.2 12.2 0 0 1-2.1 4.1"/><path d="M6.6 6.6C4.3 8 2.8 10.1 2 12c1 3.6 4.8 8 10 8 1.5 0 2.9-.4 4.1-1"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
      input.focus({ preventScroll: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPasswordToggle);
  else initPasswordToggle();
})();