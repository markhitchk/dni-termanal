const DISCORD_URL = 'https://discord.gg/dreadnoughtimperium';
const RSI_URL = 'https://robertsspaceindustries.com/en/orgs/DNI';
const RSI_LOGO_URL = 'https://robertsspaceindustries.com/media/ym5kkd52hhrclr/logo/DNI-Logo.png';

let citizenActive = document.documentElement.dataset.dniCitizen === 'true';
let dashboardObserver = null;

function installStyles() {
  if (document.getElementById('dni-citizen-community-links-style')) return;
  const style = document.createElement('style');
  style.id = 'dni-citizen-community-links-style';
  style.textContent = `
    .dni-citizen-community-links {
      margin-top: 16px;
    }

    .dni-citizen-link-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .dni-citizen-link-card {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      min-height: 76px;
      padding: 12px 14px;
      border: 1px solid rgba(125, 226, 255, .36);
      background: linear-gradient(180deg, rgba(7, 24, 35, .88), rgba(4, 14, 22, .82));
      color: inherit;
      text-decoration: none;
      box-shadow: inset 0 0 0 1px rgba(125, 226, 255, .04);
      cursor: pointer;
      transition: transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
    }

    .dni-citizen-link-card:hover,
    .dni-citizen-link-card:focus-visible,
    .dni-citizen-link-card:active {
      transform: translateY(-1px);
      border-color: rgba(125, 226, 255, .82);
      background: linear-gradient(180deg, rgba(9, 34, 49, .96), rgba(5, 20, 30, .92));
      box-shadow: 0 0 16px rgba(69, 207, 255, .12), inset 0 0 0 1px rgba(125, 226, 255, .08);
      outline: none;
    }

    .dni-citizen-link-icon {
      flex: 0 0 48px;
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      overflow: hidden;
      border: 1px solid rgba(125, 226, 255, .28);
      background: rgba(0, 0, 0, .32);
    }

    .dni-citizen-link-icon svg {
      width: 30px;
      height: 30px;
      display: block;
    }

    .dni-citizen-link-icon img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
      padding: 3px;
      box-sizing: border-box;
    }

    .dni-citizen-rsi-fallback {
      font: 800 15px/1 system-ui, sans-serif;
      letter-spacing: .08em;
    }

    .dni-citizen-link-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
      flex: 1 1 auto;
    }

    .dni-citizen-link-copy strong {
      font-size: .96rem;
      letter-spacing: .04em;
    }

    .dni-citizen-link-copy span {
      opacity: .72;
      font-size: .76rem;
      line-height: 1.35;
    }

    .dni-citizen-link-action {
      flex: 0 0 auto;
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 12px;
      border: 1px solid rgba(125, 226, 255, .52);
      background: rgba(0, 18, 28, .72);
      font: 700 .7rem/1 system-ui, sans-serif;
      letter-spacing: .08em;
      white-space: nowrap;
    }

    @media (max-width: 760px) {
      .dni-citizen-link-grid {
        grid-template-columns: 1fr;
      }

      .dni-citizen-link-card {
        flex-wrap: wrap;
        min-height: 78px;
        padding: 12px;
      }

      .dni-citizen-link-action {
        flex: 1 0 100%;
        width: 100%;
        margin-top: 2px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .dni-citizen-link-card {
        transition: none;
      }
    }
  `;
  document.head.append(style);
}

function discordIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M19.54 5.34A16.8 16.8 0 0 0 15.44 4l-.5 1.03a15.4 15.4 0 0 0-5.87 0L8.55 4a16.9 16.9 0 0 0-4.1 1.35C1.86 9.16 1.15 12.86 1.5 16.5a16.8 16.8 0 0 0 5.03 2.54l1.22-1.67a10.8 10.8 0 0 1-1.93-.92l.47-.36c3.72 1.7 7.77 1.7 11.45 0l.47.36c-.62.36-1.27.67-1.94.92l1.22 1.67a16.8 16.8 0 0 0 5.03-2.54c.42-4.22-.72-7.88-2.98-11.16ZM8.35 14.28c-1.12 0-2.04-1.03-2.04-2.3s.9-2.3 2.04-2.3c1.15 0 2.06 1.04 2.04 2.3 0 1.27-.9 2.3-2.04 2.3Zm7.3 0c-1.12 0-2.04-1.03-2.04-2.3s.9-2.3 2.04-2.3c1.15 0 2.06 1.04 2.04 2.3 0 1.27-.89 2.3-2.04 2.3Z"/>
    </svg>`;
}

function communityMarkup() {
  return `
    <section class="dni-section-block dni-citizen-community-links" data-dni-citizen-community-links>
      <div class="dni-section-heading">
        <div><span>CITIZEN COMMUNITY</span><h3>Community Links</h3></div>
        <b>PUBLIC ACCESS</b>
      </div>
      <p>Connect with Dreadnought Imperium through our public community channels.</p>
      <div class="dni-citizen-link-grid">
        <a class="dni-citizen-link-card" href="${DISCORD_URL}" target="_blank" rel="noopener noreferrer external" aria-label="Open the Dreadnought Imperium Discord">
          <span class="dni-citizen-link-icon" aria-hidden="true">${discordIcon()}</span>
          <span class="dni-citizen-link-copy">
            <strong>Discord</strong>
            <span>Join the Dreadnought Imperium Discord</span>
          </span>
          <span class="dni-citizen-link-action">OPEN DISCORD <span aria-hidden="true">↗</span></span>
        </a>
        <a class="dni-citizen-link-card" href="${RSI_URL}" target="_blank" rel="noopener noreferrer external" aria-label="Open Dreadnought Imperium on Roberts Space Industries">
          <span class="dni-citizen-link-icon" aria-hidden="true">
            <img data-dni-rsi-logo src="${RSI_LOGO_URL}" alt="" loading="lazy" referrerpolicy="no-referrer">
          </span>
          <span class="dni-citizen-link-copy">
            <strong>Roberts Space Industries</strong>
            <span>Dreadnought Imperium organization page</span>
          </span>
          <span class="dni-citizen-link-action">OPEN RSI <span aria-hidden="true">↗</span></span>
        </a>
      </div>
    </section>`;
}

function installRsiFallback(section) {
  const image = section.querySelector('[data-dni-rsi-logo]');
  if (!(image instanceof HTMLImageElement)) return;
  image.addEventListener('error', () => {
    const mark = document.createElement('span');
    mark.className = 'dni-citizen-rsi-fallback';
    mark.textContent = 'RSI';
    image.replaceWith(mark);
  }, { once: true });
}

function renderLinks() {
  if (!citizenActive) return;
  const dashboard = document.querySelector('[data-module="dashboard"]');
  if (!(dashboard instanceof HTMLElement)) return;
  if (dashboard.querySelector('[data-dni-citizen-community-links]')) return;

  dashboard.insertAdjacentHTML('beforeend', communityMarkup());
  const section = dashboard.querySelector('[data-dni-citizen-community-links]');
  if (section instanceof HTMLElement) installRsiFallback(section);
}

function observeDashboard() {
  const dashboard = document.querySelector('[data-module="dashboard"]');
  if (!(dashboard instanceof HTMLElement) || dashboardObserver) return;
  dashboardObserver = new MutationObserver(() => {
    if (citizenActive && !dashboard.querySelector('[data-dni-citizen-community-links]')) {
      queueMicrotask(renderLinks);
    }
  });
  dashboardObserver.observe(dashboard, { childList: true, subtree: false });
}

function activateCitizenLinks() {
  citizenActive = true;
  installStyles();
  observeDashboard();
  renderLinks();
}

window.addEventListener('dni:citizen-access', event => {
  if (event.detail?.citizen === true || event.detail?.accessClass === 'citizen') {
    activateCitizenLinks();
  }
});

window.addEventListener('dni:panel', event => {
  if (citizenActive && event.detail?.panel === 'dashboard') {
    queueMicrotask(renderLinks);
  }
});

if (citizenActive) activateCitizenLinks();
