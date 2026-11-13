// usage: BASE=http://localhost:8765/ node tests/fullscreen.mjs   (serve dist/pages first; PROXY optional)
// Full screen on phones: emulated screen sizes and safe areas (notch / Dynamic Island, home bar).
// Installed app and in-app viewers use the app layout: the page is exactly the screen height, the header
// gives iOS 26 a solid top edge (no blur), and only the content scrolls. Safari tabs keep the page layout.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const BASE = process.env.BASE || 'http://localhost:8765/';
const SHOTS = process.env.SHOTS || '/tmp';
const ok = (n, c, extra = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : ''));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const INSTA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 390.0.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', ...(process.env.PROXY ? ['--proxy-server=' + process.env.PROXY] : [])], headless: 'new' });

// WebKit's LocalFrameView::fixedContainerEdges, top edge: from the element 4 px below the middle of the top,
// the first fixed or sticky ancestor at least 90% as wide as the viewport and taller than 10 px, and the first
// plain background colour on the way; a backdrop filter on the way makes it glass. Without it, iOS 26 blurs
// the top of a Home Screen web app, header included. (Same rule as in the discpress project.)
const topEdge = (page) => page.evaluate(() => {
  let backdrop = false, color = null;
  for (let n = document.elementFromPoint(innerWidth / 2, 4); n && n.nodeType === 1; n = n.parentElement) {
    const cs = getComputedStyle(n), r = n.getBoundingClientRect();
    if ((cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')) backdrop = true;
    const bg = cs.backgroundColor, wide = r.width >= innerWidth * 0.9 && r.height > 10;
    if (!color && wide && bg !== 'transparent' && !/, 0\)$/.test(bg)) color = bg;
    if ((cs.position === 'fixed' || cs.position === 'sticky') && wide) return { container: n.className || n.tagName, glass: backdrop, color: color && !/rgba/.test(color) ? 'solid' : color };
  }
  return { container: null };
});
const layout = (page) => page.evaluate(() => {
  const m = document.getElementById('main'), d = document.documentElement, b = document.querySelector('.bar-in').getBoundingClientRect();
  const sa = getComputedStyle(document.getElementById('sa-probe'));
  const btns = [...document.querySelectorAll('.welcome .wl-actions .btn')].map((x) => Math.round(x.getBoundingClientRect().bottom));
  return {
    mode: d.classList.contains('mode-shell') ? 'app' : 'page', appH: getComputedStyle(d).getPropertyValue('--app-h').trim(), innerH: innerHeight,
    pageScroll: d.scrollHeight - innerHeight, mainScroll: m.scrollHeight - m.clientHeight, headerTop: Math.round(b.top), safeTop: parseFloat(sa.paddingTop), safeBottom: parseFloat(sa.paddingBottom),
    rows: document.querySelectorAll('.wl-rows li:not([hidden])').length, btnBottom: Math.max(0, ...btns),
  };
});

async function open(dev) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  const cdp = await page.createCDPSession();
  if (dev.ua) await cdp.send('Emulation.setUserAgentOverride', { userAgent: dev.ua });
  await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: 3, isMobile: dev.w < 1000, hasTouch: true });
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: dev.top || 0, bottom: dev.bottom || 0, left: 0, right: 0 } });
  if (dev.touch) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: dev.touch });
  await page.evaluateOnNewDocument((d) => {
    try { localStorage.setItem('pd-lang', d.lang || 'fr'); localStorage.setItem('pd-install-seen', '1'); } catch (e) {}
    if (d.standalone) Object.defineProperty(navigator, 'standalone', { get: () => true });
    if (d.screenH) { Object.defineProperty(screen, 'height', { get: () => d.screenH }); Object.defineProperty(screen, 'availHeight', { get: () => d.screenH }); }
  }, dev);
  await page.goto(BASE + (dev.hash || ''), { waitUntil: 'networkidle0' });
  await wait(dev.hash ? 1800 : 3200); // let the entrance motion finish
  return { ctx, page };
}

// 0. iOS 26.1 and later: an installed app starts below the status bar (no top inset, 62 pt shorter than the screen)
//    but still reaches under the home bar, so it must keep its bottom inset (on a real iPhone the home bar sat on the tab labels)
for (const hash of ['', '#demo']) {
  const { ctx, page } = await open({ w: 402, h: 812, top: 0, bottom: 34, screenH: 874, ua: IOS, standalone: true, hash });
  const r = await page.evaluate(() => {
    const b = (sel) => { const e = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().height); return e.length ? Math.round(Math.max(...e.map((x) => x.getBoundingClientRect().bottom))) : null; };
    return { hostBottom: document.documentElement.classList.contains('host-bottom'), labels: b('#tabs .tlb'), foot: b('.foot p, .foot'), h: innerHeight };
  });
  const lowest = hash ? r.labels : r.foot;
  ok(`installed below the status bar (iOS 26.1+), ${hash ? 'example' : 'welcome'}: nothing under the home bar`, !r.hostBottom && lowest !== null && lowest <= r.h - 34, JSON.stringify(r));
  await ctx.close();
}

// 1. the welcome screen on installed apps: fits the screen exactly, header sharp
const PHONES = [
  ['iPhone 16 Pro / 17 (402x874)', 402, 874, 62, 34],
  ['iPhone 16 / 15 (393x852)', 393, 852, 59, 34],
  ['iPhone Pro Max (440x956)', 440, 956, 62, 34],
  ['iPhone mini (375x812)', 375, 812, 50, 34],
  ['iPhone SE (375x667)', 375, 667, 20, 0],
];
for (const [name, w, h, top, bottom] of PHONES) {
  for (const lang of ['fr', 'en']) {
    const { ctx, page } = await open({ w, h, top, bottom, ua: IOS, standalone: true, lang });
    const L = await layout(page), edge = await topEdge(page);
    ok(`${name} ${lang}, installed: app layout, page is the screen height`, L.mode === 'app' && L.appH === h + 'px' && L.pageScroll <= 0, JSON.stringify({ appH: L.appH, pageScroll: L.pageScroll }));
    ok(`${name} ${lang}, installed: welcome fits without scrolling`, L.mainScroll <= 1 && L.btnBottom <= h - bottom, `sample lines ${L.rows}, buttons end at ${L.btnBottom}/${h - bottom}`);
    ok(`${name} ${lang}, installed: solid top edge, header below the status bar`, edge.container === 'bar' && !edge.glass && edge.color === 'solid' && L.headerTop >= top, JSON.stringify(edge) + ' header at ' + L.headerTop);
    if (name.startsWith('iPhone 16 Pro') && lang === 'fr') await page.screenshot({ path: `${SHOTS}/pd-full-welcome.png` });
    await ctx.close();
  }
}

// 2. installed app with content: only the content scrolls; the header never moves and stays solid
{
  const { ctx, page } = await open({ w: 402, h: 874, top: 62, bottom: 34, ua: IOS, standalone: true, hash: '#demo' });
  const bar0 = await page.$eval('.bar', (b) => JSON.stringify(b.getBoundingClientRect()));
  const L = await layout(page);
  ok('example: content scrolls inside the app, not the page', L.mainScroll > 200 && L.pageScroll <= 0, JSON.stringify({ mainScroll: L.mainScroll, pageScroll: L.pageScroll }));
  await page.evaluate(() => document.getElementById('main').scrollTo(0, 700)); await wait(300);
  const bar1 = await page.$eval('.bar', (b) => JSON.stringify(b.getBoundingClientRect()));
  const edge = await topEdge(page);
  ok('scrolled: header stays put and solid, hairline under it', bar0 === bar1 && edge.container === 'bar' && !edge.glass && edge.color === 'solid' && await page.evaluate(() => document.body.classList.contains('scrolled')), JSON.stringify(edge));
  await page.screenshot({ path: `${SHOTS}/pd-full-scrolled.png` });
  await page.evaluate(() => window.scrollTo(0, 300)); await wait(200);
  ok('the page itself snaps back if something scrolls it', await page.evaluate(() => window.scrollY === 0));
  const tb = await page.evaluate(() => { const r = document.getElementById('tabs').getBoundingClientRect(), l = [...document.querySelectorAll('#tabs .tlb')].map((x) => x.getBoundingClientRect().bottom); return { left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), labels: Math.round(Math.max(...l)) }; });
  ok('tab panel docked to the bottom edge, full width, labels above the home bar', tb.left === 0 && tb.right === 402 && tb.bottom === 874 && tb.labels <= 874 - 34, JSON.stringify(tb));
  await page.click('a.tab[data-view="year"]'); await wait(700);
  ok('changing tab starts at the top', await page.evaluate(() => document.getElementById('main').scrollTop === 0));
  await page.click('a.tab[data-view="pay"]'); await wait(700);
  await page.click('.v-pay .subnav [data-scroll="c-taxes"]'); await wait(1200);
  const j = await page.evaluate(() => ({ st: document.getElementById('main').scrollTop, top: Math.round(document.getElementById('c-taxes').getBoundingClientRect().top), bar: Math.round(document.querySelector('.bar').getBoundingClientRect().bottom) }));
  ok('jump bar scrolls the content to the section, just under the header', j.st > 0 && j.top >= j.bar && j.top <= j.bar + 30, JSON.stringify(j));
  await page.click('.example [data-act="pdfhelp"]').catch(() => {});
  await page.evaluate(() => document.querySelector('[data-act="pdfhelp"]').click()); await wait(700);
  const sh = await page.evaluate(() => { const r = document.querySelector('#psheet .sheet').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
  ok('PDF help sheet fits between the status bar and the bottom', sh.top >= 62 && sh.bottom <= 874, JSON.stringify(sh));
  await ctx.close();
}

// 3. other places the app runs
{
  const { ctx, page } = await open({ w: 402, h: 760, top: 62, bottom: 0, ua: IOS }); // Safari tab (bars take part of the screen)
  const L = await layout(page), edge = await topEdge(page);
  ok('Safari tab: page layout, welcome fits, solid top edge at rest', L.mode === 'page' && L.pageScroll <= 1 && !edge.glass && edge.color === 'solid', `sample lines ${L.rows}, ` + JSON.stringify(edge));
  await ctx.close();
}
{
  const { ctx, page } = await open({ w: 402, h: 800, top: 62, bottom: 34, ua: INSTA }); // Instagram's viewer
  const L = await layout(page);
  ok('in-app viewer (Instagram): app layout, fits', L.mode === 'app' && L.mainScroll <= 1 && L.pageScroll <= 0, `sample lines ${L.rows}`);
  await ctx.close();
}
{
  const { ctx, page } = await open({ w: 412, h: 891, ua: ANDROID, standalone: true }); // installed on Android
  const L = await layout(page);
  ok('Android installed: app layout, fits', L.mode === 'app' && L.mainScroll <= 1 && L.pageScroll <= 0, `sample lines ${L.rows}`);
  await ctx.close();
}
{
  const { ctx, page } = await open({ w: 820, h: 1180, top: 24, bottom: 20, ua: IPAD, touch: 5, standalone: true, hash: '#demo' }); // iPad, installed
  const L = await layout(page), edge = await topEdge(page);
  await page.evaluate(() => document.getElementById('main').scrollTo(0, 500)); await wait(200);
  const tabsTop = await page.$eval('#tabs', (t) => Math.round(t.getBoundingClientRect().top));
  ok('iPad installed: app layout, tab row stays under the header while content scrolls', L.mode === 'app' && L.pageScroll <= 0 && edge.color === 'solid' && !edge.glass && tabsTop > 0 && tabsTop < 140, 'tabs at ' + tabsTop);
  await ctx.close();
}
{
  const { ctx, page } = await open({ w: 1280, h: 800, ua: null, standalone: true, hash: '#demo' }); // desktop app window
  await page.evaluate(() => document.getElementById('main').scrollTo(0, 600)); await wait(200);
  const r = await page.evaluate(() => ({ rail: Math.round(document.querySelector('.tabs').getBoundingClientRect().top), page: document.documentElement.scrollHeight - innerHeight, main: document.getElementById('main').scrollTop }));
  ok('desktop app window: rail stays, content scrolls', r.page <= 0 && r.main > 0 && r.rail > 0 && r.rail < 80, JSON.stringify(r));
  await ctx.close();
}
await browser.close();
