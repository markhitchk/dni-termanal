const DISCORD_URL = 'https://discord.gg/dreadnoughtimperium';
const RSI_URL = 'https://robertsspaceindustries.com/en/orgs/DNI';
// RSI logo selected from the Roberts Space Industries logo results requested for Citizen view.
const RSI_LOGO_URL = 'https://star-citizen.wiki/thumb.php?f=Roberts_Space_Industries.svg&width=1200';

let citizenActive = document.documentElement.dataset.dniCitizen === 'true';
let dashboardObserver = null;
let renderInFlight = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function installStyles() {
  if (document.getElementById('dni-citizen-dashboard-style')) return;
  const style = document.createElement('style');
  style.id = 'dni-citizen-dashboard-style';
  style.textContent = `
    [data-dni-citizen-dashboard] { display:grid; gap:16px; }
    .dni-citizen-hero { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr); gap:14px; }
    .dni-citizen-card,.dni-citizen-section { border:1px solid rgba(125,226,255,.28); background:rgba(4,16,24,.78); padding:16px; min-width:0; }
    .dni-citizen-profile { display:flex; align-items:center; gap:14px; margin-top:12px; }
    .dni-citizen-avatar { width:72px; height:72px; border-radius:50%; object-fit:cover; border:1px solid rgba(125,226,255,.35); flex:0 0 72px; }
    .dni-citizen-profile h3 { margin:0 0 5px; }
    .dni-citizen-profile p { margin:0; opacity:.72; }
    .dni-citizen-values { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:14px; }
    .dni-citizen-value { border:1px solid rgba(125,226,255,.16); padding:10px; background:rgba(0,0,0,.2); }
    .dni-citizen-value span { display:block; opacity:.6; font-size:.7rem; }
    .dni-citizen-value b { display:block; margin-top:4px; }
    .dni-citizen-action-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:12px; }
    .dni-citizen-action {
      display:flex; align-items:center; gap:12px; min-height:72px; padding:12px 14px;
      border:1px solid rgba(125,226,255,.35); background:linear-gradient(180deg,rgba(8,29,42,.9),rgba(4,16,24,.86));
      color:inherit; text-decoration:none; cursor:pointer; text-align:left; font:inherit;
      transition:border-color .16s ease,transform .16s ease,background .16s ease,box-shadow .16s ease;
    }
    .dni-citizen-action:hover,.dni-citizen-action:focus-visible,.dni-citizen-action:active {
      border-color:rgba(73,207,255,.86); background:linear-gradient(180deg,rgba(10,40,58,.98),rgba(5,22,33,.95));
      box-shadow:0 0 16px rgba(73,207,255,.1); transform:translateY(-1px); outline:none;
    }
    .dni-citizen-action-icon { width:42px; height:42px; flex:0 0 42px; display:grid; place-items:center; border:1px solid rgba(125,226,255,.24); font-size:1.25rem; background:rgba(0,0,0,.25); }
    .dni-citizen-action-copy { min-width:0; flex:1 1 auto; }
    .dni-citizen-action-copy strong { display:block; font-size:.88rem; letter-spacing:.025em; }
    .dni-citizen-action-copy small { display:block; margin-top:4px; opacity:.68; line-height:1.3; }
    .dni-citizen-chevron { font-size:1.2rem; opacity:.7; }
    .dni-citizen-community-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:12px; }
    .dni-citizen-community-card { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:14px; border:1px solid rgba(125,226,255,.38); background:rgba(5,20,29,.86); color:inherit; text-decoration:none; }
    .dni-citizen-community-card:hover,.dni-citizen-community-card:focus-visible { border-color:rgba(125,226,255,.85); outline:none; }
    .dni-citizen-community-logo { width:62px; height:62px; flex:0 0 62px; display:grid; place-items:center; border:1px solid rgba(125,226,255,.28); background:#050b10; overflow:hidden; }
    .dni-citizen-community-logo svg { width:38px; height:38px; }
    .dni-citizen-community-logo img { width:100%; height:100%; object-fit:contain; padding:4px; box-sizing:border-box; }
    .dni-citizen-community-copy { flex:1 1 180px; min-width:0; }
    .dni-citizen-community-copy strong { display:block; font-size:1rem; }
    .dni-citizen-community-copy span { display:block; margin-top:4px; opacity:.7; line-height:1.35; }
    .dni-citizen-open { flex:1 0 100%; min-height:44px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(73,207,255,.62); background:rgba(0,39,62,.78); font-weight:800; letter-spacing:.08em; }
    .dni-citizen-restricted-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:12px; }
    .dni-citizen-restricted { padding:10px 12px; border:1px solid rgba(255,92,92,.2); color:rgba(255,190,190,.78); background:rgba(55,8,8,.18); }
    @media (max-width:760px) {
      .dni-citizen-hero,.dni-citizen-action-grid,.dni-citizen-community-grid,.dni-citizen-values,.dni-citizen-restricted-grid { grid-template-columns:1fr; }
      .dni-citizen-card,.dni-citizen-section { padding:13px; }
      .dni-citizen-action { min-height:68px; padding:11px 12px; }
      .dni-citizen-community-card { padding:12px; }
      .dni-citizen-community-logo { width:56px; height:56px; flex-basis:56px; }
    }
    @media (prefers-reduced-motion:reduce) { .dni-citizen-action { transition:none; } }
  `;
  document.head.append(style);
}

function discordIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.54 5.34A16.8 16.8 0 0 0 15.44 4l-.5 1.03a15.4 15.4 0 0 0-5.87 0L8.55 4a16.9 16.9 0 0 0-4.1 1.35C1.86 9.16 1.15 12.86 1.5 16.5a16.8 16.8 0 0 0 5.03 2.54l1.22-1.67a10.8 10.8 0 0 1-1.93-.92l.47-.36c3.72 1.7 7.77 1.7 11.45 0l.47.36c-.62.36-1.27.67-1.94.92l1.22 1.67a16.8 16.8 0 0 0 5.03-2.54c.42-4.22-.72-7.88-2.98-11.16Z"/></svg>`;
}

function actionCard(icon, title, description, href, external = false) {
  const attrs = external ? ' target="_blank" rel="noopener noreferrer external"' : '';
  return `<a class="dni-citizen-action" href="${esc(href)}"${attrs}><span class="dni-citizen-action-icon" aria-hidden="true">${icon}</span><span class="dni-citizen-action-copy"><strong>${esc(title)}</strong><small>${esc(description)}</small></span><span class="dni-citizen-chevron" aria-hidden="true">›</span></a>`;
}

function renderCitizen(data) {
  const root = document.querySelector('[data-module="dashboard"]');
  if (!(root instanceof HTMLElement)) return;
  const user = data.user || {};
  const dashboard = data.citizenDashboard || {};
  const restricted = Array.isArray(dashboard.restricted) ? dashboard.restricted : [];
  const name = user.guild_nick || user.global_name || user.username || 'DNI CITIZEN';
  const avatar = user.avatar_url ? `<img class="dni-citizen-avatar" src="${esc(user.avatar_url)}" alt="${esc(name)} Discord avatar" loading="lazy">` : '';

  root.className = 'module-panel dni-module-panel';
  root.innerHTML = `<div data-dni-citizen-dashboard>
    <header class="dni-module-header"><div><span>DNI PUBLIC ACCESS NETWORK</span><h2>Citizen Dashboard</h2><p>${esc(dashboard.summary || 'Public and community access for Dreadnought Imperium Citizens.')}</p></div><strong class="dni-state-badge is-online">CL/NON · CITIZEN</strong></header>

    <section class="dni-citizen-hero">
      <article class="dni-citizen-card">
        <span class="dni-card-kicker">CITIZEN IDENTITY</span>
        <div class="dni-citizen-profile">${avatar}<div><h3>${esc(name)}</h3><p>Non-member community access</p></div></div>
        <div class="dni-citizen-values">
          <div class="dni-citizen-value"><span>ACCESS CLASS</span><b>CITIZEN</b></div>
          <div class="dni-citizen-value"><span>CLEARANCE</span><b>CL/NON</b></div>
          <div class="dni-citizen-value"><span>DNI RANK</span><b>NOT ASSIGNED</b></div>
          <div class="dni-citizen-value"><span>CORPS / SECTOR / FLEET</span><b>NOT ASSIGNED</b></div>
        </div>
      </article>
      <article class="dni-citizen-card">
        <span class="dni-card-kicker">PUBLIC ACCESS</span><h3>AVAILABLE TO CITIZENS</h3>
        <p>Use the buttons below to open Citizen-accessible resources.</p>
      </article>
    </section>

    <section class="dni-citizen-section">
      <div class="dni-section-heading"><div><span>CITIZEN ACCESS</span><h3>Available to Citizens</h3></div><b>CL/NON</b></div>
      <div class="dni-citizen-action-grid">
        ${actionCard('📢','Public announcements','Open public DNI announcements and community notices.','/terminal')}
        ${actionCard('✉','Citizen and public DNI Mail','Open DNI Terminal to access Citizen-authorized mail.','/terminal')}
        ${actionCard('👥','Community information','Open the Dreadnought Imperium community Discord.',DISCORD_URL,true)}
        ${actionCard('📅','Events','View current community events through the DNI Discord.',DISCORD_URL,true)}
        ${actionCard('＋','Recruitment information','View the Dreadnought Imperium organization and recruitment page.',RSI_URL,true)}
        ${actionCard('▤','CL/NON public document reader','Open DNI Terminal for clearance-filtered public documents.','/terminal')}
      </div>
    </section>

    <section class="dni-citizen-section">
      <div class="dni-section-heading"><div><span>CITIZEN COMMUNITY</span><h3>Community Links</h3></div><b>PUBLIC ACCESS</b></div>
      <div class="dni-citizen-community-grid">
        <a class="dni-citizen-community-card" href="${DISCORD_URL}" target="_blank" rel="noopener noreferrer external"><span class="dni-citizen-community-logo" aria-hidden="true">${discordIcon()}</span><span class="dni-citizen-community-copy"><strong>Discord</strong><span>Join the Dreadnought Imperium Discord community.</span></span><span class="dni-citizen-open">OPEN DISCORD ↗</span></a>
        <a class="dni-citizen-community-card" href="${RSI_URL}" target="_blank" rel="noopener noreferrer external"><span class="dni-citizen-community-logo"><img data-dni-rsi-logo src="${RSI_LOGO_URL}" alt="Roberts Space Industries logo" loading="lazy" referrerpolicy="no-referrer"></span><span class="dni-citizen-community-copy"><strong>Roberts Space Industries</strong><span>Dreadnought Imperium organization page on RSI.</span></span><span class="dni-citizen-open">OPEN RSI ↗</span></a>
      </div>
    </section>

    <section class="dni-citizen-section">
      <div class="dni-section-heading"><div><span>CITIZEN ACCESS BOUNDARY</span><h3>Member Systems Restricted</h3></div><b>CL0+ BLOCKED</b></div>
      <p>Citizens remain separate from DNI ranks, corps, sectors, fleets, paygrades, personnel records, and internal operations until they officially join the organization.</p>
      <div class="dni-citizen-restricted-grid">${restricted.map(item => `<div class="dni-citizen-restricted">🔒 ${esc(item)}</div>`).join('')}</div>
    </section>
  </div>`;

  root.querySelector('[data-dni-rsi-logo]')?.addEventListener('error', event => {
    const fallback = document.createElement('span');
    fallback.textContent = 'RSI';
    fallback.style.fontWeight = '800';
    fallback.style.letterSpacing = '.08em';
    event.currentTarget?.replaceWith(fallback);
  }, { once: true });
}

async function renderCitizenDashboard() {
  if (!citizenActive || renderInFlight) return;
  const root = document.querySelector('[data-module="dashboard"]');
  if (!(root instanceof HTMLElement)) return;
  if (root.querySelector('[data-dni-citizen-dashboard]')) return;
  renderInFlight = true;
  try {
    const response = await fetch('/dashboard-data.php', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.citizen !== true || data.accessClass !== 'citizen') return;
    installStyles();
    renderCitizen(data);
  } catch (error) {
    console.error('Citizen dashboard render failed', error);
  } finally {
    renderInFlight = false;
  }
}

function observeDashboard() {
  const root = document.querySelector('[data-module="dashboard"]');
  if (!(root instanceof HTMLElement) || dashboardObserver) return;
  dashboardObserver = new MutationObserver(() => {
    if (citizenActive && !root.querySelector('[data-dni-citizen-dashboard]')) queueMicrotask(renderCitizenDashboard);
  });
  dashboardObserver.observe(root, { childList: true, subtree: false });
}

function activateCitizenDashboard() {
  citizenActive = true;
  document.documentElement.dataset.dniCitizen = 'true';
  installStyles();
  observeDashboard();
  void renderCitizenDashboard();
}

window.addEventListener('dni:citizen-access', event => {
  if (event.detail?.citizen === true || event.detail?.accessClass === 'citizen') activateCitizenDashboard();
});

window.addEventListener('dni:panel', event => {
  if (citizenActive && event.detail?.panel === 'dashboard') queueMicrotask(renderCitizenDashboard);
});

if (citizenActive) activateCitizenDashboard();
