(() => {
  fetch('/dev/termanal.php', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'text/html' }
  })
    .then(async response => ({ status: response.status, html: await response.text() }))
    .then(({ html }) => {
      document.open();
      document.write(html);
      document.close();
    })
    .catch(() => {
      document.body.innerHTML = '<main class="handoff">DNI DEVELOPER TERMINAL // SECURE HANDOFF FAILED<br><br><a href="/" style="color:#d8bd78">RETURN TO DNI TERMINAL</a></main>';
    });
})();
