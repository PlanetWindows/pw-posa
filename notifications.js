(() => {
  const VAPID_PUBLIC_KEY = 'BL6oByyaj54jYYOOxsXtLOI0zVOCuTVWWTwSx4NUj15s15P-2_98iLRekpnFDL9hdtRhpopcHgDQYWOllxfvXuQ';
  const cfg = window.PW_POSA_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return;

  const pushSb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let button = null;
  let busy = false;

  function base64UrlToUint8Array(base64Url) {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
  }

  function toast(message) {
    const el = document.getElementById('toast');
    if (!el) return alert(message);
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3200);
  }

  async function currentUser() {
    const { data: { session } } = await pushSb.auth.getSession();
    return session?.user || null;
  }

  async function getRegistration() {
    if (!('serviceWorker' in navigator)) throw new Error('Service worker non supportato su questo dispositivo.');
    return navigator.serviceWorker.ready;
  }

  async function saveSubscription(subscription, user) {
    const json = subscription.toJSON();
    const payload = {
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString()
    };
    if (!payload.endpoint || !payload.p256dh || !payload.auth) throw new Error('Dati della sottoscrizione push incompleti.');

    const { error } = await pushSb
      .from('push_subscriptions')
      .upsert(payload, { onConflict: 'endpoint' });
    if (error) throw error;
  }

  async function ensureSubscription() {
    const user = await currentUser();
    if (!user) throw new Error('Accedi a PW Posa prima di attivare le notifiche.');

    if (!('Notification' in window) || !('PushManager' in window)) {
      throw new Error('Le notifiche push non sono supportate da questo browser/dispositivo.');
    }

    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permesso notifiche non concesso.');

    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    await saveSubscription(subscription, user);
    return subscription;
  }

  async function sendTestPush() {
    const { data: { session } } = await pushSb.auth.getSession();
    if (!session) throw new Error('Sessione non disponibile.');

    const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        title: 'PW Posa',
        body: 'Notifica di prova ricevuta correttamente.',
        url: './'
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Invio push fallito (${response.status})`);
    }
    return result;
  }

  async function refreshButton() {
    if (!button) return;
    const user = await currentUser();
    if (!user) {
      button.classList.add('hidden');
      return;
    }
    button.classList.remove('hidden');

    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager?.getSubscription();
      if (Notification.permission === 'granted' && subscription) {
        button.textContent = '🔔 Test notifica';
        button.dataset.pushReady = '1';
      } else {
        button.textContent = '🔔 Attiva notifiche';
        button.dataset.pushReady = '0';
      }
    } catch {
      button.textContent = '🔔 Attiva notifiche';
      button.dataset.pushReady = '0';
    }
  }

  async function handleClick() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      await ensureSubscription();
      toast('Notifiche attivate su questo dispositivo.');
      await refreshButton();
      if (button.dataset.pushReady === '1') {
        const result = await sendTestPush();
        toast(`Test inviato: ${result.sent || 0} dispositivo/i.`);
      }
    } catch (error) {
      console.error('PW Posa push:', error);
      toast('Notifiche: ' + (error?.message || String(error)));
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function mountButton() {
    if (button) return;
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return;
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'pushNotificationsBtn';
    button.className = 'btn ghost hidden';
    button.textContent = '🔔 Attiva notifiche';
    button.addEventListener('click', handleClick);
    actions.insertBefore(button, actions.firstChild);
    refreshButton();
  }

  window.addEventListener('load', () => {
    mountButton();
    setTimeout(refreshButton, 800);
    setTimeout(refreshButton, 2200);
  });

  pushSb.auth.onAuthStateChange(() => setTimeout(refreshButton, 150));
})();
