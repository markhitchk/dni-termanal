const dashboard = document.querySelector('[data-module="dashboard"]');
const ROLE_NAMES_URL = '/discord-role-names.php';

let rolePayload = null;
let loadingPromise = null;

function findDiscordRoleSection() {
  if (!dashboard) return null;
  return [...dashboard.querySelectorAll('.dni-section-block')].find(section =>
    section.querySelector('h3')?.textContent?.trim() === 'Discord Roles'
  ) || null;
}

function renderNamedRoles() {
  const section = findDiscordRoleSection();
  if (!section || !rolePayload || section.dataset.discordRoleNamesResolved === 'true') return;

  const roles = Array.isArray(rolePayload.roles) ? rolePayload.roles : [];
  const count = section.querySelector('.dni-section-heading > b');
  if (count) count.textContent = `${roles.length} ROLES`;

  const description = section.querySelector(':scope > p');
  if (description) {
    description.textContent = 'Discord role names are resolved by the DNI server from the current guild membership. DNI permissions and clearances remain server enforced.';
  }

  const chipList = section.querySelector('.dni-chip-list');
  if (chipList) {
    chipList.replaceChildren();
    if (!roles.length) {
      const empty = document.createElement('span');
      empty.className = 'dni-chip is-muted';
      empty.textContent = 'NO GUILD ROLES RETURNED';
      chipList.append(empty);
    } else {
      for (const role of roles) {
        const chip = document.createElement('span');
        chip.className = role?.mapped === false ? 'dni-chip is-muted' : 'dni-chip';
        chip.textContent = String(role?.name || 'Unmapped Discord Role');
        chipList.append(chip);
      }
    }
  }

  section.dataset.discordRoleNamesResolved = 'true';
}

async function loadRoleNames() {
  if (rolePayload) {
    renderNamedRoles();
    return rolePayload;
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch(ROLE_NAMES_URL, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  }).then(async response => {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(payload.error || `Discord role-name lookup HTTP ${response.status}`);
    rolePayload = payload;
    renderNamedRoles();
    return rolePayload;
  }).catch(error => {
    console.error('DNI Discord role-name resolution failed', error);
    return null;
  }).finally(() => {
    loadingPromise = null;
  });

  return loadingPromise;
}

if (dashboard) {
  const observer = new MutationObserver(() => {
    const section = findDiscordRoleSection();
    if (!section) return;
    if (rolePayload) renderNamedRoles();
    else if (document.documentElement.dataset.dniAuth === 'authenticated') void loadRoleNames();
  });
  observer.observe(dashboard, { childList: true, subtree: true });

  window.addEventListener('dni:panel', event => {
    if (event.detail?.panel !== 'dashboard') return;
    queueMicrotask(() => void loadRoleNames());
  });

  window.addEventListener('dni:authz', event => {
    if (event.detail?.authenticated === true) void loadRoleNames();
  });

  if (document.documentElement.dataset.dniAuth === 'authenticated') void loadRoleNames();
}
