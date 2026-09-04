(() => {
  if (window.__dniUserSettingsCommunicationsLayoutInstalled) return;
  window.__dniUserSettingsCommunicationsLayoutInstalled = true;

  const style = document.createElement('style');
  style.id = 'dni-user-settings-communications-layout-v1';
  style.textContent = `
    #dni-user-settings [data-settings-panel="communications"]>.dni-user-settings-panel-heading{margin-bottom:20px!important}

    #dni-user-settings [data-settings-panel="communications"]>.dni-mail-signature-settings{
      box-sizing:border-box!important;
      width:100%!important;
      margin:0 0 24px!important;
      padding:16px!important;
      border:1px solid #34312b!important;
      border-left:2px solid #c8a866!important;
      background:linear-gradient(90deg,rgba(200,168,102,.07),#0a0a0a 58%)!important;
    }
    #dni-user-settings [data-settings-panel="communications"]>.dni-mail-signature-settings h3{
      margin:0 0 7px!important;
      color:#e9d39d!important;
      font:700 12px/1.25 "Courier New",monospace!important;
      letter-spacing:.8px!important;
    }
    #dni-user-settings [data-settings-panel="communications"]>.dni-mail-signature-settings p{
      max-width:760px!important;
      margin:0 0 12px!important;
      color:#909090!important;
      font:9px/1.55 "Courier New",monospace!important;
    }
    #dni-user-settings [data-settings-panel="communications"]>.dni-mail-signature-settings textarea{
      box-sizing:border-box!important;
      width:100%!important;
      min-height:116px!important;
      margin:0!important;
      padding:11px 12px!important;
      border:1px solid #4a4337!important;
      border-radius:0!important;
      background:#050505!important;
      color:#ece7dd!important;
      font:400 11px/1.5 "Courier New",monospace!important;
    }
    #dni-user-settings [data-settings-panel="communications"] .dni-mail-signature-actions{
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:8px!important;
      margin-top:10px!important;
    }
    #dni-user-settings [data-settings-panel="communications"] .dni-mail-signature-actions button{
      width:100%!important;
      min-height:42px!important;
      margin:0!important;
      padding:9px 10px!important;
      white-space:normal!important;
    }
    #dni-user-settings [data-settings-panel="communications"] .dni-mail-signature-status{
      min-height:18px!important;
      margin-top:9px!important;
      padding-top:8px!important;
      border-top:1px solid #29261f!important;
      line-height:1.45!important;
    }

    #dni-user-settings [data-mail-settings-notify-title]{
      margin:0 0 9px!important;
      padding-top:2px!important;
    }
    #dni-user-settings [data-mail-settings-notify]{
      min-height:72px!important;
      margin:0!important;
      border-left:2px solid #5f94aa!important;
      background:linear-gradient(90deg,rgba(116,200,244,.07),#0b0b0b 58%)!important;
    }
    #dni-user-settings [data-mail-settings-notify] strong{
      display:block!important;
      margin-bottom:5px!important;
    }
    #dni-user-settings [data-mail-settings-notify-status]{
      display:block!important;
      max-width:720px!important;
      margin:0!important;
      line-height:1.45!important;
      overflow-wrap:anywhere!important;
    }
    #dni-user-settings [data-mail-settings-notify-test]{
      box-sizing:border-box!important;
      display:block!important;
      width:100%!important;
      min-height:44px!important;
      margin:9px 0 0!important;
      padding:11px 12px!important;
      text-align:center!important;
      line-height:1.3!important;
      white-space:normal!important;
    }
    #dni-user-settings [data-mail-settings-notify-help]{
      box-sizing:border-box!important;
      width:100%!important;
      margin:9px 0 0!important;
      padding:10px 11px!important;
      line-height:1.5!important;
      overflow-wrap:anywhere!important;
    }

    .dni-user-settings-main:has([data-settings-panel="communications"]:not([hidden]))>.dni-user-settings-note{
      display:none!important;
    }

    @media(max-width:720px){
      #dni-user-settings .dni-user-settings-sidebar{padding:8px 10px 10px!important}
      #dni-user-settings .dni-user-settings-nav{
        display:grid!important;
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        gap:6px!important;
        overflow:visible!important;
      }
      #dni-user-settings .dni-user-settings-nav button{
        box-sizing:border-box!important;
        min-width:0!important;
        min-height:42px!important;
        padding:9px 7px!important;
        font-size:8px!important;
        line-height:1.15!important;
        letter-spacing:.65px!important;
        text-align:center!important;
        white-space:normal!important;
        overflow-wrap:anywhere!important;
      }
      #dni-user-settings .dni-user-settings-main{
        padding:18px 12px calc(30px + env(safe-area-inset-bottom))!important;
      }
      #dni-user-settings [data-settings-panel="communications"]>.dni-user-settings-panel-heading{
        margin-bottom:14px!important;
      }
      #dni-user-settings [data-settings-panel="communications"]>.dni-mail-signature-settings{
        margin-bottom:20px!important;
        padding:13px 12px!important;
      }
      #dni-user-settings [data-settings-panel="communications"]>.dni-mail-signature-settings textarea{
        min-height:128px!important;
        font-size:12px!important;
      }
      #dni-user-settings [data-settings-panel="communications"] .dni-mail-signature-actions{
        grid-template-columns:1fr 1fr!important;
      }
      #dni-user-settings [data-settings-panel="communications"] .dni-mail-signature-actions button{
        min-height:44px!important;
        font-size:9px!important;
      }
      #dni-user-settings [data-mail-settings-notify]{
        grid-template-columns:minmax(0,1fr) auto!important;
        gap:12px!important;
        min-height:76px!important;
        padding:12px!important;
      }
      #dni-user-settings [data-mail-settings-notify] strong{font-size:11px!important}
      #dni-user-settings [data-mail-settings-notify-status]{font-size:9px!important}
      #dni-user-settings [data-mail-settings-notify-test]{
        min-height:46px!important;
        padding:11px 10px!important;
        font-size:9px!important;
        letter-spacing:.55px!important;
      }
      #dni-user-settings [data-mail-settings-notify-help]{
        font-size:9px!important;
      }
    }

    @media(max-width:390px){
      #dni-user-settings .dni-user-settings-nav{grid-template-columns:1fr 1fr!important}
      #dni-user-settings [data-settings-panel="communications"] .dni-mail-signature-actions{grid-template-columns:1fr!important}
      #dni-user-settings [data-mail-settings-notify]{grid-template-columns:minmax(0,1fr) auto!important}
    }
  `;
  document.head.append(style);
})();
