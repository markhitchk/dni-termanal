(() => {
  if (window.__dniUserSettingsThemeInstalled) return;
  window.__dniUserSettingsThemeInstalled = true;

  const style = document.createElement('style');
  style.id = 'dni-user-settings-theme-v2';
  style.textContent = `
    body.dni-user-settings-open{overflow:hidden}

    .dni-user-settings{
      font-family:"Courier New",Courier,monospace!important;
      padding:18px!important;
    }

    .dni-user-settings-backdrop{
      background:rgba(0,0,0,.78)!important;
      backdrop-filter:blur(2px)!important;
    }

    .dni-user-settings-dialog{
      --settings-accent:#74c8f4!important;
      position:relative!important;
      z-index:1!important;
      width:min(720px,calc(100vw - 36px))!important;
      max-height:calc(100dvh - 36px)!important;
      overflow:auto!important;
      color:#efefef!important;
      background:#111!important;
      border:1px solid #4b4b4b!important;
      box-shadow:0 24px 80px rgba(0,0,0,.78),0 0 0 1px rgba(255,255,255,.025),0 0 24px rgba(116,200,244,.08)!important;
      clip-path:none!important;
      scrollbar-color:#555 #080808;
      scrollbar-width:thin;
    }

    .dni-user-settings-hazard{
      height:8px!important;
      border-bottom:1px solid #262626!important;
      background:repeating-linear-gradient(135deg,#74c8f4 0 10px,#0b0b0b 10px 20px)!important;
      opacity:.82;
    }

    .dni-user-settings-titleband{
      position:sticky!important;
      top:0!important;
      z-index:5!important;
      gap:12px!important;
      padding:14px 16px!important;
      border-bottom:1px solid #383838!important;
      background:linear-gradient(90deg,#181818,#101010 72%,#0c0c0c)!important;
      box-shadow:0 8px 18px rgba(0,0,0,.35)!important;
    }

    .dni-user-settings-titleband::after{
      content:"SECURE LOCAL TERMINAL CONTROL";
      position:absolute;
      right:58px;
      bottom:5px;
      color:#656565;
      font:700 8px/1 "Courier New",monospace;
      letter-spacing:1.2px;
      pointer-events:none;
    }

    .dni-user-settings-icon{
      width:36px!important;
      height:36px!important;
      flex:0 0 36px!important;
      border:1px solid #555!important;
      color:#74c8f4!important;
      background:#080808!important;
      font-size:18px!important;
      box-shadow:inset 0 0 0 1px rgba(116,200,244,.05)!important;
    }

    .dni-user-settings-kicker{
      margin-bottom:4px!important;
      color:#c8a866!important;
      font:700 9px/1.1 "Courier New",monospace!important;
      letter-spacing:1.8px!important;
    }

    .dni-user-settings-title{
      color:#f3f3f3!important;
      font:700 clamp(20px,4vw,27px)/1 "Courier New",monospace!important;
      letter-spacing:.8px!important;
    }

    .dni-user-settings-close-x{
      width:40px!important;
      height:40px!important;
      flex:0 0 40px!important;
      border:1px solid #565656!important;
      color:#e7e7e7!important;
      background:#0a0a0a!important;
      font:700 19px/1 "Courier New",monospace!important;
    }

    .dni-user-settings-close-x:hover,
    .dni-user-settings-close-x:focus-visible{
      outline:1px solid #9a9a9a!important;
      outline-offset:2px!important;
      border-color:#8c8c8c!important;
      background:#181818!important;
    }

    .dni-user-settings-body{padding:16px!important;background:#0c0c0c!important}

    .dni-user-settings-status{
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:8px!important;
      margin-bottom:18px!important;
    }

    .dni-user-settings-field{
      position:relative!important;
      min-width:0!important;
      padding:10px 11px 9px!important;
      border:1px solid #303030!important;
      border-left:2px solid #5f94aa!important;
      background:#090909!important;
    }

    .dni-user-settings-field span{
      margin-bottom:5px!important;
      color:#777!important;
      font:700 8px/1 "Courier New",monospace!important;
      letter-spacing:1.4px!important;
    }

    .dni-user-settings-field strong{
      color:#e7e7e7!important;
      font:700 12px/1.25 "Courier New",monospace!important;
    }

    .dni-user-settings-section-title{
      display:flex!important;
      align-items:center!important;
      gap:8px!important;
      margin:18px 0 8px!important;
      color:#c8a866!important;
      font:700 9px/1 "Courier New",monospace!important;
      letter-spacing:1.6px!important;
    }

    .dni-user-settings-section-title::before{content:"//";color:#74c8f4}
    .dni-user-settings-section-title::after{content:"";height:1px;flex:1;background:#282828}

    .dni-user-settings-option{
      grid-template-columns:minmax(0,1fr) auto!important;
      gap:12px!important;
      margin:0 0 7px!important;
      padding:11px 12px!important;
      border:1px solid #292929!important;
      background:linear-gradient(90deg,#111,#0b0b0b)!important;
    }

    .dni-user-settings-option:last-of-type{border-bottom:1px solid #292929!important}
    .dni-user-settings-option strong{margin-bottom:3px!important;color:#e8e8e8!important;font:700 11px/1.25 "Courier New",monospace!important}
    .dni-user-settings-option small{color:#858585!important;font:10px/1.4 "Courier New",monospace!important}

    .dni-user-settings-switch{width:44px!important;height:24px!important;flex:0 0 44px!important}
    .dni-user-settings-switch span{border:1px solid #555!important;background:#070707!important}
    .dni-user-settings-switch span:after{top:3px!important;left:3px!important;width:16px!important;height:16px!important;background:#666!important}
    .dni-user-settings-switch input:checked+span{border-color:#74c8f4!important;background:#101a1f!important}
    .dni-user-settings-switch input:checked+span:after{transform:translateX(20px)!important;background:#74c8f4!important;box-shadow:0 0 10px rgba(116,200,244,.35)!important}
    .dni-user-settings-switch input:focus-visible+span{outline:1px solid #b8b8b8;outline-offset:2px}

    .dni-user-settings-actions{
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:8px!important;
      margin-top:16px!important;
      padding-top:12px!important;
      border-top:1px solid #282828!important;
    }

    .dni-user-settings-btn{
      width:100%!important;
      min-height:42px!important;
      padding:9px 10px!important;
      border:1px solid #4d4d4d!important;
      color:#dedede!important;
      background:#111!important;
      font:700 9px/1.2 "Courier New",monospace!important;
      letter-spacing:.9px!important;
      text-transform:uppercase!important;
    }

    .dni-user-settings-btn:hover,
    .dni-user-settings-btn:focus-visible{
      outline:1px solid #a0a0a0!important;
      outline-offset:2px!important;
      border-color:#858585!important;
      background:#181818!important;
    }

    .dni-user-settings-btn.is-danger{
      grid-column:1/-1!important;
      margin-left:0!important;
      border-color:#6f2629!important;
      color:#f0b9bb!important;
      background:#16090a!important;
    }

    .dni-user-settings-btn.is-danger:hover,
    .dni-user-settings-btn.is-danger:focus-visible{
      border-color:#b3484d!important;
      background:#241011!important;
    }

    .dni-user-settings-note{
      min-height:18px!important;
      margin:10px 0 0!important;
      padding:8px 9px!important;
      border-left:2px solid #3e6272!important;
      color:#858585!important;
      background:#080808!important;
      font:9px/1.4 "Courier New",monospace!important;
    }

    @media(max-width:620px){
      .dni-user-settings{
        place-items:stretch!important;
        align-items:stretch!important;
        padding:max(6px,env(safe-area-inset-top)) 6px max(6px,env(safe-area-inset-bottom))!important;
      }

      .dni-user-settings-dialog{
        width:100%!important;
        height:100%!important;
        max-height:none!important;
        border-color:#3d3d3d!important;
        box-shadow:0 0 0 1px rgba(255,255,255,.02),0 0 36px rgba(0,0,0,.8)!important;
      }

      .dni-user-settings-hazard{height:6px!important}
      .dni-user-settings-titleband{padding:11px 10px!important;gap:9px!important}
      .dni-user-settings-titleband::after{display:none!important}
      .dni-user-settings-icon{width:32px!important;height:32px!important;flex-basis:32px!important;font-size:16px!important}
      .dni-user-settings-kicker{font-size:7px!important;letter-spacing:1.2px!important}
      .dni-user-settings-title{font-size:19px!important;letter-spacing:.5px!important}
      .dni-user-settings-close-x{width:38px!important;height:38px!important;flex-basis:38px!important}
      .dni-user-settings-body{padding:10px!important}
      .dni-user-settings-status{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important;margin-bottom:12px!important}
      .dni-user-settings-field{padding:8px 8px 7px!important}
      .dni-user-settings-field span{font-size:7px!important;letter-spacing:.9px!important}
      .dni-user-settings-field strong{font-size:10px!important}
      .dni-user-settings-section-title{margin:13px 0 7px!important;font-size:8px!important}
      .dni-user-settings-option{gap:9px!important;margin-bottom:6px!important;padding:9px!important}
      .dni-user-settings-option strong{font-size:10px!important}
      .dni-user-settings-option small{font-size:9px!important;line-height:1.32!important}
      .dni-user-settings-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important;margin-top:12px!important;padding-top:10px!important}
      .dni-user-settings-btn{min-height:44px!important;padding:8px 6px!important;font-size:8px!important;letter-spacing:.55px!important}
      .dni-user-settings-note{font-size:8px!important;margin-top:8px!important;padding:7px 8px!important}
    }

    @media(max-width:380px){
      .dni-user-settings-title{font-size:17px!important}
      .dni-user-settings-option small{font-size:8px!important}
      .dni-user-settings-actions{grid-template-columns:1fr!important}
      .dni-user-settings-btn.is-danger{grid-column:auto!important}
    }

    @media(max-height:620px) and (max-width:920px){
      .dni-user-settings-titleband{position:sticky!important}
      .dni-user-settings-body{padding-top:8px!important}
      .dni-user-settings-status{margin-bottom:8px!important}
      .dni-user-settings-section-title{margin-top:9px!important}
      .dni-user-settings-option{padding-top:7px!important;padding-bottom:7px!important}
    }

    @media(prefers-reduced-motion:reduce){
      .dni-user-settings-hazard{animation:none!important}
    }
  `;
  document.head.append(style);
})();
