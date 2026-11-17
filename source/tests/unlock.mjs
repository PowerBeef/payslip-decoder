// Does the agreement pack open for every way Workday may print the employer and city, and stay closed otherwise?
//   node tests/unlock.mjs
// Always runs the 9 header spellings against the made-up test pack (fixtures/test-pack.mjs). When the private folder
// holds unlock-cases.json (the real employer word and city, never committed), the same 9 run against the real pack.
// Then the fallback rule (the merged city's name applies the agreement only to pay on its scales), on the made-up
// pack, and on the real one with PAYSLIP=/path/real.pdf.
import fs from 'fs';
import { fixtures, PD, makePayslip, VARIANTS } from './fixtures.mjs';
import { TEST_PACK } from './fixtures/test-pack.mjs';

const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
};
const cap = (s) => s.replace(/(^|[-\s])([a-z])/g, (m, a, b) => a + b.toUpperCase());

/* the 9 spellings from the November 15 review: 7 that must open, 2 that must not */
function cases(word, city, otherCity) {
  const C = word.toUpperCase(),
    Cy = cap(city);
  return [
    ['as printed today', `${C} Something Canada Inc.`, `100 Some Avenue ${Cy}, QC J0J 0J0`, true],
    ['city in capitals', `${C} Something Canada Inc.`, `100 Some Avenue ${Cy.toUpperCase()}, QC J0J 0J0`, true],
    ['no comma before the province', `${C} Something Canada Inc.`, `100 Some Avenue ${Cy} QC J0J 0J0`, true],
    ['province written out', `${C} Something Canada Inc.`, `100 Some Avenue ${Cy}, Québec J0J 0J0`, true],
    ['address on two lines', `${C} Something Canada Inc.`, `100 Some Avenue\n${Cy}, QC J0J 0J0`, true],
    ['the city’s other official name', `${C} Something Canada Inc.`, `100 Some Avenue ${otherCity}, QC J0J 0J0`, true],
    ['French word order in the company name', `Something ${C} Canada inc.`, `100 Some Avenue ${Cy}, QC J0J 0J0`, true],
    ['same company, another city', `${C} Something Canada Inc.`, '100 Some Avenue Montréal, QC H1H 1H1', false],
    ['another company, same city', 'Autre Compagnie inc.', `100 Some Avenue ${Cy}, QC J0J 0J0`, false],
  ];
}

async function run(label, packs, word, city, otherCity) {
  console.log(`\n${label}`);
  let slowest = 0;
  for (const [n, company, companyAddress, opens] of cases(word, city, otherCity)) {
    PD.PACKS = packs.map((p) => ({ ...p }));
    PD.AGREEMENTS = [];
    const t = performance.now();
    const ag = await PD.unlockFor({ company, companyAddress });
    const ms = performance.now() - t;
    slowest = Math.max(slowest, ms);
    ok(`${n}: ${opens ? 'opens' : 'stays closed'}`, !!ag === opens, `${Math.round(ms)} ms`);
  }
  return slowest;
}

const F = await fixtures();
await run('Made-up test pack (1,000 rounds)', [F.pack], 'usinage', 'lac-imaginaire', 'Ville-Imaginaire');
ok(
  'the test pack opens to the made-up agreement',
  (
    await (async () => {
      PD.PACKS = [{ ...F.pack }];
      PD.AGREEMENTS = [];
      return PD.unlockFor({ company: 'Usinage Fictif ltée', companyAddress: '200, boulevard du Fictif, Lac-Imaginaire, QC J0J 1J1' });
    })()
  )?.id === TEST_PACK.id,
);

/* the merged city's name is only a fallback: another workplace of the same employer may print it too, so the agreement
   then applies only to pay whose hourly rates are on its scales */
async function fallback(label, packs, parsed, town, other) {
  console.log(`\n${label}`);
  const variant = (city, otherRates) => {
    const p = structuredClone(parsed);
    p.header.companyAddress = `100 Some Avenue ${city}, QC J0J 0J0`;
    if (otherRates)
      for (const r of p.sections.flatMap((x) => x.rows))
        if (r.values && r.values.rate > 5) r.values.rate = Math.round((r.values.rate + 0.37) * 100) / 100;
    return p;
  };
  for (const [n, city, otherRates, applies] of [
    ['the town, rates on the scales', town, false, true],
    ['the town, other rates (the rate checks flag them)', town, true, true],
    ['the merged city, rates on the scales', other, false, true],
    ['the merged city, other rates (another workplace): the app stays generic', other, true, false],
  ]) {
    PD.PACKS = packs.map((p) => ({ ...p }));
    PD.AGREEMENTS = [];
    const p = variant(city, otherRates);
    await PD.unlockFor(p.header);
    ok(`${n}: agreement ${applies ? 'applies' : 'not applied'}`, !!PD.analyze(p).agreement === applies);
  }
}
await fallback('Fallback spelling, made-up pack', [F.pack], makePayslip(VARIANTS.payslip()), 'Lac-Imaginaire', 'Ville-Imaginaire');

const priv = new URL('../private/unlock-cases.json', import.meta.url);
if (fs.existsSync(priv)) {
  const c = JSON.parse(fs.readFileSync(priv, 'utf8'));
  const real = JSON.parse(fs.readFileSync(new URL('../packs.enc.json', import.meta.url), 'utf8'));
  const slow = await run(
    `Real pack (${real[0].iter.toLocaleString('en')} rounds, from packs.enc.json)`,
    real,
    c.company,
    c.city,
    c.otherCity,
  );
  ok('the slowest try stays under 1 second on this machine', slow < 1000, `${Math.round(slow)} ms`);
  // with a real payslip (kept outside the repo), the fallback rule on the real pack
  if (process.env.PAYSLIP) {
    const pdfjs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    const { pages } = await PD.extractPages(pdfjs, new Uint8Array(fs.readFileSync(process.env.PAYSLIP)));
    await fallback('Fallback spelling, real pack and payslip', real, PD.parsePayslip(pages), cap(c.city), c.otherCity);
  }
} else console.log('\n(no private/unlock-cases.json: the real pack’s spellings are not tested here)');
