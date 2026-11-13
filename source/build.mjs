import fs from 'fs';
import zlib from 'zlib';
import crypto, { webcrypto as wc } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
process.chdir(path.dirname(fileURLToPath(import.meta.url)));
const r = (p) => fs.readFileSync(p, 'utf8');
const b64file = (p) => fs.readFileSync(p).toString('base64');
const gz64 = (p) => zlib.gzipSync(fs.readFileSync(p), { level: 9 }).toString('base64').replace(/(.{120})/g, '$1\n');
const PDFJS = '6.5.438';
const APP_URL = process.env.APP_URL || '';
// the published app, shared from the welcome screen and the menu (a QR code a coworker's camera can read)
const SITE_URL = 'https://powerbeef.github.io/payslip-decoder/';
function qrPath(text) {
  const qrcode = createRequire(import.meta.url)('qrcode-generator');
  const q = qrcode(0, 'M'); // medium error correction: reads well from a screen
  q.addData(text, 'Byte'); q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!q.isDark(y, x)) continue;
    let w = 1; while (x + w < n && q.isDark(y, x + w)) w++;
    d += `M${x} ${y}h${w}v1h-${w}z`; x += w - 1;
  }
  return { n, d };
}
const SHARE = { url: SITE_URL, qr: qrPath(SITE_URL) };

/* ---------- encrypted agreement packs (plaintext stays in private/) ---------- */
async function encryptPack(obj, material, iter) {
  const salt = wc.getRandomValues(new Uint8Array(16)), iv = wc.getRandomValues(new Uint8Array(12));
  const base = await wc.subtle.importKey('raw', new TextEncoder().encode(material), 'PBKDF2', false, ['deriveKey']);
  const key = await wc.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const b = (u) => Buffer.from(u).toString('base64');
  return { v: 1, iter, salt: b(salt), iv: b(iv), ct: b(ct) };
}
// With the private pack folder present, packs are re-encrypted from the plaintext source.
// Without it (the normal case in the public repo), the committed ciphertext is reused as is.
let packs;
if (fs.existsSync('private/pack-config.json')) {
  const cfg = JSON.parse(r('private/pack-config.json'));
  packs = [];
  for (const p of cfg.packs) packs.push(await encryptPack(JSON.parse(r(p.src)), p.material, cfg.iter));
  fs.writeFileSync('packs.enc.json', JSON.stringify(packs));
  console.log('re-encrypted', packs.length, 'agreement pack(s) from private/');
} else {
  packs = JSON.parse(r('packs.enc.json'));
  console.log('reusing', packs.length, 'encrypted agreement pack(s) from packs.enc.json');
}

const fonts = [
  ['Barlow', 400, 'node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2'],
  ['Barlow', 500, 'node_modules/@fontsource/barlow/files/barlow-latin-500-normal.woff2'],
  ['Barlow', 600, 'node_modules/@fontsource/barlow/files/barlow-latin-600-normal.woff2'],
  ['Barlow', 700, 'node_modules/@fontsource/barlow/files/barlow-latin-700-normal.woff2'],
  ['Barlow Condensed', 600, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2'],
  ['Barlow Condensed', 700, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2'],
].map(([f, w, p]) => `@font-face{font-family:'${f}';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64file(p)}) format('woff2');}`).join('\n');

const sources = ['src/parser.js', 'src/agreement.js', 'src/analyze.js', 'src/i18n.js', 'src/sample.js', 'src/assistant-model.js', 'src/assistant.js', 'src/install.js', 'src/ui.js'].map(r).join('\n');

// The browser enforces this: the page loads only its own files and can send nothing anywhere else,
// so a payslip can't leave the device even through a bug (fonts are embedded, the PDF reader is in ./vendor/).
const CSP = ["default-src 'none'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'"].join('; ');
const PAGES_HEAD = `<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<link rel="manifest" id="pd-manifest" href="manifest.fr.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" id="pd-apptitle" content="Ma paie">
<meta name="description" content="Lit le PDF de votre talon de paie Workday et explique chaque ligne, sur votre appareil.">
<script>(function(){var l=null;try{l=localStorage.getItem('pd-lang')}catch(e){}if(l==='en'){document.getElementById('pd-manifest').setAttribute('href','manifest.en.webmanifest');document.getElementById('pd-apptitle').setAttribute('content','Payslip');document.documentElement.lang='en';}})();</script>`;

function html(target) {
  const conf = { target, share: SHARE };
  if (target === 'pages') conf.pdfjs = `./vendor/pdfjs-${PDFJS}/`;
  if (APP_URL && target !== 'pages') conf.appUrl = APP_URL;
  const app = `(globalThis.PD = globalThis.PD || {}).BUILD = ${JSON.stringify(conf)};\nglobalThis.PD.PACKS = ${JSON.stringify(packs)};\n` + sources;
  for (const bad of ['</script', '<!--']) if (app.includes(bad)) throw new Error('unsafe sequence in app: ' + bad);
  let out = r('src/index.html');
  const put = (marker, content) => { const i = out.indexOf(marker); if (i < 0) throw new Error('marker ' + marker); out = out.slice(0, i) + content + out.slice(i + marker.length); };
  put('/*HEAD*/', target === 'pages' ? PAGES_HEAD : '');
  put('/*FONTS*/', fonts);
  put('/*CSS*/', r('src/style.css'));
  put('/*PDFJS_BLOCKS*/', target === 'offline'
    ? `<script type="application/octet-stream" id="pdfjs-lib">${gz64('node_modules/pdfjs-dist/legacy/build/pdf.min.mjs')}</script>\n<script type="application/octet-stream" id="pdfjs-worker">${gz64('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')}</script>` : '');
  put('/*APP*/', app);
  return out;
}
fs.mkdirSync('dist', { recursive: true });
{
  const f = 'dist/payslip-decoder.html', h = html('offline');
  fs.rmSync('dist/payslip-decoder-hosted.html', { force: true });
  fs.writeFileSync(f, h); console.log('wrote', f, (h.length / 1024).toFixed(0) + ' KB');
}

/* ---------- GitHub Pages app ---------- */
const P = 'dist/pages';
fs.rmSync(P, { recursive: true, force: true });
for (const d of ['icons', `vendor/pdfjs-${PDFJS}`, 'screenshots']) fs.mkdirSync(`${P}/${d}`, { recursive: true });
const index = html('pages');
fs.writeFileSync(`${P}/index.html`, index);
for (const f of fs.readdirSync('assets/icons')) fs.copyFileSync(`assets/icons/${f}`, `${P}/icons/${f}`);
fs.copyFileSync('node_modules/pdfjs-dist/legacy/build/pdf.min.mjs', `${P}/vendor/pdfjs-${PDFJS}/pdf.min.mjs`);
fs.copyFileSync('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', `${P}/vendor/pdfjs-${PDFJS}/pdf.worker.min.mjs`);
fs.copyFileSync('node_modules/pdfjs-dist/LICENSE', `${P}/vendor/pdfjs-${PDFJS}/LICENSE`);
const shots = fs.existsSync('assets/screenshots') ? fs.readdirSync('assets/screenshots').filter((f) => /\.(png|webp)$/.test(f)) : [];
shots.forEach((f) => fs.copyFileSync(`assets/screenshots/${f}`, `${P}/screenshots/${f}`));
if (!shots.length) fs.rmdirSync(`${P}/screenshots`);
const manifest = (lang) => ({
  id: './',
  name: lang === 'fr' ? 'Décodeur de paie' : 'Payslip Decoder',
  short_name: lang === 'fr' ? 'Ma paie' : 'Payslip',
  description: lang === 'fr' ? 'Lit le PDF de votre talon de paie Workday et explique chaque ligne. Tout reste sur votre appareil.' : 'Reads your Workday payslip PDF and explains every line. Everything stays on your device.',
  lang: lang === 'fr' ? 'fr-CA' : 'en-CA', dir: 'ltr',
  start_url: './#overview', scope: './', display: 'standalone', orientation: 'any',
  background_color: '#edf2f0', theme_color: '#edf2f0', categories: ['finance', 'productivity', 'utilities'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  screenshots: shots.filter((f) => f.startsWith(lang + '-')).map((f) => ({ src: `screenshots/${f}`, sizes: f.includes('wide') ? '1280x800' : '780x1688', type: f.endsWith('.webp') ? 'image/webp' : 'image/png', form_factor: f.includes('wide') ? 'wide' : 'narrow', label: lang === 'fr' ? 'Aperçu de votre paie' : 'Your pay at a glance' })),
});
for (const l of ['en', 'fr']) fs.writeFileSync(`${P}/manifest.${l}.webmanifest`, JSON.stringify(manifest(l), null, 2));
const version = crypto.createHash('sha256').update(index).update(JSON.stringify(manifest('en'))).digest('hex').slice(0, 12);
const core = ['./', './index.html', './manifest.en.webmanifest', './manifest.fr.webmanifest', ...fs.readdirSync(`${P}/icons`).map((f) => `./icons/${f}`), `./vendor/pdfjs-${PDFJS}/pdf.min.mjs`, `./vendor/pdfjs-${PDFJS}/pdf.worker.min.mjs`];
fs.writeFileSync(`${P}/sw.js`, r('src/sw.js').replace('__VERSION__', version).replace('__CORE__', JSON.stringify(core)));
fs.writeFileSync(`${P}/.nojekyll`, '');
fs.copyFileSync('src/README.md', `${P}/README.md`);
fs.mkdirSync(`${P}/licenses`, { recursive: true });
fs.copyFileSync('node_modules/@fontsource/barlow/LICENSE', `${P}/licenses/Barlow-OFL.txt`);
console.log('wrote', P, 'version', version, (index.length / 1024).toFixed(0) + ' KB index');
if (process.env.PUBLISH === '1') {
  // GitHub Pages serves the repo root: copy the site there (CLAUDE.md and source/ are left alone).
  fs.cpSync(P, '..', { recursive: true });
  console.log('published site files to the repo root');
}
