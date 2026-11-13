/* Payslip assistant: a tiny trained question model (src/assistant-model.js) picks the question type,
   a lexicon finds which payslip line or term it is about, and the answer is built from the app's own
   analysis and the agreement pack. Nothing leaves the device and no number is made up. */
(function () {
  const PD = (globalThis.PD = globalThis.PD || {});

  /* ---------- text features: must match source/assistant/features.py ---------- */
  const normalize = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = (text) => normalize(text).split(' ').filter(Boolean);
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
  function featureIds(text, buckets) {
    const toks = tokens(text), out = [];
    for (const t of toks) {
      out.push(fnv('w:' + t) % buckets);
      if (t.length >= 2) { const w = '<' + t + '>'; for (let n = 3; n <= 5; n++) for (let i = 0; i + n <= w.length; i++) out.push(fnv('c:' + w.slice(i, i + n)) % buckets); }
    }
    for (let i = 0; i + 1 < toks.length; i++) out.push(fnv('b:' + toks[i] + '_' + toks[i + 1]) % buckets);
    return out;
  }

  /* ---------- the model ---------- */
  let MW = null;
  const b64 = (s) => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a.buffer; };
  // 4-bit weights: two per byte, each stored as value + 8, low nibble first (see pack4 in train.py)
  function unpack4(u, n) {
    const out = new Int8Array(n);
    for (let i = 0; i < n; i++) { const v = u[i >> 1]; out[i] = ((i & 1) ? v >> 4 : v & 15) - 8; }
    return out;
  }
  function model() {
    if (MW) return MW;
    const M = PD.ASK_MODEL;
    MW = { M, E: M.bits === 4 ? unpack4(new Uint8Array(b64(M.e)), M.buckets * M.dim) : new Int8Array(b64(M.e)), S: new Float32Array(b64(M.s)), W: new Float32Array(b64(M.w)), K: M.intents.length, D: M.dim, B: M.buckets };
    return MW;
  }
  function classify(text) {
    const { M, E, S, W, K, D, B } = model();
    const ids = featureIds(text, B);
    const h = new Float32Array(D);
    if (!ids.length) ids.push(0);
    for (const f of ids) { const sc = S[f] / ids.length, o = f * D; for (let d = 0; d < D; d++) h[d] += E[o + d] * sc; }
    const z = new Float32Array(K);
    let mx = -Infinity;
    for (let k = 0; k < K; k++) { let v = M.b[k]; for (let d = 0; d < D; d++) v += h[d] * W[d * K + k]; z[k] = v; if (v > mx) mx = v; }
    let sum = 0;
    for (let k = 0; k < K; k++) { z[k] = Math.exp(z[k] - mx); sum += z[k]; }
    let best = 0;
    for (let k = 1; k < K; k++) if (z[k] > z[best]) best = k;
    return { intent: M.intents[best], conf: z[best] / sum, probs: Array.from(z, (x) => x / sum) };
  }

  /* ---------- what the question is about ---------- */
  const LEX = [
    ['qpp2', ['rrq2', 'rrq 2', 'qpp2', 'qpp 2', 'deuxieme cotisation', 'second qpp']],
    ['qpp', ['rrq', 'regime de rentes', 'rentes du quebec', 'rentes', 'qpp', 'quebec pension plan', 'regie des rentes', 'pension du quebec']],
    ['ei', ['ae', 'assurance emploi', 'assurance chomage', 'chomage', 'employment insurance', 'ei']],
    ['qpip', ['rqap', 'assurance parentale', 'parental insurance', 'qpip', 'parental']],
    ['fedTax', ['impot federal', 'impots federal', 'irf', 'federal tax', 'federal income tax', 'federal', 'impot du canada']],
    ['qcTax', ['impot du quebec', 'impot provincial', 'impot quebec', 'irp', 'irp qc', 'quebec tax', 'provincial tax', 'quebec income tax', 'provincial']],
    ['union', ['syndicat', 'cotisation syndicale', 'cotisations syndicales', 'union', 'union dues', 'dues', 'syndicale']],
    ['erPension', ['part de l employeur', 'part employeur', 'employer pension', 'employer contribution', 'cotisation employeur', 'employer match']],
    ['pension', ['regime de retraite', 'fonds de pension', 'pension', 'retraite', 'rpa', 'pension plan']],
    ['life', ['assurance collective', 'assurance vie', 'ass groupe', 'assurance groupe', 'group insurance', 'life insurance', 'assurances collectives']],
    ['medDent', ['assurance medicaments', 'medicaments', 'dentaire', 'dental', 'medical insurance', 'drug plan']],
    ['humanity', ['fonds humanitaire', 'humanity fund', 'humanitaire', 'humanity']],
    ['ftq', ['ftq', 'fonds de solidarite', 'fonds des travailleurs', 'solidarity fund']],
    ['rrsp', ['reer', 'rrsp']],
    ['evening', ['prime de soir', 'soir', 'evening', '2e quart', 'deuxieme quart', 'evening premium', 'evening shift']],
    ['night', ['prime de nuit', 'nuit', 'night', '3e quart', 'troisieme quart', 'night premium', 'night shift', 'nights']],
    ['overtime', ['temps supplementaire', 'temps supp', 'overtime', 'temps et demi', 'temps double', 'double time', 'time and a half', 'supp']],
    ['regular', ['heures regulieres', 'hrs reg', 'regular hours', 'temps regulier', 'regulieres', 'regular']],
    ['holiday', ['ferie', 'feries', 'conge ferie', 'jour ferie', 'statutory holiday', 'stat holiday', 'holiday pay', 'stat']],
    ['vacation', ['paie de vacances', 'vacances', 'vacation pay', 'vacation']],
    ['sick', ['maladie', 'maladies', 'conge de maladie', 'sick pay', 'sick leave', 'sick']],
    ['bereavement', ['deuil', 'bereavement', 'funerailles']],
    ['unpaid', ['absence non payee', 'absnp', 'non paye', 'sans solde', 'unpaid', 'unpaid absence']],
    ['retro', ['retro', 'retroactif', 'retroactivite', 'back pay', 'retroactive']],
    ['award', ['prix de service', 'service award']],
    ['vacationBank', ['bq de vac', 'banque de vacances payee']],
    // terms
    ['t:t4', ['t4']], ['t:rl1', ['releve 1', 'rl 1', 'rl1', 'releve']], ['t:td1', ['td1', 'tp 1015', 'tp1015', 'montant total de la demande', 'claim amount']],
    ['t:gross', ['brut', 'brute', 'gross']], ['t:net', ['net', 'nette']], ['t:ytd', ['cumul annuel', 'cumul', 'year to date', 'ytd']],
    ['t:taxable', ['salaires imposables', 'salaires assujettis', 'taxable wages', 'pensionable earnings', 'insurable earnings', 'assujettis', 'imposables']],
    ['t:worktag', ['worktag']], ['t:kronos', ['kronos', 'ukg']], ['t:transfer', ['virement', 'bank transfer', 'virement bancaire']],
    ['t:eeer', ['ee er', 'ee', 'er']], ['t:provtb', ['prov tb', 'avantage imposable', 'taxable benefit']], ['t:codes', ['codes entre parentheses', 'parentheses', 'brackets']],
  ].map(([id, al]) => [id, al.map((a) => ' ' + normalize(a) + ' ')]);
  // one-letter-off matches for longer single words ("asurance", "sindicat")
  const near = (a, b) => {
    if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  };
  const COMMON = new Set('cette cettes semaine semaines combien pourquoi depuis quelle quelles comment toutes autres annee heures montant please there their where which would could should about payslip'.split(' '));
  function entities(text) {
    const q = ' ' + normalize(text) + ' ', toks = q.trim().split(' ');
    const found = [];
    for (const [id, al] of LEX) {
      let score = 0;
      for (const a of al) {
        if (q.includes(a)) score = Math.max(score, a.length);
        else if (!a.trim().includes(' ') && a.trim().length >= 6 && toks.some((t) => !COMMON.has(t) && near(t, a.trim()))) score = Math.max(score, a.length - 1);
      }
      if (score) found.push([id, score]);
    }
    found.sort((a, b) => b[1] - a[1]);
    // a longer name hides the shorter one inside it ("assurance emploi" over "emploi")
    const out = [];
    for (const [id] of found) if (!out.includes(id)) out.push(id);
    const n = (re) => { const m = q.match(re); return m ? m[1] : null; };
    return {
      ids: out, line: out.find((x) => !x.startsWith('t:')) || null, term: out.find((x) => x.startsWith('t:')) || null,
      box: n(/ (?:case|box|code|boite) ([0-9]{1,3}|[a-z]) /), cls: n(/ (?:classe|class) ([0-9]{1,2}) /), level: n(/ (?:niveau|level|echelon) ([abc]) /),
      years: n(/ ([0-9]{1,2}) (?:ans|an|years|year|yrs) /), code: /\( ?[0-9]{2} ?, ?[0-9]+ ?\)/.test(text) || / [0-9]{2} [0-9]{3} /.test(q),
    };
  }
  // Québec's paid holidays by their usual names (public names, not agreement data), most specific first:
  // "lendemain de Noël" must not stop at "Noël", "veille du jour de l'An" not at "jour de l'An"
  const HOLIDAY_NAMES = [
    ['dayAfterNewYear', /\blendemain (du )?(jour de )?l an\b|\bday after new year|\b2 janvier\b|\bjanuary 2(nd)?\b/],
    ['newYearsEve', /\bveille (du )?(jour de )?l an\b|\bnew year s eve\b|\bnew years eve\b|\b31 decembre\b|\bdecember 31(st)?\b/],
    ['newYear', /\bjour de l an\b|\bnouvel an\b|\bnew year s( day)?\b|\bnew years( day)?\b|\bnew year\b|\b(1er|premier) janvier\b|\bjanuary 1(st)?\b/],
    ['christmasEve', /\bveille de noel\b|\bchristmas eve\b|\b24 decembre\b|\bdecember 24(th)?\b/],
    ['boxing', /\blendemain de noel\b|\bboxing\b|\b26 decembre\b|\bdecember 26(th)?\b/],
    ['christmas', /\bnoel\b|\bchristmas\b|\bxmas\b|\b25 decembre\b|\bdecember 25(th)?\b/],
    ['goodFriday', /\bvendredi saint\b|\bgood friday\b/],
    ['easterMonday', /\blundi de paques\b|\beaster monday\b|\bpaques\b|\beaster\b/],
    ['patriots', /\bpatriotes?\b|\bpatriots?\b|\bvictoria day\b|\bdollard\b/],
    ['stJean', /\bst jean\b|\bsaint jean\b|\bfete nationale\b|\bnational holiday\b|\b24 juin\b|\bjune 24(th)?\b/],
    ['canada', /\bconfederation\b|\bcanada day\b|\bfete du canada\b|\b(1er|premier) juillet\b|\bjuly 1(st)?\b|\bdominion day\b/],
    ['labour', /\bfete du travail\b|\blabou?r day\b/],
    ['thanksgiving', /\baction de graces?\b|\bthanksgiving\b/],
  ];
  function holidayIn(text, ag) {
    if (!ag || !ag.holidays) return -1;
    const nq = normalize(text);
    if (ag.holidayIds) for (const [id, re] of HOLIDAY_NAMES) if (re.test(nq) && ag.holidayIds.includes(id)) return ag.holidayIds.indexOf(id);
    const q = ' ' + nq + ' ';
    const words = (h) => normalize(h).split(' ').filter((w) => w.length > 3 && !['jour', 'fete', 'conge', 'apres', 'veille', 'lendemain'].includes(w));
    let best = -1, bs = 0;
    for (const lang of ['fr', 'en']) (ag.holidays[lang] || []).forEach((h, i) => { const sc = words(h).filter((w) => q.includes(' ' + w + ' ')).length; if (sc > bs) { bs = sc; best = i; } });
    return best;
  }
  const FR_WORDS = new Set('je j tu il on nous vous mon ma mes ton ta le la les un une des du de est c ce ca combien quoi pourquoi quand comment paie paye talon impot heures vacances maladie reste et ou avec pour sur dans pas plus moins semaine bonjour merci salut allo cette annee'.split(' '));
  const EN_WORDS = new Set('i my me you your the a an is are what why when how much many pay paycheck payslip tax hours vacation sick left and or with for on in not more less week hello thanks hi this year did do does get got'.split(' '));
  function langOf(text, fallback) {
    let fr = 0, en = 0;
    for (const t of tokens(text)) { if (FR_WORDS.has(t)) fr++; if (EN_WORDS.has(t)) en++; }
    return fr === en ? fallback : fr > en ? 'fr' : 'en';
  }

  /* ---------- deciding the question type ---------- */
  const GREET = /^(bonjour|bonsoir|salut|allo|hello|hi|hey|yo|coucou|bon matin|good morning|good evening)( (ca va|there|toi))?$/;
  const THANKS = /^(merci( beaucoup| bcp)?|thanks?( you)?( a lot)?|parfait|super|cool|nice|genial|ok merci|great)( merci)?$/;
  // a short thank-you with a few words after it ("merci, c'est clair"), as long as it asks nothing
  const THANKS_START = /^(merci|thanks|thank you|thx|parfait|genial|super|great|ok merci)\b/;
  const ASKS = /\b(combien|comment|pourquoi|quand|quel|quelle|quels|quoi|qui|ou|est ce|how|what|when|why|which|where|who|is|are|do|does|did|can|could)\b/;
  function decide(text, ag) {
    const nq = normalize(text);
    const ents = entities(text);
    if (!nq) return { intent: 'help', conf: 1, ents };
    if (GREET.test(nq)) return { intent: 'greeting', conf: 1, ents };
    if (THANKS.test(nq) || (THANKS_START.test(nq) && nq.split(' ').length <= 5 && !ASKS.test(nq.replace(THANKS_START, '')))) return { intent: 'thanks', conf: 1, ents };
    const c = classify(text);
    let intent = c.intent;
    const hol = holidayIn(text, ag);
    if (ents.box && /\b(t4|rl1|rl 1|releve|case|box)\b/.test(nq)) intent = 'slips';
    else if ((ents.code && ['explain', 'line_amount', 'other', 'hours'].includes(intent)) || (intent === 'explain' && ents.term === 't:codes')) intent = 'codes';
    else if (hol >= 0 && ['other', 'agreement', 'explain', 'deposit'].includes(intent)) intent = 'holidays';
    // an amount asked about a tax slip is a slips question ("what's a T4" stays a definition)
    else if (/\b(t4|rl1|rl 1|releve 1|releve)\b/.test(nq) && ['line_amount', 'ytd', 'gross', 'net', 'taxes_total'].includes(intent)) intent = 'slips';
    // a type that needs a line or term, with none named: take the model's next best guess that doesn't
    const NEEDS = ['line_amount', 'explain'];
    if (NEEDS.includes(intent) && !ents.line && !ents.term && !ents.code) {
      const M = model().M;
      let bi = -1, rest = 0;
      c.probs.forEach((p, i) => { if (!NEEDS.includes(M.intents[i])) { rest += p; if (bi < 0 || p > c.probs[bi]) bi = i; } });
      // its confidence is measured among the types that fit a question with no line named
      if (bi >= 0 && c.probs[bi] > 0.02) { intent = M.intents[bi]; c.conf = c.probs[bi] / rest; }
    }
    // a question that names a payslip line is never "something else"
    if (intent === 'other' && ents.line && c.conf < 0.9) intent = 'line_amount';
    if (intent === 'other' && ents.term && c.conf < 0.9) intent = 'explain';
    return { intent, conf: c.conf, ents, hol, probs: c.probs };
  }

  /* ---------- answers ---------- */
  const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
  const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const TAXK = ['fedTax', 'qcTax', 'provTax', 'qpp', 'qpp2', 'cpp', 'cpp2', 'ei', 'qpip', 'otherTax'];
  function lines(A, id) {
    if (!id) return [];
    const cur = A.earnings.filter((e) => e.current);
    if (['regular', 'overtime', 'evening', 'night', 'premium', 'holiday', 'vacation', 'sick', 'bereavement', 'award', 'retro', 'vacationBank', 'misc', 'other', 'unpaid'].includes(id)) {
      const rows = id === 'retro' ? cur.filter((e) => e.retro) : cur.filter((e) => e.cat === id);
      return rows.map((e) => ({ type: 'earning', kind: id, desc: e.desc, amount: e.amount, hours: e.hours, rate: e.rate, ytd: e.ytd, ytdHours: e.ytdHours }));
    }
    if (TAXK.includes(id)) return A.taxes.filter((t) => t.kind === id).map((t) => ({ type: 'tax', kind: id, desc: t.desc, amount: t.amount, ytd: t.ytd, pct: t.pctOfGross, max: t.annualMax, maxPct: t.maxPct, reached: t.maxReached }));
    if (id === 'erPension') return A.employer.filter((e) => e.kind === 'erPension').map((e) => ({ type: 'employer', kind: id, desc: e.desc, amount: e.amount, ytd: e.ytd }));
    return A.deductions.filter((d) => d.kind === id).map((d) => ({ type: 'deduction', kind: id, desc: d.desc, amount: d.amount, ytd: d.ytd }));
  }
  // where a line shows in the app, for the "see it" link
  const goFor = (id) => (!id ? 'pay' : TAXK.includes(id) ? 'pay:c-taxes' : ['erPension'].includes(id) ? 'pay:c-employer' : ['pension', 'union', 'life', 'medDent', 'humanity', 'ftq', 'rrsp'].includes(id) ? 'pay:c-ded0' : 'pay:c-earnings');

  const iso = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const todayIso = () => iso(new Date());
  const isoDaysAgo = (n) => { const t = new Date(); t.setDate(t.getDate() - n); return iso(t); };

  function answer(question, ctx) {
    const { recs, cur } = ctx;
    const rec = recs[cur];
    const A = rec.A, ag = A.agreement;
    const d = decide(question, ag);
    const lang = langOf(question, ctx.lang);
    const L = ctx.makeL(lang, ag, A.meta.year), s = L.s, k = s.ask;
    const S = A.summary, out = { intent: d.intent, conf: d.conf, lang, paras: [], links: [], chips: [] };
    const P = (t) => { if (t) out.paras.push(t); };
    const Li = (t) => { if (t) out.paras.push({ li: t }); }; // one item of a list, shown as bullets
    const link = (label, go) => out.links.push([label, go]);
    const name = (id) => (id.startsWith('t:') ? k.term[id.slice(2)][0] : L.kind(id));
    const intent = d.conf < 0.35 && !['greeting', 'thanks'].includes(d.intent) ? 'unsure' : d.intent;
    out.intent = intent;
    const e = d.ents;
    const lineText = (id) => {
      const ls = lines(A, id);
      if (!ls.length) return null;
      const amt = r2(sum(ls.map((l) => l.amount))), ytd = r2(sum(ls.map((l) => l.ytd)));
      const l0 = ls[0];
      if (l0.type === 'earning') {
        const h = sum(ls.map((l) => l.hours));
        return k.earnLine(L.kind(id), L.money(amt), h ? L.h(h) : '', ls.length === 1 && l0.rate ? L.money(l0.rate) : '', L.money(ytd));
      }
      if (l0.type === 'tax') return k.taxLine(L.kind(id), L.money(amt), l0.pct != null ? L.pct(l0.pct * 100) : '', L.money(ytd), l0.max ? L.money(l0.max) : '', !!l0.reached);
      return k.dedLine(L.kind(id), L.money(amt), L.money(ytd));
    };
    const shiftRate = (id) => (ag && ag.shiftPremium && ag.shiftPremium[id] ? k.shiftRate(L.kind(id), L.money(ag.shiftPremium[id])) : '');
    switch (intent) {
      case 'net': {
        const pay = A.payments[0];
        P(k.net(L.money(S.net), L.dateW(A.meta.payDate), pay ? pay.bank : ''));
        P(k.netEq(L.money(S.gross), L.money(r2(S.gross - S.net)), L.money(S.net)));
        link(s.tabs.pay, 'pay');
        break;
      }
      case 'gross': {
        P(k.gross(L.money(S.gross), A.hoursPaid ? L.h(A.hoursPaid) : ''));
        const cats = {};
        A.earnings.filter((x) => x.current).forEach((x) => { cats[x.cat] = (cats[x.cat] || 0) + x.amount; });
        const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, v]) => `${L.kind(c)} ${L.money(v)}`);
        if (top.length > 1) P(k.grossParts(top.join(', ')));
        link(s.payNav ? s.payNav.earnings : s.tabs.pay, 'pay:c-earnings');
        break;
      }
      case 'withheld': case 'breakdown': {
        const w = r2(S.gross - S.net);
        P(intent === 'withheld' ? k.withheld(L.money(w), L.pct((w / S.gross) * 100, 0)) : k.breakdown(L.money(S.gross), L.money(S.net), L.money(w)));
        const parts = A.split.filter((x) => x.id !== 'net' && x.amount > 0).map((x) => `${s.split[x.id]} ${L.money(x.amount)} (${L.pct((x.amount / S.gross) * 100, 0)})`);
        P(k.partsHead); parts.forEach(Li);
        const big = [...A.taxes, ...A.deductions].filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3).map((x) => `${L.kind(x.kind === 'other' ? 'otherDed' : x.kind)} ${L.money(x.amount)}`);
        if (intent === 'breakdown') {
          P(k.biggest(big.join(', ')));
          const ins = [];
          const cur2 = A.earnings.filter((x) => x.current);
          if (cur2.some((x) => x.retro)) ins.push(k.noteRetro);
          const ot = sum(cur2.filter((x) => x.cat === 'overtime').map((x) => x.hours));
          if (ot) ins.push(k.noteOt(L.h(ot)));
          if (A.checkStats.warn) ins.push(k.noteWarn(A.checkStats.warn));
          if (ins.length) P(ins.join(' '));
        }
        link(s.payNav ? s.payNav.ledger : s.tabs.pay, 'pay:p-where');
        break;
      }
      case 'deposit': case 'period': {
        const pay = A.payments[0];
        const freq = { 52: s.weekly, 26: s.biweekly, 24: s.semimonthly, 12: s.monthly }[A.meta.P];
        if (intent === 'deposit') P(k.deposit(L.dateW(A.meta.payDate), pay ? pay.bank : '', L.money(S.net)));
        P(k.period(L.range(A.meta.periodStart, A.meta.periodEnd), freq || ''));
        break;
      }
      case 'line_amount': case 'explain': {
        const id = e.line || e.term;
        if (!id) { P(k.whichLine); out.chips = [...A.taxes.slice(0, 2), ...A.deductions.slice(0, 2)].map((x) => k.chipAmount(L.kind(x.kind === 'other' ? 'otherDed' : x.kind))); break; }
        if (id.startsWith('t:')) { const t = k.term[id.slice(2)]; P(t[0] + (lang === 'fr' ? ' : ' : ': ') + t[1]); if (id === 't:codes') link(s.guideNav.codes, 'guide:codes'); break; }
        const text = lineText(id);
        if (intent === 'explain' || !text) P(`${L.kind(id)}${lang === 'fr' ? ' : ' : ': '}${L.expl(id) || k.noExpl}`);
        P(text || k.notOnSlip(L.kind(id)));
        if (['evening', 'night'].includes(id)) P(shiftRate(id));
        if (text) link(k.see(L.kind(id)), goFor(id));
        break;
      }
      case 'taxes_total': case 'tax_rate': {
        const inc = A.taxes.filter((t) => ['fedTax', 'qcTax', 'provTax'].includes(t.kind));
        const it = r2(sum(inc.map((t) => t.amount)));
        P(k.incomeTax(inc.map((t) => `${L.kind(t.kind)} ${L.money(t.amount)}`).join(', '), L.money(it), S.gross ? L.pct((it / S.gross) * 100) : ''));
        const gov = A.taxes.filter((t) => !['fedTax', 'qcTax', 'provTax'].includes(t.kind) && t.amount);
        if (gov.length) P(k.govPlans(gov.map((t) => `${L.kind(t.kind)} ${L.money(t.amount)}`).join(', ')));
        if (intent === 'tax_rate' && S.gross && S.net != null) P(k.rateNote(L.pct(((S.gross - S.net) / S.gross) * 100, 0)));
        link(s.payNav ? s.payNav.taxes : s.tabs.pay, 'pay:c-taxes');
        break;
      }
      case 'hours': {
        if (!A.hoursPaid) { P(k.noHours); break; }
        const segs = A.hoursByCat.map((x) => `${s.cat[x.cat] || L.kind(x.cat)} ${L.h(x.hours)}`);
        P(k.hours(L.h(A.hoursPaid), segs.join(', ')));
        if (e.line && lines(A, e.line).length) P(lineText(e.line));
        if (A.premiumHours) P(k.premHours(L.num(A.premiumHours), L.num(A.hoursWorked)));
        link(s.payNav ? s.payNav.earnings : s.tabs.pay, 'pay:c-earnings');
        break;
      }
      case 'rate': {
        const main = (A.rateMatches || []).find((r) => r.hit && r.rate === A.mainRate);
        P(A.mainRate ? k.rate(L.money(A.mainRate)) : k.noRate);
        if (main) P(k.rateClass(main.hit.cls, main.hit.level));
        const others = [...new Set(A.earnings.filter((x) => x.current && x.rate && x.cat === 'regular' && Math.abs(x.rate - A.mainRate) > 0.004).map((x) => x.rate))];
        if (others.length) P(k.otherRates(others.map((r) => L.money(r)).join(', ')));
        if (ag) link(s.guideNav.agreement, 'guide:agreement');
        break;
      }
      case 'per_hour': {
        if (!A.hoursPaid) { P(k.noHours); break; }
        P(k.perHour(L.money(S.gross / A.hoursPaid), L.money(S.net / A.hoursPaid), L.h(A.hoursPaid)));
        break;
      }
      case 'sick_left': case 'bank_left': case 'vacation_left': {
        const T = A.timeOff;
        if (!T) { P(k.noTimeOff); break; }
        // balances are as of the payslip: say so when it isn't a recent one
        if (A.meta.payDate && A.meta.payDate < isoDaysAgo(14)) P(k.asOfSlip(L.date(A.meta.payDate)));
        if (intent === 'sick_left') {
          if (!T.sick) P(k.noTimeOff);
          else if (T.sick.of) { P(k.sickLeft(L.h(T.sick.left), L.num(Math.round((T.sick.left / 8) * 10) / 10), L.num(T.sick.of / 8))); if (T.sick.raw < 0) P(k.sickRaw(L.num(T.sick.raw))); P(PD.agText(ag, lang, 'sickLeft', { days: L.num(T.sick.of / 8), hours: L.num(T.sick.of) })); }
          else P(k.sickWorkday(L.h(T.sick.left)));
        } else if (intent === 'bank_left') P(T.bank ? k.bankLeft(L.h(T.bank.left)) : k.noTimeOff);
        else if (T.vacation) {
          const v = T.vacation;
          P(v.likelyDollars ? k.vacLeft(L.money(v.balance), v.hours != null ? L.num(Math.round(v.hours * 10) / 10) : '') : k.vacLeftRaw(L.num(v.balance)));
          if (v.accruing != null) P(k.vacAccruing(v.likelyDollars ? L.money(v.accruing) : L.num(v.accruing)));
        } else P(k.noTimeOff);
        link(s.toff.title, 'pay:p-toff');
        break;
      }
      case 'ytd': {
        if (e.line && lines(A, e.line).length) { const ls = lines(A, e.line); P(k.ytdLine(L.kind(e.line), L.money(r2(sum(ls.map((l) => l.ytd)))))); }
        else P(k.ytd(L.money(S.grossYtd), L.money(S.netYtd), L.money(r2(S.grossYtd - S.netYtd)), L.date(A.meta.payDate)));
        link(s.tabs.year, 'year');
        break;
      }
      case 'maximums': {
        const mx = A.taxes.filter((t) => t.annualMax && (!e.line || t.kind === e.line || (e.line === 'qpp' && t.kind === 'qpp2')));
        const Pj = A.projections || {};
        if (!mx.length) { P(k.noMax); break; }
        mx.forEach((t) => {
          const p = Pj[t.kind];
          (mx.length > 1 ? Li : P)(k.maxLine(L.kind(t.kind), L.money(t.ytd), L.money(t.annualMax), t.maxReached ? k.maxHit : p && p.thisYear ? k.maxSoon(L.dateS(p.date), L.money(p.perPay)) : k.maxLater));
        });
        link(s.yearNav ? s.yearNav.max : s.tabs.year, 'year:y-max');
        break;
      }
      case 'slips': {
        const all = [...(A.slips ? A.slips.t4.map((x) => ['T4', ...x]) : []), ...(A.slips ? A.slips.rl1.map((x) => [s.rl1, ...x]) : [])];
        if (!all.length) { P(k.noSlips); break; }
        const want = e.box ? all.filter((x) => String(x[1]).toLowerCase() === e.box) : [];
        const rows = (want.length ? want : all.filter((x) => ['empIncome', 'fedTax', 'qcTax', 'qpp', 'ei'].includes(x[2]))).map((x) => `${x[0]} ${lang === 'fr' ? 'case' : 'box'} ${x[1]} (${s.slipName[x[2]] || x[2]}) ${L.money(x[3])}`);
        P(k.slips(L.date(A.meta.payDate)));
        rows.forEach(Li);
        link(s.yearNav ? s.yearNav.slips : s.tabs.year, 'year:y-slips');
        break;
      }
      case 'employer': {
        if (!A.employer.length) { P(k.noEmployer); break; }
        P(k.employer(A.employer.map((x) => `${L.kind(x.kind)} ${L.money(x.amount)}`).join(', '), L.money(sum(A.employer.map((x) => x.amount)))));
        link(s.payNav ? s.payNav.employer : s.tabs.pay, 'pay:c-employer');
        break;
      }
      case 'checks': {
        const st = A.checkStats;
        const warn = A.checks.filter((c) => c.status === 'warn');
        P(warn.length ? k.checksWarn(warn.length, st.ok + st.warn) : k.checksOk(st.ok));
        warn.slice(0, 3).forEach((c) => Li(`${typeof c.title === 'function' ? c.title(L) : c.title}. ${typeof c.detail === 'function' ? c.detail(L) : c.detail}`));
        link(s.seeChecks, 'checks');
        break;
      }
      case 'retro': {
        const rr = A.earnings.filter((x) => x.current && x.retro);
        if (!rr.length) { P(k.noRetro); P(L.expl('retro')); break; }
        P(k.retro(L.money(sum(rr.map((x) => x.amount))), rr[0].dates ? L.range(rr[0].dates.from, rr[0].dates.to) : ''));
        link(s.payNav ? s.payNav.earnings : s.tabs.pay, 'pay:c-earnings');
        break;
      }
      case 'compare': compare(out, P, Li, link, ctx, L, k, e); break;
      case 'holidays': {
        if (!ag || !ag.holidays) { P(k.noAgreement); break; }
        const y = new Date().getFullYear(), list = ag.holidays[lang] || ag.holidays.en;
        const dates = PD.holidayDates(y, ag.holidayIds).concat(PD.holidayDates(y + 1, ag.holidayIds));
        const n = list.length, today = todayIso(); // the local date, not UTC (evenings in Québec are already tomorrow in UTC)
        // the weekend rule can move a holiday onto another one that year: that date is for the plant to set, as in the Guide
        const clash = (i) => dates.indexOf(dates[i], Math.floor(i / n) * n) !== i;
        if (d.hol >= 0) {
          const i = dates[d.hol] >= today ? d.hol : n + d.hol;
          P(clash(i) ? k.holidayTbc(list[d.hol], y + Math.floor(i / n)) : k.holidayIs(list[d.hol], L.dateW(dates[i])));
        } else {
          const nxt = dates.map((iso, i) => [iso, i % n, i]).filter(([iso, , i]) => iso >= today && !clash(i))[0];
          if (nxt) P(k.nextHoliday(list[nxt[1]], L.dateW(nxt[0])));
          P(k.holidayCount(n, PD.agText(ag, lang, 'holidaysRef')));
        }
        link(s.guideNav.agreement, 'guide:agreement');
        break;
      }
      case 'vacation_rule': {
        if (!ag || !ag.vacation) { P(k.noAgreement); break; }
        const rows = ag.vacation;
        const yrs = e.years != null ? +e.years : null;
        const span = (row) => { const t = row.svc.en.toLowerCase(), nums = (t.match(/\d+/g) || []).map(Number); if (/under|less/.test(t)) return [0, nums[0]]; if (/more|\+|over/.test(t)) return [nums[0], 99]; return [nums[0] || 0, nums[1] != null ? nums[1] : 99]; };
        const fit = yrs != null ? rows.filter((r) => { const [a, b] = span(r); return yrs >= a && yrs < b; }) : [];
        const vr = fit.length ? fit : rows;
        vr.forEach((r) => (vr.length > 1 ? Li : P)(`${r.svc[lang] || r.svc.en}${lang === 'fr' ? ' : ' : ': '}${r.len[lang] || r.len.en} (${L.pct(r.pct, 1)})`));
        link(s.guideNav.agreement, 'guide:agreement');
        break;
      }
      case 'sick_rule': case 'overtime_rule': case 'shift_rule': {
        if (!ag) { P(intent === 'shift_rule' ? k.noAgreement : L.expl(intent === 'sick_rule' ? 'sick' : 'overtime')); break; }
        const kinds = intent === 'sick_rule' ? ['sick'] : intent === 'overtime_rule' ? ['overtime'] : (e.line === 'night' ? ['night'] : e.line === 'evening' ? ['evening'] : ['evening', 'night']);
        kinds.forEach((kk) => P(`${L.kind(kk)}${lang === 'fr' ? ' : ' : ': '}${L.expl(kk)}`));
        if (intent === 'sick_rule' && A.timeOff && A.timeOff.sick && A.timeOff.sick.of) P(k.sickLeft(L.h(A.timeOff.sick.left), L.num(Math.round((A.timeOff.sick.left / 8) * 10) / 10), L.num(A.timeOff.sick.of / 8)));
        if (intent === 'shift_rule') kinds.forEach((kk) => { const t = lineText(kk); if (t) P(t); });
        link(s.guideNav.agreement, 'guide:agreement');
        break;
      }
      case 'wage_scale': {
        // the scale in effect today, and the payslip's own scale when that was an earlier one
        const slipSc = ag && PD.scaleFor(ag, A.meta.periodStart || A.meta.payDate);
        const sc = (ag && PD.scaleFor(ag, todayIso())) || slipSc;
        if (!sc) { P(k.noAgreement); break; }
        const then = slipSc && slipSc.from !== sc.from ? slipSc : null;
        const lv = (e.level || '').toUpperCase();
        if (e.cls && sc.rates[e.cls]) {
          const r = sc.rates[e.cls];
          P(lv && r[lv] != null ? k.scaleOne(e.cls, lv, L.money(r[lv]), L.date(sc.from)) : k.scaleClass(e.cls, ['A', 'B', 'C'].map((x) => `${x} ${L.money(r[x])}`).join(', '), L.date(sc.from)));
          const rt = then && then.rates[e.cls];
          if (rt) P(k.scaleThen(L.date(A.meta.payDate), L.date(then.from), lv && rt[lv] != null ? L.money(rt[lv]) : ['A', 'B', 'C'].map((x) => `${x} ${L.money(rt[x])}`).join(', ')));
          const jobs = ag.jobs && ag.jobs[e.cls];
          if (jobs && jobs.length) P(k.scaleJobs(jobs.slice(0, 4).join(', ')));
        } else {
          const all = Object.values(sc.rates).flatMap((r) => Object.values(r));
          P(k.scaleRange(L.date(sc.from), L.money(Math.min(...all)), L.money(Math.max(...all)), Object.keys(sc.rates).length));
          if (then) P(k.scaleThen(L.date(A.meta.payDate), L.date(then.from), ''));
          const main = (A.rateMatches || []).find((r) => r.hit && r.rate === A.mainRate);
          if (main) P(k.yourRate(L.money(main.rate), main.hit.cls, main.hit.level));
        }
        link(s.guideNav.agreement, 'guide:agreement');
        break;
      }
      case 'agreement': {
        if (!ag) { P(k.noAgreement); break; }
        P(PD.agText(ag, lang, 'intro', { title: ag.title[lang], union: ag.union[lang] }));
        P(PD.agText(ag, lang, 'expires', { date: L.date(ag.expires) }));
        link(s.guideNav.agreement, 'guide:agreement');
        break;
      }
      case 'fact': {
        const F = ag && ag.facts && (ag.facts[lang] || ag.facts.en);
        if (!F) { P(k.noAgreement); break; }
        const qt = new Set(tokens(question).filter((t) => t.length > 3));
        const scored = F.map((f) => [f, tokens(f[1] + ' ' + f[0]).filter((t) => t.length > 3 && [...qt].some((q) => q === t || (q.length >= 5 && t.startsWith(q.slice(0, 5))))).length]).sort((a, b) => b[1] - a[1]);
        const hits = scored.filter((x) => x[1] > 0).slice(0, 2);
        if (!hits.length) { P(k.factNone); F.slice(0, 4).forEach((f) => Li(`${f[1]}${lang === 'fr' ? ' : ' : ': '}${f[0]} (${f[2]})`)); }
        else hits.forEach(([f]) => P(`${f[1]}${lang === 'fr' ? ' : ' : ': '}${f[0]} (${f[2]})`));
        link(s.guideNav.agreement, 'guide:agreement');
        break;
      }
      case 'codes': {
        const firsts = [...new Set((A.codes || []).filter((c) => c.current).map((c) => c.parts[0]))].join(', ') || '—';
        P(s.codesMeaning(firsts));
        if (A.codeTimeline) { const T = A.codeTimeline; P(s.codesTimeline(`(${T.from})`, `(${T.to})`, T.nFrom, T.nTo, L.date(T.lastFrom), L.date(T.firstTo))); }
        link(s.guideNav.codes, 'guide:codes');
        break;
      }
      case 'greeting': P(k.greeting); out.chips = k.starters.slice(0, 3); break;
      case 'thanks': P(k.thanks); break;
      case 'help': P(k.help); out.chips = k.starters.slice(0, 4); break;
      case 'privacy': P(k.privacy); break;
      case 'unsure': P(k.unsure); out.chips = k.starters.slice(0, 4); break;
      default: P(k.other); out.chips = k.starters.slice(0, 3);
    }
    out.paras = out.paras.filter(Boolean);
    return out;
  }

  /* ---------- two payslips side by side ---------- */
  function compare(out, P, Li, link, ctx, L, k, e) {
    const { recs, cur } = ctx;
    if (recs.length < 2) { P(k.compareNeedTwo); out.chips = [k.starters[2]]; out.open = true; return; }
    const order = recs.map((r, i) => [r.A.meta.payDate || '', i]).sort();
    const pos = order.findIndex(([, i]) => i === cur);
    const other = order[pos > 0 ? pos - 1 : pos + 1][1];
    const [A, B] = pos > 0 ? [recs[cur].A, recs[other].A] : [recs[other].A, recs[cur].A]; // A = later, B = earlier
    const yr = (x) => (x.meta.payDate || '').slice(0, 4);
    const dt = (x) => (yr(A) !== yr(B) ? L.dateSY : L.dateS)(x.meta.payDate); // name the year when they differ
    const dn = r2(A.summary.net - B.summary.net), dg = r2(A.summary.gross - B.summary.gross);
    const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + L.money(Math.abs(v)).replace(/^-/, '');
    P(k.compareHead(dt(A), L.money(A.summary.net), dt(B), L.money(B.summary.net), sgn(dn)));
    P(k.compareGross(L.money(A.summary.gross), L.money(B.summary.gross), sgn(dg)));
    // what moved: hours and earnings by type, then every tax and deduction
    const drivers = [];
    const byCat = (X) => { const m = {}; X.earnings.filter((x) => x.current).forEach((x) => { const c = x.retro ? 'retro' : x.cat; m[c] = m[c] || { a: 0, h: 0 }; m[c].a += x.amount || 0; m[c].h += x.hours || 0; }); return m; };
    const ca = byCat(A), cb = byCat(B);
    for (const c of new Set([...Object.keys(ca), ...Object.keys(cb)])) {
      const a = ca[c] || { a: 0, h: 0 }, b = cb[c] || { a: 0, h: 0 }, da = r2(a.a - b.a), dh = r2(a.h - b.h);
      if (Math.abs(da) >= 0.5) drivers.push({ id: c, net: da, text: k.drvEarn(L.kind(c), sgn(da), dh ? (dh > 0 ? '+' : '−') + L.h(Math.abs(dh)) : '') });
    }
    const amt = (X, kind) => sum([...X.taxes, ...X.deductions].filter((x) => (x.kind === 'other' ? 'otherDed' : x.kind) === kind).map((x) => x.amount));
    const kinds = new Set([...A.taxes, ...A.deductions, ...B.taxes, ...B.deductions].map((x) => (x.kind === 'other' ? 'otherDed' : x.kind)));
    for (const kd of kinds) {
      const a = amt(A, kd), b = amt(B, kd), dd = r2(a - b);
      if (Math.abs(dd) < 0.5) continue;
      const t = A.taxes.find((x) => x.kind === kd);
      const why = t && t.maxReached && !a ? k.drvMax : TAXK.includes(kd) && Math.sign(dd) === Math.sign(dg) ? k.drvFollows : '';
      drivers.push({ id: kd, net: -dd, text: k.drvDed(L.kind(kd), sgn(dd), why) });
    }
    if (A.mainRate && B.mainRate && Math.abs(A.mainRate - B.mainRate) > 0.004) drivers.push({ id: 'rate', net: 0.001, text: k.drvRate(L.money(B.mainRate), L.money(A.mainRate)) });
    drivers.sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
    const focus = e.line ? drivers.filter((x) => x.id === e.line || (e.line === 'retro' && x.id === 'retro')) : [];
    if (e.line && !focus.length) P(k.compareSame(L.kind(e.line)));
    const list = (focus.length ? focus : drivers).slice(0, 5);
    if (list.length) { P(k.compareWhy); list.forEach((x) => Li(x.text)); } else P(k.compareNone);
    if (drivers.length > list.length && !focus.length) P(k.compareMore(drivers.length - list.length));
    link(L.s.yearNav ? L.s.yearNav.hist : L.s.tabs.year, 'year:y-hist');
  }

  /* the answer as plain text (tests, copying) */
  const text = (out) => out.paras.map((p) => (p.li ? '- ' + p.li : p)).join('\n');
  PD.Ask = { normalize, featureIds, classify, entities, decide, answer, langOf, text };
})();
