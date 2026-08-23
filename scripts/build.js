const fs = require('fs');
const path = require('path');

const pairs = [
  ['public/src/js/script.js', 'public/dist/app.js'],
  ['public/src/js/access.js', 'public/dist/access.js'],
  ['public/src/css/style.css', 'public/dist/style.css'],
  ['public/src/css/dni.css', 'public/dist/dni.css']
];

fs.mkdirSync('public/dist', { recursive: true });
for (const [from, to] of pairs) {
  fs.copyFileSync(path.resolve(from), path.resolve(to));
}
console.log('DNI production bundle rebuilt from committed source.');
