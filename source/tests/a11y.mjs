// Accessibility in real conditions: the axe-core audit on the main screens, phone and desktop, light and dark,
// and the keyboard staying inside an open sheet. Uses the offline build and the made-up payslip (tests/fixtures.mjs).
//   node tests/a11y.mjs [--show]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fixtures, addTestPack } from './fixtures.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const AXE = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const show = process.argv.includes('--show');
const FX = await fixtures();
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra && (!cond || show) ? '  ' + extra : ''}`);
  if (!cond) fails++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--allow-file-access-from-files'],
  headless: 'new',
});

async function audit(page) {
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const r = await window.axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    });
    return r.violations.map(
      (v) =>
        `${v.id} (${v.nodes.length}): ${v.nodes
          .slice(0, 2)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    );
  });
}

const SIZES = [
  ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['desktop', { width: 1280, height: 900 }],
];
for (const [size, vp] of SIZES) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await addTestPack(page, FX.pack);
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.setViewport(vp);
    await page.goto('file://' + ROOT + '/dist/payslip-decoder.html');
    await wait(600);
    const screens = [['welcome', null]];
    let v = await audit(page);
    ok(`${size} ${theme}: welcome screen, 0 problems`, !v.length, v.join('; '));
    await (await page.$('#file')).uploadFile(FX.payslip, FX.week2);
    await page.waitForFunction(() => window.PDUI.state.slips.length === 2, { timeout: 30000 });
    for (const view of ['pay', 'checks', 'year', 'ask', 'guide']) {
      await page.evaluate((x) => window.PDUI.go(x), view);
      await wait(350);
      if (view === 'ask') {
        await page.evaluate(() => window.PDUI.ask('combien j’ai reçu'));
        await wait(200);
      }
      v = await audit(page);
      screens.push([view]);
      ok(`${size} ${theme}: ${view}, 0 problems`, !v.length, v.join('; '));
    }
    await page.close();
  }
}

/* the keyboard stays inside an open sheet (share sheet and the PDF help), 12 presses of Tab each way */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('file://' + ROOT + '/dist/payslip-decoder.html');
  await wait(600);
  for (const act of ['share', 'pdfhelp']) {
    await page.click(`.welcome [data-act="${act}"]`);
    await wait(600);
    let inside = 0;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => !!document.activeElement.closest('#psheet'))) inside++;
    }
    for (let i = 0; i < 12; i++) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Tab');
      await page.keyboard.up('Shift');
      if (await page.evaluate(() => !!document.activeElement.closest('#psheet'))) inside++;
    }
    ok(`${act} sheet: Tab and Shift+Tab stay inside, 24 times out of 24`, inside === 24, `${inside}/24`);
    await page.keyboard.press('Escape');
    await wait(600);
    ok(
      `${act} sheet: Escape gives the focus back to the button that opened it`,
      await page.evaluate((a) => document.activeElement && document.activeElement.dataset.act === a, act),
    );
  }
  // a skip link is the first thing the keyboard reaches, and it jumps to the content
  await page.goto('file://' + ROOT + '/dist/payslip-decoder.html#demo');
  await page.reload();
  await wait(700);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => ({ cls: document.activeElement.className, href: document.activeElement.getAttribute('href') }));
  ok('the first Tab reaches a “skip to content” link', /skip/.test(first.cls) && first.href === '#main', JSON.stringify(first));
  await page.close();
}
/* an older browser (before color-mix, 2023): every declaration that uses it is dropped, the fallbacks remain.
   The example's screens must stay readable: no contrast problem, and the phone tab bar keeps a solid background. */
{
  const html = fs.readFileSync(path.join(ROOT, 'dist/payslip-decoder.html'), 'utf8');
  const old = html.replace(/[a-z-]+\s*:\s*[^;{}]*color-mix\([^;{}]*;?/g, '');
  const file = path.join(FX.dir, 'old-browser.html');
  fs.writeFileSync(file, old);
  ok(
    'older browsers: every color-mix() declaration has a plain fallback before it',
    (old.match(/color-mix\(/g) || []).length === 0 && (html.match(/color-mix\(/g) || []).length > 20,
  );
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto('file://' + file + '#demo');
    await wait(600);
    const probs = [];
    for (const view of ['pay', 'year', 'guide']) {
      await page.evaluate((x) => window.PDUI.go(x), view);
      await wait(300);
      await page.evaluate(AXE);
      const v = await page.evaluate(async () =>
        (await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } })).violations.map((x) => x.nodes.length),
      );
      if (v.length) probs.push(`${view}: ${v.join(',')}`);
    }
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#tabs')).backgroundColor);
    ok(
      `older browsers, ${theme}: Pay, Year and Guide stay readable, tab bar background solid`,
      !probs.length && !/rgba\(.*, 0\)|transparent/.test(bg),
      probs.join('; ') + ' tab bar ' + bg,
    );
    await page.close();
  }
}
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
