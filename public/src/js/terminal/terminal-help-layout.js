const output = document.querySelector('#terminal-output');

if (output && !window.__dniTerminalHelpLayoutInstalled) {
  window.__dniTerminalHelpLayoutInstalled = true;

  const GROUP_NAMES = new Set(['[ CORE ]', '[ DOCUMENTS ]', '[ MAIL ]', '[ NAVIGATION ]', '[ SYSTEM ]']);
  const HELP_COMMANDS = [
    'HELP', 'LOGIN', 'ACCESS <number>', 'LIST',
    'SEARCH <text>', 'DOWNLOAD <number>',
    'MAIL', 'MAIL UNREAD', 'MAIL ANNOUNCEMENTS', 'MAIL SERVICE', 'MAIL READ <id>', 'INBOX',
    'TERMINAL', 'DASHBOARD', 'RANKS', 'SERVICES', 'COMMUNICATION', 'SECTORS',
    'PATCH NOTES', 'STARCOMMS', 'HISTORY', 'HISTORY CLEAR', 'STATUS', 'CLEAR', 'ABOUT',
    'SETTINGS', 'LOGOUT'
  ];

  function installStyle() {
    if (document.getElementById('dni-terminal-help-layout-style')) return;
    const style = document.createElement('style');
    style.id = 'dni-terminal-help-layout-style';
    style.textContent = `
      #terminal-output .dni-help-row {
        display: grid;
        grid-template-columns: minmax(138px, 190px) minmax(0, 1fr);
        column-gap: 18px;
        align-items: baseline;
        width: min(100%, 760px);
        box-sizing: border-box;
      }
      #terminal-output .dni-help-command {
        min-width: 0;
        color: inherit;
        white-space: nowrap;
      }
      #terminal-output .dni-help-description {
        min-width: 0;
        color: inherit;
        text-align: left;
        overflow-wrap: anywhere;
      }
      #terminal-output .dni-help-row[data-command="ABOUT"] .dni-help-description {
        justify-self: stretch;
      }
      @media (max-width: 560px) {
        #terminal-output .dni-help-row {
          grid-template-columns: minmax(116px, 42%) minmax(0, 1fr);
          column-gap: 10px;
        }
      }
      @media (max-width: 390px) {
        #terminal-output .dni-help-row {
          grid-template-columns: 1fr;
          row-gap: 2px;
          margin-bottom: 5px;
        }
        #terminal-output .dni-help-description {
          padding-left: 14px;
          opacity: .82;
        }
      }
    `;
    document.head.append(style);
  }

  function splitHelpLine(text) {
    const normalized = String(text || '').replace(/^\s+/, '').trimEnd();
    if (!normalized) return null;

    for (const command of HELP_COMMANDS.slice().sort((a, b) => b.length - a.length)) {
      if (normalized === command) return [command, ''];
      if (!normalized.startsWith(`${command} `)) continue;
      const description = normalized.slice(command.length).trim();
      if (description) return [command, description];
    }
    return null;
  }

  function formatLatestHelp() {
    const children = [...output.children];
    let start = -1;

    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (children[index].textContent?.trim() === 'AVAILABLE COMMANDS') {
        start = index;
        break;
      }
    }
    if (start < 0) return;

    let inHelp = false;
    for (let index = start; index < children.length; index += 1) {
      const line = children[index];
      if (!(line instanceof HTMLElement)) continue;
      const text = line.textContent?.trim() || '';

      if (text === 'AVAILABLE COMMANDS') {
        inHelp = true;
        continue;
      }
      if (!inHelp) continue;
      if (/^TIP:/i.test(text)) break;
      if (GROUP_NAMES.has(text) || !text || line.classList.contains('separator')) continue;
      if (line.classList.contains('dni-help-row')) continue;

      const pair = splitHelpLine(line.textContent || '');
      if (!pair) continue;

      const [command, description] = pair;
      line.replaceChildren();
      line.classList.add('dni-help-row');
      line.dataset.command = command;

      const commandEl = document.createElement('span');
      commandEl.className = 'dni-help-command';
      commandEl.textContent = command;

      const descriptionEl = document.createElement('span');
      descriptionEl.className = 'dni-help-description';
      descriptionEl.textContent = description;

      line.append(commandEl, descriptionEl);
    }
  }

  installStyle();
  formatLatestHelp();

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      formatLatestHelp();
    });
  });
  observer.observe(output, { childList: true });
}
