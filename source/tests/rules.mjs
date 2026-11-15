// Date-aware rules: each payslip is held to the rules in force on its pay date.
// usage: node tests/rules.mjs                      (parameters, calendar, and the made-up payslips from tests/fixtures.mjs)
//        PAYSLIPS="a.pdf b.pdf" node tests/rules.mjs   (also: every real payslip passes every check)
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import { fixtures, makePayslip, PD } from './fixtures.mjs';
const F = await fixtures();
PD.PACKS = JSON.parse(fs.readFileSync(new URL('../packs.enc.json', import.meta.url), 'utf8')).concat([F.pack]);
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};
const r2 = (v) => Math.round(v * 100) / 100;

// 1. each year's maximums follow from its own rates and ceilings (catches a mistyped figure)
// (a year can hold only the parts already published: the others are null)
for (const [y, g] of Object.entries(PD.GOV)) {
  if (g.qpp) {
    ok(
      `${y}: QPP maximum = (MGA − exemption) × rate`,
      Math.abs(r2((g.qpp.mga - g.qpp.exempt) * g.qpp.rate) - g.qpp.max) < 0.01,
      `${g.qpp.max}`,
    );
    if (g.qpp.rate2)
      ok(`${y}: QPP2 maximum = (second ceiling − MGA) × 4%`, Math.abs(r2((g.qpp.mga2 - g.qpp.mga) * g.qpp.rate2) - g.qpp.max2) < 0.01);
    ok(`${y}: QPP base + first additional = total rate`, Math.abs(g.qpp.base + g.qpp.enh - g.qpp.rate) < 1e-9);
  }
  if (g.ei) ok(`${y}: EI maximum = insurable maximum × rate`, Math.abs(r2(g.ei.mie * g.ei.rate) - g.ei.max) < 0.01, `${g.ei.max}`);
  if (g.qpip)
    ok(`${y}: QPIP maximum = insurable maximum × rate`, Math.abs(r2(g.qpip.mie * g.qpip.rate) - g.qpip.max) < 0.01, `${g.qpip.max}`);
  ok(
    `${y}: ${['qpp', 'ei', 'qpip', 'fed', 'qc'].filter((k) => g[k]).length} of 5 parts included`,
    true,
    ['qpp', 'ei', 'qpip', 'fed', 'qc'].filter((k) => !g[k]).join(', ')
      ? 'missing: ' + ['qpp', 'ei', 'qpip', 'fed', 'qc'].filter((k) => !g[k]).join(', ')
      : '',
  );
}
// Revenu Québec's tax form with K cut to the dollar gives its published 2026 constants
{
  const q = PD.GOV[2026].qc,
    k = (Y) => r2(q.rates[q.th.filter((t) => Y > t).length] * Y - PD.rqTax(Y, q.th, q.rates));
  ok(
    'Québec 2026: K constants as published (2 717, 8 151, 10 465)',
    k(60000) === 2717 && k(120000) === 8151 && k(200000) === 10465,
    `${k(60000)}, ${k(120000)}, ${k(200000)}`,
  );
}

// 2. the calendar: some years hold 53 weekly pay dates
ok('2025 had 53 Wednesday pay dates', PD.payDatesInYear('2025-12-24', 7) === 53);
ok('2026 has 52 Wednesday pay dates', PD.payDatesInYear('2026-11-04', 7) === 52);
ok('biweekly: 26 or 27 pay dates', [26, 27].includes(PD.payDatesInYear('2026-01-09', 14)));

// 3. mid-year federal change in 2025: the edition depends on the pay date
const fed = PD.GOV[2025].fed;
const ed = (iso) => fed.filter((e) => e.from <= iso).pop();
ok('federal 2025: 15% for a June pay', ed('2025-06-25').low === 0.15);
ok('federal 2025: 14% for a July pay', ed('2025-07-02').low === 0.14);

// 4. the holiday calendar: Easter (checked against published dates) and the weekend rule
const easter = (y) => {
  const [gf] = PD.holidayDates(y, ['goodFriday']);
  return new Date(Date.parse(gf + 'T12:00:00Z') + 2 * 864e5).toISOString().slice(0, 10);
};
const EASTER = [
  '2008-03-23',
  '2011-04-24',
  '2019-04-21',
  '2024-03-31',
  '2025-04-20',
  '2026-04-05',
  '2027-03-28',
  '2028-04-16',
  '2035-03-25',
  '2038-04-25',
  '2049-04-18',
  '2054-03-29',
];
const wrongEaster = EASTER.filter((d) => easter(+d.slice(0, 4)) !== d);
ok(
  `Easter falls on its published date (${EASTER.length} years, early and late ones included)`,
  !wrongEaster.length,
  wrongEaster.map((d) => `${d} got ${easter(+d.slice(0, 4))}`).join(', '),
);
ok('a Saturday holiday moves to the Friday before (June 24, 2028)', PD.holidayDates(2028, ['stJean'])[0] === '2028-06-23');
ok('a Sunday holiday moves to the Monday after (July 1, 2029)', PD.holidayDates(2029, ['canada'])[0] === '2029-07-02');
ok(
  "National Patriots' Day is the Monday before May 25 (2026, 2027, and 2020 when May 25 was a Monday)",
  PD.holidayDates(2026, ['patriots'])[0] === '2026-05-18' &&
    PD.holidayDates(2027, ['patriots'])[0] === '2027-05-24' &&
    PD.holidayDates(2020, ['patriots'])[0] === '2020-05-18',
);

// 5. payslips, made-up ones first, then real ones if given (kept outside the repo): every check passes with the
//    rules of their own date, and a figure changed on purpose (with the totals that follow from it) is caught by its own check
const files = [F.payslip, F.y52, ...(process.env.PAYSLIPS || '').split(/\s+/).filter(Boolean)];
const opened = {};
for (const f of files) {
  const { pages } = await PD.extractPages(pdfjs, new Uint8Array(fs.readFileSync(f)));
  const p = PD.parsePayslip(pages);
  await PD.unlockFor(p.header);
  const A = PD.analyze(p);
  const bad = A.checks.filter((c) => c.status === 'warn').map((c) => c.id);
  ok(`payslip of ${p.header.payDate}: ${A.checks.length} checks, none flagged`, !bad.length, bad.join(', '));
  for (const id of ['fedTax', 'qcTax']) {
    const c = A.checks.find((x) => x.id === id);
    if (c)
      ok(
        `payslip of ${p.header.payDate}: ${id} matches Workday to the cent`,
        c.status === 'ok',
        `${c.status}, expected ${A.govChecks[id].expected}`,
      );
  }

  const col = (q, re) => q.summary.columns.find((c) => re.test(PD.key(c.label)));
  const rowOf = (q, desc) => q.sections.flatMap((x) => x.rows).find((r) => r.desc === desc);
  const secOf = (q, desc) => q.sections.find((x) => x.rows.some((r) => r.desc === desc));
  // change a tax line by d, and the taxes total and the net pay with it, so only that line is wrong
  const bumpTax = (q, kind, d, ytd = 0) => {
    const t = A.taxes.find((x) => x.kind === kind);
    if (!t) return false;
    const r = rowOf(q, t.desc),
      sc = secOf(q, t.desc);
    r.values.amount = r2(r.values.amount + d);
    r.values.ytd = r2(r.values.ytd + d + ytd);
    if (sc.total) {
      sc.total.values.amount = r2(sc.total.values.amount + d);
      sc.total.values.ytd = r2(sc.total.values.ytd + d + ytd);
    }
    const tc = q.summary.columns.find((c) => /impot|tax/.test(PD.key(c.label)) && !/deduction|retenue|revenu/.test(PD.key(c.label))),
      nc = col(q, /nette|net/);
    tc.current = r2(tc.current + d);
    tc.ytd = r2(tc.ytd + d + ytd);
    nc.current = r2(nc.current - d);
    nc.ytd = r2(nc.ytd - d - ytd);
    if (q.payments && q.payments.length) q.payments[0].amount = r2(q.payments[0].amount - d); // the bank deposit follows the net
    return true;
  };
  const planted = (name, fn, want, allow = []) => {
    const q = structuredClone(p);
    if (fn(q) === false) return;
    const B = PD.analyze(q);
    const warns = B.checks.filter((c) => c.status === 'warn').map((c) => c.id);
    const missed = want.filter((w) => !warns.includes(w)),
      extra = warns.filter((w) => !want.includes(w) && !allow.includes(w));
    ok(`${p.header.payDate}, planted: ${name}`, !missed.length && !extra.length, `flagged: ${warns.join(', ') || 'nothing'}`);
  };
  planted('EI $1 too high is flagged', (q) => bumpTax(q, 'ei', 1), ['ei']);
  planted('EI 1¢ off (Workday rounding) passes', (q) => bumpTax(q, 'ei', -0.01, 0.01), []);
  planted('QPIP $1 too high is flagged', (q) => bumpTax(q, 'qpip', 1), ['qpip']);
  planted(
    'QPP $1 too high is flagged (and the taxable wages built on it)',
    (q) => bumpTax(q, 'qpp', 1),
    ['qpp'],
    ['taxable-fed', 'taxable-prov'],
  );
  planted(
    "a year-to-date line that doesn't add up is flagged",
    (q) => {
      const t = A.taxes.find((x) => x.kind === 'qpp');
      rowOf(q, t.desc).values.ytd += 100;
    },
    ['netYtd'],
  );
  planted(
    "net pay that doesn't follow from the deductions is flagged",
    (q) => {
      const nc = col(q, /nette|net/);
      nc.current = r2(nc.current + 10);
    },
    ['netCalc'],
    ['deposit'],
  );
  planted(
    "hours × rate that doesn't match the amount is flagged",
    (q) => {
      const e = A.earnings.find((x) => x.current && x.hours && x.rate);
      rowOf(q, e.desc).values.amount += 10;
    },
    ['lineMath'],
    ['earnSum', 'pension'],
  );
  {
    // once EI reaches its yearly maximum, the federal estimate uses the maximum for the credit (CRA rule), so it still fits
    const q = structuredClone(p),
      t = A.taxes.find((x) => x.kind === 'ei');
    if (t) {
      const g = PD.GOV[A.meta.year].ei.max,
        d = -t.amount;
      bumpTax(q, 'ei', d, r2(g - t.ytd - d)); // year-to-date lands exactly on the maximum
      const B = PD.analyze(q),
        ft = B.checks.find((c) => c.id === 'fedTax');
      ok(
        `${p.header.payDate}, planted: EI maximum reached, federal tax estimate still fits`,
        ft && ft.status !== 'info' && ft.status !== 'warn',
        ft && ft.status,
      );
    }
  }
}

// 6. made-up payslips with known answers (tests/fixtures.mjs), each read back from its PDF
const open = async (f) => {
  const { pages } = await PD.extractPages(pdfjs, new Uint8Array(fs.readFileSync(f)));
  const p = PD.parsePayslip(pages);
  const ag = await PD.unlockFor(p.header);
  return { p, ag, A: PD.analyze(p) };
};
const warnsOf = (A) => A.checks.filter((c) => c.status === 'warn').map((c) => c.id);
const L = { lang: 'en', money: (v) => '$' + v.toFixed(2), num: (v) => String(v), pct: (v) => v + '%', date: (d) => d };
const txt = (x) => (typeof x === 'function' ? x(L) : x && x.en ? x.en : String(x || ''));
{
  const M = await open(F.payslip);
  ok(
    'made-up payslip: the made-up agreement opens, every check passes, agreement checks included',
    !!M.ag && !warnsOf(M.A).length && M.A.checks.filter((c) => c.group === 'agreement' && c.status === 'ok').length >= 4,
    `${M.A.checks.length} checks`,
  );
  const E = await open(F.en);
  ok(
    'English template: same gross and net as the French one, every check passes',
    E.A.summary.gross === M.A.summary.gross && E.A.summary.net === M.A.summary.net && !warnsOf(E.A).length && !!E.ag,
  );
  const B = await open(F.biweekly);
  ok('biweekly pay: 26 pays a year, every check passes', B.A.meta.P === 26 && !warnsOf(B.A).length, `P ${B.A.meta.P}`);
  const X = await open(F.maxed);
  ok(
    'QPP and EI maximums reached: nothing more is taken, the projections say so, every check passes',
    X.A.projections.qpp?.reached &&
      X.A.projections.ei?.reached &&
      !warnsOf(X.A).length &&
      X.A.checks.find((c) => c.id === 'fedTax')?.status === 'ok',
  );
  const R = await open(F.backpay);
  const rc = R.A.checks.find((c) => c.id === 'rate-0.75');
  ok(
    'back pay for an earlier week: a note, not a problem, and not counted as hours worked this week',
    rc &&
      rc.status === 'info' &&
      /earlier period/.test(txt(rc.detail)) &&
      !warnsOf(R.A).length &&
      R.A.hoursWorked === M.A.hoursWorked &&
      R.A.mainRate === M.A.mainRate,
    `hours ${R.A.hoursWorked}, main rate ${R.A.mainRate}`,
  );
  const Y2 = await open(F.y52),
    Y3 = await open(F.y53);
  ok('a 52-pay year: QPP worked out over 52 pays', Y2.A.meta.Ps.join() === '52' && Y2.A.govChecks.qpp.pays === 52 && !warnsOf(Y2.A).length);
  ok(
    'a 53-pay year: QPP over 53 pays is recognized and the tax estimates follow it',
    Y3.A.meta.Ps.join() === '52,53' &&
      Y3.A.govChecks.qpp.pays === 53 &&
      /÷ 53 pays/.test(txt(Y3.A.checks.find((c) => c.id === 'qpp').detail)) &&
      !warnsOf(Y3.A).length,
  );
  const Bd = await open(F.bad);
  ok('QPP $1 higher than the formula is flagged', warnsOf(Bd.A).includes('qpp'));
  const W2 = await open(F.week2),
    W3 = await open(F.week3);
  ok(
    'the week before: same pay; with one night shift fewer, lower pay and taxes; both pass',
    W2.A.summary.net === M.A.summary.net &&
      W3.A.summary.gross < M.A.summary.gross &&
      W3.A.taxes.find((t) => t.kind === 'fedTax').amount < M.A.taxes.find((t) => t.kind === 'fedTax').amount &&
      !warnsOf(W2.A).length &&
      !warnsOf(W3.A).length,
  );
  // the agreement's end date (roadmap step 6): after it, a rate that matches no scale is a note listing the rates
  const ag = M.ag,
    end = ag.expires;
  const agWarn = (A) => A.checks.filter((c) => c.group === 'agreement' && c.status === 'warn').map((c) => c.id);
  const agInfo = (A) => A.checks.filter((c) => c.group === 'agreement' && c.status === 'info');
  ag.expires = '2026-10-31';
  const same = PD.analyze(structuredClone(M.p));
  ok(
    'after the end date, same rates: no warning, one note',
    !agWarn(same).length && agInfo(same).length === 1 && agInfo(same)[0].id === 'agreementEnded',
  );
  const raised = makePayslip({
    header: M.p.header,
    rows: (E) => E.map(([d, h, r, yh, y]) => [d, h, r > 20 ? Math.round(r * 103) / 100 : r, yh, y]),
  });
  const RA = PD.analyze(raised);
  const note = agInfo(RA);
  ok(
    'after the end date, 3% higher rates from a new agreement: no warning, one note naming the rates',
    !warnsOf(RA).length && note.length === 1 && /28\.69\/h, \$30\.35\/h/.test(txt(note[0].detail)),
    txt(note[0] && note[0].detail).slice(-80),
  );
  ag.expires = end;
  const wrong = makePayslip({ header: M.p.header, rows: (E) => E.map(([d, h, r, yh, y]) => [d, h, r === 27.85 ? 27.95 : r, yh, y]) });
  ok('before the end date, a rate off the scale is still flagged', agWarn(PD.analyze(wrong)).includes('rate-27.95'));
  // a workplace's own label spellings come from its pack (the made-up "HRES ORD" stands for one)
  const own = structuredClone(M.p);
  own.sections[0].rows[0].desc = 'HRES ORD (01, 210)';
  const without = PD.analyze(own, { agreement: false }),
    withPack = PD.analyze(own);
  ok(
    'a workplace’s own spelling of a line is recognized only with its pack, and every check still passes',
    without.earnings[0].cat === 'other' && withPack.earnings[0].cat === 'regular' && !warnsOf(withPack).length,
    `${without.earnings[0].cat} / ${withPack.earnings[0].cat}`,
  );
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
