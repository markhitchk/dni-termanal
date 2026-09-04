(() => {
  if (window.__dniUserSettingsNotificationsInstalled) return;
  window.__dniUserSettingsNotificationsInstalled = true;

  const NOTIFY_KEY = 'dni.mail.browserNotifications.v1';
  const PUSH_KEY = 'dni.mail.webPushSubscribed.v1';
  const SW_URL = '/dni-mail-sw.js';
  const API_URL = '/mail-push.php';
  let busy = false;
  let csrfToken = '';
  let publicKey = '';
  let refreshSerial = 0;

  function isIosFamily() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/i.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function standaloneMode() {
    return window.matchMedia?.('(display-mode: standalone)').matches === true
      || window.navigator.standalone === true;
  }

  function baseSupported() {
    return window.isSecureContext === true
      && 'Notification' in window
      && 'serviceWorker' in navigator
      && 'PushManager' in window;
  }

  function iosInstallRequired() {
    return isIosFamily() && !standaloneMode();
  }

  function controls() {
    const root = document.querySelector('#dni-user-settings');
    const toggle = root?.querySelector('[data-mail-settings-notify-toggle]');
    const status = root?.querySelector('[data-mail-settings-notify-status]');
    return { root, toggle, status };
  }

  function setNote(message) {
    const note = document.querySelector('#dni-user-settings [data-settings-note]');
    if (note) note.textContent = String(message || '');
  }

  function ensureInstallMetadata() {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.webmanifest';
      document.head.append(link);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
      const capable = document.createElement('meta');
      capable.name = 'apple-mobile-web-app-capable';
      capable.content = 'yes';
      document.head.append(capable);
    }
    if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
      const statusBar = document.createElement('meta');
      statusBar.name = 'apple-mobile-web-app-status-bar-style';
      statusBar.content = 'black';
      document.head.append(statusBar);
    }
  }

  function ensureStyle() {
    if (document.getElementById('dni-user-settings-notifications-fix')) return;
    const style = document.createElement('style');
    style.id = 'dni-user-settings-notifications-fix';
    style.textContent = `
      .dni-user-settings-switch input[data-mail-settings-notify-toggle]{inset:0!important;width:100%!important;height:100%!important;margin:0!important;cursor:pointer!important;z-index:2!important}
      .dni-user-settings-notify-test{width:100%;min-height:44px;margin-top:7px;padding:10px 12px;border:1px solid #3b5360;background:#0b1114;color:#dceef7;font:700 9px/1.2 "Courier New",monospace;letter-spacing:.8px;text-align:left;cursor:pointer}
      .dni-user-settings-notify-test:hover,.dni-user-settings-notify-test:focus-visible{outline:1px solid #74c8f4;outline-offset:2px;border-color:#74c8f4;background:#101a1f}
      .dni-user-settings-notify-test:disabled{opacity:.45;cursor:not-allowed}
      .dni-user-settings-notify-mobile-help{margin:7px 0 0;padding:9px 10px;border:1px solid #2d3438;border-left:2px solid #c8a866;background:#090b0c;color:#969696;font:9px/1.45 "Courier New",monospace}
      .dni-user-settings-notify-mobile-help b{color:#d9c38f}
    `;
    document.head.append(style);
  }

  function ensureNotificationSection() {
    const settingsRoot = document.querySelector('#dni-user-settings');
    const body = settingsRoot?.querySelector('[data-settings-panel="communications"].dni-user-settings-body');
    if (!(body instanceof HTMLElement)) return null;

    let title = body.querySelector('[data-mail-settings-notify-title]');
    let option = body.querySelector('[data-mail-settings-notify]');
    const actions = body.querySelector('.dni-user-settings-actions');

    if (!(title instanceof HTMLElement)) {
      title = document.createElement('div');
      title.className = 'dni-user-settings-section-title';
      title.dataset.mailSettingsNotifyTitle = 'true';
      title.textContent = 'DNI MAIL';
      body.insertBefore(title, actions || null);
    }

    if (!(option instanceof HTMLElement)) {
      option = document.createElement('label');
      option.className = 'dni-user-settings-option';
      option.dataset.mailSettingsNotify = 'true';
      option.innerHTML = '<span><strong>Browser notifications</strong><small class="dni-mail-settings-notify-state" data-mail-settings-notify-status>Checking Web Push status...</small></span><span class="dni-user-settings-switch"><input type="checkbox" data-mail-settings-notify-toggle><span aria-hidden="true"></span></span>';
      body.insertBefore(option, actions || null);
    }

    return option;
  }

  function ensureExtraControls() {
    const option = ensureNotificationSection();
    const body = option?.closest('.dni-user-settings-body');
    if (!(option instanceof HTMLElement) || !(body instanceof HTMLElement)) return;

    if (!body.querySelector('[data-mail-settings-notify-test]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dni-user-settings-notify-test';
      button.dataset.mailSettingsNotifyTest = 'true';
      button.textContent = 'SEND TEST ALERT // real Web Push';
      const actions = body.querySelector('.dni-user-settings-actions');
      body.insertBefore(button, actions || null);
    }

    let help = body.querySelector('[data-mail-settings-notify-help]');
    if (!(help instanceof HTMLElement)) {
      help = document.createElement('div');
      help.className = 'dni-user-settings-notify-mobile-help';
      help.dataset.mailSettingsNotifyHelp = 'true';
      const test = body.querySelector('[data-mail-settings-notify-test]');
      body.insertBefore(help, test?.nextSibling || body.querySelector('.dni-user-settings-actions') || null);
    }
    if (iosInstallRequired()) {
      help.innerHTML = '<b>iPhone/iPad:</b> use Add to Home Screen, open DNI Terminal from the Home Screen icon, then enable notifications there.';
      help.hidden = false;
    } else {
      help.textContent = 'Mobile Web Push stays subscribed after the DNI browser tab is suspended. Android may also require Chrome/browser notifications to be enabled in system Settings.';
      help.hidden = false;
    }
  }

  async function jsonRequest(action, { method = 'GET', body = null } = {}) {
    const options = {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    };
    if (method !== 'GET') {
      if (!csrfToken) await loadConfig();
      options.headers['Content-Type'] = 'application/json';
      options.headers['X-DNI-CSRF'] = csrfToken;
      options.body = JSON.stringify(body || {});
    }
    const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, options);
    const payload = await response.json().catch(() => ({}));
    if (payload.csrfToken) csrfToken = String(payload.csrfToken);
    if (!response.ok) throw new Error(payload.error || `DNI Mail Web Push HTTP ${response.status}`);
    return payload;
  }

  async function loadConfig() {
    const payload = await jsonRequest('config');
    publicKey = String(payload.publicKey || '');
    if (!publicKey) throw new Error('DNI Mail Web Push public key is unavailable.');
    return payload;
  }

  function applicationServerKey(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  async function readyWorker() {
    if (!baseSupported()) return null;
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    try { await registration.update(); } catch {}
    const candidate = registration.installing || registration.waiting;
    if (candidate && candidate.state !== 'activated') {
      await Promise.race([
        new Promise(resolve => {
          const onState = () => {
            if (candidate.state === 'activated' || candidate.state === 'redundant') {
              candidate.removeEventListener('statechange', onState);
              resolve();
            }
          };
          candidate.addEventListener('statechange', onState);
          onState();
        }),
        new Promise(resolve => window.setTimeout(resolve, 4000))
      ]);
    }
    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('Service worker activation timed out. Reload DNI Terminal and try again.')), 12000);
    });
    return Promise.race([navigator.serviceWorker.ready, timeout]);
  }

  async function currentSubscription() {
    if (!baseSupported()) return null;
    try {
      const registration = await readyWorker();
      return await registration.pushManager.getSubscription();
    } catch {
      return null;
    }
  }

  async function state() {
    const supported = baseSupported() && !iosInstallRequired();
    const permission = 'Notification' in window ? Notification.permission : 'unsupported';
    let subscription = null;
    if (supported && permission === 'granted') subscription = await currentSubscription();
    return {
      supported,
      permission,
      subscription,
      enabled: supported && permission === 'granted' && subscription !== null
    };
  }

  async function render(message = '') {
    const serial = ++refreshSerial;
    ensureStyle();
    ensureNotificationSection();
    ensureExtraControls();
    const { toggle, status } = controls();
    if (!(toggle instanceof HTMLInputElement) || !(status instanceof HTMLElement)) return;

    let current;
    try {
      current = await state();
    } catch {
      current = { supported: false, permission: 'unsupported', subscription: null, enabled: false };
    }
    if (serial !== refreshSerial) return;

    toggle.checked = current.enabled;
    toggle.disabled = busy || !current.supported || current.permission === 'denied';
    status.dataset.state = current.enabled ? 'on' : current.permission === 'denied' ? 'blocked' : 'off';

    if (message) status.textContent = message;
    else if (!window.isSecureContext) status.textContent = 'Unavailable: Web Push requires HTTPS.';
    else if (iosInstallRequired()) status.textContent = 'iPhone/iPad: install DNI Terminal to the Home Screen, then enable notifications from the installed web app.';
    else if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) status.textContent = 'This browser does not support standards-based Web Push.';
    else if (current.permission === 'denied') status.textContent = 'Blocked by browser/site permission. Re-enable notifications in browser or system settings.';
    else if (current.enabled) status.textContent = 'Enabled. Background DNI Mail Web Push is registered on this device.';
    else if (current.permission === 'default') status.textContent = 'Off. Enable to request notification permission and register this device.';
    else status.textContent = 'Permission is allowed, but this device is not subscribed. Enable to register Web Push.';

    const test = document.querySelector('#dni-user-settings [data-mail-settings-notify-test]');
    if (test instanceof HTMLButtonElement) test.disabled = busy || !current.enabled;
  }

  async function serverSubscribe(subscription) {
    const json = subscription.toJSON();
    await jsonRequest('subscribe', {
      method: 'POST',
      body: { subscription: json }
    });
  }

  async function setEnabled(desired) {
    if (!desired) {
      const subscription = await currentSubscription();
      if (subscription) {
        try {
          await jsonRequest('unsubscribe', {
            method: 'POST',
            body: { endpoint: subscription.endpoint }
          });
        } finally {
          try { await subscription.unsubscribe(); } catch {}
        }
      }
      localStorage.setItem(NOTIFY_KEY, 'false');
      localStorage.setItem(PUSH_KEY, 'false');
      await render('Off. This device is no longer subscribed to DNI Mail Web Push.');
      return false;
    }

    if (!window.isSecureContext) throw new Error('Web Push requires a secure HTTPS connection.');
    if (iosInstallRequired()) throw new Error('On iPhone/iPad, add DNI Terminal to the Home Screen and open the installed web app first.');
    if (!baseSupported()) throw new Error('This mobile browser does not support standards-based Web Push.');

    let currentPermission = Notification.permission;
    if (currentPermission === 'default') currentPermission = await Notification.requestPermission();
    if (currentPermission !== 'granted') {
      localStorage.setItem(NOTIFY_KEY, 'false');
      localStorage.setItem(PUSH_KEY, 'false');
      await render(currentPermission === 'denied' ? 'Blocked by browser/site permission.' : 'Notification permission was not granted.');
      return false;
    }

    const config = await loadConfig();
    const registration = await readyWorker();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(config.publicKey)
      });
    }
    await serverSubscribe(subscription);

    localStorage.setItem(NOTIFY_KEY, 'true');
    localStorage.setItem(PUSH_KEY, 'true');
    await render('Enabled. Background DNI Mail Web Push is registered on this device.');
    return true;
  }

  async function sendTestAlert() {
    const current = await state();
    if (!current.enabled) throw new Error('Enable Browser notifications first.');
    const payload = await jsonRequest('test', {
      method: 'POST',
      body: { endpoint: current.subscription.endpoint }
    });
    const push = payload.push || {};
    if (Number(push.attempted || 0) < 1) throw new Error('No server-side push subscription is registered for this account.');
    if (Number(push.delivered || 0) < 1) throw new Error('The push service did not accept the test notification.');
    await render('Real Web Push test accepted by the mobile push service.');
    setNote('DNI Mail Web Push test sent through the server. Check the device notification shade/lock screen.');
  }

  document.addEventListener('change', event => {
    const toggle = event.target;
    if (!(toggle instanceof HTMLInputElement) || !toggle.matches('[data-mail-settings-notify-toggle]')) return;
    event.stopImmediatePropagation();
    if (busy) return;
    const desired = toggle.checked;
    busy = true;
    void render(desired ? 'Registering this device for Web Push...' : 'Removing this device Web Push subscription...');
    setNote(desired ? 'Registering mobile Web Push...' : 'Removing mobile Web Push subscription...');
    void setEnabled(desired).then(ok => {
      setNote(ok ? 'DNI Mail background Web Push enabled on this device.' : 'DNI Mail Web Push disabled on this device.');
    }).catch(error => {
      localStorage.setItem(NOTIFY_KEY, 'false');
      localStorage.setItem(PUSH_KEY, 'false');
      const message = String(error?.message || error || 'Web Push setup failed.');
      void render(`Setup failed: ${message}`);
      setNote(`Web Push setup failed: ${message}`);
    }).finally(() => {
      busy = false;
      void render();
    });
  }, true);

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-mail-settings-notify-test]');
    if (!(button instanceof HTMLButtonElement)) return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    void render('Sending test through the DNI Web Push server...');
    setNote('Sending a real DNI Mail Web Push test...');
    void sendTestAlert().catch(error => {
      const message = String(error?.message || error || 'Web Push test failed.');
      void render(`Test failed: ${message}`);
      setNote(`Web Push test failed: ${message}`);
    }).finally(() => {
      busy = false;
      void render();
    });
  }, true);

  function scheduleRender() {
    for (const delay of [0, 80, 220, 600]) window.setTimeout(() => void render(), delay);
  }

  window.addEventListener('dni:settings-opened', scheduleRender);
  window.addEventListener('focus', () => window.setTimeout(() => void render(), 0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void render(); });
  ensureInstallMetadata();
  scheduleRender();
})();