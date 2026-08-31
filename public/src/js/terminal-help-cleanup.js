const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const terminalWindow = document.querySelector('#terminal-window');

if (output && input && !window.__dniTerminalHelpCleanupInstalled) {
  window.__dniTerminalHelpCleanupInstalled = true;

  const style = document.createElement('style');
  style.id = 'dni-terminal-help-cleanup-style';
  style.textContent = `
    .dni-terminal-help{margin:4px 0 2px;border:1px solid #2f2b22;background:rgba(6,6,6,.78);font-family:"Courier New",ui-monospace,monospace;white-space:normal}
    .dni-terminal-help-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border-bottom:1px solid #2f2b22;color:#e8e8e8;font-size:10px;letter-spacing:1.25px}
    .dni-terminal-help-head b{color:#c8a866;font-size:9px;letter-spacing:1.05px}
    .dni-terminal-help-section{padding:7px 10px;border-bottom:1px solid #1f1f1f}
    .dni-terminal-help-section:last-of-type{border-bottom:0}
    .dni-terminal-help-label{margin-bottom:5px;color:#8f7b50;font-size:8px;font-weight:700;letter-spacing:1.35px}
    .dni-terminal-help-row{display:grid;grid-template-columns:minmax(118px,148px) minmax(0,1fr);gap:10px;padding:2px 0;line-height:1.25}
    .dni-terminal-help-command{color:#e9d39d;font-weight:700;white-space:nowrap}
    .dni-terminal-help-copy{color:#a9a9a9;font-weight:400;overflow-wrap:anywhere}
    .dni-terminal-help-foot{padding:7px 10px;border-top:1px solid #2f2b22;color:#777;font-size:8px;letter-spacing:.75px}
    @media(max-width:520px){
      .dni-terminal-help-head{padding:7px 8px;font-size:9px}
      .dni-terminal-help-section{padding:6px 8px}
      .dni-terminal-help-row{grid-template-columns:minmax(108px,132px) minmax(0,1fr);gap:7px;font-size:11px}
      .dni-terminal-help-foot{padding:6px 8px;line-height:1.4}
    }
  `;
  document.head.append(style);

  const groups = [
    ['CORE', [
      ['HELP', 'Show this command reference'],
      ['ACCESS <number>', 'Open a DNI archive record'],
      ['LIST', 'List available DNI records'],
      ['LOGIN', 'Sign in with Discord when required']
    ]],
    ['MAIL', [
      ['MAIL', 'Open DNI Mail'],
      ['MAIL UNREAD', 'Show unread messages'],
      ['MAIL ANNOUNCEMENTS', 'Show official announcements'],
      ['MAIL SERVICE', 'Show service announcements'],
      ['MAIL READ <id>', 'Read a specific message'],
      ['INBOX', 'Alias for MAIL']
    ]],
    ['MODULES', [
      ['TERMINAL', 'Return to DNI Terminal'],
      ['DASHBOARD', 'Open DNI Dashboard'],
      ['SERVICES', 'Open DNI Services'],
      ['COMMUNICATION', 'Open DNI Communication'],
      ['SECTORS', 'Open DNI Sectors'],
      ['STARCOMMS', 'Show Star Comms bridge status']
    ]],
    ['TOOLS', [
      ['HISTORY', 'Show command history'],
      ['HISTORY CLEAR', 'Clear command history'],
      ['STATUS', 'Show browser and DNI link status'],
      ['CLEAR', 'Clear and restart the active terminal'],
      ['ABOUT', 'Show DNI Terminal information']
    ]]
  ];

  function appendHelpRow(section, command, description) {
    const row = document.createElement('div');
    row.className = 'dni-terminal-help-row';

    const commandEl = document.createElement('span');
    commandEl.className = 'dni-terminal-help-command';
    commandEl.textContent = command;

    const copy = document.createElement('span');
    copy.className = 'dni-terminal-help-copy';
    copy.textContent = description;

    row.append(commandEl, copy);
    section.append(row);
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

    const root = document.createElement('section');
    root.className = 'dni-terminal-help';
    root.setAttribute('aria-label', 'DNI Terminal command reference');

    const head = document.createElement('div');
    head.className = 'dni-terminal-help-head';
    const title = document.createElement('span');
    title.textContent = 'DNI TERMINAL';
    const badge = document.createElement('b');
    badge.textContent = 'COMMAND REFERENCE';
    head.append(title, badge);
    root.append(head);

    for (const [label, commands] of groups) {
      const section = document.createElement('div');
      section.className = 'dni-terminal-help-section';
      const sectionLabel = document.createElement('div');
      sectionLabel.className = 'dni-terminal-help-label';
      sectionLabel.textContent = label;
      section.append(sectionLabel);
      for (const [command, description] of commands) appendHelpRow(section, command, description);
      root.append(section);
    }

    const foot = document.createElement('div');
    foot.className = 'dni-terminal-help-foot';
    foot.textContent = 'TIP // ↑ / ↓ COMMAND HISTORY  ·  TAB AUTOCOMPLETE  ·  EXAMPLE: ACCESS 173';
    root.append(foot);

    output.append(root);
    if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
  }

  document.addEventListener('keydown', event => {
    if (event.target !== input || event.key !== 'Enter') return;
    if (String(input.value || '').trim().toLowerCase() !== 'help') return;
    queueMicrotask(renderCleanHelp);
  }, true);

  queueMicrotask(renderCleanHelp);
}
