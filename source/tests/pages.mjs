// usage: BASE=http://localhost:8765/ PAYSLIP=/path/real.pdf node tests/pages.mjs  (serve dist/pages first; PROXY optional)
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const BASE = process.env.BASE || 'http://localhost:8765/';
const R = process.env.PAYSLIP;
const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', ...(process.env.PROXY ? ['--proxy-server=' + process.env.PROXY] : [])], headless: 'new' });

/* 1. installability, service worker, offline */
{
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await page.createCDPSession();
  const inst = await cdp.send('Page.getInstallabilityErrors');
  ok('Chrome installability errors: ' + JSON.stringify(inst.installabilityErrors.map((e) => e.errorId)), inst.installabilityErrors.length === 0);
  const man = await cdp.send('Page.getAppManifest');
  ok('manifest parses without errors ' + JSON.stringify(man.errors), man.errors.length === 0);
  ok('desktop: no auto sheet', await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.getElementById('sheet').hidden), 1200))));
  ok('desktop menu offers Install as an app', await page.evaluate(() => !!document.querySelector('.rail-acts [data-act="install"]')));
  await page.reload({ waitUntil: 'networkidle0' });
  const cached = await page.evaluate(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length);
  ok('service worker cached core files: ' + cached, cached >= 10);
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 800));
  ok('works offline (welcome screen renders)', await page.evaluate(() => !!document.querySelector('.welcome [data-act="open"]')));
  const input = await page.$('#file'); await input.uploadFile(R);
  await page.waitForFunction(() => window.PDUI.state.slips.length === 1, { timeout: 30000 }).catch(() => {});
  ok('opens a real payslip offline + agreement unlocked', await page.evaluate(() => window.PDUI.state.slips.length === 1 && !!window.PDUI.state.slips[0].A.agreement && window.PDUI.state.slips[0].A.checkStats.ok >= 15 && window.PDUI.state.slips[0].A.checkStats.warn === 0));
  await page.setOfflineMode(false);
  ok('no page errors', errs.length === 0); if (errs.length) console.log(errs);
  await page.close();
}

/* 2. device emulation for the first-launch guide */
const devices = [
  ['iphone-safari', { w: 390, h: 844, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', touch: 5 }, /iPhone/, 'en'],
  ['iphone-safari-fr', { w: 390, h: 844, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', touch: 5 }, /iPhone/, 'fr'],
  ['ipad-safari', { w: 820, h: 1180, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15', touch: 5, mobile: false }, /iPad/, 'en'],
  ['iphone-chrome', { w: 390, h: 844, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.7444.77 Mobile/15E148 Safari/604.1', touch: 5 }, /iOS 26/, 'en'],
  ['iphone-instagram', { w: 390, h: 844, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.30.110', touch: 5 }, /inside another app/, 'en'],
  ['android-chrome-pixel', { w: 412, h: 915, ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36', touch: 5, meta: { brands: [{ brand: 'Google Chrome', version: '142' }], fullVersionList: [], platform: 'Android', platformVersion: '16.0.0', architecture: '', model: 'Pixel 9', mobile: true } }, /Pixel 9/, 'en'],
  ['android-samsung', { w: 384, h: 832, ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36', touch: 5, meta: { brands: [{ brand: 'Samsung Internet', version: '28' }], fullVersionList: [], platform: 'Android', platformVersion: '15.0.0', architecture: '', model: 'SM-S921W', mobile: true } }, /Samsung Galaxy \(SM-S921W\)/, 'fr'],
  ['android-tablet', { w: 800, h: 1280, ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', touch: 5, mobile: false, meta: { brands: [{ brand: 'Google Chrome', version: '142' }], fullVersionList: [], platform: 'Android', platformVersion: '15.0.0', architecture: '', model: 'SM-X710', mobile: false } }, /Galaxy \(SM-X710\)/, 'en'],
];
for (const [name, d, expect, lang] of devices) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: d.ua, platform: d.meta ? 'Linux armv8l' : (d.ua.includes('Macintosh') ? 'MacIntel' : 'iPhone'), ...(d.meta ? { userAgentMetadata: d.meta } : {}) });
  await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: 2, isMobile: d.mobile !== false, hasTouch: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: d.touch });
  await page.evaluateOnNewDocument((l) => { try { localStorage.setItem('pd-lang', l); } catch (e) {} }, lang);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !document.getElementById('sheet').hidden, { timeout: 4000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 450));
  const info = await page.evaluate(() => ({ open: !document.getElementById('sheet').hidden, dev: (document.querySelector('.sh-dev') || {}).innerText || '', steps: document.querySelectorAll('.sh-steps li').length, prompt: !!document.querySelector('[data-ins="prompt"]'), over: document.querySelector('.sheet') ? document.querySelector('.sheet').scrollWidth > document.querySelector('.sheet').clientWidth + 1 : null }));
  ok(`${name}: sheet opens, detects ${expect} -> "${info.dev.replace(/\n/g, ' | ')}" steps=${info.steps} prompt=${info.prompt}`, info.open && expect.test(info.dev) && (info.steps > 0 || info.prompt) && !info.over);
  await page.screenshot({ path: `/tmp/pd-sheet-${name}.png` });
  if (name === 'iphone-safari') {
    await page.click('[data-ins="choose"]'); await new Promise((r) => setTimeout(r, 100));
    await page.click('[data-ins="pick"][data-k="androidSamsung"]'); await new Promise((r) => setTimeout(r, 100));
    ok('manual pick switches to Samsung steps', await page.evaluate(() => /Samsung Internet/.test(document.querySelector('.sh-dev').innerText) || document.querySelectorAll('.sh-steps li').length === 3));
    await page.click('[data-ins="dismiss"]'); await new Promise((r) => setTimeout(r, 600));
    ok('dismiss closes and continues in browser', await page.evaluate(() => document.getElementById('sheet').hidden && !!document.querySelector('.welcome')));
    await page.reload({ waitUntil: 'networkidle0' }); await new Promise((r) => setTimeout(r, 1200));
    ok('not shown again after dismiss', await page.evaluate(() => document.getElementById('sheet').hidden));
    await page.click('[data-act="menu"]'); await page.click('#menu [data-act="install"]'); await new Promise((r) => setTimeout(r, 400));
    ok('reopens from the menu', await page.evaluate(() => !document.getElementById('sheet').hidden));
  }
  if (errs.length) console.log('  errors:', errs);
  await ctx.close();
}

/* Home-screen launch and Android's install prompt are covered by tests/pages-standalone.mjs
   (headless Chrome can't emulate display-mode: standalone). */
await browser.close();
