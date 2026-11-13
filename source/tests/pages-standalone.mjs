// usage: BASE=http://localhost:8765/ PAYSLIP=/path/real.pdf node tests/pages-standalone.mjs  (serve dist/pages first; PROXY optional)
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const BASE = process.env.BASE || 'http://localhost:8765/';
const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', ...(process.env.PROXY ? ['--proxy-server=' + process.env.PROXY] : [])], headless: 'new' });
{ // launched from iOS home screen
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); try { localStorage.setItem('pd-lang', 'en'); } catch (e) {} });
  await page.goto(BASE + '#demo', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.PDUI.go('guide')); await new Promise((r) => setTimeout(r, 1500));
  const st = await page.evaluate(() => ({ sheet: !document.getElementById('sheet').hidden, toast: document.getElementById('toast').textContent, menuInstall: !!document.querySelector('[data-act="install"]:not(#g-install *)'), card: (document.querySelector('#g-install') || {}).innerText || '' }));
  ok('home-screen launch: no guide, welcome toast, no install menu item, guide card says already installed ' + JSON.stringify(st), !st.sheet && /app version/.test(st.toast) && !st.menuInstall && /already/.test(st.card));
  await ctx.close();
}
{ // Android one-tap install (simulated beforeinstallprompt)
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36', userAgentMetadata: { brands: [{ brand: 'Google Chrome', version: '142' }], fullVersionList: [], platform: 'Android', platformVersion: '16.0.0', architecture: '', model: 'Pixel 9', mobile: true } });
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('pd-lang', 'fr'); } catch (e) {} });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await page.waitForFunction(() => !document.getElementById('sheet').hidden, { timeout: 4000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  ok('Android: one-tap Install button shown', await page.evaluate(() => !!document.querySelector('[data-ins="prompt"]')));
  await page.screenshot({ path: '/tmp/pd-sheet-android-prompt-fr.png' });
  await page.click('[data-ins="prompt"]'); await new Promise((r) => setTimeout(r, 500));
  ok('tapping Install calls the browser prompt and closes the guide', await page.evaluate(() => window.__prompted === true && document.getElementById('sheet').hidden));
  await ctx.close();
}
await browser.close();
