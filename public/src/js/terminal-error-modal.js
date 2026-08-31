const output = document.querySelector('#terminal-output');
const input = document.querySelector('#command-input');
const prompt = document.querySelector('.terminal-prompt');
const addButton = document.querySelector('#terminal-add');
const inboxButton = document.querySelector('#terminal-inbox');

if (!window.__dniTerminalErrorModalInstalled) {
  window.__dniTerminalErrorModalInstalled = true;

  const LOGIN_URL = '/auth/discord/login';
  const LEGACY_ERRORS = Object.freeze({
    'NEW TERMINAL LOCKED // CURRENT TERMINAL NOT READY': {
      title: 'TERMINAL NOT READY',
      message: 'The current terminal must finish initializing and reach READY before a new terminal can be opened.'
    },
    'DNI MAIL LOCKED // TERMINAL INITIALIZATION NOT READY': {
      title: 'DNI MAIL LOCKED',
      message: 'DNI Mail is unavailable until the active terminal finishes initializing and reaches READY.'
    },
    'DNI MAIL LOCKED // AUTHORIZATION CHECK IN PROGRESS': {
      title: 'DNI MAIL LOCKED',
      message: 'DNI is still checking your session authorization. Try Mail again when the authorization check finishes.'
    },
    'DNI MAIL LOCKED // DISCORD AUTHENTICATION REQUIRED': {
      title: 'DISCORD LOGIN REQUIRED',
      message: 'Sign in with Discord before opening DNI Mail.',
      login: true
    }
  });

  const style = document.createElement('style');
  style.id = 'dni-terminal-error-modal-style';
  style.textContent = `
    .dni-error-modal{position:fixed;inset:0;z-index:2147483200;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.76);backdrop-filter:blur(3px);font-family:"Courier New",ui-monospace,monospace}
    .dni-error-modal.is-open{display:flex}
    .dni-error-modal-card{width:min(480px,100%);border:1px solid #5a4a2d;background:#080909;box-shadow:0 18px 60px rgba(0,0,0,.65),0 0 0 1px #171717 inset;color:#d9d9d9}
    .dni-error-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border-bottom:1px solid #27231a;background:#0c0d0d}
    .dni-error-modal-kicker{color:#c8a866;font:700 9px/1.2 "Courier New",monospace;letter-spacing:1.25px}
    .dni-error-modal-close{display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid #343434;background:#111;color:#aaa;font:700 18px/1 Arial,sans-serif;cursor:pointer}
    .dni-error-modal-close:hover,.dni-error-modal-close:focus-visible{border-color:#c8a866;color:#fff;background:#18150f;outline:none}
    .dni-error-modal-body{padding:17px 15px 15px}
    .dni-error-modal-code{margin-bottom:9px;color:#d06b5d;font:700 10px/1.35 "Courier New",monospace;letter-spacing:1px}
    .dni-error-modal-title{margin:0 0 9px;color:#f1f1f1;font:800 15px/1.25 "Courier New",monospace;letter-spacing:1.2px}
    .dni-error-modal-message{margin:0;color:#aaa;font:10px/1.65 "Courier New",monospace}
    .dni-error-modal-actions{display:flex;justify-content:flex-end;gap:8px;padding:0 15px 15px}
    .dni-error-modal-action{min-height:34px;padding:8px 12px;border:1px solid #454545;background:#111;color:#d8d8d8;font:700 9px/1.2 "Courier New",monospace;letter-spacing:.8px;cursor:pointer}
    .dni-error-modal-action:hover,.dni-error-modal-action:focus-visible{border-color:#c8a866;color:#fff;outline:none}
    .dni-error-modal-action.is-primary{border-color:#6e5b34;background:#1a160f;color:#e2c98f}
    @media(max-width:620px){.dni-error-modal{padding:12px}.dni-error-modal-card{width:100%}.dni-error-modal-head{padding:10px 11px}.dni-error-modal-body{padding:15px 12px 13px}.dni-error-modal-actions{padding:0 12px 12px}.dni-error-modal-action{min-height:42px;flex:1}}
    @media(prefers-reduced-motion:no-preference){.dni-error-modal.is-open .dni-error-modal-card{animation:dni-error-modal-in .16s ease both}@keyframes dni-error-modal-in{from{opacity:0;transform:translateY(7px) scale(.985)}to{opacity:1;transform:none}}}
  `;
  document.head.append(style);

  const modal = document.createElement('div');
  modal.className = 'dni-error-modal';
  modal.id = 'dni-terminal-error-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'dni-error-modal-title');
  modal.setAttribute('aria-describedby', 'dni-error-modal-message');
  modal.innerHTML = `
    <div class="dni-error-modal-card">
      <div class="dni-error-modal-head">
        <span class="dni-error-modal-kicker">DNI TERMINAL // ERROR</span>
        <button class="dni-error-modal-close" type="button" aria-label="Close error">×</button>
      </div>
      <div class="dni-error-modal-body">
        <div class="dni-error-modal-code">REQUEST BLOCKED</div>
        <h2 class="dni-error-modal-title" id="dni-error-modal-title">TERMINAL ERROR</h2>
        <p class="dni-error-modal-message" id="dni-error-modal-message"></p>
      </div>
      <div class="dni-error-modal-actions">
        <button class="dni-error-modal-action" type="button" data-dni-error-dismiss>OK</button>
        <button class="dni-error-modal-action is-primary" type="button" data-dni-error-login hidden>LOGIN WITH DISCORD</button>
      </div>
    </div>`;
  document.body.append(modal);

  const card = modal.querySelector('.dni-error-modal-card');
  const closeButton = modal.querySelector('.dni-error-modal-close');
  const dismissButton = modal.querySelector('[data-dni-error-dismiss]');
  const loginButton = modal.querySelector('[data-dni-error-login]');
  const titleNode = modal.querySelector('#dni-error-modal-title');
  const messageNode = modal.querySelector('#dni-error-modal-message');
  const codeNode = modal.querySelector('.dni-error-modal-code');
  let restoreFocus = null;

  function closeModal() {
    if (!modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    document.body.style.removeProperty('overflow');
    const target = restoreFocus;
    restoreFocus = null;
    if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
  }

  function showModal({ title = 'REQUEST BLOCKED', message = 'This action is not available right now.', code = 'REQUEST BLOCKED', login = false } = {}) {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleNode.textContent = title;
    messageNode.textContent = message;
    codeNode.textContent = code;
    loginButton.hidden = !login;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => (login ? loginButton : dismissButton).focus({ preventScroll: true }), 0);
  }

  window.DNIErrorModal = Object.freeze({ show: showModal, close: closeModal });

  closeButton.addEventListener('click', closeModal);
  dismissButton.addEventListener('click', closeModal);
  loginButton.addEventListener('click', () => {
    window.location.assign(LOGIN_URL);
  });
  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });
  card.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('keydown', event => {
    if (!modal.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  });

  function terminalReady() {
    return Boolean(prompt?.classList.contains('dni-terminal-ready') && input && !input.disabled);
  }

  function authState() {
    return String(document.documentElement.dataset.dniAuth || 'pending').toLowerCase();
  }

  function mailBlock() {
    if (!terminalReady()) {
      return {
        title: 'DNI MAIL LOCKED',
        code: 'TERMINAL NOT READY',
        message: 'DNI Mail is unavailable until the active terminal finishes initializing and reaches READY.'
      };
    }
    const state = authState();
    if (state === 'authenticated') return null;
    if (state === 'guest') {
      return {
        title: 'DISCORD LOGIN REQUIRED',
        code: 'AUTHENTICATION REQUIRED',
        message: 'Sign in with Discord before opening DNI Mail.',
        login: true
      };
    }
    return {
      title: 'DNI MAIL LOCKED',
      code: 'AUTHORIZATION PENDING',
      message: 'DNI is still checking your session authorization. Try Mail again when the authorization check finishes.'
    };
  }

  // Installed before the main terminal bundle so blocked actions never write
  // error messages into the terminal output in the first place.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#terminal-add, #terminal-inbox') : null;
    if (!target) return;

    if (target.id === 'terminal-add' && !terminalReady()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showModal({
        title: 'TERMINAL NOT READY',
        code: 'NEW TERMINAL LOCKED',
        message: 'The current terminal must finish initializing and reach READY before a new terminal can be opened.'
      });
      return;
    }

    if (target.id === 'terminal-inbox') {
      const block = mailBlock();
      if (!block) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showModal(block);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.target !== input) return;
    const value = String(input?.value || '').trim();
    if (!/^(?:mail|inbox)(?:\s|$)/i.test(value)) return;
    const block = mailBlock();
    if (!block) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (input) input.value = '';
    showModal(block);
  }, true);

  // Fallback cleanup for any legacy guard message emitted by cached or older
  // code paths. Remove it from terminal history and convert it to the modal.
  if (output) {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const key = String(node.textContent || '').trim();
          const config = LEGACY_ERRORS[key];
          if (!config) continue;
          node.remove();
          showModal({ ...config, code: key.split(' // ')[0] });
        }
      }
    });
    observer.observe(output, { childList: true });
  }
}
