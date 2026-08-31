const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const terminalWindow = document.querySelector('#terminal-window');

if (output && input && !window.__dniTerminalHelpCleanupInstalled) {
  window.__dniTerminalHelpCleanupInstalled = true;

  const HELP_GROUPS = Object.freeze([
    ['CORE', [
      ['HELP', 'Show this command list'],
      ['LOGIN', 'Sign in with Discord'],
      ['ACCESS <number>', 'Open a DNI archive record'],
      ['LIST', 'List DNI archive records']
    ]],
    ['DOCUMENTS', [
      ['SEARCH <text>', 'Search authorized DNI documents'],
      ['DOWNLOAD <number>', 'Download an authorized DNI document']
    ]],
    ['MAIL', [
      ['MAIL', 'Open DNI Mail'],
      ['MAIL UNREAD', 'Show unread mail'],
      ['MAIL ANNOUNCEMENTS', 'Official announcements'],
      ['MAIL SERVICE', 'Service announcements'],
      ['MAIL READ <id>', 'Read a mail message'],
      ['INBOX', 'Alias for MAIL']
    ]],
    ['NAVIGATION', [
      ['TERMINAL', 'Return to DNI Terminal'],
      ['DASHBOARD', 'Open DNI Dashboard'],
      ['RANKS', 'Open the DNI Ranks directory'],
      ['SERVICES', 'Open DNI Services'],
      ['COMMUNICATION', 'Open DNI Communication'],
      ['SECTORS', 'Open DNI Sectors']
    ]],
    ['SYSTEM', [
      ['PATCH NOTES', 'Show all public/non-developer patches'],
      ['STARCOMMS', 'Show server bridge status'],
      ['HISTORY', 'Show command history'],
      ['HISTORY CLEAR', 'Clear command history'],
      ['STATUS', 'Show DNI link status'],
      ['CLEAR', 'Restart the active terminal'],
      ['ABOUT', 'Show terminal information']
    ]]
  ]);

  const PUBLIC_PATCH_NOTES = Object.freeze([
    {
      date: '2026-08-31',
      version: 'v1.0',
      patches: [
        'Added the full DNI Ranks directory, /ranks navigation, and RANKS terminal command.',
        'Reset the displayed DNI Terminal version string to v1.0.',
        'Reorganized HELP into readable command groups.',
        'Added movable multi-terminal tabs with add, switch, and close controls.',
        'Each terminal tab now performs its own startup sequence before reaching READY.',
        'DNI Mail stays locked until that terminal is READY and Discord authentication is valid.',
        'Reduced the DNI Terminal startup sequence to about five seconds.',
        'Improved DNI Communication so a standby fallback bridge does not falsely show the network as unavailable.',
        'Improved Star Comms roster, activity, status, and reconnect handling.'
      ]
    },
    {
      date: '2026-08-30',
      version: 'v1.0 PRE-RELEASE',
      patches: [
        'Completed the main DNI Sectors command workflows for sector, asset, personnel, and home-base operations.',
        'Moved live Sectors data to MariaDB-backed storage when the database is configured.',
        'Moved Admin sector and asset editing to MariaDB-backed data paths.',
        'Improved Sectors and Admin fallback behavior so normal site operations remain available when a preferred data path is unavailable.',
        'Improved maintenance-mode behavior and normal site availability handling.'
      ]
    },
    {
      date: '2026-08-29',
      version: 'v1.0 PRE-RELEASE',
      patches: [
        'Rebuilt the Sectors and Assets admin renderer for better reliability with larger datasets.',
        'Made Admin controls load consistently whenever the Admin panel opens.',
        'Improved mobile Admin sector controls and production bundle loading.',
        'Added additional Admin stability checks around personnel, sectors, and assets.'
      ]
    }
  ]);

  function addLine(text = '', className = 'muted') {
    const line = document.createElement('div');
    line.textContent = text;
    if (className) line.className = className;
    output.append(line);
    return line;
  }

  function paddedCommand(command) {
    return `  ${command.padEnd(20, ' ')}`;
  }

  function scrollToLatest() {
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  function echoCommand(value) {
    const line = document.createElement('div');
    const user = document.createElement('span');
    user.className = 'prompt-admin';
    user.textContent = document.querySelector('.terminal-prompt .prompt-admin')?.textContent || 'guest';
    const host = document.createElement('span');
    host.className = 'prompt-host';
    host.textContent = document.querySelector('.terminal-prompt .prompt-host')?.textContent || 'dni';
    line.append(user, document.createTextNode('@'), host, document.createTextNode(`:~$ ${value}`));
    output.append(line);
  }

  function renderCleanHelp() {
    const children = [...output.children];
    let start = -1;

    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (children[index].textContent?.trim() === 'AVAILABLE COMMANDS') {
        start = index;
        break;
      }
    }
    if (start < 0) return;

    for (let index = children.length - 1; index >= start; index -= 1) {
      children[index].remove();
    }

    addLine('AVAILABLE COMMANDS', '');
    addLine('------------------', 'separator');

    HELP_GROUPS.forEach(([group, commands], groupIndex) => {
      if (groupIndex > 0) addLine('');
      addLine(`[ ${group} ]`, 'command-highlight');
      for (const [command, description] of commands) {
        addLine(`${paddedCommand(command)}${description}`);
      }
    });

    addLine('');
    addLine('TIP: ↑/↓ history  ·  TAB autocomplete  ·  Example: ACCESS 173', 'muted');
    scrollToLatest();
  }

  function renderPatchNotes() {
    addLine('DNI TERMINAL // PUBLIC PATCH NOTES', '');
    addLine('----------------------------------', 'separator');
    addLine('NON-DEVELOPER PATCH HISTORY', 'command-highlight');
    addLine('Developer Terminal, private tooling, deployment-only, and internal maintenance changes are excluded.', 'muted');

    for (const release of PUBLIC_PATCH_NOTES) {
      addLine('');
      addLine(`[ ${release.date} // ${release.version} ]`, 'command-highlight');
      release.patches.forEach((patch, index) => {
        addLine(`  ${String(index + 1).padStart(2, '0')}. ${patch}`, 'muted');
      });
    }

    addLine('');
    addLine(`TOTAL PUBLIC PATCHES // ${PUBLIC_PATCH_NOTES.reduce((total, release) => total + release.patches.length, 0)}`, 'muted');
    addLine('Aliases: PATCHES · PATCHNOTES · PATCH NOTES', 'muted');
    scrollToLatest();
  }

  function isPatchNotesCommand(value) {
    return /^(?:patches|patchnotes|patch\s+notes)$/i.test(String(value || '').trim());
  }

  document.addEventListener('keydown', event => {
    if (event.target !== input || event.key !== 'Enter') return;
    const value = String(input.value || '').trim();

    if (isPatchNotesCommand(value)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      echoCommand(value);
      renderPatchNotes();
      return;
    }

    if (value.toLowerCase() !== 'help') return;

    // The base terminal writes the legacy HELP list synchronously. Replace it
    // after that handler completes so every session shows one organized list.
    window.setTimeout(renderCleanHelp, 0);
  }, true);
}
