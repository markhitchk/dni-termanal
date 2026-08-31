const DNI_CDN_PREFIX = 'https://cdn.dreadnoughtimperium.org/files/';
const DNI_CDN_URL_RE = /https:\/\/cdn\.dreadnoughtimperium\.org\/files\/[A-Za-z0-9._~%+\-]+/g;

function installAttachmentPreviewStyles() {
  if (document.querySelector('style[data-dni-mail-attachment-preview-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailAttachmentPreviewStyle = 'true';
  style.textContent = `
    .dni-mail-attachment-preview-section{margin-top:18px;border-top:1px solid #2a2a2a;padding-top:12px}
    .dni-mail-attachment-preview-title{display:block;margin-bottom:9px;color:#c8a866;font:700 10px/1.35 "Courier New",monospace;letter-spacing:.7px}
    .dni-mail-attachment-preview-card{margin-top:9px;border:1px solid #303030;background:#070707;padding:10px;overflow:hidden}
    .dni-mail-attachment-preview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .dni-mail-attachment-preview-name{min-width:0;color:#e7e7e7;font:700 10px/1.35 "Courier New",monospace;overflow-wrap:anywhere}
    .dni-mail-attachment-preview-type{display:block;margin-top:4px;color:#747474;font:700 8px/1.35 "Courier New",monospace;letter-spacing:.3px}
    .dni-mail-attachment-preview-open{flex:0 0 auto;border:1px solid rgba(200,168,102,.55);padding:7px 9px;color:#d9bc7c!important;text-decoration:none;font:700 8px/1 "Courier New",monospace;letter-spacing:.45px;text-transform:uppercase}
    .dni-mail-attachment-preview-open:hover,.dni-mail-attachment-preview-open:focus-visible{border-color:#e0c078;color:#fff!important;outline:none}
    .dni-mail-attachment-preview-image,.dni-mail-cdn-preview{display:block;width:auto;max-width:100%;max-height:520px;margin:10px auto 0;border:1px solid #353535;background:#020202;object-fit:contain}
    .dni-mail-attachment-preview-video{display:block;width:100%;max-height:520px;margin-top:10px;background:#000}
    .dni-mail-attachment-preview-audio{display:block;width:100%;margin-top:10px}
    .dni-mail-attachment-preview-url{display:block;margin-top:8px;color:#5f5f5f;font:700 7px/1.35 "Courier New",monospace;overflow-wrap:anywhere}
    @media(max-width:700px){.dni-mail-attachment-preview-head{display:grid;grid-template-columns:minmax(0,1fr) auto}.dni-mail-attachment-preview-image,.dni-mail-cdn-preview{max-height:340px}}
  `;
  document.head.append(style);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function collectCdnUrls(reader) {
  const textMatches = String(reader.textContent || '').match(DNI_CDN_URL_RE) || [];
  const hrefMatches = [...reader.querySelectorAll('a[href]')]
    .map(link => String(link.href || ''))
    .filter(url => url.startsWith(DNI_CDN_PREFIX));
  const dataMatches = [...reader.querySelectorAll('[data-dni-cdn-source]')]
    .map(node => String(node.dataset.dniCdnSource || ''))
    .filter(url => url.startsWith(DNI_CDN_PREFIX));
  const srcMatches = [...reader.querySelectorAll('[src]')]
    .map(node => String(node.src || ''))
    .filter(url => url.startsWith(DNI_CDN_PREFIX));
  return unique([...textMatches, ...hrefMatches, ...dataMatches, ...srcMatches]);
}

function fileName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'DNI CDN file');
  } catch {
    return 'DNI CDN file';
  }
}

function sameOriginPreviewUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.href.startsWith(DNI_CDN_PREFIX)) return url;
    const encodedName = parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (!encodedName) return url;
    return `${window.location.origin}/files/${encodedName}`;
  } catch {
    return url;
  }
}

function extension(url) {
  const name = fileName(url);
  const match = name.match(/\.([A-Za-z0-9]{1,12})$/);
  return match ? match[1].toLowerCase() : '';
}

function kindFor(url) {
  const ext = extension(url);
  if (['apng', 'avif', 'bmp', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'ogv', 'mov', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'PDF document';
  if (['apk', 'aab'].includes(ext)) return 'Android package';
  if (['zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return 'Archive';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'Document';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'Spreadsheet';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'Presentation';
  if (['txt', 'md', 'log', 'json', 'xml', 'yaml', 'yml'].includes(ext)) return 'Text/data file';
  return ext ? `${ext.toUpperCase()} file` : 'File';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanLegacyAttachmentNoise(body, urls) {
  if (!(body instanceof HTMLElement) || body.dataset.dniAttachmentBodyCleaned === 'true') return;
  if (body.querySelector('.dni-mail-cdn-attachments, .dni-mail-attachment-preview-section')) return;

  let text = String(body.textContent || '');
  const original = text;
  for (const url of urls) {
    const escapedUrl = escapeRegExp(url);
    const name = fileName(url);
    text = text.replace(new RegExp(`\\[([^\\]]+)\\]\\(${escapedUrl}\\)`, 'g'), '');
    text = text.replace(new RegExp(escapedUrl, 'g'), '');
    text = text.replace(new RegExp(`(^|\\n)\\s*${escapeRegExp(name)}\\s*(?=\\n|$)`, 'g'), '$1');
  }
  text = text
    .replace(/---\s*DNI CDN ATTACHMENTS\s*---/gi, '')
    .replace(/^\s*\|\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text !== original.trim()) {
    body.textContent = text;
    body.dataset.dniAttachmentBodyCleaned = 'true';
  }
}

function patchCorePreviewSources(reader) {
  reader.querySelectorAll('img.dni-mail-cdn-preview[src]').forEach(image => {
    const current = String(image.dataset.dniCdnSource || image.src || '');
    if (!current.startsWith(DNI_CDN_PREFIX)) return;
    const preview = sameOriginPreviewUrl(current);
    image.dataset.dniCdnSource = current;
    if (image.src !== preview) image.src = preview;
    image.loading = 'lazy';
    image.decoding = 'async';
  });
}

function createPreviewCard(url) {
  const card = document.createElement('div');
  card.className = 'dni-mail-attachment-preview-card';

  const head = document.createElement('div');
  head.className = 'dni-mail-attachment-preview-head';
  const info = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'dni-mail-attachment-preview-name';
  name.textContent = fileName(url);
  const type = document.createElement('span');
  type.className = 'dni-mail-attachment-preview-type';
  type.textContent = `${kindFor(url)} // CL/NON PUBLIC CDN`;
  info.append(name, type);

  const open = document.createElement('a');
  open.className = 'dni-mail-attachment-preview-open';
  open.href = url;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = 'OPEN FILE';
  head.append(info, open);
  card.append(head);

  const kind = kindFor(url);
  const previewUrl = sameOriginPreviewUrl(url);
  if (kind === 'image') {
    const image = document.createElement('img');
    image.className = 'dni-mail-attachment-preview-image';
    image.dataset.dniCdnSource = url;
    image.src = previewUrl;
    image.alt = fileName(url);
    image.loading = 'lazy';
    image.decoding = 'async';
    card.append(image);
  } else if (kind === 'video') {
    const video = document.createElement('video');
    video.className = 'dni-mail-attachment-preview-video';
    video.dataset.dniCdnSource = url;
    video.src = previewUrl;
    video.controls = true;
    video.preload = 'metadata';
    card.append(video);
  } else if (kind === 'audio') {
    const audio = document.createElement('audio');
    audio.className = 'dni-mail-attachment-preview-audio';
    audio.dataset.dniCdnSource = url;
    audio.src = previewUrl;
    audio.controls = true;
    audio.preload = 'metadata';
    card.append(audio);
  }

  const source = document.createElement('span');
  source.className = 'dni-mail-attachment-preview-url';
  source.textContent = url;
  card.append(source);
  return card;
}

function enhanceReader(reader) {
  if (!(reader instanceof HTMLElement)) return;
  patchCorePreviewSources(reader);

  const urls = collectCdnUrls(reader);
  if (!urls.length) return;

  const body = reader.querySelector('.dni-mail-reader-body');
  if (body instanceof HTMLElement) cleanLegacyAttachmentNoise(body, urls);

  const existingCore = reader.querySelector('.dni-mail-cdn-attachments');
  if (existingCore) {
    patchCorePreviewSources(reader);
    return;
  }

  const signature = urls.join('|');
  const existing = reader.querySelector('[data-dni-attachment-preview]');
  if (existing instanceof HTMLElement && existing.dataset.dniAttachmentPreview === signature) return;
  existing?.remove();

  const section = document.createElement('section');
  section.className = 'dni-mail-attachment-preview-section';
  section.dataset.dniAttachmentPreview = signature;
  const title = document.createElement('strong');
  title.className = 'dni-mail-attachment-preview-title';
  title.textContent = `FILE ATTACHMENTS // ${urls.length} ITEM${urls.length === 1 ? '' : 'S'}`;
  section.append(title);
  urls.forEach(url => section.append(createPreviewCard(url)));

  if (body instanceof HTMLElement) body.append(section);
  else reader.append(section);
}

let scheduled = false;
function scanReaders() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    document.querySelectorAll('#dni-mail-reader, .dni-mail-reader').forEach(enhanceReader);
  });
}

installAttachmentPreviewStyles();
scanReaders();
new MutationObserver(scanReaders).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
