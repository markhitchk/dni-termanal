(() => {
  const target = document.querySelector('meta[name="dni-mail-browser-target"]')?.content || '';
  if (!target.startsWith('/mail')) return;
  try {
    history.replaceState({ ...(history.state || {}), panel: 'mail' }, '', target);
  } catch {
    window.location.replace(target);
  }
})();
