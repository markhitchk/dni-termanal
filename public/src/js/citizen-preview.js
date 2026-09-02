const params = new URLSearchParams(window.location.search);
const previewTarget = String(params.get('citizenPreview') || '').trim().toLowerCase();

if (previewTarget === 'max') {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const DISCORD_URL = 'https://discord.gg/dreadnoughtimperium';
  const RSI_URL = 'https://robertsspaceindustries.com/en/orgs/DNI';
  const RSI_LOGO_URL = 'https://robertsspaceindustries.com/media/8d9aess71alt7r/slideshow_pager/CS_42_METAL_LOGO_FINAL.jpg';
  const RESTRICTED_PANELS = new Set(['ranks', 'documents', 'services', 'communication', 'sectors', 'admin']);
  let payload = null;
  let observer = null;

  function installStyles() {
    if (document.getElementById('dni-citizen-preview-style')) return;
    const style = document.createElement('style');
    style.id = 'dni-citizen-preview-style';
    style.textContent = `
      html[data-dni-citizen-preview="max"] .nav-tab[data-panel="ranks"],
      html[data-dni-citizen-preview="max"] .nav-tab[data-panel="documents"],
      html[data-dni-citizen-preview="max"] .nav-tab[data-panel="services"],
      html[data-dni-citizen-preview="max"] .nav-tab[data-panel="communication"],
      html[data-dni-citizen-preview="max"] .nav-tab[data-panel="sectors"],
      html[data-dni-citizen-preview="max"] .nav-tab[data-panel="admin"] { display:none!important; }
      .dni-preview-banner{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 14px;margin-bottom:14px;border:1px solid rgba(255,196,0,.55);background:rgba(52,37,0,.36)}
      .dni-preview-banner strong{letter-spacing:.08em}.dni-preview-banner span{opacity:.82;font-size:.82rem}.dni-preview-exit{white-space:nowrap}
      .dni-preview-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
      .dni-preview-link{display:flex;align-items:center;gap:12px;min-height:68px;padding:12px 14px;border:1px solid rgba(125,226,255,.28);background:rgba(5,17,25,.72);color:inherit;text-decoration:none}
      .dni-preview-link-icon{width:44px;height:44px;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(125,226,255,.22);background:rgba(0,0,0,.28);flex:0 0 44px}
      .dni-preview-link-icon svg{width:28px;height:28px}.dni-preview-link-icon img{width:100%;height:100%;object-fit:cover}.dni-preview-link-copy{display:grid;gap:3px}.dni-preview-link-copy span{font-size:.76rem;opacity:.7}
      @media(max-width:680px){.dni-preview-links{grid-template-columns:1fr}.dni-preview-link{min-height:64px;padding:10px 12px}}
    `;
    document.head.append(style);
  }

  function value(label, text) {
    return `<div class="dni-value"><span>${esc(label)}</span><b>${esc(text || 'UNASSIGNED')}</b></div>`;
  }

  function discordIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.54 5.34A16.8 16.8 0 0 0 15.44 4l-.5 1.03a15.4 15.4 0 0 0-5.87 0L8.55 4a16.9 16.9 0 0 0-4.1 1.35C1.86 9.16 1.15 12.86 1.5 16.5a16.8 16.8 0 0 0 5.03 2.54l1.22-1.67a10.8 10.8 0 0 1-1.93-.92l.47-.36c3.72 1.7 7.77 1.7 11.45 0l.47.36c-.62.36-1.27.67-1.94.92l1.22 1.67a16.8 16.8 0 0 0 5.03-2.54c.42-4.22-.72-7.88-2.98-11.16ZM8.35 14.28c-1.12 0-2.04-1.03-2.04-2.3s.9-2.3 2.04-2.3c1.15 0 2.06 1.04 2.04 2.3 0 1.27-.9 2.3-2.04 2.3Zm7.3 0c-1.12 0-2.04-1.03-2.04-2.3s.9-2.3 2.04-2.3c1.15 0 2.06 1.04 2.04 2.3 0 1.27-.89 2.3-2.04 2.3Z"/></svg>`;
  }

  function render() {
    if (!payload) return;
    const root = document.querySelector('[data-module="dashboard"]');
    if (!(root instanceof HTMLElement)) return;
    if (root.dataset.dniCitizenPreviewRendered === 'max') return;

    const user = payload.user || {};
    const citizen = payload.citizenDashboard || {};
    const available = Array.isArray(citizen.available) ? citizen.available : [];
    const restricted = Array.isArray(citizen.restricted) ? citizen.restricted : [];
    const name = user.guild_nick || user.global_name || user.username || 'Max';
    const avatar = user.avatar_url
      ? `<img src="${esc(user.avatar_url)}" alt="${esc(name)} Discord avatar" loading="lazy" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin:8px 0">`
      : '';

    root.dataset.dniCitizenPreviewRendered = 'max';
    root.className = 'module-panel dni-module-panel dni-citizen-dashboard';
    root.innerHTML = `
      <div class="dni-preview-banner">
        <div><strong>DEVELOPER PREVIEW // MAX AS CITIZEN</strong><br><span>${esc(payload.developerPreview?.warning || 'Visual template only. Real permissions are unchanged.')}</span></div>
        <a class="dni-primary-action dni-preview-exit" href="/dashboard">EXIT PREVIEW</a>
      </div>
      <header class="dni-module-header"><div><span>DNI PUBLIC ACCESS NETWORK</span><h2>Citizen Dashboard</h2><p>Public and community access for Dreadnought Imperium Citizens.</p></div><strong class="dni-state-badge is-online">CL/NON · CITIZEN</strong></header>
      <section class="dni-profile-grid">
        <article class="dni-profile-card dni-profile-primary">
          <span class="dni-card-kicker">CITIZEN IDENTITY</span>${avatar}<h3>${esc(name)}</h3>
          <p>${esc(citizen.summary || '')}</p>
          <div class="dni-value-grid">${value('ACCESS CLASS','CITIZEN')}${value('CLEARANCE','CL/NON')}${value('MEMBERSHIP','NON-MEMBER / COMMUNITY')}${value('DNI RANK','NOT ASSIGNED')}${value('CORPS','NOT ASSIGNED')}${value('SECTOR / FLEET','NOT ASSIGNED')}</div>
        </article>
        <article class="dni-profile-card"><span class="dni-card-kicker">PUBLIC ACCESS</span><h3>AVAILABLE TO CITIZENS</h3><div class="dni-chip-list">${available.map(item => `<span class="dni-chip">${esc(item)}</span>`).join('')}</div></article>
      </section>
      <section class="dni-section-block"><div class="dni-section-heading"><div><span>CITIZEN COMMUNITY</span><h3>Community Links</h3></div><b>PUBLIC ACCESS</b></div><div class="dni-preview-links">
        <a class="dni-preview-link" href="${DISCORD_URL}" target="_blank" rel="noopener noreferrer external"><span class="dni-preview-link-icon">${discordIcon()}</span><span class="dni-preview-link-copy"><strong>Discord</strong><span>Join the Dreadnought Imperium Discord</span></span></a>
        <a class="dni-preview-link" href="${RSI_URL}" target="_blank" rel="noopener noreferrer external"><span class="dni-preview-link-icon"><img src="${RSI_LOGO_URL}" alt="" loading="lazy" referrerpolicy="no-referrer"></span><span class="dni-preview-link-copy"><strong>Roberts Space Industries</strong><span>Dreadnought Imperium organization page</span></span></a>
      </div></section>
      <section class="dni-section-block"><div class="dni-section-heading"><div><span>CITIZEN ACCESS BOUNDARY</span><h3>Member Systems Restricted</h3></div><b>CL0+ BLOCKED</b></div><p>Citizens remain separate from DNI ranks, corps, sectors, fleets, paygrades, personnel records, and internal operations until they officially join the organization.</p><div class="dni-chip-list">${restricted.map(item => `<span class="dni-chip is-muted">${esc(item)}</span>`).join('')}</div></section>`;
  }

  function showError(message, locked = false) {
    const root = document.querySelector('[data-module="dashboard"]');
    if (!(root instanceof HTMLElement)) return;
    root.innerHTML = `<header class="dni-module-header"><div><span>DNI DEVELOPER PREVIEW</span><h2>Citizen Preview Unavailable</h2></div><strong class="dni-state-badge is-error">${locked ? 'DEV LOGIN REQUIRED' : 'UNAVAILABLE'}</strong></header><div class="dni-error">${esc(message)}</div><a class="dni-primary-action" href="/dashboard">EXIT PREVIEW</a>`;
  }

  async function start() {
    document.documentElement.dataset.dniCitizenPreview = 'max';
    installStyles();
    for (const tab of document.querySelectorAll('.nav-tab[data-panel]')) {
      if (RESTRICTED_PANELS.has(String(tab.dataset.panel || ''))) tab.hidden = true;
    }
    try {
      const response = await fetch('/dev/private/citizen-preview.php?template=max', { credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'} });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(data.error || 'Citizen preview could not be loaded.', data.developerLocked === true);
        return;
      }
      payload = data;
      render();
      const root = document.querySelector('[data-module="dashboard"]');
      if (root instanceof HTMLElement) {
        observer = new MutationObserver(() => {
          if (root.dataset.dniCitizenPreviewRendered !== 'max') queueMicrotask(render);
        });
        observer.observe(root, {childList:true});
      }
      document.querySelector('.nav-tab[data-panel="dashboard"]')?.click();
    } catch (error) {
      showError(error?.message || 'Citizen preview could not be loaded.');
    }
  }

  void start();
}
