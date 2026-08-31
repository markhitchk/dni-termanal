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
      ['SERVICES', 'Open DNI Services'],
      ['COMMUNICATION', 'Open DNI Communication'],
      ['SECTORS', 'Open DNI Sectors']
    ]],
    ['SYSTEM', [
      ['STARCOMMS', 'Show server bridge status'],
      ['HISTORY', 'Show command history'],
      ['HISTORY CLEAR', 'Clear command history'],
      ['STATUS', 'Show DNI link status'],
      ['CLEAR', 'Restart the active terminal'],
      ['ABOUT', 'Show terminal information']
    ]]
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

    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  document.addEventListener('keydown', event => {
    if (event.target !== input || event.key !== 'Enter') return;
    if (String(input.value || '').trim().toLowerCase() !== 'help') return;

    // The base terminal writes the legacy HELP list synchronously. Replace it
    // after that handler completes so every session shows one organized list.
    window.setTimeout(renderCleanHelp, 0);
  }, true);
}
