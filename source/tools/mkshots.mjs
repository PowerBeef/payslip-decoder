// usage: BASE=http://localhost:8765/ node tools/mkshots.mjs  (serve dist/pages first; run from source/)
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const BASE = process.env.BASE || 'http://localhost:8765/';
import { execFileSync } from 'child_process';
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'], headless: 'new' });
for (const lang of ['en', 'fr']) {
  for (const [kind, w, h, dpr, view, n] of [['narrow', 390, 844, 2, 'pay', 1], ['narrow', 390, 844, 2, 'ask', 2], ['narrow', 390, 844, 2, 'year', 3], ['wide', 1280, 800, 1, 'pay', 1]]) {
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: kind === 'narrow', hasTouch: kind === 'narrow' });
    await page.evaluateOnNewDocument((l) => { localStorage.setItem('pd-lang', l); localStorage.setItem('pd-install-seen', '1'); Object.defineProperty(navigator, 'standalone', { get: () => true }); localStorage.setItem('pd-welcomed', '1'); }, lang);
    // the store screenshots show the example payslip (#demo) without its banner, after the entrance motion settles
    await page.goto(BASE + '#demo', { waitUntil: 'networkidle0' });
    await page.evaluate((v) => { window.PDUI.go(v); const e = document.querySelector('.example'); if (e) e.remove(); }, view);
    await new Promise((r) => setTimeout(r, 1800));
    // the assistant: two of its suggested questions, the newest on top
    if (view === 'ask') await page.evaluate(() => { const k = window.PD.STR[window.PDUI.state.lang].ask; window.PDUI.ask(k.starters[3]); window.PDUI.ask(k.starters[0]); });
    await page.evaluate(() => { const e = document.querySelector('.example'); if (e) e.remove(); document.querySelectorAll('.toast').forEach((t) => t.classList.remove('show')); });
    await new Promise((r) => setTimeout(r, 300));
    const out = `/tmp/pd-shot-${lang}-${kind}-${n}.png`;
    await page.screenshot({ path: out });
    execFileSync('python3', ['-c', `from PIL import Image; Image.open('${out}').convert('RGB').save('assets/screenshots/${lang}-${kind}-${n}.webp', 'WEBP', quality=82, method=6)`]);
    await ctx.close();
  }
}
await browser.close();
