const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const windowEl = document.querySelector('#terminal-window');

const developerCommands = new Set(['developer', 'credits', 'creator']);
const developerLogo = 'https://cdn.jsdelivr.net/gh/markhitchk/hcf@main/assets/logos/HTG.svg';
const separator = '------------------------------------------------------------';

function scrollTerminal() {
  if (windowEl) windowEl.scrollTop = windowEl.scrollHeight;
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

function textRow(text, className = '') {
  const line = document.createElement('div');
  line.textContent = text;
  if (className) line.className = className;
  output.append(line);
  return line;
}

function showDeveloperCredits() {
  if (!output) return;

  textRow(separator, 'separator');
  textRow('DNI DEVELOPMENT CREDITS');
  textRow('DREADNOUGHT IMPERIUM DATABASE NETWORK', 'muted');

  const card = document.createElement('section');
  card.setAttribute('aria-label', 'DNI Terminal developer credits');
  card.style.display = 'grid';
  card.style.gridTemplateColumns = 'minmax(110px, 190px) minmax(0, 1fr)';
  card.style.gap = '18px';
  card.style.alignItems = 'center';
  card.style.margin = '14px 0';
  card.style.padding = '16px';
  card.style.border = '1px solid currentColor';
  card.style.background = 'rgba(0, 0, 0, 0.28)';
  card.style.boxSizing = 'border-box';

  const logo = document.createElement('img');
  logo.src = developerLogo;
  logo.alt = 'Harley-The-Gamer logo';
  logo.loading = 'eager';
  logo.decoding = 'async';
  logo.style.display = 'block';
  logo.style.width = '100%';
  logo.style.maxWidth = '190px';
  logo.style.height = 'auto';
  logo.style.margin = '0 auto';

  const details = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = "MADE & DEVELOPED BY HARLEY'S STUDIOS";
  heading.style.display = 'block';
  heading.style.marginBottom = '10px';

  const creator = document.createElement('div');
  creator.textContent = 'CREATOR / DEVELOPER // HarleyTG';
  const studio = document.createElement('div');
  studio.textContent = "STUDIO // Harley's Studios";
  const project = document.createElement('div');
  project.textContent = 'PROJECT // Dreadnought Imperium Database Network';
  const terminal = document.createElement('div');
  terminal.textContent = 'SYSTEM // DNI Terminal v4.3.0';
  const note = document.createElement('div');
  note.className = 'muted';
  note.style.marginTop = '10px';
  note.textContent = 'Website and DNI Terminal developed for the Dreadnought Imperium organization.';

  details.append(heading, creator, studio, project, terminal, note);
  card.append(logo, details);
  output.append(card);

  if (window.matchMedia('(max-width: 620px)').matches) {
    card.style.gridTemplateColumns = '1fr';
    card.style.textAlign = 'center';
    logo.style.maxWidth = '170px';
  }

  textRow("ALIASES // 'credits' or 'creator'", 'muted');
  textRow(separator, 'separator');
  scrollTerminal();
}

function augmentHelp() {
  if (!output) return;
  const rows = [...output.children];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const text = String(row.textContent || '').trim();
    if (!text.startsWith('ABOUT')) continue;
    if (row.dataset.dniDeveloperHelpPatched === 'true') return;

    row.dataset.dniDeveloperHelpPatched = 'true';
    const developer = document.createElement('div');
    developer.className = 'muted';
    developer.textContent = 'DEVELOPER           Show website developer credits and logo';
    row.after(developer);
    scrollTerminal();
    return;
  }
}

if (output) {
  const helpObserver = new MutationObserver(() => queueMicrotask(augmentHelp));
  helpObserver.observe(output, { childList: true });
  queueMicrotask(augmentHelp);
}

if (input) {
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const raw = input.value.trim();
    if (!raw) return;
    const command = raw.split(/\s+/)[0].toLowerCase();
    if (!developerCommands.has(command)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    echoCommand(raw);
    showDeveloperCredits();
  }, true);
}
