(() => {
  if (window.__dniUserSettingsNotificationsInstalled) return;
  window.__dniUserSettingsNotificationsInstalled = true;

  const NOTIFY_KEY = 'dni.mail.browserNotifications.v1';
  const SW_URL = '/dni-mail-sw.js';
  let busy = false;

  function supported() {
    return window.isSecureContext === true && 'Notification' in window;
  }

  function permission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  function enabled() {
    return supported() && permission() === 'granted' && localStorage.getItem(NOTIFY_KEY) === 'true';
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

  function ensureStyle() {
    if (document.getElementById('dni-user-settings-notifications-fix')) return;
    const style = document.createElement('style');
    style.id = 'dni-user-settings-notifications-fix';
    style.textContent = `
      .dni-user-settings-switch input[data-mail-settings-notify-toggle]{inset:0!important;width:100%!important;height:100%!important;margin:0!important;cursor:pointer!important;z-index:2!important}
      .dni-user-settings-notify-test{width:100%;min-height:42px;margin-top:7px;padding:10px 12px;border:1px solid #3b5360;background:#0b1114;color:#dceef7;font:700 9px/1.2 "Courier New",monospace;letter-spacing:.8px;text-align:left;cursor:pointer}
      .dni-user-settings-notify-test:hover,.dni-user-settings-notify-test:focus-visible{outline:1px solid #74c8f4;outline-offset:2px;border-color:#74c8f4;background:#101a1f}
      .dni-user-settings-notify-test:disabled{opacity:.45;cursor:not-allowed}
    `;
    document.head.append(style);
  }

  function ensureTestButton() {
    const option = document.querySelector('#dni-user-settings [data-mail-settings-notify]');
    const body = option?.closest('.dni-user-settings-body');
    if (!(option instanceof HTMLElement) || !(body instanceof HTMLElement)) return;
    if (body.querySelector('[data-mail-settings-notify-test]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dni-user-settings-notify-test';
    button.dataset.mailSettingsNotifyTest = 'true';
    button.textContent = 'SEND TEST ALERT // verify this browser';
    const actions = body.querySelector('.dni-user-settings-actions');
    body.insertBefore(button, actions || null);
  }

  function render(message = '') {
    ensureStyle();
    ensureTestButton();
    const { toggle, status } = controls();
    if (!(toggle instanceof HTMLInputElement) || !(status instanceof HTMLElement)) return;

    const isSupported = supported();
    const currentPermission = permission();
    const isEnabled = enabled();
    toggle.checked = isEnabled;
    toggle.disabled = busy || !isSupported || currentPermission === 'denied';
    status.dataset.state = isEnabled ? 'on' : currentPermission === 'denied' ? 'blocked' : 'off';

    if (message) status.textContent = message;
    else if (!window.isSecureContext) status.textContent = 'Unavailable: browser notifications require HTTPS.';
    else if (!('Notification' in window)) status.textContent = 'Browser notifications are not supported on this device.';
    else if (currentPermission === 'denied') status.textContent = 'Blocked by browser/site permission. Re-enable notifications in site settings.';
    else if (isEnabled) status.textContent = 'Enabled. DNI Mail alerts are active on this browser.';
    else if (currentPermission === 'default') status.textContent = 'Off. Enable to request browser notification permission.';
    else status.textContent = 'Off for this browser.';

    const test = document.querySelector('#dni-user-settings [data-mail-settings-notify-test]');
    if (test instanceof HTMLButtonElement) test.disabled = busy || !isSupported || currentPermission === 'denied';
  }

  async function registerWorker() {
    if (!('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    try { await registration.update(); } catch {}
    return registration;
  }

  async function setEnabled(desired) {
    if (!desired) {
      localStorage.setItem(NOTIFY_KEY, 'false');
      render('Off for this browser.');
      return false;
    }
    if (!window.isSecureContext) throw new Error('Browser notifications require a secure HTTPS connection.');
    if (!('Notification' in window)) throw new Error('Browser notifications are not supported on this device.');

    let currentPermission = Notification.permission;
    if (currentPermission === 'default') currentPermission = await Notification.requestPermission();
    if (currentPermission !== 'granted') {
      localStorage.setItem(NOTIFY_KEY, 'false');
      render(currentPermission === 'denied' ? 'Blocked by browser/site permission.' : 'Notification permission was not granted.');
      return false;
    }

    if ('serviceWorker' in navigator) await registerWorker();
    localStorage.setItem(NOTIFY_KEY, 'true');
    render('Enabled. DNI Mail alerts are active on this browser.');
    return true;
  }

  async function sendTestAlert() {
    if (!enabled()) {
      const ok = await setEnabled(true);
      if (!ok) return;
    }
    const options = {
      body: 'Browser notifications are working for DNI Mail.',
      tag: 'dni-mail-settings-test',
      renotify: false,
      data: { url: '/mail' }
    };
    const registration = await registerWorker();
    if (registration?.showNotification) {
      await registration.showNotification('DNI Mail Test Alert', options);
    } else {
      const notification = new Notification('DNI Mail Test Alert', options);
      notification.onclick = () => {
        try { window.focus(); } catch {}
        window.location.href = '/mail';
      };
    }
    render('Test alert sent successfully.');
    setNote('DNI Mail browser notification test sent successfully.');
  }

  document.addEventListener('change', event => {
    const toggle = event.target;
    if (!(toggle instanceof HTMLInputElement) || !toggle.matches('[data-mail-settings-notify-toggle]')) return;
    event.stopImmediatePropagation();
    if (busy) return;
    const desired = toggle.checked;
    busy = true;
    render(desired ? 'Requesting browser notification access...' : 'Disabling DNI Mail browser notifications...');
    setNote(desired ? 'Requesting browser notification access...' : 'Disabling DNI Mail browser notifications...');
    void setEnabled(desired).then(ok => {
      setNote(ok ? 'DNI Mail browser notifications enabled.' : 'DNI Mail browser notifications disabled.');
    }).catch(error => {
      localStorage.setItem(NOTIFY_KEY, 'false');
      const message = String(error?.message || error || 'Browser notification setup failed.');
      render(`Setup failed: ${message}`);
      setNote(`Browser notification setting failed: ${message}`);
    }).finally(() => {
      busy = false;
      render();
    });
  }, true);

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-mail-settings-notify-test]');
    if (!(button instanceof HTMLButtonElement)) return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    render('Preparing test notification...');
    setNote('Preparing DNI Mail browser notification test...');
    void sendTestAlert().catch(error => {
      const message = String(error?.message || error || 'Browser notification test failed.');
      render(`Test failed: ${message}`);
      setNote(`Browser notification test failed: ${message}`);
    }).finally(() => {
      busy = false;
      render();
    });
  }, true);

  function scheduleRender() {
    for (const delay of [0, 60, 160, 320, 700]) window.setTimeout(render, delay);
  }

  window.addEventListener('dni:settings-opened', scheduleRender);
  window.addEventListener('focus', () => window.setTimeout(render, 0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  scheduleRender();
})();
