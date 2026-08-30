(() => {
  const loader = document.getElementById('dni-page-loader');
  if (!loader) return;

  const bar = loader.querySelector('[data-dni-page-loader-bar]');
  const percent = loader.querySelector('[data-dni-page-loader-percent]');
  const status = loader.querySelector('[data-dni-page-loader-status]');
  const currentScript = document.currentScript;
  const version = (() => {
    try {
      const src = currentScript?.src || '';
      return new URL(src, window.location.href).searchParams.get('v') || 'local';
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
      loadModule('dist/authz.js', () => loadModule('dist/app.js'));
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

  // Fail-safe: never leave users trapped behind the loader if a resource stalls.
  window.setTimeout(() => {
    resourcesLoaded = true;
  }, 4500);

  render(0);
  window.requestAnimationFrame(() => tick());
})();
