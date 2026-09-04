(() => {
  if (window.__dniUserSettingsHeaderAnimationInstalled) return;
  window.__dniUserSettingsHeaderAnimationInstalled = true;

  const style = document.createElement('style');
  style.id = 'dni-user-settings-header-animation';
  style.textContent = `
    @keyframes dni-settings-blue-stripe-scan {
      from { background-position: 0 0; }
      to { background-position: 40px 0; }
    }

    @keyframes dni-settings-blue-stripe-glow {
      0%, 100% { box-shadow: 0 0 0 rgba(116,200,244,0); filter: brightness(.92); }
      50% { box-shadow: 0 1px 10px rgba(116,200,244,.22); filter: brightness(1.08); }
    }

    .dni-user-settings-hazard {
      background-size: 40px 40px!important;
      animation:
        dni-settings-blue-stripe-scan 1.15s linear infinite,
        dni-settings-blue-stripe-glow 2.8s ease-in-out infinite!important;
      will-change: background-position, filter;
    }

    @media(max-width:620px) {
      .dni-user-settings-hazard {
        animation-duration: .95s, 2.5s!important;
      }
    }

    @media(prefers-reduced-motion:reduce) {
      .dni-user-settings-hazard {
        animation: none!important;
        filter: none!important;
        box-shadow: none!important;
      }
    }
  `;

  document.head.append(style);

  const source = new URL(import.meta.url);
  const notifications = new URL(`./user-settings-notifications.js${source.search}`, source);
  import(notifications.href).catch(error => {
    console.error('DNI Settings notification controls failed to load', error);
  });
})();
