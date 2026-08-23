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
const expectedTabs=['DNI Terminal','Dreadnought Imperium','DNI DIRECT ACCESS TERMINAL','DNI Communications','DNI Services','DNI Dashboard'];
const expectedTitle='DNI Terminal | Dreadnought Imperium and DNI Sectors';
for(const file of ['public/index.html','public/src/html/index.html']){const html=fs.readFileSync(file,'utf8');for(const required of [...expectedTabs,'WELCOME','RESEARCHER','DNI TERMINAL','dni-helmet.webp',expectedTitle]){if(!html.includes(required)){console.error(`${file} missing ${required}`);process.exit(1);}}const positions=expectedTabs.map(label=>html.indexOf(`>${label}</button>`));if(positions.some(pos=>pos<0)||positions.some((pos,i)=>i>0&&pos<=positions[i-1])){console.error(`${file} has wrong DNI tab order`);process.exit(1);}if(!html.includes('aria-selected="true" tabindex="0" data-panel="terminal">DNI Terminal</button>')){console.error(`${file} must default to DNI Terminal`);process.exit(1);}}
for(const image of ['public/src/images/dni-helmet.webp','public/src/images/dni-helmet-icon.webp']){if(!fs.existsSync(image)||fs.statSync(image).size<1000){console.error(`Missing DNI image: ${image}`);process.exit(1);}}
const css=fs.readFileSync('public/src/css/style.css','utf8');for(const marker of ['.welcome-title','.terminal-frame','.terminal-window','.hero-action.primary','background-size:48px 48px','.brand-logo','touch-action:pan-x','scroll-snap-type:x proximity']){if(!css.includes(marker)){console.error(`UI marker missing: ${marker}`);process.exit(1);}}
const script=fs.readFileSync('public/src/js/script.js','utf8');for(const marker of ["selectPanel('terminal'","selectPanel('imperium'","selectPanel('direct'","selectPanel('communications'","selectPanel('services'","selectPanel('dashboard'"]){if(!script.includes(marker)){console.error(`Missing functional tab handler: ${marker}`);process.exit(1);}}
console.log('DNI six-tab branding, title, images, navigation, and build verification passed.');
