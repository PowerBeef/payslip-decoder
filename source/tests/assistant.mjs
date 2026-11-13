// usage: PAYSLIP=/path/real.pdf [PAYSLIP2=/path/other.pdf] node tests/assistant.mjs [--show]
// The assistant's question model and answers, outside the browser:
//  1. the JS model gives the same question type as the Python trainer on every test question (parity.json)
//  2. accuracy on the hand-written test sets (test_blind.tsv was never used to tune anything), and every suggested question
//  3. answers to sample questions carry the numbers from the analysis, in the question's language
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import '../src/parser.js'; import '../src/agreement.js'; import '../src/analyze.js'; import '../src/i18n.js'; import '../src/sample.js';
import '../src/assistant-model.js'; import '../src/assistant.js';
const PD = globalThis.PD;
const ROOT = new URL('..', import.meta.url);
const ok = (n, c, extra = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : ''));
const show = process.argv.includes('--show');
// the app's own formatter, taken from ui.js
const ui = fs.readFileSync(new URL('src/ui.js', ROOT), 'utf8');
const src = ui.slice(ui.indexOf('function makeL('), ui.indexOf('  const val = (x, L)'));
const makeL = new Function('PD', src + '; return makeL;')(PD);

// 1-2: model
const parity = JSON.parse(fs.readFileSync(new URL('assistant/parity.json', ROOT), 'utf8'));
let same = 0;
for (const p of parity) if (PD.Ask.classify(p.q).intent === p.intent) same++;
ok(`JS model matches the Python model on ${parity.length} questions`, same === parity.length, `${same}/${parity.length}`);
const tsv = (f) => fs.existsSync(new URL('assistant/' + f, ROOT)) ? fs.readFileSync(new URL('assistant/' + f, ROOT), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')) : [];
// what the person sees: below 35% confidence the assistant says it isn't sure
const understood = (q) => { const d = PD.Ask.decide(q, null); return d.conf < 0.35 && !['greeting', 'thanks'].includes(d.intent) ? 'unsure' : d.intent; };
for (const f of ['test_questions.tsv', 'test_final.tsv', 'test_blind.tsv']) {
  const rows = tsv(f);
  if (!rows.length) continue;
  let right = 0; const miss = [];
  for (const [gold, q] of rows) { const got = understood(q); if (got === gold) right++; else miss.push(`${gold} -> ${got}: ${q}`); }
  ok(`${f}: ${right}/${rows.length} questions understood (${(100 * right / rows.length).toFixed(1)}%)`, right / rows.length >= 0.85);
  if (show) miss.forEach((m) => console.log('   miss ' + m));
}
{
  const want = ['net', 'sick_left', 'breakdown', 'maximums', 'explain', 'holidays'];
  const bad = [];
  for (const lang of ['en', 'fr']) {
    const k = PD.STR[lang].ask;
    k.starters.forEach((q, i) => { if (understood(q) !== want[i]) bad.push(`${q} -> ${understood(q)}`); });
    if (understood(k.starterCompare) !== 'compare') bad.push(k.starterCompare);
  }
  ok('every suggested question is understood (EN and FR)', !bad.length, bad.join('; '));
}
const t0 = performance.now(); for (let i = 0; i < 200; i++) PD.Ask.classify('combien de jours de maladie il me reste cette semaine'); const ms = (performance.now() - t0) / 200;
ok(`one question takes ${ms.toFixed(2)} ms`, ms < 5);

// 3: answers
if (process.env.PAYSLIP) {
  PD.PACKS = JSON.parse(fs.readFileSync(new URL('packs.enc.json', ROOT), 'utf8'));
  const load = async (f) => { const { pages } = await PD.extractPages(pdfjs, new Uint8Array(fs.readFileSync(f))); const parsed = PD.parsePayslip(pages); await PD.unlockFor(parsed.header); return { name: f, parsed, A: PD.analyze(parsed) }; };
  const recs = [await load(process.env.PAYSLIP)];
  if (process.env.PAYSLIP2) recs.unshift(await load(process.env.PAYSLIP2));
  const cur = recs.length - 1, A = recs[cur].A;
  const ask = (q, uiLang = 'fr') => { const r = PD.Ask.answer(q, { recs, cur, makeL, lang: uiLang }); if (show) console.log(`\n? ${q}\n  [${r.intent} ${r.conf.toFixed(2)} ${r.lang}] ${PD.Ask.text(r).replace(/\n/g, ' | ')}${r.links.length ? '  links: ' + r.links.map((l) => l[1]).join(',') : ''}`); return r; };
  const Lf = makeL('fr', A.agreement), Le = makeL('en', A.agreement);
  const txt = (r) => PD.Ask.text(r).replace(/\n/g, ' ');
  const has = (r, t) => txt(r).includes(t);
  let r = ask('combien j’ai reçu cette semaine'); ok('net pay (fr)', r.intent === 'net' && has(r, Lf.money(A.summary.net)) && r.lang === 'fr');
  r = ask('how much did I take home?'); ok('net pay (en question, fr app): answers in English', r.intent === 'net' && has(r, Le.money(A.summary.net)) && r.lang === 'en');
  r = ask('il me reste combien de maladie'); ok('sick time left is never negative', r.intent === 'sick_left' && A.timeOff && has(r, Lf.h(A.timeOff.sick.left)) && !/(^|\s)-\d/.test(r.paras[0]));
  const q = A.taxes.find((t) => t.kind === 'qpp');
  r = ask('combien de RRQ'); ok('QPP amount', r.intent === 'line_amount' && q && has(r, Lf.money(q.amount)));
  r = ask("c'est quoi le RQAP"); ok('explains QPIP', r.intent === 'explain' && has(r, Lf.kind('qpip')));
  r = ask('when do I stop paying EI'); ok('EI maximum', r.intent === 'maximums' && /EI|Employment/.test(txt(r)));
  r = ask('pourquoi ma paie est si basse'); ok('breakdown names the split', r.intent === 'breakdown' && has(r, Lf.money(A.summary.gross)));
  r = ask('combien gagne une classe 3 niveau B'); ok('wage scale lookup', r.intent === 'wage_scale' && (!A.agreement || /3/.test(r.paras[0])));
  r = ask('c’est quand le prochain férié'); ok('next holiday', r.intent === 'holidays' && r.paras.length > 0);
  r = ask('quel temps fait-il demain'); ok('off-topic question is declined', ['other', 'unsure'].includes(r.intent));
  r = ask('montant de la case 14'); ok('T4 box 14', r.intent === 'slips' && /14/.test(txt(r)));
  r = ask('ma paie est-tu correcte'); ok('checks summary', r.intent === 'checks');
  r = ask('pourquoi ma paie est différente de la semaine passée');
  if (recs.length > 1) ok('comparison explains the change with two payslips', r.intent === 'compare' && r.paras.length >= 3, txt(r).slice(0, 160));
  else ok('comparison asks for a second payslip', r.intent === 'compare' && r.open === true);
  if (recs.length > 1) {
    const ys = recs.map((x) => (x.A.meta.payDate || '').slice(0, 4));
    if (ys[0] !== ys[1]) ok('comparison across years names both years', ys.every((y) => r.paras[0].includes(y)), r.paras[0]);
  }
  // holiday names, the more specific first ("lendemain de Noël" is not Noël, "jour de l'An" has no word longer than 3 letters)
  if (A.agreement && A.agreement.holidayIds) {
    const ids = A.agreement.holidayIds, nameOf = (id) => (A.agreement.holidays.fr || [])[ids.indexOf(id)];
    for (const [q2, id] of [['c’est quand le lendemain de Noël', 'boxing'], ['when is christmas', 'christmas'], ['c’est quand le jour de l’An', 'newYear'], ['le lendemain du jour de l’an tombe quand', 'dayAfterNewYear'], ['when is new year’s eve', 'newYearsEve'], ['c’est quand Pâques', 'easterMonday']]) {
      if (!ids.includes(id)) continue;
      const d = PD.Ask.decide(q2, A.agreement);
      ok(`holiday name: “${q2}”`, d.hol === ids.indexOf(id), `got ${d.hol >= 0 ? nameOf(ids[d.hol]) : 'none'}`);
    }
  }
}
// "this year" in the text means the payslip's year once that year is over
{
  const y = new Date().getFullYear() - 1;
  const en = makeL('en', null, y).s, fr = makeL('fr', null, y).s, now = makeL('en', null, y + 1).s;
  ok('earlier year: titles name the year (EN)', en.h.ytdSplit.includes(String(y)) && !/this year/i.test(en.h.ytdSplit) && en.projLater.includes(String(y)), en.h.ytdSplit);
  ok('earlier year: titles name the year (FR), “cette année-là” stays', fr.h.ytdSplit.includes(String(y)) && !/cette année(?!-là)/i.test(fr.h.ytdSplit) && fr.rulesAsOf('x').includes('cette année-là'), fr.h.ytdSplit);
  ok('earlier year: function texts too', en.pensionTotal('$1', '$2').includes(`So far in ${y}`) && fr.ask.maxLater.includes(`en ${y}`), en.pensionTotal('$1', '$2'));
  ok('current year: text unchanged', now === PD.STR.en);
}
