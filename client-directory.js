(() => {
  const byId = id => document.getElementById(id);
  const formatAddress = ({address, city, postal_code}) =>
    [address, [postal_code, city].filter(Boolean).join(' ')].filter(Boolean).join(', ').trim();

  window.PWPoseMaps = {
    addressCard(contact) {
      const location = formatAddress(contact);
      const label = location.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
      const map = location ? `<a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(location)}" target="_blank" rel="noopener noreferrer" class="client-address-link">${label}</a>` : '—';
      return `<div class="detail-card"><div class="k">Indirizzo</div><div class="v">${map}</div></div>`;
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

  function bindAddressSuggest(clientId, streetId, cityId, postalId) {
    const client = byId(clientId);
    const street = byId(streetId);
    const city = byId(cityId);
    const postal = byId(postalId);
    if (!client || !street || !city || !postal) return;

    const list = document.createElement('ul');
    list.className = 'client-suggestions';
    list.setAttribute('aria-label', 'Indirizzi di cantiere suggeriti');
    list.hidden = true;
    street.closest('label').append(list);
    street.setAttribute('autocomplete', 'off');
    const dialog = street.closest('dialog');
    let timer;
    let revision = 0;
    let history;
    let historyClient;

    function clear() {
      revision++;
      clearTimeout(timer);
      list.hidden = true;
      list.replaceChildren();
    }

    function suggest() {
      clear();
      const name = client.value.trim();
      if (!name) return;
      const current = revision;
      const filter = street.value.trim().toLocaleLowerCase('it');
      timer = setTimeout(async () => {
        if (historyClient !== name) {
          const responses = await Promise.all(['poses', 'assistances'].map(table => {
            const query = supabase.from(table).select('address,city,postal_code')
              .eq('client_name', name).order('updated_at', { ascending: false }).limit(30);
            return table === 'poses' ? query.is('external_request_id', null) : query;
          }));
          if (current !== revision || !dialog.open || client.value.trim() !== name) return;
          history = responses.flatMap(response => response.data || []);
          historyClient = name;
        }
        if (current !== revision || !dialog.open || client.value.trim() !== name) return;
        const shown = new Set();
        for (const address of history) {
          const label = formatAddress(address);
          const key = label.toLocaleLowerCase('it');
          if (!address.address?.trim() || !key.includes(filter) || shown.has(key)) continue;
          shown.add(key);
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.addEventListener('click', () => {
            street.focus();
            street.value = address.address;
            city.value = address.city || '';
            postal.value = address.postal_code || '';
            clear();
          });
          item.append(button);
          list.append(item);
          if (shown.size === 6) break;
        }
        list.hidden = shown.size === 0;
      }, 180);
    }

    street.addEventListener('focus', suggest);
    street.addEventListener('input', suggest);
    client.addEventListener('input', clear);
    street.closest('form')?.addEventListener('reset', clear);
    document.querySelectorAll('[data-program-type]').forEach(button => button.addEventListener('click', clear));
    dialog.addEventListener('close', () => {
      clear();
      history = undefined;
      historyClient = undefined;
    });
    street.closest('label').addEventListener('keydown', event => {
      if (list.hidden) return;
      if (event.key === 'ArrowDown' && event.target === street) {
        event.preventDefault();
        list.querySelector('button')?.focus();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        street.focus();
        clear();
      }
    });
  }

  window.addEventListener('load', () => {
    bind('clientName', 'clientPhone', 'poseClientEmail');
    bind('assClient', 'assPhone', 'assEmail');
    bindAddressSuggest('clientName', 'address', 'city', 'postalCode');
    bindAddressSuggest('assClient', 'assAddress', 'assCity', 'assPostal');
  });
})();
