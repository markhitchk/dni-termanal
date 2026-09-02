const DISCORD_URL = 'https://discord.gg/dreadnoughtimperium';
const RSI_URL = 'https://robertsspaceindustries.com/en/orgs/DNI';
const RSI_LOGO_URL = 'https://robertsspaceindustries.com/media/8d9aess71alt7r/slideshow_pager/CS_42_METAL_LOGO_FINAL.jpg';

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
      min-height: 68px;
      padding: 12px 14px;
      border: 1px solid rgba(125, 226, 255, .28);
      background: rgba(5, 17, 25, .72);
      color: inherit;
      text-decoration: none;
      transition: transform .16s ease, border-color .16s ease, background .16s ease;
    }

    .dni-citizen-link-card:hover,
    .dni-citizen-link-card:focus-visible {
      transform: translateY(-1px);
      border-color: rgba(125, 226, 255, .72);
      background: rgba(8, 26, 38, .92);
      outline: none;
    }

    .dni-citizen-link-icon {
      flex: 0 0 44px;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      overflow: hidden;
      border: 1px solid rgba(125, 226, 255, .22);
      background: rgba(0, 0, 0, .28);
    }

    .dni-citizen-link-icon svg {
      width: 28px;
      height: 28px;
      display: block;
    }

    .dni-citizen-link-icon img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    .dni-citizen-rsi-fallback {
      font: 800 15px/1 system-ui, sans-serif;
      letter-spacing: .08em;
    }

    .dni-citizen-link-copy {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .dni-citizen-link-copy strong {
      font-size: .92rem;
      letter-spacing: .04em;
    }

    .dni-citizen-link-copy span {
      opacity: .7;
      font-size: .76rem;
      line-height: 1.35;
    }

    @media (max-width: 680px) {
      .dni-citizen-link-grid {
        grid-template-columns: 1fr;
      }

      .dni-citizen-link-card {
        min-height: 64px;
        padding: 10px 12px;
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
        </a>
        <a class="dni-citizen-link-card" href="${RSI_URL}" target="_blank" rel="noopener noreferrer external" aria-label="Open Dreadnought Imperium on Roberts Space Industries">
          <span class="dni-citizen-link-icon" aria-hidden="true">
            <img data-dni-rsi-logo src="${RSI_LOGO_URL}" alt="" loading="lazy" referrerpolicy="no-referrer">
          </span>
          <span class="dni-citizen-link-copy">
            <strong>Roberts Space Industries</strong>
            <span>Dreadnought Imperium organization page</span>
          </span>
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
