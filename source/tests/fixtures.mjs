// Made-up test files, built fresh for each test run and never committed (every .pdf is gitignored anyway).
//   node tests/fixtures.mjs [dir]      writes them to dir (default /tmp/pd-fixtures) and lists them
//   import { fixtures } from './fixtures.mjs'; const F = await fixtures();   same, from a test
// A made-up employer ("Usinage Fictif") with a made-up agreement (fixtures/test-pack.mjs) stands in for a real
// workplace: tests add the encrypted test pack to the page (addTestPack) so the agreement features are exercised
// without any private file.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makePayslip, PD } from '../tools/fake_payslip.mjs';
import { payslipPdf, otherPdf, lockedPdf, scanPdf, png } from '../tools/payslip_pdf.mjs';
import { encryptPack } from '../tools/pack_crypto.mjs';
import { TEST_PACK, TEST_COMPANY, TEST_ADDRESS, TEST_MATERIALS } from './fixtures/test-pack.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export { PD, makePayslip, payslipPdf, TEST_PACK, TEST_MATERIALS };

// the made-up employee of the made-up employer
export const WORKER = {
  company: TEST_COMPANY,
  companyAddress: TEST_ADDRESS,
  name: 'Sam Fictif',
  employeeId: '00001234',
  employeeAddress: '12, rue des Essais, Lac-Imaginaire, QC',
  position: 'Régleur',
};
// The test worker's week differs from the example's (2 more regular hours, on nights), so nothing on a test payslip
// can be mistaken for the example built into the app (the privacy suite looks for payslip details in the app's files).
const own = (E) => E.map(([d, h, r, yh, y], i) => (i === 0 || i === 6 ? [d, h + 2, r, yh + 2, y] : [d, h, r, yh, y]));
const W = (o = {}) => ({ ...o, rows: (E) => (o.rows || ((x) => x))(own(E)), header: { ...WORKER, ...(o.header || {}) } });
const BANK = { bank: 'Caisse Fictive', accountName: 'Compte courant', accountNumber: '******0077' };
// the week before the reference week: its year-to-date hours stop before this week's (h0: other hours by line number)
const prev =
  (h0 = {}) =>
  (E) =>
    E.map(([d, h, r, yh, y], i) => [d, i in h0 ? h0[i] : h, r, yh - h, y]);

/* every made-up payslip the suites use, with what each one is for */
export const VARIANTS = {
  payslip: () => W(), // the reference week: November 1 to 7, 2026, paid on the 12th; every check passes
  week2: () => W({ start: '2026-10-25', rows: prev(), back: 1 }), // the week before, same hours: a comparison with nothing to explain
  week3: () => W({ start: '2026-10-25', rows: prev({ 0: 24, 6: 28 }), back: 1 }), // the week before, one night shift fewer: taxes change
  en: () => W({ lang: 'en' }), // Workday's English template
  biweekly: () => W({ days: 14, rows: (E) => E.map(([d, h, r, yh, y]) => [d, h * 2, r, yh + h, y]) }), // two weeks per pay (26 a year)
  maxed: () =>
    W({ maxed: true, rows: (E) => E.map(([d, h, r, yh, y]) => [d, h, r, Math.round(yh * 1.6), y && Math.round(y * 160) / 100]) }), // QPP and EI maximums already reached
  backpay: () =>
    W({
      rows: (E) => [
        ...E,
        ['Heures régulières (01, 210)', 40, 0.75, 40, null, { from: '2026-05-03', to: '2026-05-09', raw: '05/03/2026 - 05/09/2026' }],
      ],
    }), // a raise paid late, for an earlier week
  // 2025: 52 Thursdays, so 52 weekly pays; the 2025 scale's rates (before the 2.75% raise)
  y52: () =>
    W({
      start: '2025-11-02',
      qppPays: 52,
      rows: (E) => E.map(([d, h, r, yh, y]) => [d, h, { 27.85: 27.1, 29.47: 28.68, 41.78: 40.65 }[r] || r, yh, y]),
    }),
  y53: () => W({ qppPays: 53 }), // 2026: 53 Thursdays; QPP worked out over 53 pays, as Workday did in 2025
};

export async function fixtures(dir = process.env.FIXTURES || '/tmp/pd-fixtures') {
  fs.mkdirSync(dir, { recursive: true });
  const out = { dir };
  const parsed = {};
  for (const [name, f] of Object.entries(VARIANTS)) {
    const p = makePayslip(f());
    p.payments = p.payments.map((x) => ({ ...x, ...BANK }));
    parsed[name] = p;
    fs.writeFileSync((out[name] = path.join(dir, name + '.pdf')), await payslipPdf(p));
  }
  // a failed check: QPP $1 higher than the formula (net pay left as is, so arithmetic flags it too)
  const bad = structuredClone(parsed.payslip);
  const q = bad.sections[1].rows.find((r) => /RRQ/.test(r.desc));
  q.values.amount = Math.round((q.values.amount + 1) * 100) / 100;
  fs.writeFileSync((out.bad = path.join(dir, 'bad.pdf')), await payslipPdf(bad));
  // two payslips saved in one file
  fs.writeFileSync((out.merged = path.join(dir, 'merged.pdf')), await payslipPdf([parsed.week2, parsed.payslip]));
  // files that aren't a readable payslip
  fs.writeFileSync((out.other = path.join(dir, 'other.pdf')), await otherPdf());
  fs.writeFileSync((out.locked = path.join(dir, 'locked.pdf')), await lockedPdf(fs.readFileSync(out.payslip)));
  const pic = png();
  fs.writeFileSync((out.scan = path.join(dir, 'scan.pdf')), await scanPdf(pic));
  fs.writeFileSync((out.photo = path.join(dir, 'photo.png')), pic);
  fs.writeFileSync((out.text = path.join(dir, 'notes.txt')), 'Pas un talon de paie.\n');
  // the made-up agreement, encrypted like the real one (fewer rounds: it guards nothing)
  out.pack = await encryptPack(TEST_PACK, TEST_MATERIALS, 1000);
  fs.writeFileSync((out.packFile = path.join(dir, 'test-pack.json')), JSON.stringify(out.pack));
  out.parsed = parsed;
  return out;
}

/* Add the made-up agreement pack to a page before its own script runs (survives reloads).
   The page's build sets PD.PACKS; the setter appends the test pack to whatever it is given. */
export async function addTestPack(page, pack) {
  await page.evaluateOnNewDocument((p) => {
    const PD = (globalThis.PD = globalThis.PD || {});
    let packs = [p];
    Object.defineProperty(PD, 'PACKS', {
      configurable: true,
      get: () => packs,
      set: (v) => {
        packs = (v || []).concat(v && v.includes(p) ? [] : [p]);
      },
    });
  }, pack);
}

/* Load the app's code in Node with the test pack added (for the suites that don't need a browser) */
export function loadTestPack(pack) {
  PD.PACKS = (PD.PACKS || []).concat([pack]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const F = await fixtures(process.argv[2]);
  for (const [k, v] of Object.entries(F))
    if (typeof v === 'string' && v !== F.dir) console.log(k.padEnd(10), path.relative(process.cwd(), v));
}
