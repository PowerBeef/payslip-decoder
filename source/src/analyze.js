/* Payslip decoder — turns the parsed layout into meaning: categories, plain-language
   explanations, money split, and independent verification checks. */
(function (G) {
  'use strict';
  const PD = (G.PD = G.PD || {});
  const key = PD.key;
  const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const sum = (a) => r2(a.reduce((s, v) => s + (v || 0), 0));
  const T = (en, fr) => (L) => (L.lang === 'fr' ? fr : en);
  PD.T = T;

  /* ---------- government parameters by year, Québec employee ----------
     A payslip is checked against the rules in force on its pay date, never today's.
     fed and qc may be a list of editions when a rate changed mid-year: each has the first pay date it applies to
     (federal 2025: the lowest rate went from 15% to 14% for pays from July 1). null: not included (not published yet,
     or not estimated); those checks are skipped with a notice and the rest still run. */
  PD.GOV = {
    // 2027 so far: only EI is published (Canada Employment Insurance Commission: Québec rate $1.29 per $100, maximum
    // insurable earnings $70,800). QPP, QPIP and the federal and Québec tax tables come out in late November and December.
    2027: {
      qpp: null,
      ei: { rate: 0.0129, mie: 70800, max: 913.32 },
      qpip: null,
      fed: null,
      qc: null,
    },
    2026: {
      qpp: { rate: 0.063, base: 0.053, enh: 0.01, mga: 74600, exempt: 3500, max: 4479.3, rate2: 0.04, mga2: 85000, max2: 416 },
      ei: { rate: 0.013, mie: 68900, max: 895.7 },
      qpip: { rate: 0.0043, mie: 103000, max: 442.9 },
      fed: { th: [58523, 117045, 181440, 258482], rates: [0.14, 0.205, 0.26, 0.29, 0.33], low: 0.14, bpa: 16452, cea: 1501, abatement: 0.165 },
      qc: { th: [54345, 108680, 132245], rates: [0.14, 0.19, 0.24, 0.2575], low: 0.14, bpa: 18952, workerRate: 0.06, workerMax: 1450 },
    },
    2025: {
      qpp: { rate: 0.064, base: 0.054, enh: 0.01, mga: 71300, exempt: 3500, max: 4339.2, rate2: 0.04, mga2: 81200, max2: 396 },
      ei: { rate: 0.0131, mie: 65700, max: 860.67 },
      qpip: { rate: 0.00494, mie: 98000, max: 484.12 },
      fed: [
        { from: '2025-01-01', th: [57375, 114750, 177882, 253414], rates: [0.15, 0.205, 0.26, 0.29, 0.33], low: 0.15, bpa: 16129, cea: 1471, abatement: 0.165 },
        { from: '2025-07-01', th: [57375, 114750, 177882, 253414], rates: [0.14, 0.205, 0.26, 0.29, 0.33], low: 0.14, bpa: 16129, cea: 1471, abatement: 0.165 },
      ],
      qc: { th: [53255, 106495, 129590], rates: [0.14, 0.19, 0.24, 0.2575], low: 0.14, bpa: 18571, workerRate: 0.06, workerMax: 1420 },
    },
    2024: {
      qpp: { rate: 0.064, base: 0.054, enh: 0.01, mga: 68500, exempt: 3500, max: 4160, rate2: 0.04, mga2: 73200, max2: 188 },
      ei: { rate: 0.0132, mie: 63200, max: 834.24 },
      qpip: { rate: 0.00494, mie: 94000, max: 464.36 },
      fed: { th: [55867, 111733, 173205, 246752], rates: [0.15, 0.205, 0.26, 0.29, 0.33], low: 0.15, bpa: 15705, cea: 1433, abatement: 0.165 },
      qc: { th: [51780, 103545, 126000], rates: [0.14, 0.19, 0.24, 0.2575], low: 0.14, bpa: 18056, workerRate: 0.06, workerMax: 1380 },
    },
    2023: {
      qpp: { rate: 0.064, base: 0.054, enh: 0.01, mga: 66600, exempt: 3500, max: 4038.4 }, // no second contribution before 2024
      ei: { rate: 0.0127, mie: 61500, max: 781.05 },
      qpip: { rate: 0.00494, mie: 91000, max: 449.54 },
      fed: { th: [53359, 106717, 165430, 235675], rates: [0.15, 0.205, 0.26, 0.29, 0.33], low: 0.15, bpa: 15000, cea: 1368, abatement: 0.165 },
      qc: null, // Québec cut its two lowest rates for pays after June 30, 2023: tax estimate not attempted
    },
  };
  /* the edition in force on a pay date */
  const edition = (x, iso) => (Array.isArray(x) ? x.filter((e) => !iso || e.from <= iso).pop() || x[0] : x);

  /* How many pay dates the pay date's year holds at this frequency: weekly pays fall 53 times in some years
     (2025 had 53 Wednesdays), biweekly 27. Per-pay amounts (the QPP exemption, annualized income) divide by it. */
  PD.payDatesInYear = (iso, stepDays) => {
    if (!iso || !stepDays) return null;
    const t = Date.parse(iso + 'T12:00:00Z'), y = new Date(t).getUTCFullYear();
    let n = 0;
    for (let x = t; new Date(x).getUTCFullYear() === y; x -= stepDays * 864e5) n++;
    for (let x = t + stepDays * 864e5; new Date(x).getUTCFullYear() === y; x += stepDays * 864e5) n++;
    return n;
  };

  /* Revenu Québec's form of the same tax (TP-1015.F): rate × income − K, with K cut to the dollar as Revenu Québec
     publishes it (2026: 2 717, 8 151, 10 465). Workday follows it: with the exact K the estimate was 1–2¢ low. */
  const rqTax = (inc, th, rates) => {
    let i = 0;
    while (i < th.length && inc > th[i]) i++;
    let K = 0;
    for (let j = 1; j <= i; j++) K += (rates[j] - rates[j - 1]) * th[j - 1];
    return Math.max(0, rates[i] * inc - Math.floor(K + 1e-6));
  };
  PD.rqTax = rqTax;
  const progressive = (inc, th, rates) => {
    let tax = 0, prev = 0;
    for (let i = 0; i < rates.length; i++) {
      const top = i < th.length ? th[i] : Infinity;
      if (inc > prev) tax += (Math.min(inc, top) - prev) * rates[i];
      prev = top;
    }
    return tax;
  };

  /* ---------- classification ---------- */
  const EARN = [
    // hours recorded at $0 so the week adds up (unpaid absence): not a pay line to recalculate
    ['unpaid', /\babs\.?\s*n\.?\s*p\b|absence\s+non\s+pay|non\s+pay[ée]e?s?\b|sans\s+solde|unpaid|without\s+pay|\blwop\b/i],
    ['overtime', /\b(temps\s*(supp\w*\s*)?\d+([.,]\d+)?\s*x?|t\s*1[.,]5|overtime|o\/?t|double|temps double)\b/i],
    ['evening', /prime\s+de\s+soir|evening|2e quart|second shift/i],
    ['night', /prime\s+de\s+nuit|night|3e quart|third shift/i],
    ['premium', /\bprime\b|premium|differential/i],
    ['vacationBank', /bq\s*de\s*vac|banque\s+de\s+vac|vacation\s+bank|vac\w*\s+pay(e|ée)/i],
    ['vacation', /vacances|vacation/i],
    ['holiday', /f[ée]ri[ée]|statutaire|holiday|\bstat\b/i],
    ['sick', /maladie|sick/i],
    ['bereavement', /deuil|bereavement/i],
    ['award', /award|prix|bonus|boni|gratification/i],
    ['retro', /r[ée]tro/i],
    ['misc', /divers|misc/i],
    ['regular', /hrs?\s*reg|r[ée]gul|regular|heures\s+norm/i],
  ];
  const earnCat = (d) => (EARN.find(([, re]) => re.test(d)) || ['other'])[0];
  const otMult = (d) => { const m = d.match(/(\d+(?:[.,]\d+)?)/); const v = m ? parseFloat(m[1].replace(',', '.')) : NaN; return v >= 1 && v <= 3 ? v : (/double/i.test(d) ? 2 : 1.5); };

  const taxKind = (d) => {
    const k = key(d);
    if (/rrq\s*2|qpp\s*2|deuxieme cotisation/.test(k)) return 'qpp2';
    if (/cpp\s*2|rpc\s*2/.test(k)) return 'cpp2';
    if (/^ae\b|assurance-emploi|assurance emploi|^ei\b|employment insurance/.test(k)) return 'ei';
    if (/^rqap|assurance parentale|qpip/.test(k)) return 'qpip';
    if (/^cpp|^rpc|canada pension|regime de pensions du canada/.test(k)) return 'cpp';
    if (/^rrq|regime de rentes|qpp/.test(k)) return 'qpp';
    if (/^irf|^fit\b|federal/.test(k)) return 'fedTax';
    if (/^irp|^pit\b|provincial|quebec income/.test(k)) return 'qcTax';
    return 'otherTax';
  };
  const dedKind = (d) => {
    const k = key(d);
    if (/syndic|union due|cotisation syndicale/.test(k)) return 'union';
    if (/pension|retraite|rpp|rrsp|reer/.test(k) && !/\ber\b|employeur|employer/.test(k)) return /reer|rrsp/.test(k) ? 'rrsp' : 'pension';
    if (/med|dent|sante|health/.test(k) && /ass|group|insur|assur/.test(k)) return 'medDent';
    if (/ass\.? ?groupe|assurance|insurance|life|vie/.test(k)) return 'life';
    if (/humanitaire|humanity/.test(k)) return 'humanity';
    if (/solidarite|ftq|fondaction/.test(k)) return 'ftq';
    if (/virement|transfer|depot|deposit/.test(k)) return 'transfer';
    return 'other';
  };
  const empKind = (d) => {
    const k = key(d);
    if (/pension|retraite|rpp/.test(k)) return 'erPension';
    if (/prov\s*tb|\btb\b|avantage|taxable benefit|benefit/.test(k)) return /prov/.test(k) ? 'provTB' : (/fed/.test(k) ? 'fedTB' : 'bothTB');
    return 'erOther';
  };
  const TAX_RE = /^(ae|ei|irf|irp|rrq|rqap|qpp|qpip|cpp|rpc)\b|imp[oô]t sur le revenu|assurance-emploi|employment insurance|income tax/i;
  const TAXABLE_RE = /salaires\s+(assujettis|imposables)|taxable wages|subject wages|gross wages/i;

  function classifySections(parsed) {
    const res = { earnings: null, taxes: null, dedGroups: [], employer: null, taxable: null, absences: null };
    const titleSeen = {};
    for (const s of parsed.sections) {
      const roles = s.columns.map((c) => c.role);
      const descs = s.rows.map((r) => r.desc);
      const frac = (re) => (descs.length ? descs.filter((d) => re.test(d)).length / descs.length : 0);
      const tk = key(s.title);
      titleSeen[tk] = (titleSeen[tk] || 0) + 1;
      if (roles.includes('available') || roles.includes('accrued')) { res.absences = s; continue; }
      if (roles.includes('hours') && roles.includes('rate')) { res.earnings = s; continue; }
      if (frac(TAXABLE_RE) >= 0.5) { res.taxable = s; continue; }
      if (frac(TAX_RE) >= 0.5) { res.taxes = s; continue; }
      if (/employeur|employer/.test(tk) || titleSeen[tk] > 1 || descs.some((d) => /\bER\b|\bTB\b/.test(d))) { res.employer = s; continue; }
      res.dedGroups.push(s);
    }
    return res;
  }

  /* ---------- main ---------- */
  PD.analyze = function analyze(parsed, opts = {}) {
    const H = parsed.header || {};
    const sec = classifySections(parsed);
    const year = +(H.payDate || H.periodEnd || '').slice(0, 4) || null;
    const gov = PD.GOV[year] || null;
    const days = H.periodStart && H.periodEnd ? Math.round((Date.parse(H.periodEnd) - Date.parse(H.periodStart)) / 864e5) + 1 : 7;
    const P = days <= 7 ? 52 : days <= 14 ? 26 : days <= 16 ? 24 : 12;
    // the year may hold one more pay date than usual; Workday then divides by 53 (or 27): both are legitimate
    const inYear = PD.payDatesInYear(H.payDate, P === 52 ? 7 : P === 26 ? 14 : 0);
    const Ps = inYear && inYear > P ? [P, inYear] : [P];
    const ag = opts.agreement === false ? null : PD.findAgreement(H);
    const A = { meta: { ...H, P, Ps, days, year, rulesDate: H.payDate || H.periodEnd || null }, gov, agreement: ag, checks: [], notes: [] };
    const chk = (c) => A.checks.push(c);

    /* summary columns */
    const cols = (parsed.summary && parsed.summary.columns) || [];
    const findCol = (re) => cols.find((c) => re.test(key(c.label)));
    const grossCol = findCol(/brute|gross/) || cols[0];
    const netCol = findCol(/nette|net pay|^net/) || cols[cols.length - 1];
    const taxCol = cols.find((c) => /impot|tax/.test(key(c.label)) && !/deduction|retenue|revenu/.test(key(c.label)));
    const otherCols = cols.filter((c) => c !== grossCol && c !== netCol && c !== taxCol);
    A.summary = {
      gross: grossCol ? grossCol.current : null, grossYtd: grossCol ? grossCol.ytd : null,
      net: netCol ? netCol.current : null, netYtd: netCol ? netCol.ytd : null,
      taxes: taxCol ? taxCol.current : null, taxesYtd: taxCol ? taxCol.ytd : null,
      groups: otherCols.map((c) => ({ label: c.label, current: c.current, ytd: c.ytd })),
      columns: cols,
    };
    const S = A.summary;

    /* ---- earnings ---- */
    const er = sec.earnings ? sec.earnings.rows : [];
    A.earnings = er.map((r) => {
      const v = r.values;
      const cat = earnCat(r.desc);
      const codes = (r.desc.match(/\(([^)]*)\)\s*$/) || [])[1];
      const base = r.desc.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const truncated = /\([^)]*$|-$/.test(r.desc);
      const current = !!(v.amount || v.hours);
      const retro = !!(r.dates && H.periodStart && r.dates.to < H.periodStart);
      return {
        retro,
        desc: r.desc, base, codes: codes ? codes.split(/\s*,\s*/) : null, truncated, cat,
        mult: cat === 'overtime' ? otMult(r.desc) : null,
        dates: r.dates || null,
        hours: v.hours ?? null, rate: v.rate || null, amount: v.amount ?? null,
        ytdHours: v.ytdHours ?? null, ytd: v.ytd ?? null, current, notes: [],
      };
    });
    const curE = A.earnings.filter((e) => e.current);
    const HOUR_CATS = ['regular', 'overtime', 'vacation', 'holiday', 'sick', 'bereavement'];
    A.hoursPaid = sum(curE.filter((e) => HOUR_CATS.includes(e.cat)).map((e) => e.hours));
    A.hoursWorked = sum(curE.filter((e) => ['regular', 'overtime'].includes(e.cat)).map((e) => e.hours));
    A.hoursByCat = HOUR_CATS.map((c) => ({ cat: c, hours: sum(curE.filter((e) => e.cat === c).map((e) => e.hours)) })).filter((x) => x.hours > 0);
    A.earningsTotal = { current: sum(A.earnings.map((e) => e.amount)), ytd: sum(A.earnings.map((e) => e.ytd)) };
    // primary hourly rate = regular rate with the most hours this period
    const regs = curE.filter((e) => e.cat === 'regular' && e.rate);
    const byRate = {};
    regs.forEach((e) => (byRate[e.rate] = (byRate[e.rate] || 0) + (e.hours || 0)));
    A.mainRate = +Object.keys(byRate).sort((a, b) => byRate[b] - byRate[a])[0] || null;

    // YTD by category
    const cats = {};
    for (const e of A.earnings) {
      const c = ['evening', 'night', 'premium'].includes(e.cat) ? 'premiums' : ['award', 'misc', 'retro', 'vacationBank', 'other', 'bereavement'].includes(e.cat) ? 'other' : e.cat;
      cats[c] = cats[c] || { hours: 0, amount: 0, cur: 0 };
      if (c !== 'premiums') cats[c].hours = r2(cats[c].hours + (e.ytdHours || 0));
      cats[c].amount = r2(cats[c].amount + (e.ytd || 0));
      cats[c].cur = r2(cats[c].cur + (e.amount || 0));
    }
    A.ytdByCat = cats;

    /* ---- taxes ---- */
    A.taxes = (sec.taxes ? sec.taxes.rows : []).map((r) => ({ desc: r.desc, kind: taxKind(r.desc), amount: r.values.amount ?? null, ytd: r.values.ytd ?? null }));
    A.taxesTotal = { current: sum(A.taxes.map((t) => t.amount)), ytd: sum(A.taxes.map((t) => t.ytd)) };
    const tx = (k) => A.taxes.find((t) => t.kind === k);
    // Québec payslips carry QPP and QPIP; elsewhere CPP and a provincial tax line.
    const tkinds = new Set(A.taxes.map((t) => t.kind));
    A.province = tkinds.has('qpp') || tkinds.has('qpip') || A.taxes.some((t) => /\bqc\b|quebec/.test(key(t.desc))) ? 'QC' : A.taxes.length ? 'other' : null;
    if (A.province === 'other') A.taxes.forEach((t) => { if (t.kind === 'qcTax') t.kind = 'provTax'; });
    const INCOME_TAX = ['fedTax', 'qcTax', 'provTax'];

    /* ---- deductions ---- */
    A.dedGroups = sec.dedGroups.map((g) => {
      const rows = g.rows.map((r) => ({ desc: r.desc, kind: dedKind(r.desc), amount: r.values.amount ?? null, ytd: r.values.ytd ?? null }));
      const pre = rows.filter((x) => ['pension', 'union', 'rrsp'].includes(x.kind)).length;
      return { title: g.title, rows, total: g.total ? g.total.values : null, pretax: pre > 0 && pre >= rows.length / 2, sum: sum(rows.map((x) => x.amount)), sumYtd: sum(rows.map((x) => x.ytd)) };
    });
    A.deductions = A.dedGroups.flatMap((g) => g.rows.map((x) => ({ ...x, group: g.title })));
    const ded = (k) => A.deductions.filter((d) => d.kind === k);
    const dedSum = (k) => sum(ded(k).map((d) => d.amount));

    /* ---- employer ---- */
    A.employer = (sec.employer ? sec.employer.rows : []).map((r) => ({ desc: r.desc, kind: empKind(r.desc), amount: r.values.amount ?? null, ytd: r.values.ytd ?? null }));
    const emp = (k) => A.employer.filter((e) => e.kind === k);

    /* ---- taxable wages ---- */
    const tw = {};
    for (const r of sec.taxable ? sec.taxable.rows : []) {
      const k = key(r.desc);
      const jur = /irf|federal/.test(k) ? 'fed' : /irp|provinc|quebec/.test(k) ? 'prov' : null;
      const typ = /assujetti|subject|gross/.test(k) ? 'subject' : /imposable|taxable/.test(k) ? 'taxable' : null;
      if (jur && typ) tw[jur + typ[0].toUpperCase() + typ.slice(1)] = { cur: r.values.amount ?? null, ytd: r.values.ytd ?? null, desc: r.desc };
    }
    A.taxableWages = tw;

    /* ---- other blocks ---- */
    A.absences = (sec.absences ? sec.absences.rows : []).map((r) => ({ desc: r.desc, ...r.values }));
    A.vacation = parsed.vacation || [];
    A.withholding = parsed.withholding || [];
    A.payments = parsed.payments || [];
    const claim = (re) => { const w = A.withholding.find((x) => re.test(key(x.label))); return w || null; };
    const claimRow = claim(/montant total|total claim|claim amount/);
    A.claims = { fed: claimRow ? claimRow.federal : null, prov: claimRow ? claimRow.provincial : null };
    const extraRow = claim(/supplementaire|additional/);
    A.extraTax = { fed: extraRow ? extraRow.federal || 0 : 0, prov: extraRow ? extraRow.provincial || 0 : 0 };
    const nonZeroOther = A.withholding.filter((w) => w !== claimRow && w !== extraRow && ((w.federal || 0) !== 0 || (w.provincial || 0) !== 0));

    /* ---- money split (where the gross went) ---- */
    const incomeTax = sum(A.taxes.filter((t) => INCOME_TAX.includes(t.kind)).map((t) => t.amount));
    const govPlans = sum(A.taxes.filter((t) => !INCOME_TAX.includes(t.kind)).map((t) => t.amount));
    const pensionUnion = sum(A.deductions.filter((d) => ['pension', 'union', 'rrsp', 'ftq'].includes(d.kind)).map((d) => d.amount));
    const benefitsOther = sum(A.deductions.filter((d) => !['pension', 'union', 'rrsp', 'ftq'].includes(d.kind)).map((d) => d.amount));
    A.split = [
      { id: 'net', amount: S.net },
      { id: 'incomeTax', amount: incomeTax },
      { id: 'gov', amount: govPlans },
      { id: 'pensionUnion', amount: pensionUnion },
      { id: 'benefitsOther', amount: benefitsOther },
    ];
    const ytdIncomeTax = sum(A.taxes.filter((t) => INCOME_TAX.includes(t.kind)).map((t) => t.ytd));
    A.splitYtd = [
      { id: 'net', amount: S.netYtd },
      { id: 'incomeTax', amount: ytdIncomeTax },
      { id: 'gov', amount: r2(A.taxesTotal.ytd - ytdIncomeTax) },
      { id: 'pensionUnion', amount: sum(A.deductions.filter((d) => ['pension', 'union', 'rrsp', 'ftq'].includes(d.kind)).map((d) => d.ytd)) },
      { id: 'benefitsOther', amount: sum(A.deductions.filter((d) => !['pension', 'union', 'rrsp', 'ftq'].includes(d.kind)).map((d) => d.ytd)) },
    ];

    /* ---- ledger: every dollar from gross to net ---- */
    const order = ['fedTax', 'qcTax', 'provTax', 'qpp', 'qpp2', 'cpp', 'cpp2', 'ei', 'qpip', 'otherTax'];
    PD.TAX_ORDER = order;
    const dOrder = ['pension', 'rrsp', 'union', 'life', 'medDent', 'humanity', 'ftq', 'transfer', 'other'];
    const ledgerItems = [
      ...A.taxes.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map((t) => ({ type: 'tax', kind: t.kind, desc: t.desc, amount: t.amount })),
      ...A.deductions.slice().sort((a, b) => dOrder.indexOf(a.kind) - dOrder.indexOf(b.kind)).map((d) => ({ type: 'ded', kind: d.kind, desc: d.desc, amount: d.amount })),
    ].filter((x) => x.amount);
    let run = S.gross || 0;
    A.ledger = ledgerItems.map((x) => { run = r2(run - x.amount); return { ...x, after: run }; });

    /* ---- the codes in parentheses: one line per set of Workday worktag values ---- */
    const codeKey = (e) => (e.codes ? e.codes.join(', ') : null);
    const codeMap = {};
    for (const e of A.earnings) {
      const k = codeKey(e);
      if (!k) continue;
      const c = (codeMap[k] = codeMap[k] || { code: k, parts: e.codes, cats: new Set(), curHours: 0, curAmount: 0, ytdHours: 0, ytdAmount: 0, regHours: 0, regAmount: 0, rates: new Set(), hits: [] });
      c.cats.add(e.cat);
      c.curHours = r2(c.curHours + (e.hours || 0));
      c.curAmount = r2(c.curAmount + (e.amount || 0));
      c.ytdHours = r2(c.ytdHours + (e.ytdHours || 0));
      c.ytdAmount = r2(c.ytdAmount + (e.ytd || 0));
      if (e.cat === 'regular') { c.regHours = r2(c.regHours + (e.ytdHours || 0)); c.regAmount = r2(c.regAmount + (e.ytd || 0)); }
      if (e.current && e.rate && e.cat === 'regular') c.rates.add(e.rate);
    }
    A.codes = Object.values(codeMap).map((c) => ({
      ...c, cats: [...c.cats], rates: [...c.rates], current: c.curHours > 0 || c.curAmount !== 0,
      avgRegRate: c.regHours ? r2(c.regAmount / c.regHours) : null,
    })).sort((a, b) => (b.current - a.current) || (b.ytdHours - a.ytdHours));
    const groupsBySecond = {};
    A.codes.forEach((c) => { const g = c.parts[c.parts.length - 1]; groupsBySecond[g] = groupsBySecond[g] || { code: g, ytdHours: 0, current: false, members: [] }; groupsBySecond[g].ytdHours = r2(groupsBySecond[g].ytdHours + c.ytdHours); groupsBySecond[g].current = groupsBySecond[g].current || c.current; groupsBySecond[g].members.push(c.code); });
    A.codeGroups = Object.values(groupsBySecond).sort((a, b) => (b.current - a.current) || (b.ytdHours - a.ytdHours));
    // Paid holidays come in date order, so their split across codes dates a change of code.
    A.codeTimeline = null;
    if (ag && year && H.periodEnd) {
      const holi = {};
      A.earnings.filter((e) => e.cat === 'holiday' && e.codes && e.ytdHours > 0).forEach((e) => { const k = codeKey(e); holi[k] = (holi[k] || 0) + e.ytdHours; });
      const keys = Object.keys(holi);
      const dates = PD.holidayDates(year, ag.holidayIds).filter((d, i, arr) => d <= H.periodEnd && arr.indexOf(d) === i);
      const totalDays = keys.reduce((s2, k) => s2 + holi[k], 0) / 8;
      if (keys.length === 2 && Number.isInteger(totalDays) && totalDays === dates.length) {
        const curKeys = new Set(A.codes.filter((c) => c.current).map((c) => c.code));
        const later = keys.find((k) => curKeys.has(k));
        const earlier = keys.find((k) => k !== later);
        if (later && earlier && Number.isInteger(holi[earlier] / 8)) {
          const n = holi[earlier] / 8;
          A.codeTimeline = { from: earlier, to: later, nFrom: n, nTo: dates.length - n, lastFrom: dates[n - 1], firstTo: dates[n] };
        }
      }
    }

    /* ---- year-end tax slips so far (T4 / RL-1 boxes), from year-to-date amounts ---- */
    const ysum = (arr) => sum(arr.map((x) => x.ytd));
    const tY = (k) => ysum(A.taxes.filter((t) => t.kind === k));
    const dY = (k) => ysum(A.deductions.filter((d) => d.kind === k));
    const eY = (k) => ysum(A.employer.filter((e) => e.kind === k));
    const capped = (v, cap) => (v == null ? null : cap ? Math.min(v, cap) : v);
    const fedSubjY = tw.fedSubject ? tw.fedSubject.ytd : S.grossYtd;
    const provSubjY = tw.provSubject ? tw.provSubject.ytd : S.grossYtd;
    A.slips = {
      t4: [
        ['14', 'empIncome', fedSubjY], ['17', 'qpp', tY('qpp')], ['17A', 'qpp2', tY('qpp2')], ['18', 'ei', tY('ei')],
        ['20', 'rpp', dY('pension')], ['22', 'fedTax', tY('fedTax')], ['24', 'eiInsurable', capped(S.grossYtd, gov && gov.ei && gov.ei.mie)],
        ['26', 'qppPensionable', capped(provSubjY, gov && gov.qpp && gov.qpp.mga)], ['44', 'union', dY('union')], ['46', 'donations', dY('humanity')],
        ['52', 'pa', Math.round(dY('pension') + eY('erPension'))], ['55', 'qpip', tY('qpip')], ['56', 'qpipInsurable', capped(S.grossYtd, gov && gov.qpip && gov.qpip.mie)],
        ['85', 'healthPremiums', dY('medDent')],
      ].filter(([, , v]) => v),
      rl1: [
        ['A', 'empIncome', provSubjY], ['B', 'qpp', tY('qpp')], ['B.A', 'qpp2', tY('qpp2')], ['C', 'ei', tY('ei')], ['D', 'rpp', dY('pension')],
        ['E', 'qcTax', tY('qcTax')], ['F', 'union', dY('union')], ['G', 'qppPensionable', capped(provSubjY, gov && gov.qpp && gov.qpp.mga)],
        ['H', 'qpip', tY('qpip')], ['I', 'qpipInsurable', capped(S.grossYtd, gov && gov.qpip && gov.qpip.mie)], ['J', 'employerHealth', eY('provTB')],
        ['N', 'donations', dY('humanity')], ['235', 'healthPremiums', dY('medDent')],
      ].filter(([, , v]) => v),
    };

    /* ============ CHECKS ============ */
    const near = (a, b, tol = 0.011) => a != null && b != null && Math.abs(a - b) <= tol;
    const fmt = (L, v) => L.money(v);

    // --- math ---
    if (S.gross != null) {
      chk({ group: 'math', id: 'earnSum', status: near(A.earningsTotal.current, S.gross) ? 'ok' : 'warn',
        title: T('Earnings lines add up to gross pay', 'Les lignes de gains totalisent la paie brute'),
        detail: (L) => L.lang === 'fr' ? `Somme des lignes : ${fmt(L, A.earningsTotal.current)}; paie brute : ${fmt(L, S.gross)}` : `Sum of lines: ${fmt(L, A.earningsTotal.current)}; gross pay: ${fmt(L, S.gross)}` });
    }
    if (S.taxes != null) chk({ group: 'math', id: 'taxSum', status: near(A.taxesTotal.current, S.taxes) ? 'ok' : 'warn',
      title: T('Tax lines add up to the taxes total', 'Les lignes d’impôt totalisent le montant des impôts'),
      detail: (L) => `${fmt(L, A.taxesTotal.current)} = ${fmt(L, S.taxes)}` });
    A.dedGroups.forEach((g, i) => {
      const col = S.groups.find((c) => key(c.label) === key(g.title)) || S.groups[i];
      if (!col) return;
      chk({ group: 'math', id: 'dedSum' + i, status: near(g.sum, col.current) ? 'ok' : 'warn',
        title: (L) => (L.lang === 'fr' ? `« ${g.title} » totalise ${fmt(L, col.current)}` : `“${g.title}” lines add up to ${fmt(L, col.current)}`),
        detail: (L) => g.rows.filter((x) => x.amount).map((x) => fmt(L, x.amount)).join(' + ') + ` = ${fmt(L, g.sum)}` });
    });
    if (S.gross != null && S.net != null) {
      const calcNet = r2(S.gross - (S.taxes || 0) - sum(S.groups.map((g) => g.current)));
      chk({ group: 'math', id: 'netCalc', status: near(calcNet, S.net) ? 'ok' : 'warn',
        title: T('Gross minus everything withheld equals net pay', 'Le brut moins tout ce qui est retenu donne la paie nette'),
        detail: (L) => `${fmt(L, S.gross)} − ${fmt(L, S.taxes)} − ${S.groups.map((g) => fmt(L, g.current)).join(' − ')} = ${fmt(L, calcNet)}` });
      const calcNetY = r2((S.grossYtd || 0) - (S.taxesYtd || 0) - sum(S.groups.map((g) => g.ytd)));
      // every section's year-to-date lines must also add up to that section's year-to-date total
      const ytdOff = [];
      if (S.grossYtd != null && !near(A.earningsTotal.ytd, S.grossYtd, 0.02)) ytdOff.push([sec.earnings && sec.earnings.title, A.earningsTotal.ytd, S.grossYtd]);
      if (S.taxesYtd != null && !near(A.taxesTotal.ytd, S.taxesYtd, 0.02)) ytdOff.push([sec.taxes && sec.taxes.title, A.taxesTotal.ytd, S.taxesYtd]);
      A.dedGroups.forEach((g, i) => {
        const col = S.groups.find((c) => key(c.label) === key(g.title)) || S.groups[i];
        if (col && col.ytd != null && !near(g.sumYtd, col.ytd, 0.02)) ytdOff.push([g.title, g.sumYtd, col.ytd]);
      });
      chk({ group: 'math', id: 'netYtd', status: near(calcNetY, S.netYtd, 0.02) && !ytdOff.length ? 'ok' : 'warn',
        title: T('Year-to-date totals are consistent', 'Les cumuls annuels sont cohérents'),
        detail: (L) => (L.lang === 'fr' ? `Brut cumulé ${fmt(L, S.grossYtd)} − retenues = net cumulé ${fmt(L, calcNetY)}` : `YTD gross ${fmt(L, S.grossYtd)} − withholdings = YTD net ${fmt(L, calcNetY)}`)
          + (near(calcNetY, S.netYtd, 0.02) ? '' : L.lang === 'fr' ? `; le talon indique ${fmt(L, S.netYtd)}` : `; the payslip shows ${fmt(L, S.netYtd)}`)
          + ytdOff.map(([t, a, b]) => (L.lang === 'fr' ? `. Les cumuls des lignes « ${t || '?'} » font ${fmt(L, a)}, mais le total cumulé est de ${fmt(L, b)}` : `. The year-to-date lines of “${t || '?'}” add up to ${fmt(L, a)}, but the year-to-date total is ${fmt(L, b)}`)).join('') });
    }
    if (A.payments.length && S.net != null) {
      const dep = sum(A.payments.map((p) => p.amount));
      chk({ group: 'math', id: 'deposit', status: near(dep, S.net) ? 'ok' : 'warn',
        title: T('Net pay matches the bank deposit', 'La paie nette correspond au dépôt bancaire'),
        detail: (L) => `${A.payments.map((p) => `${p.bank} ${fmt(L, p.amount)}`).join(', ')}` });
    }
    const priced = curE.filter((e) => e.hours && e.rate && e.cat !== 'unpaid');
    const lineBad = priced.filter((e) => e.amount != null && !near(r2(e.hours * e.rate), e.amount, 0.011));
    const lineCount = priced.length;
    if (lineCount) chk({ group: 'math', id: 'lineMath', status: lineBad.length ? 'warn' : 'ok',
      title: (L) => (L.lang === 'fr' ? `Heures × taux = montant (${lineCount} ligne${lineCount > 1 ? 's' : ''})` : `Hours × rate = amount (${lineCount} line${lineCount > 1 ? 's' : ''})`),
      detail: (L) => lineBad.length ? lineBad.map((e) => `${e.desc}: ${L.num(e.hours)} × ${L.money(e.rate)} ≠ ${L.money(e.amount)}`).join('; ')
        : (L.lang === 'fr' ? 'Chaque ligne de cette paie se recalcule exactement.' : 'Every line on this pay recalculates exactly.') });

    // --- government plans ---
    A.govChecks = {};
    const pens = tw.provSubject ? tw.provSubject.cur : S.gross;
    if (gov && S.gross != null && A.province === 'QC') {
      const prevYtd = (t) => (t ? r2((t.ytd || 0) - (t.amount || 0)) : 0);
      // QPP
      const q = tx('qpp');
      if (q && gov.qpp) {
        const qppFor = (n) => r2(Math.min(Math.max(0, pens - gov.qpp.exempt / n) * gov.qpp.rate, Math.max(0, gov.qpp.max - prevYtd(q))));
        const n = Ps.reduce((b, c) => (Math.abs(qppFor(c) - q.amount) < Math.abs(qppFor(b) - q.amount) ? c : b), P);
        const exp = qppFor(n);
        A.meta.Pyear = n;
        A.govChecks.qpp = { expected: exp, max: gov.qpp.max, pays: n };
        const ex = (L) => (n !== P ? (L.lang === 'fr' ? ` (${L.money(gov.qpp.exempt)} ÷ ${n} paies en ${year})` : ` (${L.money(gov.qpp.exempt)} ÷ ${n} pays in ${year})`) : '');
        chk({ group: 'gov', id: 'qpp', status: near(exp, q.amount, 0.02) ? 'ok' : 'warn',
          title: T(`QPP contribution matches the ${year} formula`, `La cotisation au RRQ correspond à la formule ${year}`),
          detail: (L) => L.lang === 'fr'
            ? `(${fmt(L, pens)} − exemption ${fmt(L, gov.qpp.exempt / n)}${ex(L)}) × ${L.pct(gov.qpp.rate * 100, 2)} = ${fmt(L, exp)}; Workday : ${fmt(L, q.amount)}`
            : `(${fmt(L, pens)} − ${fmt(L, gov.qpp.exempt / n)} exemption${ex(L)}) × ${L.pct(gov.qpp.rate * 100, 2)} = ${fmt(L, exp)}; Workday: ${fmt(L, q.amount)}` });
      }
      // EI
      const e = tx('ei');
      if (e && gov.ei) {
        const exp = r2(Math.min(S.gross * gov.ei.rate, Math.max(0, gov.ei.max - prevYtd(e))));
        const expYtd = r2(Math.min((S.grossYtd || 0) * gov.ei.rate, gov.ei.max));
        // Workday rounds on the year-to-date total, so a few cents' catch-up is fine when the year's total is right
        const d = Math.abs(exp - e.amount);
        const ytdFits = near(r2(expYtd - prevYtd(e)), e.amount, 0.011);
        A.govChecks.ei = { expected: exp, max: gov.ei.max };
        chk({ group: 'gov', id: 'ei', status: d <= 0.02 ? 'ok' : ytdFits && d <= 0.05 ? 'okish' : 'warn',
          title: T(`EI premium matches the ${year} Québec rate (${(gov.ei.rate * 100).toFixed(2)}%)`, `La cotisation d’AE correspond au taux québécois ${year} (${(gov.ei.rate * 100).toFixed(2).replace('.', ',')} %)`),
          detail: (L) => L.lang === 'fr'
            ? `${L.pct(gov.ei.rate * 100, 2)} × ${fmt(L, S.gross)} = ${fmt(L, exp)}; Workday : ${fmt(L, e.amount)}. Workday calcule sur le cumul annuel (${L.pct(gov.ei.rate * 100, 2)} × ${fmt(L, S.grossYtd)} = ${fmt(L, expYtd)}), d’où un écart possible de quelques cents.`
            : `${L.pct(gov.ei.rate * 100, 2)} × ${fmt(L, S.gross)} = ${fmt(L, exp)}; Workday: ${fmt(L, e.amount)}. Workday rounds on the year-to-date total (${L.pct(gov.ei.rate * 100, 2)} × ${fmt(L, S.grossYtd)} = ${fmt(L, expYtd)}), so a difference of a few cents is normal.` });
      }
      // QPIP
      const qp = tx('qpip');
      if (qp && gov.qpip) {
        const exp = r2(Math.min(S.gross * gov.qpip.rate, Math.max(0, gov.qpip.max - prevYtd(qp))));
        A.govChecks.qpip = { expected: exp, max: gov.qpip.max };
        chk({ group: 'gov', id: 'qpip', status: near(exp, qp.amount, 0.02) ? 'ok' : 'warn',
          title: T(`QPIP premium matches the ${year} rate (${(gov.qpip.rate * 100).toFixed(3)}%)`, `La cotisation au RQAP correspond au taux ${year} (${(gov.qpip.rate * 100).toFixed(3).replace('.', ',')} %)`),
          detail: (L) => `${L.pct(gov.qpip.rate * 100, 3)} × ${fmt(L, S.gross)} = ${fmt(L, exp)}; Workday${L.lang === 'fr' ? ' :' : ':'} ${fmt(L, qp.amount)}` });
      }
      // QPP2: 4% on pensionable pay between the first and second ceilings, once the year-to-date total passes the first.
      const q2 = tx('qpp2');
      if (q2 && gov.qpp && gov.qpp.rate2) {
        const ytdP = tw.provSubject ? tw.provSubject.ytd : S.grossYtd;
        const prevP = r2((ytdP || 0) - pens);
        const band = Math.max(0, Math.min(ytdP || 0, gov.qpp.mga2) - Math.max(prevP, gov.qpp.mga));
        const exp = r2(Math.min(band * gov.qpp.rate2, Math.max(0, gov.qpp.max2 - prevYtd(q2))));
        A.govChecks.qpp2 = { expected: exp, max: gov.qpp.max2 };
        chk({ group: 'gov', id: 'qpp2', status: near(exp, q2.amount, 0.05) ? 'ok' : 'info',
          title: T(`Second QPP contribution (QPP2) matches the ${year} formula`, `La deuxième cotisation au RRQ (RRQ2) correspond à la formule ${year}`),
          detail: (L) => L.lang === 'fr'
            ? `4 % de la paie admissible entre ${fmt(L, gov.qpp.mga)} et ${fmt(L, gov.qpp.mga2)} dans l’année : ${fmt(L, exp)}; Workday : ${fmt(L, q2.amount)}`
            : `4% of pensionable pay between ${fmt(L, gov.qpp.mga)} and ${fmt(L, gov.qpp.mga2)} in the year: ${fmt(L, exp)}; Workday: ${fmt(L, q2.amount)}` });
      }

      // Taxable wages reconciliation
      const qppAmt = q ? q.amount : 0;
      const q2Amt = q2 ? q2.amount || 0 : 0;
      // the deductible part of QPP needs that year's rates; without them the taxable wages aren't explained
      const enhDed = gov.qpp ? r2(qppAmt * (gov.qpp.enh / gov.qpp.rate)) : null;
      const pensionEE = dedSum('pension') + dedSum('rrsp');
      const union = dedSum('union');
      const provTB = sum(emp('provTB').concat(emp('bothTB')).map((x) => x.amount));
      const fedTB = sum(emp('fedTB').concat(emp('bothTB')).map((x) => x.amount));
      A.recon = enhDed == null ? null : {
        fed: { steps: [['gross', S.gross], ['tb', fedTB], ['pension', -pensionEE], ['union', -union], ['qppEnh', -enhDed], ['qpp2', -q2Amt]].filter(([, v]) => v), result: r2(S.gross + fedTB - pensionEE - union - enhDed - q2Amt), workday: tw.fedTaxable ? tw.fedTaxable.cur : null, subject: tw.fedSubject ? tw.fedSubject.cur : null },
        prov: { steps: [['gross', S.gross], ['tb', provTB], ['pension', -pensionEE], ['qppEnh', -enhDed], ['qpp2', -q2Amt]].filter(([, v]) => v), result: r2(S.gross + provTB - pensionEE - enhDed - q2Amt), workday: tw.provTaxable ? tw.provTaxable.cur : null, subject: tw.provSubject ? tw.provSubject.cur : null },
        enhDed,
      };
      for (const j of A.recon ? ['fed', 'prov'] : []) {
        const R = A.recon[j];
        if (R.workday == null) continue;
        chk({ group: 'gov', id: 'taxable-' + j, status: near(R.result, R.workday, 0.02) ? 'ok' : 'warn',
          title: j === 'fed' ? T('Federal taxable wages are explained line by line', 'Le salaire imposable fédéral s’explique ligne par ligne') : T('Québec taxable wages are explained line by line', 'Le salaire imposable du Québec s’explique ligne par ligne'),
          detail: (L) => (L.lang === 'fr' ? `Recalculé : ${fmt(L, R.result)}; Workday : ${fmt(L, R.workday)}` : `Recalculated: ${fmt(L, R.result)}; Workday: ${fmt(L, R.workday)}`) });
      }

      // Income tax estimates (T4127 / TP-1015.F style annualization)
      const fedT = tx('fedTax');
      const F = edition(gov.fed, H.payDate);
      // the number of pays QPP was worked out with, or whichever of the year's possible counts fits best
      const maxed = (t, max) => !!t && (t.ytd || 0) >= max - 0.01;
      const best = (f, amt) => (A.meta.Pyear ? A.meta.Pyear : Ps.reduce((b, c) => (Math.abs(f(c) - amt) < Math.abs(f(b) - amt) ? c : b), P));
      if (F && fedT && tw.fedTaxable && A.claims.fed != null && gov.qpp && gov.ei && gov.qpip) { // the credits need all three plans
        const fedFor = (n) => {
          const Aann = n * tw.fedTaxable.cur;
          const basic = progressive(Aann, F.th, F.rates);
          const K1 = F.low * A.claims.fed;
          // once a yearly maximum is reached (even during this pay), the CRA formula uses the maximum for the rest of the year
          const qppBaseMax = (gov.qpp.mga - gov.qpp.exempt) * gov.qpp.base;
          const qppBase = maxed(q, gov.qpp.max) ? qppBaseMax : Math.min(n * qppAmt * (gov.qpp.base / gov.qpp.rate), qppBaseMax);
          const eiC = maxed(e, gov.ei.max) ? gov.ei.max : Math.min(n * (e ? e.amount : 0), gov.ei.max);
          const qpC = maxed(qp, gov.qpip.max) ? gov.qpip.max : Math.min(n * (qp ? qp.amount : 0), gov.qpip.max);
          const K2 = F.low * (qppBase + eiC + qpC);
          const K4 = F.low * Math.min(Aann, F.cea);
          const T3 = Math.max(0, basic - K1 - K2 - K4);
          return r2((T3 * (1 - F.abatement)) / n + (A.extraTax.fed || 0));
        };
        const n = best(fedFor, fedT.amount);
        const Aann = n * tw.fedTaxable.cur;
        const est = fedFor(n);
        const diff = r2(fedT.amount - est);
        A.govChecks.fedTax = { expected: est, annualTaxable: Aann, pays: n, low: F.low };
        const ed = (L) => (Array.isArray(gov.fed) ? (L.lang === 'fr' ? `, taux le plus bas ${L.pct(F.low * 100, 0)} à cette date` : `, lowest rate ${L.pct(F.low * 100, 0)} on this date`) : '');
        chk({ group: 'gov', id: 'fedTax', status: Math.abs(diff) <= 0.005 ? 'ok' : Math.abs(diff) <= 1 ? 'okish' : 'info',
          title: T(`Federal income tax matches the CRA formula for ${year}`, `L’impôt fédéral correspond à la formule ${year} de l’ARC`),
          detail: (L) => L.lang === 'fr'
            ? `Revenu annualisé ${fmt(L, Aann)} (${n} paies), montant personnel ${fmt(L, A.claims.fed)}, crédits RRQ/AE/RQAP, montant canadien pour emploi, abattement du Québec de 16,5 %${ed(L)} → ${fmt(L, est)} par paie; Workday : ${fmt(L, fedT.amount)}`
            : `Annualized ${fmt(L, Aann)} (${n} pays), claim ${fmt(L, A.claims.fed)}, QPP/EI/QPIP credits, Canada employment amount, 16.5% Québec abatement${ed(L)} → ${fmt(L, est)} per pay; Workday: ${fmt(L, fedT.amount)}` });
      }
      const qcT = tx('qcTax');
      const Q = edition(gov.qc, H.payDate);
      if (Q && qcT && tw.provTaxable && A.claims.prov != null) {
        const qcFor = (n) => {
          const subjAnn = n * (tw.provSubject ? tw.provSubject.cur : tw.provTaxable.cur);
          const Y = n * tw.provTaxable.cur - Math.min(Q.workerRate * subjAnn, Q.workerMax);
          return r2(Math.max(0, rqTax(Y, Q.th, Q.rates) - Q.low * A.claims.prov) / n + (A.extraTax.prov || 0));
        };
        const P = best(qcFor, qcT.amount);
        const subjAnn = P * (tw.provSubject ? tw.provSubject.cur : tw.provTaxable.cur);
        const Y = P * tw.provTaxable.cur - Math.min(Q.workerRate * subjAnn, Q.workerMax);
        const est = qcFor(P);
        const diff = r2(qcT.amount - est);
        A.govChecks.qcTax = { expected: est, annualTaxable: Y };
        chk({ group: 'gov', id: 'qcTax', status: Math.abs(diff) <= 0.005 ? 'ok' : Math.abs(diff) <= 1 ? 'okish' : 'info',
          title: T(`Québec income tax matches the Revenu Québec formula for ${year}`, `L’impôt du Québec correspond à la formule ${year} de Revenu Québec`),
          detail: (L) => L.lang === 'fr'
            ? `Revenu annualisé ${fmt(L, P * tw.provTaxable.cur)} (${P} paies) − déduction pour travailleur, montant personnel ${fmt(L, A.claims.prov)} → ${fmt(L, est)} par paie; Workday : ${fmt(L, qcT.amount)}`
            : `Annualized ${fmt(L, P * tw.provTaxable.cur)} (${P} pays) − worker deduction, claim ${fmt(L, A.claims.prov)} → ${fmt(L, est)} per pay; Workday: ${fmt(L, qcT.amount)}` });
      }
      if (nonZeroOther.length) A.notes.push('withholding-adjustments');
      // a year added before all its figures were published (or a part not estimated): say which checks are skipped
      const missing = [['qpp', !gov.qpp && q], ['qpip', !gov.qpip && qp], ['ei', !gov.ei && e], ['fedTax', !F && fedT], ['qcTax', !Q && qcT]].filter(([, x]) => x).map(([k]) => k);
      if (missing.length) chk({ group: 'gov', id: 'partParams', status: 'info',
        title: (L) => (L.lang === 'fr' ? `Certains chiffres gouvernementaux de ${year} ne sont pas inclus` : `Some ${year} government figures aren’t included`),
        detail: (L) => (L.lang === 'fr' ? `Non vérifié pour cette date de paie : ${missing.map((k) => L.kind(k)).join(', ')}. Les autres vérifications s’appliquent.` : `Not checked for this pay date: ${missing.map((k) => L.kind(k)).join(', ')}. The other checks still run.`) });
      // TD1 claims
      if (A.claims.fed != null && F) A.claimInfo = { fedIsBasic: near(A.claims.fed, F.bpa, 0.5), provIsBasic: near(A.claims.prov, Q ? Q.bpa : -1, 0.5) };
    } else if (A.province === 'other') {
      chk({ group: 'gov', id: 'notQc', status: 'info',
        title: T('Government checks are for Québec payslips', 'Les vérifications gouvernementales visent les talons du Québec'),
        detail: T('This payslip has CPP instead of QPP and QPIP, so it’s from outside Québec. Contribution and tax checks are skipped; the arithmetic checks still run.', 'Ce talon contient le RPC plutôt que le RRQ et le RQAP : il vient de l’extérieur du Québec. Les vérifications des cotisations et de l’impôt sont sautées; les vérifications arithmétiques s’appliquent.') });
    } else if (!gov) {
      chk({ group: 'gov', id: 'noParams', status: 'info',
        title: (L) => (L.lang === 'fr' ? `Paramètres gouvernementaux ${year || ''} non inclus` : `Government parameters for ${year || 'this year'} aren’t included`),
        detail: T('Contribution and tax checks are skipped for this pay date. Math checks still run.', 'Les vérifications des cotisations et de l’impôt sont sautées pour cette date de paie. Les vérifications arithmétiques s’appliquent.') });
    }

    /* ---- annual maximum progress ---- */
    A.taxes.forEach((t) => {
      if (!gov) return;
      const m = { qpp: gov.qpp && gov.qpp.max, qpp2: gov.qpp && gov.qpp.max2, ei: gov.ei && gov.ei.max, qpip: gov.qpip && gov.qpip.max }[t.kind];
      if (m) { t.annualMax = m; t.maxPct = Math.min(1, (t.ytd || 0) / m); t.maxReached = (t.ytd || 0) >= m - 0.01; }
      t.pctOfGross = S.gross ? (t.amount || 0) / S.gross : null;
      t.expected = A.govChecks && A.govChecks[t.kind] ? A.govChecks[t.kind].expected : null;
    });
    /* when each yearly maximum will be reached at this pace */
    A.projections = {};
    if (gov && H.payDate && A.province === 'QC') {
      A.taxes.forEach((t) => {
        if (!t.annualMax) return;
        if (t.maxReached) { A.projections[t.kind] = { reached: true, thisPay: (t.amount || 0) > 0, perPay: t.amount }; return; }
        if (!t.amount || t.amount <= 0) return;
        const remaining = r2(t.annualMax - (t.ytd || 0));
        const n = Math.ceil(remaining / t.amount - 1e-9);
        const iso = new Date(Date.parse(H.payDate + 'T12:00:00Z') + n * days * 864e5).toISOString().slice(0, 10);
        A.projections[t.kind] = { n, date: iso, thisYear: iso.slice(0, 4) === String(year), perPay: t.amount, remaining };
      });
    }

    /* ============ AGREEMENT ============ */
    if (ag) {
      const date = H.periodStart || H.payDate;
      const sc = PD.scaleFor(ag, date);
      A.meta.scaleFrom = sc ? sc.from : null;
      // a pay period older than every scale in the pack: say so instead of calling the rate wrong
      const first = ag.scales && ag.scales.length ? ag.scales[0].from : null;
      if (!sc && first) {
        chk({ group: 'agreement', id: 'scaleMissing', status: 'info',
          title: T('The wage scale for this date isn’t included', 'L’échelle salariale de cette date n’est pas incluse'),
          detail: (L) => (L.lang === 'fr' ? `Les échelles incluses commencent le ${L.date(first)}. Les taux horaires de cette paie ne sont pas comparés.` : `The scales included start on ${L.date(first)}. The hourly rates on this pay aren’t compared.`) });
      }
      A.rateMatches = [];
      const seen = new Set();
      for (const ed of curE) {
        if (!ed.rate) continue;
        if (sc && (ed.cat === 'regular' || ed.cat === 'overtime')) {
          const base = ed.cat === 'overtime' ? r2(ed.rate / (ed.mult || 1.5)) : ed.rate;
          // a line carries its own dates (back pay, a raise in the middle of a period): either end's scale is right
          const d1 = (ed.dates && ed.dates.from) || date, d2 = (ed.dates && ed.dates.to) || H.periodEnd || date;
          let lk = PD.lookupRate(ag, d1, base);
          if (!(lk && lk.hits[0]) && d2 !== d1) { const lk2 = PD.lookupRate(ag, d2, base); if (lk2 && lk2.hits[0]) lk = lk2; }
          if (!lk) continue; // older than every scale: the notice above covers it
          const hit = lk.hits[0];
          const used = lk.scale;
          ed.scaleHit = hit || null;
          if (seen.has(base + '|' + used.from)) continue;
          seen.add(base + '|' + used.from);
          const back = !hit && ed.retro;
          A.rateMatches.push({ rate: base, hit, hours: sum(curE.filter((x) => x.rate === ed.rate).map((x) => x.hours)) });
          chk({ group: 'agreement', id: 'rate-' + base, status: hit ? 'ok' : back ? 'info' : 'warn',
            title: (L) => hit
              ? (L.lang === 'fr' ? `${L.money(base)}/h = classe ${hit.cls}, niveau ${hit.level}${hit.premium ? ' + prime ' + L.money(hit.premium.amount) : ''}` : `${L.money(base)}/h = class ${hit.cls}, level ${hit.level}${hit.premium ? ' + ' + L.money(hit.premium.amount) + ' premium' : ''}`)
              : (L.lang === 'fr' ? `${L.money(base)}/h ne figure pas dans l’échelle` : `${L.money(base)}/h isn’t on the wage scale`),
            detail: (L) => {
              const from = L.date(used.from);
              if (back) return L.lang === 'fr' ? `Cette ligne vise une période antérieure (${L.date(ed.dates.from)} au ${L.date(ed.dates.to)}) : c’est sans doute un rajustement rétroactif plutôt qu’un taux horaire.` : `This line is for an earlier period (${L.date(ed.dates.from)} to ${L.date(ed.dates.to)}), so it is probably a back-pay adjustment rather than an hourly rate.`;
              if (!hit) return PD.agText(ag, L.lang, 'rateMiss', { from });
              const isMain = base === A.mainRate;
              const extra = !isMain && A.mainRate && base > A.mainRate ? PD.agText(ag, L.lang, 'rateHigher', { main: L.money(A.mainRate) }) : '';
              return PD.agText(ag, L.lang, 'rateHit', { from, raise: L.num(used.raise) }) + extra;
            } });
        }
      }
      // shift premiums
      const prem = curE.filter((x) => x.cat === 'evening' || x.cat === 'night');
      const premRates = [...new Set(prem.map((x) => x.rate))];
      premRates.forEach((rate) => {
        const kind = Math.abs(rate - ag.shiftPremium.evening) < 0.005 ? 'evening' : Math.abs(rate - ag.shiftPremium.night) < 0.005 ? 'night' : null;
        const lbl = prem.find((x) => x.rate === rate).cat;
        const ok = kind === lbl;
        chk({ group: 'agreement', id: 'shift-' + rate, status: ok ? 'ok' : 'warn',
          title: (L) => (lbl === 'evening' ? (L.lang === 'fr' ? `Prime de soir à ${L.money(rate)}/h` : `Evening premium at ${L.money(rate)}/h`) : (L.lang === 'fr' ? `Prime de nuit à ${L.money(rate)}/h` : `Night premium at ${L.money(rate)}/h`)),
          detail: (L) => PD.agText(ag, L.lang, ok ? 'shiftOk' : 'shiftBad', { ev: L.money(ag.shiftPremium.evening), ni: L.money(ag.shiftPremium.night) }) });
      });
      if (prem.length) {
        const ph = sum(prem.map((x) => x.hours));
        const wh = A.hoursWorked;
        A.premiumHours = ph;
        chk({ group: 'agreement', id: 'premHours', status: ph <= wh + 0.01 ? (Math.abs(ph - wh) < 0.01 ? 'ok' : 'info') : 'warn',
          title: (L) => (L.lang === 'fr' ? `Prime versée sur ${L.num(ph)} h de ${L.num(wh)} h travaillées` : `Shift premium paid on ${L.num(ph)} of ${L.num(wh)} hours worked`),
          detail: (L) => PD.agText(ag, L.lang, 'premHours') });
      }
      // overtime multiplier
      curE.filter((x) => x.cat === 'overtime' && x.rate).forEach((o) => {
        const baseRate = A.mainRate;
        const expected = baseRate ? r2(baseRate * (o.mult || 1.5)) : null;
        chk({ group: 'agreement', id: 'ot-' + o.desc, status: expected && Math.abs(expected - o.rate) < 0.02 ? 'ok' : 'info',
          title: (L) => (L.lang === 'fr' ? `Temps supplémentaire payé à ${L.money(o.rate)}/h` : `Overtime paid at ${L.money(o.rate)}/h`),
          detail: (L) => `${L.num(o.mult || 1.5)} × ${L.money(baseRate)} = ${L.money(expected)}` + PD.agText(ag, L.lang, 'otRule') });
      });
      // pension 5 %
      const pe = ded('pension')[0];
      if (pe) {
        const baseLines = curE.filter((x) => ['regular', 'overtime', 'vacation', 'holiday', 'sick', 'bereavement'].includes(x.cat));
        const base = sum(baseLines.map((x) => x.amount));
        const exp5 = r2(base * ag.pension.rate), exp6 = r2(base * (ag.pension.rate + ag.pension.extraAfter10y));
        const er = emp('erPension')[0];
        const ok = near(exp5, pe.amount, 0.02) || near(exp6, pe.amount, 0.02);
        A.pensionBase = base;
        if (base > 0) chk({ group: 'agreement', id: 'pension', status: ok ? 'ok' : 'warn',
          title: (L) => (L.lang === 'fr' ? `Régime de retraite : ${L.pct((pe.amount / base) * 100, 1)} de votre salaire de base` : `Pension: ${L.pct((pe.amount / base) * 100, 1)} of your base pay`),
          detail: (L) => PD.agText(ag, L.lang, 'pension', { base: fmt(L, base), exp: fmt(L, exp5) })
            + (er ? (near(er.amount, pe.amount, 0.02) ? (L.lang === 'fr' ? ` L’employeur verse le même montant (${fmt(L, er.amount)}).` : ` Your employer matches it (${fmt(L, er.amount)}).`) : (L.lang === 'fr' ? ` Part employeur : ${fmt(L, er.amount)}.` : ` Employer share: ${fmt(L, er.amount)}.`)) : '') });
      }
      // humanity fund: a set amount per hour paid (the rate and the wording come from the pack)
      const hf = ded('humanity')[0];
      if (hf && hf.amount && ag.humanityRate) {
        const hrs = sum(curE.filter((x) => ['regular', 'overtime', 'vacation', 'holiday'].includes(x.cat)).map((x) => x.hours));
        const ok = near(r2(hrs * ag.humanityRate), hf.amount, 0.011);
        chk({ group: 'agreement', id: 'humanity', status: ok ? 'ok' : 'info',
          title: (L) => PD.agText(ag, L.lang, 'humanityTitle', { h: L.num(hrs) }) || (L.lang === 'fr' ? `Fonds humanitaire : ${L.num(hrs)} h payées` : `Humanity Fund: ${L.num(hrs)} hours paid`),
          detail: (L) => PD.agText(ag, L.lang, 'humanity') + (ok ? '' : L.lang === 'fr'
            ? ` ${L.num(hrs)} h × ${L.money(ag.humanityRate)} = ${L.money(r2(hrs * ag.humanityRate))}; votre talon : ${L.money(hf.amount)}.`
            : ` ${L.num(hrs)} h × ${L.money(ag.humanityRate)} = ${L.money(r2(hrs * ag.humanityRate))}; your payslip: ${L.money(hf.amount)}.`) });
      }
      // sick time is not a check: the time-off panel shows what is left and explains Workday's balance
    }

    /* ---- what the Workday labels really mean ---- */
    const MAP = [
      [sec.earnings, 'earnings'], [sec.taxes, 'taxes'], [sec.employer, 'employer'], [sec.taxable, 'taxable'], [sec.absences, 'absences'],
      ...A.dedGroups.map((g, i) => [sec.dedGroups[i], g.pretax ? 'preTax' : 'postTax']),
    ];
    A.labelMap = MAP.filter(([s]) => s && s.title)
      .sort((a, b) => parsed.sections.indexOf(a[0]) - parsed.sections.indexOf(b[0]))
      .map(([s, role]) => ({ original: s.title, role }));
    A.summaryRoles = cols.map((c) => {
      if (c === grossCol) return 'gross';
      if (c === netCol) return 'net';
      if (c === taxCol) return 'taxes';
      const g = A.dedGroups.find((x) => key(x.title) === key(c.label));
      return g ? (g.pretax ? 'preTax' : 'postTax') : 'other';
    });
    A.truncated = A.earnings.filter((e) => e.truncated).map((e) => e.desc);
    [...new Set(A.earnings.filter((e) => /^prime de (soir|nuit) \S+$/i.test(e.desc)).map((e) => e.desc))].forEach((d) => A.truncated.push(d));

    /* ---- headline ---- */
    const counted = A.checks.filter((c) => c.status !== 'info');
    A.checkStats = { total: A.checks.length, ok: A.checks.filter((c) => c.status === 'ok' || c.status === 'okish').length, warn: A.checks.filter((c) => c.status === 'warn').length, info: A.checks.filter((c) => c.status === 'info').length, counted: counted.length };
    /* ---- time off left: sick days, banked hours, vacation (also used by the assistant) ---- */
    {
      const plan = (re, not) => A.absences.find((x) => re.test(x.desc) && !(not && not.test(x.desc)));
      const sick = plan(/maladie|sick/i), bank = plan(/banque|bank/i, /vacan|vacation/i), floating = plan(/flottant|floating/i);
      // the yearly sick allowance comes from the agreement (days x 8 h); Workday often counts hours used without loading it,
      // which shows as a negative balance: what is left is the allowance plus that balance, never below 0
      const allowance = ag && ag.sickDays ? ag.sickDays * 8 : null;
      let sickT = null;
      if (sick && sick.available != null) {
        if (allowance == null) sickT = { left: sick.available, of: null, raw: sick.available };
        else {
          const accrued = sick.accrued || 0, of = Math.max(allowance, accrued);
          const left = sick.available + (accrued >= allowance ? 0 : allowance - accrued);
          sickT = { left: Math.max(0, Math.min(of, left)), of, raw: sick.available };
        }
        sickT.hoursPerDay = 8;
      }
      const vb = A.vacation.find((v) => /solde|balance/i.test(v.label));
      const va = A.vacation.find((v) => /accum|accru/i.test(v.label));
      A.timeOff = (sickT || bank || vb) ? {
        sick: sickT,
        bank: bank && bank.available != null ? { left: bank.available } : null,
        floating: floating && (floating.accrued || floating.available) ? { left: floating.available } : null,
        vacation: vb ? { balance: vb.value, accruing: va ? va.value : null, likelyDollars: !!ag, hours: ag && A.mainRate ? r2(vb.value / A.mainRate) : null } : null,
      } : null;
    }
    return A;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
