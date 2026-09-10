const fs = require('fs');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function must(source, marker, label) {
  if (!source.includes(marker)) fail(`${label} missing marker: ${marker}`);
}

const authz = fs.readFileSync('public/src/js/authz.js', 'utf8');
const admin = fs.readFileSync('public/src/js/admin/admin.js', 'utf8');

for (const marker of [
  'installAdminMobileFilterCollapse',
  'dni-admin-mobile-filter-layout-style',
  '@media(max-width:1100px)',
  '.dni-admin-mobile-workspace-selector{display:none!important}',
  '.dni-admin-panel .dni-admin-worktabs{display:flex!important',
  '.dni-admin-filterbar[data-admin-user-filters]{display:none!important}',
  '[data-admin-mobile-filters-open="true"] .dni-admin-filterbar[data-admin-user-filters]{display:grid!important}',
  'data-admin-mobile-filter-toggle',
  'FILTERS ▾',
  'aria-expanded',
  'MutationObserver',
  'installAdminMobileFilterCollapse();'
]) must(authz, marker, 'Admin mobile filter collapse');

must(admin, 'data-admin-user-filters', 'Admin user filter form');

if (authz.includes('.dni-admin-panel .dni-admin-worktabs{display:none!important')) {
  fail('Mobile Admin workspace buttons must remain visible instead of being collapsed into a workspace selector.');
}

console.log('DNI Admin mobile layout contract passed: normal workspace buttons remain visible and the user filter controls collapse on mobile/tablet.');
