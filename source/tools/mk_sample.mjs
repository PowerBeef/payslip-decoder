// Builds a fictional, internally consistent payslip (parsed form) for the example view.
// Every number is made up; checks are made to pass by computing taxes with the same formulas.
// It must not resemble any real workplace: generic payroll labels, and no rate, premium or percentage
// taken from a real collective agreement or payslip (tools/leak_scan.mjs checks the rates against the private pack).
import fs from 'fs';
await import('../src/parser.js'); await import('../src/agreement.js'); await import('../src/analyze.js');
const PD = globalThis.PD;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const sum = (a) => r2(a.reduce((s, v) => s + (v || 0), 0));
const D = { from: '2026-11-01', to: '2026-11-07', raw: '11/01/2026 - 11/07/2026' };

// [desc, hours, rate, ytdHours, ytdAmount]; current lines carry dates
const OLD = 27.10; // the rate before this year's raise, for year-to-date lines
const E = [
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
const earnRows = E.map(([desc, h, rate, yh, y]) => {
  const v = { rate, ytdHours: yh, ytd: y == null ? r2(yh * rate) : y };
  if (h) { v.hours = h; v.amount = r2(h * rate); }
  return { desc, dates: h ? D : undefined, values: v };
});
const gross = sum(earnRows.map((r) => r.values.amount));
const grossYtd = sum(earnRows.map((r) => r.values.ytd));
const baseCats = /régulières|supplémentaire|férié|Vacances|Maladie/;
const pensionBase = sum(earnRows.filter((r) => baseCats.test(r.desc)).map((r) => r.values.amount));
const pensionBaseYtd = sum(earnRows.filter((r) => baseCats.test(r.desc)).map((r) => r.values.ytd));

const provTB = 16.9, provTBYtd = 743.6;
const pension = r2(pensionBase * 0.045), pensionYtd = r2(pensionBaseYtd * 0.045);
const union = r2(gross * 0.013), unionYtd = r2(grossYtd * 0.013);
const life = 5.4, lifeYtd = 237.6, med = 36.8, medYtd = 1619.2;
const gift = 2, giftYtd = 88;

function build(t) {
  const enh = r2(t.qpp / 6.3);
  const enhY = r2(t.qppYtd / 6.3);
  const fedTaxable = r2(gross - pension - union - enh), fedTaxableY = r2(grossYtd - pensionYtd - unionYtd - enhY);
  const provSubj = r2(gross + provTB), provSubjY = r2(grossYtd + provTBYtd);
  const provTaxable = r2(provSubj - pension - enh), provTaxableY = r2(provSubjY - pensionYtd - enhY);
  const taxes = [
    ['Assurance-emploi', t.ei, t.eiYtd], ['Impôt sur le revenu fédéral', t.fed, t.fedYtd],
    ['RQAP', t.qpip, t.qpipYtd], ['RRQ', t.qpp, t.qppYtd],
    ['Impôt sur le revenu provincial', t.qc, t.qcYtd],
  ];
  const taxCur = sum(taxes.map((x) => x[1])), taxY = sum(taxes.map((x) => x[2]));
  const post = [['Assurance vie collective', life, lifeYtd], ['Assurance médicaments et dentaire', med, medYtd], ['Don Centraide', gift, giftYtd]];
  const pre = [['Cotisation syndicale', union, unionYtd], ['Régime de retraite (employé)', pension, pensionYtd]];
  const er = [['Régime de retraite (employeur)', pension, r2(pensionYtd - 0.1)], ['Avantage imposable prov.', provTB, provTBYtd]];
  const postC = sum(post.map((x) => x[1])), postY = sum(post.map((x) => x[2]));
  const preC = sum(pre.map((x) => x[1])), preY = sum(pre.map((x) => x[2]));
  const net = r2(gross - taxCur - postC - preC), netY = r2(grossYtd - taxY - postY - preY);
  const C = (role, label) => ({ role, label });
  const simple = (title, rows) => ({
    title, columns: [C('desc', 'Description'), C('amount', 'Montant'), C('ytd', 'Cumul annuel')],
    rows: rows.map(([desc, a, y]) => ({ desc, values: { amount: a, ytd: y } })),
    total: { desc: title, values: { amount: sum(rows.map((x) => x[1])), ytd: sum(rows.map((x) => x[2])) } },
  });
  return {
    header: {
      name: 'Alex Exemple', company: 'Fabrication Exemple inc.', employeeId: '00000000',
      companyAddress: '100, rue de l’Exemple, Saint-Exemple, QC J0J 0J0', position: 'Opérateur',
      employeeAddress: '123, rue de l’Exemple, Saint-Exemple, QC', dateOrder: 'MDY',
      periodStart: '2026-11-01', periodEnd: '2026-11-07', payDate: '2026-11-12',
    },
    summary: { columns: [
      { label: 'Paie brute', current: gross, ytd: grossYtd }, { label: 'Retenues après impôt', current: postC, ytd: postY },
      { label: 'Impôts', current: taxCur, ytd: taxY }, { label: 'Retenues avant impôt', current: preC, ytd: preY },
      { label: 'Paie nette', current: net, ytd: netY },
    ] },
    sections: [
      { title: 'Gains', columns: [C('desc', 'Description'), C('dates', 'Dates'), C('hours', 'Heures'), C('rate', 'Taux'), C('amount', 'Montant'), C('ytdHours', 'Heures annuelles cumulées'), C('ytd', 'Montant annuel cumulé')],
        rows: earnRows, total: { desc: 'Gains', values: { amount: gross, ytd: grossYtd } } },
      simple('Impôts', taxes),
      simple('Retenues après impôt', post),
      simple('Retenues avant impôt', pre),
      simple('Cotisations de l’employeur', er),
      { title: 'Salaires imposables', columns: [C('desc', 'Description'), C('amount', 'Montant'), C('ytd', 'Cumul annuel')], total: null, rows: [
        { desc: 'Fédéral - Salaires assujettis', values: { amount: gross, ytd: grossYtd } },
        { desc: 'Fédéral - Salaires imposables', values: { amount: fedTaxable, ytd: fedTaxableY } },
        { desc: 'Provincial (Québec) - Salaires assujettis', values: { amount: provSubj, ytd: provSubjY } },
        { desc: 'Provincial (Québec) - Salaires imposables', values: { amount: provTaxable, ytd: provTaxableY } },
      ] },
      { title: 'Congés', columns: [C('desc', 'Description'), C('accrued', 'Cumulé'), C('reduced', 'Réduit'), C('available', 'Disponible')], total: null, rows: [
        { desc: 'Vacances flottantes', values: { accrued: 8, reduced: 0, available: 8 } },
        { desc: "Banque d'heures supplémentaires", values: { accrued: 12, reduced: 8, available: 4 } },
        { desc: 'Maladie', values: { accrued: 32, reduced: 16, available: 16 } },
      ] },
    ],
    vacation: [{ label: 'Solde de vacances', value: 1820.45 }, { label: 'Vacances accumulées', value: 3540.12 }],
    withholding: [
      { label: 'Montant total de la demande', federal: 16452, provincial: 18952 }, { label: 'Habitant de zone visée par le règlement', federal: 0, provincial: 0 },
      { label: "Montants d'impôt supplémentaire", federal: 0, provincial: 0 }, { label: 'Retenues/crédits annuels', federal: 0, provincial: 0 },
      { label: 'Fonds des travailleurs', federal: 0, provincial: 0 },
    ],
    payments: [{ bank: 'Banque Exemple', accountName: 'Compte chèques', accountNumber: '******0042', amount: net, currency: 'CAD' }],
    warnings: [], pageCount: 1, sample: true,
  };
}

// year-to-date taxes: plausible running totals below the yearly maximums
const provSubjY = grossYtd + provTBYtd;
let t = {
  qpp: 0, qppYtd: r2(0.063 * (provSubjY - 45 * 3500 / 52)), ei: r2(gross * 0.013), eiYtd: r2(grossYtd * 0.013),
  qpip: r2(gross * 0.0043), qpipYtd: r2(grossYtd * 0.0043), fed: 0, fedYtd: 0, qc: 0, qcYtd: 0,
};
for (let i = 0; i < 6; i++) {
  const A = PD.analyze(build(t));
  const g = A.govChecks;
  t.qpp = g.qpp.expected;
  t.fed = g.fedTax ? g.fedTax.expected : t.fed;
  t.qc = g.qcTax ? g.qcTax.expected : t.qc;
  t.fedYtd = r2(t.fed * (grossYtd / gross) * 0.985);
  t.qcYtd = r2(t.qc * (grossYtd / gross) * 0.985);
}
const parsed = build(t);
const A = PD.analyze(parsed);
console.log('gross', gross, 'net', A.summary.net, 'grossYtd', grossYtd, 'checks', JSON.stringify(A.checkStats));
A.checks.filter((c) => c.status !== 'ok').forEach((c) => console.log('  ', c.status, c.id));
console.log('timeline', JSON.stringify(A.codeTimeline), 'proj', JSON.stringify(A.projections));
fs.writeFileSync(new URL('../src/sample.js', import.meta.url), `/* A made-up payslip shown until you open your own. Every name and number in it is fictional. */\n(function (G) { (G.PD = G.PD || {}).SAMPLE = ${JSON.stringify(parsed)}; })(typeof globalThis !== 'undefined' ? globalThis : window);\n`);
