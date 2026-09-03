// Lightweight runtime self-test for the DNI Mail recipient pipeline.
// This module does not expose private directory data; it only reports whether
// the expected client pieces are present after the production bundle loads.
(() => {
  const expected = [
    'dev@support.dni.org',
    'general@support.dni.org',
    'admin@support.dni.org'
  ];

  const inspect = () => {
    const select = document.querySelector('#dni-mail-panel [data-mail-recipients]');
    if (!(select instanceof HTMLSelectElement)) return;
    const addresses = new Set([...select.options]
      .map(option => String(option.dataset.dniMailAddress || '').trim().toLowerCase())
      .filter(Boolean));
    const missing = expected.filter(address => !addresses.has(address));
    document.documentElement.dataset.dniMailRoutesReady = missing.length ? 'false' : 'true';
    if (missing.length) {
      console.warn('DNI Mail support routes not ready yet:', missing.join(', '));
    }
  };

  new MutationObserver(inspect).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', inspect);
  inspect();
})();
