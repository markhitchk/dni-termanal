const input = document.querySelector('#command-input');
const output = document.querySelector('#terminal-output');
const windowEl = document.querySelector('#terminal-window');
const separator = '------------------------------------------------------------';

function row(text = '', className = '') {
  if (!output) return null;
  const el = document.createElement('div');
  el.textContent = text;
  if (className) el.className = className;
  output.append(el);
  if (windowEl) windowEl.scrollTop = windowEl.scrollHeight;
  return el;
}

function echoCommand(value) {
  if (!output) return;
  const line = document.createElement('div');
  const admin = document.createElement('span');
  admin.className = 'prompt-admin';
  admin.textContent = document.querySelector('.terminal-prompt .prompt-admin')?.textContent || 'guest';
  const host = document.createElement('span');
  host.className = 'prompt-host';
  host.textContent = document.querySelector('.terminal-prompt .prompt-host')?.textContent || 'dni';
  line.append(admin, document.createTextNode('@'), host, document.createTextNode(`:~$ ${value}`));
  output.append(line);
}

async function requestJson(params) {
  const url = new URL('/documents-data.php', window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status === 404 ? 'DNI record not found.' : (payload.error || 'DNI document service unavailable.'));
    error.status = response.status;
    throw error;
  }
  return payload;
}

function clearanceText(payload) {
  const clearance = payload?.effectiveClearance;
  return clearance?.code ? `${clearance.code} — ${clearance.name || ''}`.trim() : 'CL/NON — Unclassified';
}

async function showList() {
  row('DNI DATABASE INDEX');
  try {
    const payload = await requestJson({ action: 'list' });
    const documents = Array.isArray(payload.documents) ? payload.documents : [];
    row(`SESSION CLEARANCE: ${clearanceText(payload)}`, 'muted');
    if (!documents.length) {
      row('NO DOCUMENTS AUTHORIZED FOR CURRENT CLEARANCE', 'muted');
      return;
    }
    for (const record of documents) {
      row(`${record.file_code}  ${record.classification}  ${record.status}  ${record.title}`, 'muted');
    }
  } catch (error) {
    row(`DOCUMENT INDEX UNAVAILABLE // ${error.message}`, 'muted');
  }
}

async function showRecord(number) {
  if (!number) {
    row('ERROR: ENTER A DNI DOCUMENT NUMBER. EXAMPLE: ACCESS 173');
    return;
  }
  try {
    const payload = await requestJson({ action: 'record', number });
    const record = payload.document;
    if (!record) throw new Error('DNI record not found.');
    row(separator, 'separator');
    row(`DOCUMENT: ${record.file_code}`);
    row(`TITLE: ${record.title}`, 'muted');
    row(`CLASSIFICATION: ${record.classification} — ${record.clearance?.name || ''}`, 'muted');
    row(`STATUS: ${record.status}`, 'muted');
    if (record.sector) row(`SECTOR: ${record.sector}`, 'muted');
    row(`SUMMARY: ${record.summary}`, 'muted');
    row(separator, 'separator');
    for (const line of String(record.body || '').split(/\r?\n/)) row(line);
    row(separator, 'separator');
  } catch (error) {
    // Deliberately do not distinguish nonexistent from unauthorized records.
    row(error.status === 404 ? 'DNI RECORD NOT FOUND' : `DOCUMENT SERVICE UNAVAILABLE // ${error.message}`, 'muted');
  }
}

async function searchRecords(query) {
  query = String(query || '').trim();
  if (!query) {
    row('ERROR: ENTER A SEARCH TERM. EXAMPLE: SEARCH ORIENTATION');
    return;
  }
  row(`DNI SEARCH // ${query.toUpperCase()}`);
  try {
    const payload = await requestJson({ action: 'search', q: query });
    const documents = Array.isArray(payload.documents) ? payload.documents : [];
    row(`SESSION CLEARANCE: ${clearanceText(payload)}`, 'muted');
    if (!documents.length) {
      row('NO MATCHING AUTHORIZED RECORDS', 'muted');
      return;
    }
    for (const record of documents) {
      row(`${record.file_code}  ${record.classification}  ${record.title}`, 'muted');
    }
  } catch (error) {
    row(`DOCUMENT SEARCH UNAVAILABLE // ${error.message}`, 'muted');
  }
}

async function downloadRecord(number) {
  if (!number) {
    row('ERROR: ENTER A DNI DOCUMENT NUMBER. EXAMPLE: DOWNLOAD 173');
    return;
  }
  const url = new URL('/documents-data.php', window.location.origin);
  url.searchParams.set('action', 'download');
  url.searchParams.set('number', String(number));
  try {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) {
      row(response.status === 404 ? 'DNI RECORD NOT FOUND' : 'DOCUMENT DOWNLOAD UNAVAILABLE', 'muted');
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `DNI-${String(number).replace(/\D/g, '') || 'document'}.txt`;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    row(`AUTHORIZED DOWNLOAD READY // ${filename}`, 'muted');
  } catch {
    row('DOCUMENT DOWNLOAD UNAVAILABLE', 'muted');
  }
}

function handledCommand(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const [command, ...args] = value.split(/\s+/);
  const name = command.toLowerCase();
  if (!['access', 'list', 'search', 'download'].includes(name)) return null;
  return { value, name, args };
}

if (input && output) {
  // Capture phase ensures the secure document handler runs before the legacy
  // Terminal command switch. If this module fails to load, access.js itself
  // contains no records and therefore fails closed.
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const command = handledCommand(input.value);
    if (!command) {
      if (String(input.value || '').trim().toLowerCase() === 'help') {
        queueMicrotask(() => {
          row('SEARCH <text>       Search authorized DNI documents', 'muted');
          row('DOWNLOAD <number>   Download an authorized DNI document', 'muted');
        });
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    echoCommand(command.value);

    if (command.name === 'access') void showRecord(command.args[0]);
    else if (command.name === 'list') void showList();
    else if (command.name === 'search') void searchRecords(command.args.join(' '));
    else if (command.name === 'download') void downloadRecord(command.args[0]);
  }, true);
}
