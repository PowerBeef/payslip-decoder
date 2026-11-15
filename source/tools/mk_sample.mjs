// Builds the fictional example payslip (parsed form) shown in the app, from tools/fake_payslip.mjs.
// Every number is made up; checks are made to pass by computing taxes with the same formulas.
// It must not resemble any real workplace: generic payroll labels, and no rate, premium or percentage
// taken from a real collective agreement or payslip (tools/leak_scan.mjs checks the rates against the private pack).
import fs from 'fs';
import { makePayslip, PD } from './fake_payslip.mjs';
const parsed = makePayslip();
const A = PD.analyze(parsed);
console.log('gross', A.summary.gross, 'net', A.summary.net, 'grossYtd', A.summary.grossYtd, 'checks', JSON.stringify(A.checkStats));
A.checks.filter((c) => c.status !== 'ok').forEach((c) => console.log('  ', c.status, c.id));
console.log('timeline', JSON.stringify(A.codeTimeline), 'proj', JSON.stringify(A.projections));
fs.writeFileSync(
  new URL('../src/sample.js', import.meta.url),
  `/* A made-up payslip shown until you open your own. Every name and number in it is fictional. */\n(function (G) { (G.PD = G.PD || {}).SAMPLE = ${JSON.stringify(parsed)}; })(typeof globalThis !== 'undefined' ? globalThis : window);\n`,
);
