(() => {
  const VAPID_PUBLIC_KEY = 'BL6oByyaj54jYYOOxsXtLOI0zVOCuTVWWTwSx4NUj15s15P-2_98iLRekpnFDL9hdtRhpopcHgDQYWOllxfvXuQ';
  const cfg = window.PW_POSA_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return;

  const pushSb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let button = null;
  let busy = false;
  const mobileQuery = window.matchMedia('(max-width: 900px)');

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
    const { error } = await pushSb.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' });
    if (error) throw error;
  }

  async function ensureSubscription() {
    const user = await currentUser();
    if (!user) throw new Error('Accedi a PW Posa prima di attivare le notifiche.');
    if (!('Notification' in window) || !('PushManager' in window)) throw new Error('Le notifiche push non sono supportate da questo browser/dispositivo.');

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

  async function disableSubscription() {
    const user = await currentUser();
    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      await clearAppBadge();
      return;
    }
    const endpoint = subscription.endpoint;

    if (user && endpoint) {
      const { error } = await pushSb
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', endpoint);
      if (error) throw error;
    }
    await subscription.unsubscribe();
    await clearAppBadge();
  }

  async function clearAppBadge() {
    if (document.visibilityState !== 'visible') return;
    try {
      const user = await currentUser();
      if (!user) return;
      if ('clearAppBadge' in navigator) await navigator.clearAppBadge();
      else if ('setAppBadge' in navigator) await navigator.setAppBadge(0);

      const registration = await getRegistration();
      const worker = registration.active || registration.waiting || registration.installing;
      worker?.postMessage({ type: 'PW_POSA_CLEAR_BADGE' });
    } catch (error) {
      console.warn('PW Posa: impossibile azzerare il badge', error);
    }
  }

  function setButtonState(active) {
    if (!button) return;
    button.dataset.pushReady = active ? '1' : '0';
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? 'Disattiva notifiche' : 'Attiva notifiche');
    button.title = active ? 'Notifiche attive · clicca per disattivare' : 'Notifiche disattivate · clicca per attivare';
    button.innerHTML = `<span class="push-bell" aria-hidden="true">${active ? '🔔' : '🔕'}</span><span class="push-label">${active ? 'Notifiche attive' : 'Attiva notifiche'}</span>`;
  }

  function placeButton() {
    if (!button) return;
    const sidebarFooter = document.querySelector('.sidebar-footer');
    const topbarActions = document.querySelector('.topbar-actions');
    if (mobileQuery.matches) {
      if (topbarActions && button.parentElement !== topbarActions) {
        const logout = document.getElementById('topLogoutBtn');
        topbarActions.insertBefore(button, logout || topbarActions.firstChild);
      }
    } else if (sidebarFooter && button.parentElement !== sidebarFooter) {
      sidebarFooter.insertBefore(button, sidebarFooter.firstChild);
    }
  }

  async function refreshButton() {
    if (!button) return;
    placeButton();
    const user = await currentUser();
    if (!user) {
      button.classList.add('hidden');
      return;
    }
    button.classList.remove('hidden');
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager?.getSubscription();
      setButtonState(Notification.permission === 'granted' && !!subscription);
    } catch {
      setButtonState(false);
    }
  }

  async function handleClick() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      const registration = await getRegistration();
      const existing = await registration.pushManager?.getSubscription();
      if (existing) {
        await disableSubscription();
        toast('Notifiche disattivate su questo dispositivo.');
      } else {
        await ensureSubscription();
        toast('Notifiche attivate su questo dispositivo.');
      }
      await refreshButton();
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
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'pushNotificationsBtn';
    button.className = 'push-notifications-toggle hidden';
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', handleClick);
    document.body.appendChild(button);
    placeButton();
    refreshButton();
  }

  window.addEventListener('load', () => {
    mountButton();
    setTimeout(refreshButton, 800);
    setTimeout(refreshButton, 2200);
    setTimeout(clearAppBadge, 900);
  });

  window.addEventListener('focus', clearAppBadge);
  window.addEventListener('pageshow', clearAppBadge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') clearAppBadge();
  });

  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', placeButton);
  else mobileQuery.addListener(placeButton);

  pushSb.auth.onAuthStateChange(() => setTimeout(refreshButton, 150));
})();
