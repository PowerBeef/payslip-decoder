import fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { encryptPack } from './tools/pack_crypto.mjs';
process.chdir(path.dirname(fileURLToPath(import.meta.url)));
const r = (p) => fs.readFileSync(p, 'utf8');
const b64file = (p) => fs.readFileSync(p).toString('base64');
const gz64 = (p) =>
  zlib
    .gzipSync(fs.readFileSync(p), { level: 9 })
    .toString('base64')
    .replace(/(.{120})/g, '$1\n');
const PDFJS = '6.5.438';
const APP_URL = process.env.APP_URL || '';
// the published app, shared from the welcome screen and the menu (a QR code a coworker's camera can read)
const SITE_URL = 'https://powerbeef.github.io/payslip-decoder/';
function qrPath(text) {
  const qrcode = createRequire(import.meta.url)('qrcode-generator');
  const q = qrcode(0, 'M'); // medium error correction: reads well from a screen
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!q.isDark(y, x)) continue;
      let w = 1;
      while (x + w < n && q.isDark(y, x + w)) w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w - 1;
    }
  return { n, d };
}
const SHARE = { url: SITE_URL, qr: qrPath(SITE_URL) };
// The date shown in About: set when publishing and committed, so a fresh clone builds the same page.
const DATE_FILE = 'build-date.txt';
if (process.env.PUBLISH === '1')
  fs.writeFileSync(DATE_FILE, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) + '\n');
const BUILT = fs.existsSync(DATE_FILE) ? r(DATE_FILE).trim() : null;

/* ---------- encrypted agreement packs (plaintext stays in private/; tools/pack_crypto.mjs) ---------- */
// With the private pack folder present, packs are re-encrypted from the plaintext source when it changed (a hash of
// the plaintext and settings is kept in private/, never published). Otherwise (always so in the public repo), the
// committed ciphertext is reused as is, so a clean clone builds the same page.
let packs;
const cfgFile = 'private/pack-config.json',
  hashFile = 'private/.pack-hash';
if (fs.existsSync(cfgFile)) {
  const cfg = JSON.parse(r(cfgFile));
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(cfg))
    .update(cfg.packs.map((p) => r(p.src)).join('\n'))
    .digest('hex');
  if (fs.existsSync('packs.enc.json') && fs.existsSync(hashFile) && r(hashFile).trim() === hash) {
    packs = JSON.parse(r('packs.enc.json'));
    console.log('reusing', packs.length, 'encrypted agreement pack(s): the private plaintext has not changed');
  } else {
    packs = [];
    // each pack lists the spellings of "<employer word>|<city>" that open it (p.materials; p.material for one)
    for (const p of cfg.packs) packs.push(await encryptPack(JSON.parse(r(p.src)), p.materials || p.material, cfg.iter));
    fs.writeFileSync('packs.enc.json', JSON.stringify(packs));
    fs.writeFileSync(hashFile, hash + '\n');
    console.log('re-encrypted', packs.length, 'agreement pack(s) from private/');
  }
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
]
  .map(
    ([f, w, p]) =>
      `@font-face{font-family:'${f}';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64file(p)}) format('woff2');}`,
  )
  .join('\n');

const sources = [
  'src/parser.js',
  'src/agreement.js',
  'src/analyze.js',
  'src/i18n.js',
  'src/sample.js',
  'src/assistant-model.js',
  'src/assistant.js',
  'src/install.js',
  'src/ui.js',
]
  .map(r)
  .join('\n');

// The browser enforces this: the page loads only its own files and can send nothing anywhere else,
// so a payslip can't leave the device even through a bug (fonts are embedded, the PDF reader is in ./vendor/).
// Inline scripts are allowed by their exact SHA-256 hashes (filled in once the page is assembled): a script injected
// into the page, by a bug or anything else, doesn't run. Inline styles stay allowed (the views set style attributes).
const CSP = [
  "default-src 'none'",
  "script-src 'self' __SCRIPT_HASHES__",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');
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

/* Browsers before 2023 (Safari 16.2, Chrome 111) drop a declaration that uses color-mix(). Each one gets a plain
   fallback declared just before it, so older browsers keep a sensible colour instead of none:
   mostly A: A; a little of A over B: B; a little of A over transparent: transparent. */
function colorFallbacks(css) {
  const mix = (args) => {
    const parts = [];
    let depth = 0,
      cur = '';
    for (const ch of args) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && !depth) {
        parts.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    parts.push(cur.trim());
    const [, a, b] = parts; // "in srgb", "A p%", "B"
    const m = a.match(/^(.*?)\s+(\d+(?:\.\d+)?)%$/);
    const A = m ? m[1] : a,
      p = m ? +m[2] : 50;
    return p >= 50 ? A : b;
  };
  const plain = (value) => {
    let out = '',
      i = 0;
    while (i < value.length) {
      const k = value.indexOf('color-mix(', i);
      if (k < 0) {
        out += value.slice(i);
        break;
      }
      out += value.slice(i, k);
      let j = k + 10,
        depth = 1;
      while (j < value.length && depth) {
        if (value[j] === '(') depth++;
        else if (value[j] === ')') depth--;
        j++;
      }
      out += mix(value.slice(k + 10, j - 1));
      i = j;
    }
    return out;
  };
  return css.replace(
    /([{;]\s*)([a-z-]+)\s*:\s*([^;{}]*color-mix\([^;{}]*)/g,
    (all, pre, prop, value) => `${pre}${prop}: ${plain(value)}; ${prop}: ${value}`,
  );
}

function html(target) {
  const conf = { target, share: SHARE, built: BUILT };
  if (target === 'pages') conf.pdfjs = `./vendor/pdfjs-${PDFJS}/`;
  if (APP_URL && target !== 'pages') conf.appUrl = APP_URL;
  const app =
    `(globalThis.PD = globalThis.PD || {}).BUILD = ${JSON.stringify(conf)};\nglobalThis.PD.PACKS = ${JSON.stringify(packs)};\n` + sources;
  for (const bad of ['</script', '<!--']) if (app.includes(bad)) throw new Error('unsafe sequence in app: ' + bad);
  let out = r('src/index.html');
  const put = (marker, content) => {
    const i = out.indexOf(marker);
    if (i < 0) throw new Error('marker ' + marker);
    out = out.slice(0, i) + content + out.slice(i + marker.length);
  };
  put('/*HEAD*/', target === 'pages' ? PAGES_HEAD : '');
  put('/*FONTS*/', fonts);
  put('/*CSS*/', colorFallbacks(r('src/style.css')));
  put(
    '/*PDFJS_BLOCKS*/',
    target === 'offline'
      ? `<script type="application/octet-stream" id="pdfjs-lib">${gz64('node_modules/pdfjs-dist/legacy/build/pdf.min.mjs')}</script>\n<script type="application/octet-stream" id="pdfjs-worker">${gz64('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')}</script>`
      : '',
  );
  put('/*APP*/', app);
  return out;
}
fs.mkdirSync('dist', { recursive: true });
{
  const f = 'dist/payslip-decoder.html',
    h = html('offline');
  fs.rmSync('dist/payslip-decoder-hosted.html', { force: true });
  fs.writeFileSync(f, h);
  console.log('wrote', f, (h.length / 1024).toFixed(0) + ' KB');
}

/* ---------- GitHub Pages app ---------- */
const P = 'dist/pages';
fs.rmSync(P, { recursive: true, force: true });
for (const d of ['icons', `vendor/pdfjs-${PDFJS}`, 'screenshots']) fs.mkdirSync(`${P}/${d}`, { recursive: true });
const index = (() => {
  const page = html('pages');
  const hashes = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
  );
  if (!page.includes('__SCRIPT_HASHES__') || !hashes.length) throw new Error('script hashes');
  return page.replace('__SCRIPT_HASHES__', hashes.join(' '));
})();
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
  description:
    lang === 'fr'
      ? 'Lit le PDF de votre talon de paie Workday et explique chaque ligne. Tout reste sur votre appareil.'
      : 'Reads your Workday payslip PDF and explains every line. Everything stays on your device.',
  lang: lang === 'fr' ? 'fr-CA' : 'en-CA',
  dir: 'ltr',
  start_url: './#overview',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#edf2f0',
  theme_color: '#edf2f0',
  categories: ['finance', 'productivity', 'utilities'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  screenshots: shots
    .filter((f) => f.startsWith(lang + '-'))
    .map((f) => ({
      src: `screenshots/${f}`,
      sizes: f.includes('wide') ? '1280x800' : '780x1688',
      type: f.endsWith('.webp') ? 'image/webp' : 'image/png',
      form_factor: f.includes('wide') ? 'wide' : 'narrow',
      label: lang === 'fr' ? 'Aperçu de votre paie' : 'Your pay at a glance',
    })),
});
for (const l of ['en', 'fr']) fs.writeFileSync(`${P}/manifest.${l}.webmanifest`, JSON.stringify(manifest(l), null, 2));
const version = crypto
  .createHash('sha256')
  .update(index)
  .update(JSON.stringify(manifest('en')))
  .digest('hex')
  .slice(0, 12);
const core = [
  './',
  './index.html',
  './manifest.en.webmanifest',
  './manifest.fr.webmanifest',
  ...fs.readdirSync(`${P}/icons`).map((f) => `./icons/${f}`),
  `./vendor/pdfjs-${PDFJS}/pdf.min.mjs`,
  `./vendor/pdfjs-${PDFJS}/pdf.worker.min.mjs`,
];
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
