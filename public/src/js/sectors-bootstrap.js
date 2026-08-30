const panel = document.querySelector('[data-module="sectors"]');

if (panel) {
  panel.classList.remove('placeholder-panel');
  panel.classList.add('sectors-panel');
  panel.innerHTML = '<div id="dni-sectors-root" class="dni-sectors-root" aria-live="polite"></div>';

  const bootstrapUrl = new URL(import.meta.url);
  const version = bootstrapUrl.searchParams.get('v') || String(Date.now());

  for (const [file, marker] of [
    ['./sectors.css', 'structure'],
    ['./sectors-theme.css', 'theme'],
    ['./sectors-mobile-fit.css', 'mobile-fit'],
    ['./sectors-readable.css', 'readable']
  ]) {
    const stylesheetUrl = new URL(file, import.meta.url);
    stylesheetUrl.searchParams.set('v', version);
    const existing = [...document.styleSheets].some(sheet => {
      try { return sheet.href === stylesheetUrl.href; } catch { return false; }
    });
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheetUrl.href;
      link.dataset.dniSectors = marker;
      document.head.append(link);
    }
  }

  const sectorsRoot = document.querySelector('#dni-sectors-root');
  sectorsRoot?.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !globalThis.matchMedia?.('(max-width: 700px)').matches) return;
    queueMicrotask(() => {
      if (['select-asset', 'select-person', 'select-sector'].includes(action)) {
        sectorsRoot.classList.remove('is-directory-open');
        sectorsRoot.classList.add('is-details-open');
      } else if (action === 'toggle-sector') {
        sectorsRoot.classList.remove('is-directory-open');
      }
    });
  }, true);

  let networkRefreshController = null;
  let networkRefreshSequence = 0;

  async function refreshSectorsNetwork(reason = 'panel') {
    const sequence = ++networkRefreshSequence;
    networkRefreshController?.abort();
    const controller = new AbortController();
    networkRefreshController = controller;

    try {
      const response = await fetch(`/sectors-data.php?action=network&_=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `${response.status} ${response.statusText}`);
      if (!payload || !Array.isArray(payload.sectors) || !Array.isArray(payload.assets) || !Array.isArray(payload.personnel)) {
        throw new Error('DNI Sectors returned an invalid network snapshot.');
      }
      if (sequence !== networkRefreshSequence) return;

      window.dispatchEvent(new CustomEvent('dni:sectors-network-data', {
        detail: { data: payload, reason, receivedAt: Date.now() }
      }));
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('DNI Sectors live refresh failed', error);
    } finally {
      if (networkRefreshController === controller) networkRefreshController = null;
    }
  }

  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel === 'sectors') void refreshSectorsNetwork('panel');
  });

  window.addEventListener('focus', () => {
    if (document.querySelector('.terminal-shell')?.dataset.panel === 'sectors') {
      void refreshSectorsNetwork('focus');
    }
  });

  const sectorsModuleUrl = new URL('./sectors.js', import.meta.url);
  sectorsModuleUrl.searchParams.set('v', version);
  void import(sectorsModuleUrl.href).catch(error => {
    console.error('DNI Sectors module failed to load', error);
    const root = document.querySelector('#dni-sectors-root');
    if (root) root.innerHTML = '<div class="sector-empty">DNI SECTORS MODULE LOAD FAILURE</div>';
  });
}
