const fs = require('fs');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function must(source, marker, label) {
  if (!source.includes(marker)) fail(`${label} missing marker: ${marker}`);
}

const mobileNavigation = fs.readFileSync('public/src/js/core/mobile-navigation.js', 'utf8');
const admin = fs.readFileSync('public/src/js/admin/admin.js', 'utf8');

for (const marker of [
  'installAdminMobileWorkspaceCollapse',
  'dni-admin-mobile-workspace-layout-style',
  '@media(max-width:1100px)',
  '.dni-admin-mobile-workspace-selector{display:none!important}',
  '.dni-admin-panel[data-module="admin"] .dni-admin-worktabs{display:flex!important',
  '.dni-admin-panel[data-module="admin"]:not([data-admin-mobile-workspace-open="true"]) .dni-admin-worktabs ~ *{display:none!important}',
  'adminMobileWorkspaceOpen',
  "closest('.dni-admin-worktab')",
  "classList.contains('is-active')",
  "panel.dataset.adminMobileWorkspaceOpen = sameActive && open ? 'false' : 'true'",
  'ADMIN_COMPACT_QUERY.matches',
  'installAdminMobileWorkspaceCollapse();'
]) must(mobileNavigation, marker, 'Admin mobile whole-workspace collapse');

must(admin, 'data-admin-user-filters', 'Admin user filter form');
must(admin, 'dni-admin-workspace', 'Admin workspace host');

for (const forbidden of [
  'dni-admin-mobile-filter-toggle',
  'adminMobileFilterToggle',
  'FILTERS ▾',
  '.dni-admin-filterbar[data-admin-user-filters]{display:none!important}'
]) {
  if (mobileNavigation.includes(forbidden)) {
    fail(`Mobile Admin must collapse the entire workspace, not only filters: ${forbidden}`);
  }
}

if (mobileNavigation.includes('.dni-admin-panel[data-module="admin"] .dni-admin-worktabs{display:none!important')) {
  fail('Mobile Admin workspace buttons must remain visible instead of being collapsed into a workspace selector.');
}

console.log('DNI Admin mobile layout contract passed: normal workspace buttons remain visible while everything below them is collapsed until a workspace button is tapped.');
