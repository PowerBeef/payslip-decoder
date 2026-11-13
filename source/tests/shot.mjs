// WAIT=ms waits longer before the shot (the welcome animation takes about 2 s)
// DEMO=1 opens the made-up example first; ASK='question||question' asks the assistant (newest last)
// usage: node tests/shot.mjs <abs path to html> <out.png> <w> <h> <lang> <light|dark> <view> <full 0|1> [pdf files...]
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// usage: node shot3.mjs <html> <out.png> <w> <h> <lang> <scheme> <view> <full 0|1> [pdf files...]
const [,, html, out, w = '390', h = '844', lang = 'en', scheme = 'light', view = 'overview', full = '1', ...files] = process.argv;
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files'], headless: 'new' });
const page = await browser.newPage();
const mobile = +w < 760;
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
await page.evaluateOnNewDocument((l) => { try { localStorage.setItem('pd-lang', l); } catch (e) {} }, lang);
await page.goto('file://' + html + '#' + (process.env.DEMO ? 'demo' : view));
await new Promise((r) => setTimeout(r, +(process.env.WAIT || 500)));
if (process.env.DEMO && !files.length) { await page.evaluate((v) => window.PDUI.go(v), view); await new Promise((r) => setTimeout(r, 600)); }
if (files.length) {
  const input = await page.$('#file');
  await input.uploadFile(...files);
  await page.waitForFunction(() => window.PDUI && window.PDUI.state.slips.length > 0, { timeout: 30000 }).catch((e) => logs.push('TIMEOUT ' + e.message));
  await page.evaluate((v) => window.PDUI.go(v), view);
  await new Promise((r) => setTimeout(r, 600));
}
if (process.env.ASK) {
  if (view !== 'ask') await page.evaluate(() => window.PDUI.go('ask'));
  for (const q of process.env.ASK.split('||').filter(Boolean)) await page.evaluate((x) => window.PDUI.ask(x), q);
  await new Promise((r) => setTimeout(r, 900));
}
await page.screenshot({ path: out, fullPage: full === '1' });
const info = await page.evaluate(() => {
  const over = [];
  const W = document.documentElement.clientWidth;
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true; } return false; };
  document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1 && getComputedStyle(el).position !== 'fixed' && !inScroller(el)) over.push(el.tagName + '.' + el.className + ' ' + Math.round(r.right)); });
  return { h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, W, over: over.slice(0, 8) };
});
console.log(JSON.stringify(info));
const l2 = logs.filter((l) => !/standardFontDataUrl|Warning: TT|Indexing all PDF/.test(l));
if (l2.length) console.log(l2.join('\n'));
await browser.close();
