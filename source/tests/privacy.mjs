// Privacy and security in real conditions: open a real payslip in the published build, use every view and the
// assistant, then check that nothing left the device and nothing was kept.
// usage: (cd dist/pages && python3 -m http.server 8765) &
//        BASE=http://localhost:8765/ node tests/privacy.mjs                 (made-up payslip and agreement)
//        BASE=http://localhost:8765/ PAYSLIP=/path/real.pdf node tests/privacy.mjs
//        (BASE=https://powerbeef.github.io/payslip-decoder/ PROXY=$HTTPS_PROXY ... checks the live site)
import puppeteer from 'puppeteer-core';
import { fixtures, addTestPack } from './fixtures.mjs';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const BASE = process.env.BASE || 'http://localhost:8765/';
const FX = await fixtures();
const PAYSLIP = process.env.PAYSLIP || FX.payslip;
console.log(process.env.PAYSLIP ? 'real payslip' : 'made-up payslip and agreement from tests/fixtures.mjs');
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', ...(process.env.PROXY ? [`--proxy-server=${process.env.PROXY}`, '--ignore-certificate-errors'] : [])],
});
const page = await browser.newPage();
if (!process.env.PAYSLIP) await addTestPack(page, FX.pack);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const origin = new URL(BASE).origin;
const reqs = [],
  csp = [],
  errors = [];
page.on('request', (r) => reqs.push({ url: r.url(), method: r.method(), at: Date.now() }));
page.on('console', (m) => {
  if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));
await page.evaluateOnNewDocument(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
});

await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
await wait(500);
const opened = Date.now();
await (await page.$('#file')).uploadFile(PAYSLIP);
await page.waitForFunction(() => window.PDUI && window.PDUI.state.slips.length > 0 && !window.PDUI.state.loading, { timeout: 30000 });
for (const v of ['pay', 'checks', 'year', 'ask', 'guide']) {
  await page.evaluate((x) => window.PDUI.go(x), v);
  await wait(400);
}
await page.evaluate(() => window.PDUI.ask('combien j’ai reçu cette semaine'));
await page.evaluate(() => window.PDUI.ask('what is my wage scale'));
await page.evaluate(() => window.PDUI.go('guide'));
await wait(300);
await page.evaluate(() => {
  const d = document.querySelector('#orig-d');
  if (d) {
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
  }
});
await wait(2500); // the original PDF is drawn with the PDF reader

// what the payslip and the unlocked agreement contain, to look for it everywhere it must not be
const secrets = await page.evaluate(() => {
  const r = window.PDUI.state.slips[0],
    A = r.A,
    H = A.meta,
    ag = A.agreement;
  const out = [
    H.name,
    H.employeeId,
    H.company,
    H.employeeAddress,
    H.companyAddress,
    H.position,
    ...(A.payments || []).flatMap((p) => [p.bank, p.accountNumber]),
    String(A.summary.net),
    String(A.summary.gross),
  ];
  if (ag) out.push(ag.title && (ag.title.fr || ag.title.en), ag.union && (ag.union.fr || ag.union.en));
  return { list: out.filter((x) => x && String(x).trim().length >= 4).map(String), agreement: !!ag };
});
ok('the payslip opened and its agreement unlocked', secrets.agreement);
const has = (text) => secrets.list.filter((s) => text.includes(s) || text.includes(encodeURIComponent(s)));

// "Copy a report" (Checks): what someone sends when something looks wrong holds no amount, name or account
await page.evaluate(() => window.PDUI.go('checks'));
await wait(300);
await page.click('[data-act="report"]');
await wait(400);
const rep = await page.evaluate(() => {
  const A = window.PDUI.state.slips[0].A,
    nums = [];
  const add = (v) => {
    if (v == null || !isFinite(v) || Math.abs(v) < 1) return;
    nums.push(v.toFixed(2), v.toFixed(2).replace('.', ','), String(v));
  };
  A.earnings.forEach((e) => [e.amount, e.rate, e.hours, e.ytd, e.ytdHours].forEach(add));
  [...A.taxes, ...A.deductions, ...A.employer].forEach((t) => [t.amount, t.ytd].forEach(add));
  Object.values(A.summary).forEach((v) => typeof v === 'number' && add(v));
  return {
    text: window.PDUI.state.lastReport || '',
    nums: [...new Set(nums)].filter((n) => n.replace(/\D/g, '').length >= 3),
    toast: document.querySelector('#toast').textContent,
  };
});
const inReport = [...has(rep.text), ...rep.nums.filter((n) => rep.text.includes(n))];
ok(
  `“Copy a report” copies the checks and unknown line names, with none of the payslip’s ${secrets.list.length} personal details or ${rep.nums.length} amounts`,
  rep.text.length > 100 && /: ok/.test(rep.text) && !inReport.length && !/\d[.,]\d{2}\b/.test(rep.text) && /\S/.test(rep.toast),
  inReport.slice(0, 5).join(', '),
);

// 1. nothing left the device
const other = reqs.filter((r) => !/^(data|blob):/.test(r.url) && new URL(r.url).origin !== origin);
ok(
  'every request stays on the app’s own site',
  !other.length,
  other
    .slice(0, 3)
    .map((r) => r.url)
    .join(' '),
);
const notGet = reqs.filter((r) => r.method !== 'GET' && !/^(data|blob):/.test(r.url));
ok('nothing is ever sent (only GET requests)', !notGet.length, notGet.map((r) => `${r.method} ${r.url}`).join(' '));
const after = reqs.filter((r) => r.at >= opened && !/^(data|blob):/.test(r.url));
const leakyUrl = after.filter((r) => has(decodeURIComponent(r.url)).length);
ok(
  `no request carries payslip details (${after.length} requests after opening it, all app files)`,
  !leakyUrl.length && after.every((r) => new URL(r.url).origin === origin),
);

// 2. nothing was kept
const kept = await page.evaluate(async () => {
  const ls = Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]);
  const ss = Object.keys(sessionStorage);
  const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [];
  const cached = [];
  for (const name of await caches.keys()) {
    const c = await caches.open(name);
    for (const req of await c.keys()) {
      const res = await c.match(req);
      cached.push({
        url: req.url,
        body: res
          ? await res
              .clone()
              .text()
              .catch(() => '')
          : '',
      });
    }
  }
  return { ls, ss, dbs, cached };
});
const allowed = ['pd-lang', 'pd-install-seen', 'pd-installed', 'pd-welcomed'];
ok(
  'local storage holds only the language and install flags',
  kept.ls.every(([k]) => allowed.includes(k)),
  kept.ls.map(([k]) => k).join(', '),
);
ok('local storage holds nothing from the payslip', !kept.ls.some(([, v]) => has(v || '').length));
ok('session storage and databases are empty', !kept.ss.length && !kept.dbs.length, [...kept.ss, ...kept.dbs].join(', '));
ok(
  `the offline cache holds only the app’s own files (${kept.cached.length})`,
  kept.cached.every((c) => new URL(c.url).origin === origin && !/\.pdf$/i.test(new URL(c.url).pathname)),
  kept.cached
    .map((c) => c.url)
    .filter((u) => /\.pdf$/i.test(u))
    .join(' '),
);
ok('the offline cache holds nothing from the payslip or the unlocked agreement', !kept.cached.some((c) => has(c.body).length));

// 3. the browser's security policy was never broken, and nothing failed
const inPage = await page.evaluate(() => window.__csp);
ok('no security-policy violation', !csp.length && !inPage.length, [...csp, ...inPage].slice(0, 3).join(' | '));
ok('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
const policy = await page.evaluate(() => {
  const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  return m ? m.content : '';
});
ok(
  'scripts are allowed one by one (by hash), not any inline script',
  /script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+;/.test(policy) && !/script-src[^;]*unsafe-inline/.test(policy),
);
// a script slipped into the page (by a bug, an extension or anything else) is refused by the browser
const injected = await page.evaluate(async () => {
  const s = document.createElement('script');
  s.textContent = 'window.__injected = 1;';
  document.body.appendChild(s);
  await new Promise((r) => setTimeout(r, 200));
  return { ran: window.__injected === 1, blocked: window.__csp.some((v) => /script-src/.test(v)) };
});
ok('a script injected into the page is blocked', !injected.ran && injected.blocked, JSON.stringify(injected));
ok(
  'the page declares a security policy that only allows its own site',
  /default-src 'none'/.test(policy) && /connect-src 'self'/.test(policy) && !/https?:/.test(policy),
  policy.slice(0, 80),
);

await browser.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
