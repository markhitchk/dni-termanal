import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const expect = (value, pattern, message) => {
  if (!pattern.test(value)) throw new Error(message);
};

const layout = read('public/src/js/terminal/user-settings-communications-layout.js');
const loader = read('public/src/js/terminal/user-settings-header-animation.js');

expect(loader, /user-settings-communications-layout\.js/, 'Settings loader must load the communications layout patch.');
expect(layout, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'Mobile Settings navigation must use a readable 2-column grid.');
expect(layout, /dni-mail-signature-settings/, 'Communications layout must style the Mail Signature section.');
expect(layout, /data-mail-settings-notify/, 'Communications layout must style the Web Push notification row.');
expect(layout, /data-mail-settings-notify-test/, 'Communications layout must style the Web Push test control.');
expect(layout, /data-mail-settings-notify-help/, 'Communications layout must style the mobile Web Push help text.');
expect(layout, /:has\(\[data-settings-panel="communications"\]:not\(\[hidden\]\)\)/, 'Communications view must suppress the redundant global Settings status note.');
expect(layout, /overflow-wrap:anywhere/, 'Mobile Communications text must be protected from overflow.');

console.log('DNI Settings communications mobile layout verification passed.');
