(() => {
  const match = String(window.location.pathname || '').match(/^\/bounty\/([A-Za-z0-9]{6})\/?$/);
  if (!match) return;
  const code = match[1].toUpperCase();
  window.location.replace('/bounty/?code=' + encodeURIComponent(code));
})();
