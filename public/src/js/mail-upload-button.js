function installMailUploadButtonStyles() {
  if (document.querySelector('style[data-dni-mail-upload-button-style]')) return;
  const style = document.createElement('style');
  style.dataset.dniMailUploadButtonStyle = 'true';
  style.textContent = `
    .dni-mail-cdn-field input[type=file][data-mail-cdn-input]{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    .dni-mail-upload-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:8px}
    .dni-mail-upload-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:9px 14px;border:1px solid rgba(200,168,102,.62);background:rgba(200,168,102,.09);color:#f0d79d;font:700 10px/1 "Courier New",monospace;letter-spacing:.65px;cursor:pointer;text-transform:uppercase}
    .dni-mail-upload-button:hover,.dni-mail-upload-button:focus-visible{border-color:#e0c078;background:rgba(200,168,102,.17);color:#fff;outline:none;box-shadow:0 0 0 1px rgba(200,168,102,.22)}
    .dni-mail-upload-button:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
    .dni-mail-upload-button-icon{font-size:15px;line-height:1;transform:translateY(-1px)}
    .dni-mail-upload-limit{color:#747474;font:700 8px/1.35 "Courier New",monospace;letter-spacing:.3px}
    @media(max-width:700px){.dni-mail-upload-actions{align-items:stretch}.dni-mail-upload-button{width:100%}.dni-mail-upload-limit{width:100%}}
  `;
  document.head.append(style);
}

function upgradeMailUploadButton(panel) {
  const input = panel.querySelector('[data-mail-cdn-input]');
  const field = panel.querySelector('[data-mail-cdn-field]');
  if (!(input instanceof HTMLInputElement) || !(field instanceof HTMLElement)) return;
  if (field.dataset.dniUploadButton === 'true') return;
  field.dataset.dniUploadButton = 'true';

  input.setAttribute('aria-label', 'Choose DNI Mail image or file attachments');

  const actions = document.createElement('div');
  actions.className = 'dni-mail-upload-actions';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dni-mail-upload-button';
  button.dataset.mailUploadButton = 'true';
  button.innerHTML = '<span class="dni-mail-upload-button-icon" aria-hidden="true">📎</span><span>Upload Image / File</span>';

  const limit = document.createElement('span');
  limit.className = 'dni-mail-upload-limit';
  limit.textContent = 'UP TO 200 MB PER FILE // MULTIPLE FILES SUPPORTED';

  const syncDisabled = () => {
    button.disabled = input.disabled;
    button.setAttribute('aria-disabled', input.disabled ? 'true' : 'false');
  };

  button.addEventListener('click', () => {
    if (input.disabled) return;
    input.click();
  });

  input.addEventListener('change', () => {
    const count = input.files?.length || 0;
    if (count > 0) {
      button.querySelector('span:last-child').textContent = count === 1 ? 'Uploading 1 File…' : `Uploading ${count} Files…`;
      window.setTimeout(() => {
        const label = button.querySelector('span:last-child');
        if (label) label.textContent = 'Upload Image / File';
      }, 1200);
    }
  });

  const disabledObserver = new MutationObserver(syncDisabled);
  disabledObserver.observe(input, { attributes: true, attributeFilter: ['disabled'] });
  syncDisabled();

  actions.append(button, limit);
  input.insertAdjacentElement('afterend', actions);
}

function scanMailUploadButton() {
  const panel = document.querySelector('#dni-mail-panel');
  if (panel instanceof HTMLElement) upgradeMailUploadButton(panel);
}

installMailUploadButtonStyles();
scanMailUploadButton();
new MutationObserver(scanMailUploadButton).observe(document.documentElement, { childList: true, subtree: true });
