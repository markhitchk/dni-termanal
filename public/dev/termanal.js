(() => {
  const output = document.querySelector('#dev-output');
  const form = document.querySelector('#dev-form');
  const input = document.querySelector('#dev-input');
  const csrf = document.querySelector('meta[name="dni-csrf"]')?.content || '';

  if (!output || !form || !input) return;

  function line(text = '', className = '') {
    const row = document.createElement('div');
    row.textContent = text;
    if (className) row.className = className;
    output.append(row);
    output.scrollTop = output.scrollHeight;
    return row;
  }

  function gap() {
    line('');
  }

  function boot() {
    output.replaceChildren();
    line('---------------- DNI DEVELOPER TERMINAL ----------------', 'sep');
    line('DREADNOUGHT IMPERIUM // AUTHORIZED SYSTEM CONTROL');
    line('SAFE CONTROL MODE ........ ACTIVE', 'good');
    line('REMOTE SHELL ............. DISABLED', 'muted');
    line('MAINTENANCE CONTROL ...... AVAILABLE', 'good');
    gap();
    line("Type 'help' for developer commands.", 'muted');
    line('--------------------------------------------------------', 'sep');
    gap();
  }

  function showHelp() {
    line('DEVELOPER COMMANDS');
    line('HELP                         Show this command list', 'muted');
    line('WHOAMI                       Show current developer identity', 'muted');
    line('RUNTIME                      Show live server/runtime status', 'muted');
    line('BUILD                        Show deployed build information', 'muted');
    line('MAINTENANCE STATUS           Show maintenance state', 'muted');
    line('MAINTENANCE ON               Enable site update mode', 'muted');
    line('MAINTENANCE OFF              Disable site update mode', 'muted');
    line('CLEAR                        Clear Developer Terminal', 'muted');
    line('EXIT                         Return to normal DNI Terminal', 'muted');
  }

  async function request(action) {
    const response = await fetch('/dev/termanal.php', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-DNI-CSRF': csrf
      },
      body: JSON.stringify({ action })
    });

    const raw = await response.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(`Developer Terminal control endpoint returned non-JSON data (HTTP ${response.status}).`);
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error(`Developer Terminal control endpoint returned an empty response (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(payload.error || `Developer Terminal HTTP ${response.status}`);
    if (payload.ok !== true) throw new Error(payload.error || 'Developer Terminal rejected the control request.');
    return payload;
  }

  function value(value) {
    if (value === true) return 'YES';
    if (value === false) return 'NO';
    if (value === null || value === undefined || value === '') return 'N/A';
    return String(value);
  }

  async function run(raw) {
    const commandLine = String(raw || '').trim();
    if (!commandLine) return;

    const echo = document.createElement('div');
    echo.innerHTML = '<span class="prompt-user"></span>@<span class="prompt-host">dni-dev</span>:~$ ';
    echo.querySelector('.prompt-user').textContent = document.querySelector('.prompt-user')?.textContent || 'developer';
    echo.append(document.createTextNode(commandLine));
    output.append(echo);

    const [command, ...args] = commandLine.toLowerCase().split(/\s+/);

    try {
      switch (command) {
        case 'help':
          showHelp();
          break;
        case 'whoami': {
          const payload = await request('whoami');
          line(`USER: ${value(payload.user?.name)}`);
          line(`ADMIN: ${value(payload.user?.admin)}`, 'good');
          line(`AUTH SOURCE: ${value(payload.user?.source)}`, 'muted');
          break;
        }
        case 'runtime': {
          const payload = await request('runtime');
          const runtime = payload.runtime || {};
          line('DNI RUNTIME STATUS');
          line(`RUNTIME: ${value(runtime.runtime)}`, 'muted');
          line(`PHP: ${value(runtime.php)} / ${value(runtime.sapi)}`, 'muted');
          line(`SERVER: ${value(runtime.server)}`, 'muted');
          line(`DATABASE MODE: ${value(runtime.databaseMode)}`, 'muted');
          line(`STAR COMMS CONFIGURED: ${value(runtime.starCommsConfigured)}`, runtime.starCommsConfigured ? 'good' : 'bad');
          line(`MAINTENANCE: ${runtime.maintenance ? 'ON' : 'OFF'}`, runtime.maintenance ? 'bad' : 'good');
          line(`UTC: ${value(runtime.utc)}`, 'muted');
          break;
        }
        case 'build': {
          const payload = await request('build');
          const build = payload.build || {};
          line('DNI BUILD INFORMATION');
          line(`VERSION: ${value(build.version)}`, 'muted');
          line(`BUILD: ${value(build.buildLabel)}`, 'muted');
          line(`COMMIT: ${value(build.commit)}`, 'muted');
          if (build.deploymentNote) line(`NOTE: ${build.deploymentNote}`, 'muted');
          break;
        }
        case 'maintenance': {
          const mode = args[0] || 'status';
          if (!['status', 'on', 'off'].includes(mode)) {
            line('USAGE: maintenance status|on|off', 'bad');
            break;
          }
          const action = mode === 'status' ? 'maintenance-status' : `maintenance-${mode}`;
          line(mode === 'status' ? 'CHECKING MAINTENANCE STATE...' : `${mode === 'on' ? 'ENABLING' : 'DISABLING'} SITE MAINTENANCE...`, 'muted');
          const payload = await request(action);
          if (typeof payload.maintenance !== 'boolean') {
            throw new Error('Maintenance control response did not include a valid server state.');
          }
          if (mode === 'on' && payload.maintenance !== true) {
            throw new Error('Server did not enable DNI maintenance mode.');
          }
          if (mode === 'off' && payload.maintenance !== false) {
            throw new Error('Server did not disable DNI maintenance mode.');
          }
          line(`DNI MAINTENANCE MODE: ${payload.maintenance ? 'ON' : 'OFF'}`, payload.maintenance ? 'bad' : 'good');
          if (payload.maintenance) line('PUBLIC PAGES NOW SHOW SYSTEM UPDATE IN PROGRESS.', 'muted');
          else line('NORMAL WEBSITE ACCESS RESTORED.', 'muted');
          break;
        }
        case 'clear':
          boot();
          break;
        case 'exit':
        case 'terminal':
          window.location.assign('/terminal');
          break;
        default:
          line(`UNKNOWN DEVELOPER COMMAND: ${command.toUpperCase()} // TYPE HELP`, 'bad');
      }
    } catch (error) {
      line(`ERROR: ${String(error?.message || error)}`, 'bad');
    }

    gap();
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const command = input.value;
    input.value = '';
    void run(command);
  });

  boot();
  input.focus({ preventScroll: true });
})();
