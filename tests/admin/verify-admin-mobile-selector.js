const fs = require('fs');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function must(source, marker, label) {
  if (!source.includes(marker)) fail(`${label} missing marker: ${marker}`);
}

const adminControls = fs.readFileSync('public/src/js/admin-controls.js', 'utf8');

for (const marker of [
  'ensureMobileWorkspaceSelector',
  'syncMobileWorkspaceSelector',
  'data-admin-mobile-workspace-toggle',
  'data-admin-mobile-menu-open',
  "aria-expanded",
  "@media(max-width:1100px)",
  '.dni-admin-mobile-workspace-selector',
  '.dni-admin-worktabs{display:none!important}',
  '[data-admin-mobile-menu-open="true"] .dni-admin-worktabs{display:grid!important}',
  "tabs.querySelector('.dni-admin-worktab.is-active')",
  "target.closest('.dni-admin-worktab')",
  "event.key === 'Escape'",
  "observer.observe(tabs, { childList: true })"
]) must(adminControls, marker, 'Admin mobile workspace selector');

if (adminControls.includes('select[data-admin-workspace]')) {
  fail('Mobile Admin selector must preserve the existing workspace buttons instead of replacing routing with a select element.');
}

console.log('DNI Admin mobile workspace selector contract passed: compact selector, dynamic tabs, auto-close, and keyboard collapse are present.');
