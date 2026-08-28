(() => {
  const script = document.currentScript;
  const route = script?.dataset?.dniAuthRoute || '';
  if (!['login', 'callback'].includes(route)) return;

  const params = new URLSearchParams(window.location.search);
  params.set('dni_auth_route', route);
  window.location.replace(`/auth/index.php?${params.toString()}`);
})();
