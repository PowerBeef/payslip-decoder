// Every suite, in order, with the made-up payslips and agreement (tests/fixtures.mjs): no private file needed.
//   npm test                     builds, then runs everything and prints a summary
//   PAYSLIPS="a.pdf b.pdf" npm test   also runs the real payslips (kept outside the repo) where a suite takes them
//   SKIP=fullscreen,pages npm test     leaves suites out
// Exit code 1 if any suite fails.
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const real = (process.env.PAYSLIPS || '').split(/\s+/).filter(Boolean);
const skip = new Set((process.env.SKIP || '').split(',').filter(Boolean));
const PORT = +(process.env.PORT || 8765),
  BASE = `http://localhost:${PORT}/`;

/* the published build, served the way GitHub Pages serves it (a tiny static server, no Python needed) */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
};
function serve(dir) {
  return http
    .createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, BASE).pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    })
    .listen(PORT);
}

const SUITES = [
  ['rules', 'tests/rules.mjs', { PAYSLIPS: real.join(' ') }],
  ['unlock', 'tests/unlock.mjs'],
  ['assistant', 'tests/assistant.mjs'],
  ['ui', 'tests/ui.mjs'],
  ['privacy', 'tests/privacy.mjs', { BASE }],
  ['pages', 'tests/pages.mjs', { BASE }],
  ['standalone', 'tests/pages-standalone.mjs', { BASE }],
  ['fullscreen', 'tests/fullscreen.mjs', { BASE }],
  ['a11y', 'tests/a11y.mjs'],
  ['leaks', 'tools/leak_scan.mjs'],
];

function run(name, file, env = {}) {
  return new Promise((resolve) => {
    const t = Date.now();
    const child = spawn(process.execPath, [file], { cwd: ROOT, env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      out += d;
    });
    child.on('close', (code) => {
      const pass = (out.match(/^PASS/gm) || []).length,
        fail = (out.match(/^FAIL/gm) || []).length;
      const failed = code !== 0 || fail > 0;
      if (failed)
        console.log(
          out
            .split('\n')
            .filter((l) => /^FAIL|Error|error/.test(l))
            .slice(0, 15)
            .map((l) => '    ' + l)
            .join('\n'),
        );
      resolve({ name, pass, fail, code, secs: ((Date.now() - t) / 1000).toFixed(0), failed });
    });
  });
}

if (!process.env.NO_BUILD) {
  const b = spawnSync(process.execPath, ['build.mjs'], { cwd: ROOT, encoding: 'utf8' });
  if (b.status) {
    console.log(b.stdout, b.stderr);
    process.exit(1);
  }
  console.log(
    b.stdout
      .trim()
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n'),
  );
}
const server = serve(path.join(ROOT, 'dist/pages'));
const results = [];
for (const [name, file, env] of SUITES) {
  if (skip.has(name) || !fs.existsSync(path.join(ROOT, file))) continue;
  process.stdout.write(`${name.padEnd(11)}`);
  const r = await run(name, file, env);
  console.log(
    `${r.failed ? 'FAILED' : 'ok    '}  ${String(r.pass).padStart(3)} passed${r.fail ? `, ${r.fail} failed` : ''}  (${r.secs} s)`,
  );
  results.push(r);
}
server.close();
const bad = results.filter((r) => r.failed);
const total = results.reduce((a, r) => a + r.pass, 0),
  totalF = results.reduce((a, r) => a + r.fail, 0);
console.log(
  `\n${bad.length ? 'FAILED' : 'All suites passed'}: ${total} checks passed${totalF ? `, ${totalF} failed` : ''}, in ${results.length} suites${real.length ? ` (with ${real.length} real payslip${real.length > 1 ? 's' : ''})` : ' (made-up payslips only)'}`,
);
process.exit(bad.length ? 1 : 0);
