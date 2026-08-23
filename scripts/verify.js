const fs = require('fs');
const path = require('path');
const legacy = [new RegExp('s'+'cp','i'), new RegExp('sci'+'pnet','i')];
const ignored = new Set(['.git','node_modules']);
const allowedFile = path.resolve('UPSTREAM_SOURCE.md');
const exts = new Set(['.html','.js','.css','.json','.md','.txt','.yml','.yaml','.svg','.webmanifest']);
const offenders=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(e.name))continue;const full=path.join(dir,e.name);if(e.isDirectory()){walk(full);continue;}if(path.resolve(full)===allowedFile)continue;if(!exts.has(path.extname(e.name).toLowerCase()))continue;const text=fs.readFileSync(full,'utf8');if(legacy.some(r=>r.test(text))||legacy.some(r=>r.test(full)))offenders.push(full);}}
walk('.');
if(offenders.length){console.error('Legacy references remain:\n'+offenders.join('\n'));process.exit(1);}
const pairs=[['public/src/js/script.js','public/dist/app.js'],['public/src/js/access.js','public/dist/access.js'],['public/src/css/style.css','public/dist/style.css'],['public/src/css/dni.css','public/dist/dni.css']];
for(const [s,b] of pairs){if(!fs.existsSync(b)||fs.readFileSync(s,'utf8')!==fs.readFileSync(b,'utf8')){console.error(`${b} does not match ${s}`);process.exit(1);}}
for(const file of ['public/index.html','public/src/html/index.html']){const html=fs.readFileSync(file,'utf8');for(const required of ['DNI Communications','DNI Services','DNI Dashboard','WELCOME','RESEARCHER','DNI TERMINAL','dni-helmet.webp','DNI Terminal | Dreadnought Imperium DNI Sectors']){if(!html.includes(required)){console.error(`${file} missing ${required}`);process.exit(1);}}}
for(const image of ['public/src/images/dni-helmet.webp','public/src/images/dni-helmet-icon.webp']){if(!fs.existsSync(image)||fs.statSync(image).size<1000){console.error(`Missing DNI image: ${image}`);process.exit(1);}}
const css=fs.readFileSync('public/src/css/style.css','utf8');for(const marker of ['.welcome-title','.terminal-frame','.terminal-window','.hero-action.primary','background-size:48px 48px','.brand-logo']){if(!css.includes(marker)){console.error(`UI marker missing: ${marker}`);process.exit(1);}}
console.log('DNI website branding, tabs, images, and build verification passed.');
