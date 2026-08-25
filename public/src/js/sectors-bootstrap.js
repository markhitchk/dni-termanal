const panel = document.querySelector('[data-module="sectors"]');

if (panel) {
  panel.classList.remove('placeholder-panel');
  panel.classList.add('sectors-panel');
  panel.innerHTML = '<div id="dni-sectors-root" class="dni-sectors-root" aria-live="polite"></div>';

  const bootstrapUrl = new URL(import.meta.url);
  const version = bootstrapUrl.searchParams.get('v') || String(Date.now());
  const stylesheetUrl = new URL('./sectors.css', import.meta.url);
  stylesheetUrl.searchParams.set('v', version);

  const existing = [...document.styleSheets].some(sheet => {
    try { return sheet.href === stylesheetUrl.href; } catch { return false; }
  });
  if (!existing) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheetUrl.href;
    link.dataset.dniSectors = '1';
    document.head.append(link);
  }

  const sectorsModuleUrl = new URL('./sectors.js', import.meta.url);
  sectorsModuleUrl.searchParams.set('v', version);
  void import(sectorsModuleUrl.href).catch(error => {
    console.error('DNI Sectors module failed to load', error);
    const root = document.querySelector('#dni-sectors-root');
    if (root) root.innerHTML = '<div class="sector-empty">DNI SECTORS MODULE LOAD FAILURE</div>';
  });
}
