(() => {
  const loader = document.getElementById('dni-page-loader');
  if (!loader) return;

  const bar = loader.querySelector('[data-dni-page-loader-bar]');
  const percent = loader.querySelector('[data-dni-page-loader-percent]');
  const status = loader.querySelector('[data-dni-page-loader-status]');
  const terminalVersion = 'v1.0';
  const legacyTerminalVersions = ['v4.3.0'];
  const version = (() => {
    try {
      const preload = document.querySelector('link[rel="modulepreload"][href*="dist/app.js"]');
      const href = preload?.href || '';
      return new URL(href, window.location.href).searchParams.get('v') || 'local';
    } catch (_) {
      return 'local';
    }
  })();

  const startedAt = performance.now();
  const minimumMs = 1450;
  let resourcesLoaded = document.readyState === 'complete';
  let progress = 0;
  let finished = false;

  const messages = [
    [0, 'CONNECTING TO DNI DATABASE...'],
    [22, 'LOADING SITE OVERVIEW...'],
    [45, 'INITIALIZING USER SESSION...'],
    [68, 'LOADING ADDITIONAL RESOURCES...'],
    [86, 'OPTIMIZING INTERFACE...'],
    [100, 'TERMINAL READY']
  ];

  const render = value => {
    const bounded = Math.max(0, Math.min(100, Math.round(value)));
    const segments = Math.max(1, Math.min(16, Math.ceil((bounded / 100) * 16)));
    if (bar) bar.textContent = `|${'█'.repeat(segments)}${'-'.repeat(16 - segments)}|`;
    if (percent) percent.textContent = `${bounded}%`;

    if (status) {
      let message = messages[0][1];
      for (const [threshold, text] of messages) {
        if (bounded >= threshold) message = text;
      }
      status.textContent = message;
    }
  };

  const normalizeVersionText = root => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node);
      node = walker.nextNode();
    }
    for (const textNode of textNodes) {
      let text = textNode.nodeValue || '';
      let normalized = text;
      for (const legacy of legacyTerminalVersions) {
        normalized = normalized.split(legacy).join(terminalVersion);
      }
      if (normalized !== text) textNode.nodeValue = normalized;
    }
  };

  const installTerminalVersionNormalizer = () => {
    const output = document.querySelector('#terminal-output');
    if (!output || window.__dniTerminalVersionNormalizerInstalled) return;
    window.__dniTerminalVersionNormalizerInstalled = true;
    window.DNI_TERMINAL_VERSION = terminalVersion;
    normalizeVersionText(output);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          normalizeVersionText(mutation.target.parentNode || output);
          continue;
        }
        for (const added of mutation.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE) normalizeVersionText(added.parentNode || output);
          else if (added.nodeType === Node.ELEMENT_NODE) normalizeVersionText(added);
        }
      }
    });
    observer.observe(output, { childList: true, subtree: true, characterData: true });
  };

  const loadModule = (src, onload) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = `${src}?v=${encodeURIComponent(version)}`;
    if (onload) script.addEventListener('load', onload, { once: true });
    script.addEventListener('error', () => {
      console.error(`DNI module failed to load: ${src}`);
    }, { once: true });
    document.body.append(script);
  };

  const startDni = () => {
    document.body.classList.add('dni-page-loaded');
    loader.classList.add('is-exiting');

    window.setTimeout(() => {
      loader.remove();
      installTerminalVersionNormalizer();
      loadModule('dist/terminal-error-modal.js', () => {
        loadModule('src/js/session-expiry.js');
        loadModule('src/js/citizen-access.js');
        loadModule('src/js/citizen-links.js');
        loadModule('auth/discord/login-alert-bridge.js', () => {
          loadModule('dist/authz.js', () => {
            loadModule('dist/app.js', () => {
              loadModule('dist/terminal-developer-login.js', () => {
                loadModule('src/js/terminal-help-cleanup.js', () => {
                  loadModule('src/js/terminal/terminal-help-layout.js');
                  loadModule('src/js/terminal/terminal-logout.js');
                  loadModule('src/js/terminal/user-settings.js');
                  loadModule('src/js/mail/mail-actions.js');
                });
              });
            });
          });
        });
      });
    }, 190);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    progress = 100;
    render(progress);
    window.setTimeout(startDni, 180);
  };

  const tick = () => {
    if (finished) return;

    const elapsed = performance.now() - startedAt;
    if (resourcesLoaded) {
      progress = Math.min(100, progress + Math.max(2.5, (100 - progress) * 0.18));
    } else {
      progress = Math.min(92, progress + Math.max(0.55, (94 - progress) * 0.032));
    }

    render(progress);

    if (resourcesLoaded && elapsed >= minimumMs && progress >= 99) {
      finish();
      return;
    }

    window.setTimeout(tick, 55);
  };

  if (!resourcesLoaded) {
    window.addEventListener('load', () => {
      resourcesLoaded = true;
    }, { once: true });
  }

  window.setTimeout(() => {
    resourcesLoaded = true;
  }, 4500);

  // Hidden Developer Login / Support Logout. These commands never reach the
  // public terminal history handler. The target account is selected by the
  // support controller while the authenticated developer remains the actor.
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || event.key !== 'Enter') return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.id !== 'command-input') return;
    const command = String(field.value || '').trim().toLowerCase();
    const isLogin = command === 'dev login' || command === 'devlogin';
    const isLogout = command === 'dev logout' || command === 'devlogout';
    if (!isLogin && !isLogout) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    field.value = '';

    if (!window.DNIDeveloperLogin) {
      console.error('DNI Developer Support controller is not available.');
      return;
    }

    if (isLogin && typeof window.DNIDeveloperLogin.show === 'function') {
      void window.DNIDeveloperLogin.show();
      return;
    }

    if (isLogout && typeof window.DNIDeveloperLogin.stopSupport === 'function') {
      void window.DNIDeveloperLogin.stopSupport();
    }
  }, true);

  render(0);
  window.requestAnimationFrame(() => tick());
})();
