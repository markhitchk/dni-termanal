const fs = require('fs');
const path = require('path');

const BUILD_FILE = 'scripts/build/build.js';
const ALLOWED_WHOLE_DOCUMENT_OBSERVER = 'public/src/js/sectors/sectors-strategic-layout.js';
const WHOLE_DOCUMENT_OBSERVER = /\.observe\(document\.(?:body|documentElement)\s*,/g;

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing DNI production source: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

const buildSource = read(BUILD_FILE);
const sourceFiles = [...buildSource.matchAll(/\['(public\/src\/js\/[^']+\.js)'\s*,\s*'public\/dist\/[^']+'\]/g)]
  .map(match => match[1]);

if (!sourceFiles.length) {
  throw new Error('MutationObserver regression guard could not discover production JavaScript sources from scripts/build/build.js.');
}

const violations = [];
for (const file of new Set(sourceFiles)) {
  const source = read(file);
  const matches = [...source.matchAll(WHOLE_DOCUMENT_OBSERVER)];
  if (!matches.length) continue;

  if (file === ALLOWED_WHOLE_DOCUMENT_OBSERVER) {
    const oneShotBootObserver = /if \(!start\(\)\) \{[\s\S]*?const bootObserver = new MutationObserver\([\s\S]*?if \(start\(\)\) bootObserver\.disconnect\(\);[\s\S]*?bootObserver\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\);[\s\S]*?\}/;
    if (matches.length === 1 && oneShotBootObserver.test(source)) continue;
  }

  for (const match of matches) {
    const before = source.slice(0, match.index);
    const line = before.split('\n').length;
    violations.push(`${file}:${line}`);
  }
}

if (violations.length) {
  throw new Error(
    `Persistent whole-document MutationObserver target found in production JavaScript:\n${violations.join('\n')}\n` +
    'Scope observers to the smallest stable feature root and debounce expensive scans.'
  );
}

for (const file of sourceFiles.filter(file => /(?:\/mail(?:\/|[-.]|\.js$)|\/admin[^/]*\.js$)/.test(file))) {
  const source = read(file);
  if (WHOLE_DOCUMENT_OBSERVER.test(source)) {
    throw new Error(`${file} must never observe document.body or document.documentElement.`);
  }
  WHOLE_DOCUMENT_OBSERVER.lastIndex = 0;
}

const mailControls = read('public/src/js/mail-controls.js');
const mergeRecipientOptions = mailControls.match(/function mergeRecipientOptions\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
if (!mergeRecipientOptions.includes('if (directoryIsCurrent) return;')) {
  throw new Error('DNI Mail recipient merging must be idempotent before replacing observed select options.');
}
if (!mergeRecipientOptions.includes("option.dataset.dniDirectorySource = 'server';")) {
  throw new Error('DNI Mail controls must mark authoritative directory options for realtime reconciliation.');
}
if (mergeRecipientOptions.indexOf('if (directoryIsCurrent) return;') > mergeRecipientOptions.indexOf('select.replaceChildren(fragment);')) {
  throw new Error('DNI Mail recipient idempotency guard must run before the observed select is mutated.');
}

console.log(`MutationObserver regression guard passed for ${new Set(sourceFiles).size} production JavaScript sources; only the self-disconnecting Sectors boot observer is permitted to watch the document root.`);
