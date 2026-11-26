(() => {
  const byId = id => document.getElementById(id);
  window.PWPoseMaps = {
    addressCard({address, city, postal_code}) {
      const location = [address, [postal_code, city].filter(Boolean).join(' ')].filter(Boolean).join(', ').trim();
      const label = location.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
      const map = location && `<a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(location)}" target="_blank" rel="noopener noreferrer" class="btn ghost">Apri in Google Maps</a>`;
      return `<div class="detail-card"><div class="k">Indirizzo</div><div class="v">${label || '—'}</div>${map}</div>`;
    }
  };

  const config = window.PW_POSA_CONFIG;
  if (!window.supabase || !config?.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return;
  const supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

  function bind(name, phone, email) {
    const input = byId(name);
    if (!input || byId(name + 'Directory')) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn ghost';
    toggle.textContent = 'Rubrica clienti';
    toggle.setAttribute('aria-expanded', 'false');

    const results = document.createElement('select');
    results.id = name + 'Directory';
    results.hidden = true;
    results.setAttribute('aria-label', 'Contatti dalla rubrica clienti');
    toggle.setAttribute('aria-controls', results.id);

    const suggestions = document.createElement('ul');
    suggestions.className = 'client-suggestions';
    suggestions.hidden = true;
    suggestions.setAttribute('aria-label', 'Clienti suggeriti');
    input.setAttribute('autocomplete', 'off');

    const status = document.createElement('small');
    status.className = 'muted';
    status.setAttribute('role', 'status');
    const label = input.closest('label');
    const field = document.createElement('div');
    label.before(field);
    field.append(label, suggestions, toggle, results, status);

    let timer;
    let revision = 0;
    let contacts = [];
    function clear() {
      revision++;
      clearTimeout(timer);
      contacts = [];
      results.hidden = true;
      results.replaceChildren();
      suggestions.hidden = true;
      suggestions.replaceChildren();
      status.textContent = '';
      toggle.setAttribute('aria-expanded', 'false');
    }

    function choose(contact) {
      input.value = contact.client_name;
      byId(phone).value = contact.client_phone || '';
      byId(email).value = contact.client_email || '';
      clear();
      input.focus();
    }

    function search(query) {
      clear();
      if (query.length > 120) return;
      const requestedRevision = revision;
      if (!query) toggle.setAttribute('aria-expanded', 'true');
      status.textContent = 'Caricamento rubrica…';
      timer = setTimeout(async () => {
        const { data, error } = await supabase.rpc('pw_posa_search_clients', { search_text: query });
        if (requestedRevision !== revision || !input.closest('dialog')?.open) return;
        if (error) {
          status.textContent = 'Rubrica non disponibile. Riprova.';
          return;
        }
        if (!data?.length) {
          status.textContent = 'Nessun cliente trovato.';
          return;
        }
        status.textContent = '';
        contacts = data;
        if (query) {
          for (const contact of contacts) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = [contact.client_name, contact.client_phone, contact.client_email].filter(Boolean).join(' · ');
            button.addEventListener('click', () => choose(contact));
            item.append(button);
            suggestions.append(item);
          }
          suggestions.hidden = false;
          return;
        }
        results.add(new Option(`Seleziona un cliente (${contacts.length})`, ''));
        contacts.forEach((contact, index) => results.add(new Option(
          [contact.client_name, contact.client_phone, contact.client_email].filter(Boolean).join(' · '),
          String(index)
        )));
        results.hidden = false;
      }, query ? 180 : 0);
    }

    toggle.addEventListener('click', () => {
      if (toggle.getAttribute('aria-expanded') === 'true') clear();
      else search('');
    });
    input.addEventListener('input', () => {
      const query = input.value.trim();
      if (query) search(query);
      else clear();
    });

    results.addEventListener('change', () => {
      if (results.value !== '') choose(contacts[Number(results.value)]);
    });

    field.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && event.target === input && !suggestions.hidden) {
        event.preventDefault();
        suggestions.querySelector('button')?.focus();
      }
      if (event.key === 'Escape' && (!suggestions.hidden || !results.hidden)) {
        event.preventDefault();
        clear();
        input.focus();
      }
    });

    input.closest('dialog')?.addEventListener('close', clear);
    input.closest('form')?.addEventListener('reset', clear);
    document.querySelectorAll('[data-program-type]').forEach(button => button.addEventListener('click', clear));
  }

  window.addEventListener('load', () => {
    bind('clientName', 'clientPhone', 'poseClientEmail');
    bind('assClient', 'assPhone', 'assEmail');
  });
})();
