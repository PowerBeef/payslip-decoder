// Made-up payslips (in parsed form) for the example view and the tests. Every name and number is fictional.
// Taxes are computed with the app's own formulas so a made-up payslip passes its checks, unless a test changes one
// on purpose. It must not resemble any real workplace: generic payroll labels, and no rate, premium or percentage
// taken from a real collective agreement or payslip (tools/leak_scan.mjs checks the rates against the private pack).
//
//   makePayslip()                    the example shown in the app (tools/mk_sample.mjs writes it to src/sample.js)
//   makePayslip({ start, rows, ... })  variants for the tests (tests/fixtures.mjs)
await import('../src/parser.js');
await import('../src/agreement.js');
await import('../src/analyze.js');
const PD = globalThis.PD;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const sum = (a) => r2(a.reduce((s, v) => s + (v || 0), 0));
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + 'T12:00:00Z') + n * 864e5);
const mdy = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;

// [desc, hours, rate, ytdHours, ytdAmount]; current lines carry dates. ytdHours include this pay's hours.
export const OLD = 27.1; // the rate before this year's raise, for year-to-date lines
export const RATES = { main: 27.85, second: 29.47, night: 1.25 };
export const EARN = [
  ['Heures régulières (01, 210)', 32, 27.85, 720, null],
  ['Heures régulières (01, 330)', 8, 29.47, 24, null],
  ['Heures régulières (02, 105)', 0, 0, 744, r2(744 * OLD)],
  ['Temps supplémentaire 1.5 (01, 210)', 4, 41.78, 30, null],
  ['Temps supplémentaire 1.5 (02, 105)', 0, 0, 16, r2(16 * OLD * 1.5)],
  ['Temps supplémentaire 2.0 (01, 210)', 0, 0, 8, r2(8 * 27.85 * 2)],
  ['Prime de nuit', 36, 1.25, 758, null],
  ['Prime de nuit', 8, 1.25, 24, null],
  ['Prime de nuit', 0, 0, 760, r2(760 * 1.25)],
  ['Congé férié (02, 105)', 0, 0, 40, r2(40 * OLD)],
  ['Congé férié (01, 210)', 0, 0, 32, r2(32 * 27.85)],
  ['Vacances (02, 105)', 0, 0, 80, r2(80 * OLD * 1.1)],
  ['Vacances (01, 210)', 0, 0, 40, r2(40 * 27.85 * 1.1)],
  ['Maladie (01, 210)', 0, 0, 16, r2(16 * 27.85)],
];

// English labels for the same lines and sections (Workday's English template)
const EN = {
  'Heures régulières': 'Regular Hours',
  'Temps supplémentaire': 'Overtime',
  'Prime de nuit': 'Night Premium',
  'Congé férié': 'Statutory Holiday',
  Vacances: 'Vacation',
  Maladie: 'Sick',
  Gains: 'Earnings',
  Impôts: 'Employee Taxes',
  'Retenues après impôt': 'Post Tax Deductions',
  'Retenues avant impôt': 'Pre Tax Deductions',
  'Cotisations de l’employeur': 'Employer Contributions',
  'Salaires imposables': 'Taxable Wages',
  Congés: 'Absence Plans',
  'Assurance-emploi': 'EI - Employment Insurance',
  'Impôt sur le revenu fédéral': 'FIT - Federal Income Tax',
  RQAP: 'QPIP - Quebec Parental Insurance Plan',
  RRQ: 'QPP - Quebec Pension Plan',
  'Impôt sur le revenu provincial': 'PIT QC - Provincial Income Tax',
  'Assurance vie collective': 'Group Life Insurance',
  'Assurance médicaments et dentaire': 'Medical and Dental Insurance',
  'Don Centraide': 'United Way Donation',
  'Cotisation syndicale': 'Union Dues',
  'Régime de retraite (employé)': 'Pension Plan (employee)',
  'Régime de retraite (employeur)': 'Pension Plan (employer)',
  'Avantage imposable prov.': 'Provincial Taxable Benefit',
  'Fédéral - Salaires assujettis': 'Federal - Subject Wages',
  'Fédéral - Salaires imposables': 'Federal - Taxable Wages',
  'Provincial (Québec) - Salaires assujettis': 'Provincial (Quebec) - Subject Wages',
  'Provincial (Québec) - Salaires imposables': 'Provincial (Quebec) - Taxable Wages',
  'Vacances flottantes': 'Floating Holidays',
  "Banque d'heures supplémentaires": 'Overtime Bank',
  'Paie brute': 'Gross Pay',
  'Paie nette': 'Net Pay',
  'Solde de vacances': 'Vacation Balance',
  'Vacances accumulées': 'Vacation Accrual',
  'Montant total de la demande': 'Total Claim Amount',
  'Habitant de zone visée par le règlement': 'Prescribed Zone Resident',
  "Montants d'impôt supplémentaire": 'Additional Tax Amounts',
  'Retenues/crédits annuels': 'Annual Deductions/Credits',
  'Fonds des travailleurs': 'Labour-Sponsored Funds',
  'Compte chèques': 'Chequing',
  'Banque Exemple': 'Example Bank',
};
const en = (s) => EN[s] || Object.entries(EN).reduce((t, [a, b]) => (t.startsWith(a + ' ') ? b + t.slice(a.length) : t), s);

/* o: { start, days, payDelay, rows(EARN) => rows, header, lang, qppPays, maxed, back, extraEarn } */
export function makePayslip(o = {}) {
  const start = o.start || '2026-11-01';
  const days = o.days || 7;
  const end = addDays(start, days - 1);
  const payDate = o.payDate || addDays(end, o.payDelay == null ? 5 : o.payDelay);
  const year = +payDate.slice(0, 4);
  const gov = PD.GOV[year];
  const D = { from: start, to: end, raw: `${mdy(start)} - ${mdy(end)}` };
  const E = o.rows ? o.rows(EARN.map((x) => x.slice())) : EARN;
  const back = o.back || 0; // pays before the reference week: fixed year-to-date amounts are that much lower

  const earnRows = E.map(([desc, h, rate, yh, y, dates]) => {
    const v = { rate, ytdHours: yh, ytd: y == null ? r2(yh * rate) : y };
    if (h) {
      v.hours = h;
      v.amount = r2(h * rate);
    }
    return { desc, dates: dates || (h ? D : undefined), values: v };
  });
  const gross = sum(earnRows.map((r) => r.values.amount));
  const grossYtd = sum(earnRows.map((r) => r.values.ytd));
  const baseCats = /régulières|supplémentaire|férié|Vacances|Maladie/;
  const pensionBase = sum(earnRows.filter((r) => baseCats.test(r.desc)).map((r) => r.values.amount));
  const pensionBaseYtd = sum(earnRows.filter((r) => baseCats.test(r.desc)).map((r) => r.values.ytd));

  const provTB = 16.9,
    provTBYtd = r2(743.6 - back * 16.9);
  const pension = r2(pensionBase * 0.045),
    pensionYtd = r2(pensionBaseYtd * 0.045);
  const union = r2(gross * 0.013),
    unionYtd = r2(grossYtd * 0.013);
  const life = 5.4,
    lifeYtd = r2(237.6 - back * 5.4),
    med = 36.8,
    medYtd = r2(1619.2 - back * 36.8);
  const gift = 2,
    giftYtd = r2(88 - back * 2);

  function build(t) {
    const enhDiv = gov.qpp.rate / gov.qpp.enh; // the enhanced part of QPP (deductible): 1 point of the rate
    const enh = r2(t.qpp / enhDiv);
    const enhY = r2(t.qppYtd / enhDiv);
    const fedTaxable = r2(gross - pension - union - enh),
      fedTaxableY = r2(grossYtd - pensionYtd - unionYtd - enhY);
    const provSubj = r2(gross + provTB),
      provSubjY = r2(grossYtd + provTBYtd);
    const provTaxable = r2(provSubj - pension - enh),
      provTaxableY = r2(provSubjY - pensionYtd - enhY);
    const taxes = [
      ['Assurance-emploi', t.ei, t.eiYtd],
      ['Impôt sur le revenu fédéral', t.fed, t.fedYtd],
      ['RQAP', t.qpip, t.qpipYtd],
      ['RRQ', t.qpp, t.qppYtd],
      ['Impôt sur le revenu provincial', t.qc, t.qcYtd],
    ];
    const taxCur = sum(taxes.map((x) => x[1])),
      taxY = sum(taxes.map((x) => x[2]));
    const post = [
      ['Assurance vie collective', life, lifeYtd],
      ['Assurance médicaments et dentaire', med, medYtd],
      ['Don Centraide', gift, giftYtd],
    ];
    const pre = [
      ['Cotisation syndicale', union, unionYtd],
      ['Régime de retraite (employé)', pension, pensionYtd],
    ];
    const er = [
      ['Régime de retraite (employeur)', pension, r2(pensionYtd - 0.1)],
      ['Avantage imposable prov.', provTB, provTBYtd],
    ];
    const postC = sum(post.map((x) => x[1])),
      postY = sum(post.map((x) => x[2]));
    const preC = sum(pre.map((x) => x[1])),
      preY = sum(pre.map((x) => x[2]));
    const net = r2(gross - taxCur - postC - preC),
      netY = r2(grossYtd - taxY - postY - preY);
    const C = (role, label) => ({ role, label });
    const simple = (title, rows) => ({
      title,
      columns: [C('desc', 'Description'), C('amount', 'Montant'), C('ytd', 'Cumul annuel')],
      rows: rows.map(([desc, a, y]) => ({ desc, values: { amount: a, ytd: y } })),
      total: { desc: title, values: { amount: sum(rows.map((x) => x[1])), ytd: sum(rows.map((x) => x[2])) } },
    });
    return {
      header: {
        name: 'Alex Exemple',
        company: 'Fabrication Exemple inc.',
        employeeId: '00000000',
        companyAddress: '100, rue de l’Exemple, Saint-Exemple, QC J0J 0J0',
        position: 'Opérateur',
        employeeAddress: '123, rue de l’Exemple, Saint-Exemple, QC',
        dateOrder: 'MDY',
        periodStart: start,
        periodEnd: end,
        payDate,
        ...(o.header || {}),
      },
      summary: {
        columns: [
          { label: 'Paie brute', current: gross, ytd: grossYtd },
          { label: 'Retenues après impôt', current: postC, ytd: postY },
          { label: 'Impôts', current: taxCur, ytd: taxY },
          { label: 'Retenues avant impôt', current: preC, ytd: preY },
          { label: 'Paie nette', current: net, ytd: netY },
        ],
      },
      sections: [
        {
          title: 'Gains',
          columns: [
            C('desc', 'Description'),
            C('dates', 'Dates'),
            C('hours', 'Heures'),
            C('rate', 'Taux'),
            C('amount', 'Montant'),
            C('ytdHours', 'Heures annuelles cumulées'),
            C('ytd', 'Montant annuel cumulé'),
          ],
          rows: earnRows,
          total: { desc: 'Gains', values: { amount: gross, ytd: grossYtd } },
        },
        simple('Impôts', taxes),
        simple('Retenues après impôt', post),
        simple('Retenues avant impôt', pre),
        simple('Cotisations de l’employeur', er),
        {
          title: 'Salaires imposables',
          columns: [C('desc', 'Description'), C('amount', 'Montant'), C('ytd', 'Cumul annuel')],
          total: null,
          rows: [
            { desc: 'Fédéral - Salaires assujettis', values: { amount: gross, ytd: grossYtd } },
            { desc: 'Fédéral - Salaires imposables', values: { amount: fedTaxable, ytd: fedTaxableY } },
            { desc: 'Provincial (Québec) - Salaires assujettis', values: { amount: provSubj, ytd: provSubjY } },
            { desc: 'Provincial (Québec) - Salaires imposables', values: { amount: provTaxable, ytd: provTaxableY } },
          ],
        },
        {
          title: 'Congés',
          columns: [C('desc', 'Description'), C('accrued', 'Cumulé'), C('reduced', 'Réduit'), C('available', 'Disponible')],
          total: null,
          rows: [
            { desc: 'Vacances flottantes', values: { accrued: 8, reduced: 0, available: 8 } },
            { desc: "Banque d'heures supplémentaires", values: { accrued: 12, reduced: 8, available: 4 } },
            { desc: 'Maladie', values: { accrued: 32, reduced: 16, available: 16 } },
          ],
        },
      ],
      vacation: [
        { label: 'Solde de vacances', value: 1820.45 },
        { label: 'Vacances accumulées', value: 3540.12 },
      ],
      withholding: [
        { label: 'Montant total de la demande', federal: 16452, provincial: 18952 },
        { label: 'Habitant de zone visée par le règlement', federal: 0, provincial: 0 },
        { label: "Montants d'impôt supplémentaire", federal: 0, provincial: 0 },
        { label: 'Retenues/crédits annuels', federal: 0, provincial: 0 },
        { label: 'Fonds des travailleurs', federal: 0, provincial: 0 },
      ],
      payments: [{ bank: 'Banque Exemple', accountName: 'Compte chèques', accountNumber: '******0042', amount: net, currency: 'CAD' }],
      warnings: [],
      pageCount: 1,
      sample: true,
    };
  }

  // year-to-date taxes: plausible running totals below the yearly maximums
  const provSubjY = grossYtd + provTBYtd;
  let t = {
    qpp: 0,
    qppYtd: r2(gov.qpp.rate * (provSubjY - (45 * gov.qpp.exempt) / 52)),
    ei: r2(gross * gov.ei.rate),
    eiYtd: r2(grossYtd * gov.ei.rate),
    qpip: r2(gross * gov.qpip.rate),
    qpipYtd: r2(grossYtd * gov.qpip.rate),
    fed: 0,
    fedYtd: 0,
    qc: 0,
    qcYtd: 0,
  };
  // a high earner who has already reached the QPP and EI maximums: nothing more is taken this pay
  if (o.maxed) Object.assign(t, { qppYtd: gov.qpp.max, ei: 0, eiYtd: gov.ei.max });
  // QPP worked out over a chosen number of pays (53 in a year with 53 pay dates); otherwise the app's first choice
  const qppFixed = o.qppPays ? r2(Math.max(0, gross + provTB - gov.qpp.exempt / o.qppPays) * gov.qpp.rate) : null;
  for (let i = 0; i < 6; i++) {
    if (qppFixed != null) t.qpp = qppFixed;
    const A = PD.analyze(build(t));
    const g = A.govChecks;
    if (qppFixed == null) t.qpp = g.qpp.expected;
    t.fed = g.fedTax ? g.fedTax.expected : t.fed;
    t.qc = g.qcTax ? g.qcTax.expected : t.qc;
    t.fedYtd = r2(t.fed * (grossYtd / gross) * 0.985);
    t.qcYtd = r2(t.qc * (grossYtd / gross) * 0.985);
  }
  const parsed = build(t);
  if (o.lang === 'en') toEnglish(parsed);
  return parsed;
}

/* Workday's English template: same numbers, English labels */
function toEnglish(p) {
  p.lang = 'en';
  for (const s of p.sections) {
    s.title = en(s.title);
    for (const r of s.rows) r.desc = en(r.desc);
    if (s.total) s.total.desc = en(s.total.desc);
  }
  for (const c of p.summary.columns) c.label = en(c.label);
  for (const v of p.vacation) v.label = en(v.label);
  for (const w of p.withholding) w.label = en(w.label);
  for (const x of p.payments) {
    x.bank = en(x.bank);
    x.accountName = en(x.accountName);
  }
  if (p.header.name === 'Alex Exemple') p.header = { ...p.header, name: 'Alex Example', position: 'Operator' };
  return p;
}

export { PD };
