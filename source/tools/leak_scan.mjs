// Checks everything public for details that must never appear in readable form
// (employer, union, workplace, contract figures and references, the owner's personal details).
// usage (from source/):
//   node tools/leak_scan.mjs              the files as they are now (run before every commit; exits 1 on any hit)
//   node tools/leak_scan.mjs --history    also every file in every commit, commit messages and authors
//   node tools/leak_scan.mjs --images     also the text in images (needs tesseract)
//   add --show to list what was found (on your own screen only)
//
// What it looks for:
//  - the words in source/private/forbidden.txt (never committed), ignoring case and accents, as whole words;
//  - every figure of the private agreement pack (wage-scale rates, premiums) and every contract reference it cites;
//  - any contract-style reference (the abbreviation for article or annex followed by a number): public text never cites the agreement.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const PRIV = path.resolve(HERE, '../private');
const args = new Set(process.argv.slice(2));
const problems = [];

// one spelling for comparing: no accents, straight apostrophes, plain spaces, lower case
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’‘]/g, "'").replace(/[  ]/g, ' ').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const terms = new Set();
const listFile = path.join(PRIV, 'forbidden.txt');
const havePrivate = fs.existsSync(listFile);
if (havePrivate) fs.readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')).forEach((t) => terms.add(fold(t)));
// the pack's own figures and references
for (const f of havePrivate ? fs.readdirSync(PRIV).filter((n) => /^pack-.*\.json$/.test(n)) : []) {
  const raw = JSON.parse(fs.readFileSync(path.join(PRIV, f), 'utf8'));
  for (const ag of Array.isArray(raw) ? raw : [raw.agreement || raw]) {
    const money = (v) => [v.toFixed(2), v.toFixed(2).replace('.', ',')];
    for (const s of ag.scales || []) for (const lv of Object.values(s.rates || {})) for (const v of Object.values(lv)) money(v).forEach((x) => terms.add(x));
    const prem = [ag.shiftPremium && ag.shiftPremium.evening, ag.shiftPremium && ag.shiftPremium.night].filter((v) => v > 0);
    prem.forEach((v) => { terms.add('$' + v.toFixed(2)); terms.add(v.toFixed(2).replace('.', ',') + ' $'); });
    for (const m of JSON.stringify(ag).matchAll(/\b(?:art\.|article)\s*\d+\.\d+/gi)) terms.add(fold(m[0]).replace(/\s+/g, ' '));
  }
}
const termRe = terms.size ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...terms].map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
// contract-style references, whatever the number
const refRe = /(?<![\p{L}\p{N}])(?:art\.|article|articles|annexe?|lettre d'entente|letter of agreement)\s+(?:\d+\.\d+|[a-z]\d?(?![\p{L}\p{N}]))/gu;

// what a readable text contains, with encoded blobs removed (fonts, encrypted packs, the embedded PDF reader, model weights)
function hits(text) {
  let t = text.replace(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g, '').replace(/"(ct|salt|iv|e|w|b|s)":"[A-Za-z0-9+/=]+"/g, '')
    .replace(/<script type="application\/octet-stream"[^>]*>[\s\S]*?<\/script>/g, '');
  t = fold(t);
  const out = [];
  if (termRe) for (const m of t.matchAll(termRe)) out.push(m[0]);
  for (const m of t.matchAll(refRe)) out.push(m[0]);
  return out;
}
const skip = (p) => /\.(png|webp|jpg|jpeg|gif|ico|woff2?)$/i.test(p) || /(^|\/)vendor\//.test(p) || /(^|\/)licenses\//.test(p);
// shown in the report: how many hits, not the hits themselves (the report may be pasted somewhere); --show lists them
const report = (where, h) => problems.push(`${where}: ${h.length} hit(s)${args.has('--show') ? '  [' + [...new Set(h)].join(' | ') + ']' : ''}`);

// 1. the files as they are now
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (['.git', 'node_modules', 'private', 'dist', '__pycache__'].includes(e.name)) return []; // never published (also when linked)
  if (e.isDirectory() || (e.isSymbolicLink() && fs.statSync(p).isDirectory())) return walk(p);
  return [p];
});
const files = walk(REPO);
for (const f of files) {
  const rel = path.relative(REPO, f);
  if (/\.pdf$/i.test(f)) { problems.push(`PDF file in repo: ${rel}`); continue; }
  if (skip(rel)) continue;
  const h = hits(fs.readFileSync(f, 'utf8'));
  if (h.length) report(rel, h);
}

// 2. every file in every commit, the commit messages and who made them
let blobs = 0, commits = 0;
if (args.has('--history')) {
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { maxBuffer: 1 << 30 }).toString();
  const seen = new Map();
  for (const line of git('rev-list', '--all', '--objects').split('\n')) {
    const [sha, ...p] = line.split(' ');
    if (sha && p.length && !seen.has(sha)) seen.set(sha, p.join(' '));
  }
  for (const [sha, p] of seen) {
    if (git('cat-file', '-t', sha).trim() !== 'blob') continue;
    blobs++;
    if (/\.pdf$/i.test(p)) { problems.push(`history: a PDF was committed: ${p} (${sha.slice(0, 8)})`); continue; }
    if (skip(p)) continue;
    const buf = execFileSync('git', ['-C', REPO, 'cat-file', 'blob', sha], { maxBuffer: 1 << 30 });
    if (buf.includes(0)) continue;
    const h = hits(buf.toString('utf8'));
    if (h.length) report(`history: ${p} (${sha.slice(0, 8)})`, h);
  }
  for (const rec of git('log', '--all', '--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e').split('\x1e').filter((r) => r.trim())) {
    const [sha, ...rest] = rec.trim().split('\x1f');
    commits++;
    const h = hits(rest.join('\n'));
    if (h.length) report(`history: commit ${sha.slice(0, 8)} message or author`, h);
  }
}

// 3. the text inside images (store screenshots, icons)
let images = 0;
if (args.has('--images')) {
  for (const f of files.filter((x) => /\.(png|webp|jpg|jpeg)$/i.test(x) && !/vendor/.test(x))) {
    images++;
    const tmp = path.join(fs.mkdtempSync('/tmp/leak-'), 'i.png');
    try {
      execFileSync('python3', ['-c', 'import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2])', f, tmp]);
      const txt = execFileSync('tesseract', [tmp, '-', '-l', 'eng+fra'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const h = hits(txt);
      if (h.length) report(`image text: ${path.relative(REPO, f)}`, h);
    } catch (e) { problems.push(`image not read: ${path.relative(REPO, f)}`); }
  }
}

if (!havePrivate) console.log('No private/forbidden.txt here, so only the PDF check and the contract-reference check ran. Ask the owner for the private folder before publishing.');
if (problems.length) { console.log('LEAK CHECK FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`Leak check passed: ${files.length} files${blobs ? `, ${blobs} files in ${commits} commits` : ''}${images ? `, text in ${images} images` : ''}; ${terms.size} private terms and figures, plus contract references.`);
