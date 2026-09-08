(() => {
  const CDN_PREFIX = 'https://cdn.dreadnoughtimperium.org/files';

  function promoteToCdn(img) {
    const localPath = img.getAttribute('src');
    if (!localPath || !localPath.startsWith('/logos/emblems/')) return;

    const cdnUrl = CDN_PREFIX + localPath;
    const probe = new Image();

    probe.onload = () => {
      img.src = cdnUrl;
      img.dataset.delivery = 'cdn';
    };

    probe.onerror = () => {
      img.dataset.delivery = 'origin-fallback';
    };

    probe.src = cdnUrl;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.asset img').forEach(promoteToCdn);
  });
})();
