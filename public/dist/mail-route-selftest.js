// Lightweight runtime readiness marker for DNI Mail support routes.
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
    document.documentElement.dataset.dniMailRoutesReady = expected.every(address => addresses.has(address)) ? 'true' : 'false';
  };
  new MutationObserver(inspect).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', inspect);
  inspect();
})();
