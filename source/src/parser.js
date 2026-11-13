/* Payslip decoder — PDF layout parser for Workday payslips (FR + EN templates).
   Works on positioned text items: {str, x0, x1, y, h, page}. y = baseline from top of page. */
(function (G) {
  'use strict';
  const PD = (G.PD = G.PD || {});

  const norm = (s) => String(s || '').normalize('NFC').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  const key = (s) => norm(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`´]/g, "'");
  PD.norm = norm; PD.key = key;

  /* ---------- numbers & dates ---------- */
  function parseNum(raw) {
    let s = norm(raw);
    if (!s || !/\d/.test(s)) return NaN;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/\$|CAD|USD/gi, '').trim();
    if (/^\+/.test(s)) s = s.slice(1).trim();
    if (/^[-−–]/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
    if (/[-−]$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
    s = s.trim();
    if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) || /^\d+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else if (/^\d{1,3}( \d{3})*(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) s = s.replace(/ /g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else return NaN;
    const v = parseFloat(s);
    return isNaN(v) ? NaN : (neg ? -v : v);
  }
  PD.parseNum = parseNum;
  const isNum = (s) => !isNaN(parseNum(s));
  const DATE_RE = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/;
  const DATE_RANGE_RE = /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\s*[-–]\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})\s*$/;

  /* ---------- label dictionaries (normalized keys) ---------- */
  const L = {
    name: ['nom', 'name', 'nom de l\'employe'],
    company: ['societe', 'company', 'entreprise'],
    current: ['actuel', 'current', 'periode courante', 'courant'],
    ytd: ['cumul annuel', 'ytd', 'year to date', 'cumulatif'],
    description: ['description'],
    federal: ['federal'],
    province: ['province', 'provincial', 'state', 'quebec'],
    payInfo: ['information sur le paiement', 'payment information', 'informations sur le paiement'],
    vacation: /vacance|vacation/,
  };
  const isLabel = (s, list) => list.includes(key(s));

  /* ---------- line building ---------- */
  function buildLines(pages) {
    const all = [];
    pages.forEach((pg, pi) => {
      const items = pg.items
        .map((it) => ({ ...it, str: norm(it.str), page: pi, gy: pi * 10000 + it.y }))
        .filter((it) => it.str !== '');
      items.sort((a, b) => a.gy - b.gy || a.x0 - b.x0);
      let cur = null;
      for (const it of items) {
        if (cur && Math.abs(it.gy - cur.gy) <= 1.6) { cur.items.push(it); }
        else { cur = { gy: it.gy, page: pi, items: [it] }; all.push(cur); }
      }
    });
    all.forEach((ln) => ln.items.sort((a, b) => a.x0 - b.x0));
    return all;
  }

  const within = (it, Lx, Rx) => it.x0 >= Lx - 1.5 && it.x1 <= Rx + 1.5;
  const textOf = (items) => {
    let out = '';
    let prev = null;
    for (const it of items) {
      if (prev && it.x0 - prev.x1 > 1.2 && !out.endsWith(' ')) out += ' ';
      out += it.str;
      prev = it;
    }
    return norm(out);
  };

  /* ---------- column semantics ---------- */
  function colRole(label) {
    const k = key(label);
    if (k === 'description') return 'desc';
    if (/^dates?$/.test(k) || k === 'periode') return 'dates';
    if (/(heures|hours).*(annuel|cumul|ytd)|(ytd|annual).*(hours|heures)/.test(k)) return 'ytdHours';
    if (/(montant|amount).*(annuel|cumul|ytd)|^cumul annuel$|^ytd( amount)?$|^year to date$/.test(k)) return 'ytd';
    if (/^(heures|hours|hrs)$/.test(k)) return 'hours';
    if (/^(taux|rate)$/.test(k)) return 'rate';
    if (/^(montant|amount|current)$/.test(k)) return 'amount';
    if (/^(cumule|accrued|accumule)$/.test(k)) return 'accrued';
    if (/^(reduit|reduced|utilise|used|taken)$/.test(k)) return 'reduced';
    if (/^(disponible|available|solde|balance)$/.test(k)) return 'available';
    return 'other:' + k;
  }

  /* A single text item can hold two right-aligned column headers ("Montant Cumul annuel").
     Split it on known phrases and estimate each part's x-extent from character offsets. */
  const HEAD_PHRASES = ['cumul annuel', 'montant', 'heures', 'taux', 'dates', 'description', 'ytd amount', 'ytd hours',
    'amount', 'ytd', 'hours', 'rate', 'cumule', 'reduit', 'disponible', 'accrued', 'reduced', 'available', 'balance', 'current', 'solde', 'utilise'];
  function splitHeader(o) {
    const s = o.str, k = key(s);
    const parts = [];
    let pos = 0;
    while (pos < k.length) {
      while (k[pos] === ' ') pos++;
      const ph = HEAD_PHRASES.find((p) => k.startsWith(p, pos) && (k.length === pos + p.length || k[pos + p.length] === ' '));
      if (!ph) return [{ label: s, x0: o.x0, x1: o.x1 }];
      parts.push([pos, pos + ph.length]);
      pos += ph.length;
    }
    if (parts.length < 2) return [{ label: s, x0: o.x0, x1: o.x1 }];
    const cw = (o.x1 - o.x0) / s.length;
    return parts.map(([a, b]) => ({ label: s.slice(a, b), x0: o.x0 + a * cw, x1: o.x0 + b * cw }));
  }

  /* ---------- the parser ---------- */
  function parsePayslip(pages) {
    const lines = buildLines(pages);
    const out = {
      header: {}, summary: null, sections: [], vacation: [], withholding: [], payments: [],
      warnings: [], rawLabels: {}, pageCount: pages.length,
    };
    const pageRight = (p) => Math.max(...pages[p].items.map((i) => i.x1), 0) + 2;

    /* --- header block (Nom / Société / dates) --- */
    const hdrIdx = lines.findIndex((ln) => ln.items.some((i) => isLabel(i.str, L.name)) && ln.items.some((i) => isLabel(i.str, L.company)));
    if (hdrIdx >= 0) {
      const hl = lines[hdrIdx];
      const nameItem = hl.items.find((i) => isLabel(i.str, L.name));
      const compItem = hl.items.find((i) => isLabel(i.str, L.company));
      // values line: first line below containing a date
      for (let j = hdrIdx + 1; j < Math.min(lines.length, hdrIdx + 6); j++) {
        const ln = lines[j];
        const dates = ln.items.filter((i) => DATE_RE.test(i.str) && /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(i.str));
        if (dates.length >= 2) {
          const first = ln.items[0];
          out.header.name = Math.abs(first.x0 - nameItem.x0) < 20 && !isNum(first.str) ? first.str : '';
          const comp = ln.items.find((i) => Math.abs(i.x0 - compItem.x0) < 12);
          if (comp) out.header.company = comp.str;
          const emp = ln.items.find((i) => /^[A-Z]?\d{4,}$/.test(i.str));
          if (emp) out.header.employeeId = emp.str;
          out.header.rawDates = dates.map((d) => d.str);
          // check number: an item right of the last date
          const last = dates[dates.length - 1];
          const chk = ln.items.find((i) => i.x0 > last.x1 + 5 && /^\d+$/.test(i.str));
          if (chk) out.header.checkNumber = chk.str;
          break;
        }
      }
      // address lines above the header table
      const above = lines.slice(Math.max(0, hdrIdx - 4), hdrIdx).filter((ln) => ln.page === hl.page && hl.gy - ln.gy < 40);
      for (const ln of above) {
        const t = ln.items.map((i) => i.str);
        const pos = t.findIndex((s) => /^(position|poste)\b/i.test(s));
        if (pos >= 0 || (out.header.name && key(t[0]) === key(out.header.name))) {
          const posStr = pos >= 0 ? t.slice(pos).join(' ').replace(/^(position|poste)\s*:?\s*/i, '') : '';
          if (posStr) out.header.position = posStr;
          const addr = t.slice(1, pos >= 0 ? pos : undefined).join(', ');
          if (addr) out.header.employeeAddress = addr;
        } else if (out.header.company && key(t[0]) === key(out.header.company)) {
          out.header.companyAddress = t.slice(1).join(', ');
        }
      }
    } else out.warnings.push('header-not-found');

    // dates: decide MM/DD vs DD/MM
    if (out.header.rawDates) {
      const parts = out.header.rawDates.map((d) => d.match(DATE_RE).slice(1, 4).map(Number));
      const ddmm = parts.some((p) => p[0] > 12) && !parts.some((p) => p[1] > 12);
      out.header.dateOrder = ddmm ? 'DMY' : 'MDY';
      const toISO = (p) => {
        const [a, b, y] = p; const m = ddmm ? b : a; const d = ddmm ? a : b;
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      };
      const iso = parts.map(toISO);
      out.header.periodStart = iso[0];
      out.header.periodEnd = iso[1];
      out.header.payDate = iso[2] || iso[1];
    }
    const toISOAny = (s) => {
      const m = s.match(DATE_RE); if (!m) return null;
      const ddmm = out.header.dateOrder === 'DMY';
      const a = +m[1], b = +m[2], y = +m[3];
      const mm = ddmm ? b : a, dd = ddmm ? a : b;
      return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    };

    /* --- summary (Actuel / Cumul annuel) --- */
    const curIdx = lines.findIndex((ln) => isLabel(ln.items[0].str, L.current) && ln.items.filter((i) => isNum(i.str)).length >= 3);
    if (curIdx > 0) {
      const curLn = lines[curIdx];
      const ytdLn = lines.slice(curIdx + 1, curIdx + 3).find((ln) => isLabel(ln.items[0].str, L.ytd));
      // header line: closest line above with >= 3 non-numeric items
      let hdr = null;
      for (let j = curIdx - 1; j >= Math.max(0, curIdx - 3); j--) {
        const nonNum = lines[j].items.filter((i) => !isNum(i.str));
        if (nonNum.length >= 3) { hdr = lines[j]; break; }
      }
      if (hdr) {
        const cols = hdr.items.filter((i) => !isNum(i.str)).map((i) => ({ label: i.str, x1: i.x1, x0: i.x0 }));
        const pick = (ln) => {
          const nums = ln ? ln.items.filter((i) => isNum(i.str)).sort((a, b) => a.x1 - b.x1) : [];
          if (nums.length === cols.length) return nums.map((i) => parseNum(i.str)); // one value per column, in order
          return cols.map((c) => {
            const it = nums.find((i) => Math.abs(i.x1 - c.x1) < 6);
            return it ? parseNum(it.str) : null;
          });
        };
        const cur = pick(curLn), ytd = pick(ytdLn);
        out.summary = { columns: cols.map((c, i) => ({ label: c.label, current: cur[i], ytd: ytd[i] })) };
      }
    }
    if (!out.summary) out.warnings.push('summary-not-found');

    /* --- sections with a "Description" header --- */
    const descHeads = [];
    lines.forEach((ln, li) => ln.items.forEach((it) => { if (isLabel(it.str, L.description)) descHeads.push({ li, it }); }));
    const secDefs = descHeads.map(({ li, it }) => {
      const ln = lines[li];
      const nextOnLine = ln.items.filter((o) => isLabel(o.str, L.description) && o.x0 > it.x0 + 5).sort((a, b) => a.x0 - b.x0)[0];
      const Lx = it.x0 - 1;
      const Rx = nextOnLine ? nextOnLine.x0 - 3 : pageRight(ln.page);
      // title: nearest line above (same page, within 16pt) with non-numeric text within [Lx,Rx]
      let title = '', titleGy = ln.gy;
      for (let j = li - 1; j >= Math.max(0, li - 3); j--) {
        const up = lines[j];
        if (up.page !== ln.page || ln.gy - up.gy > 16) break;
        const t = up.items.filter((o) => within(o, Lx, Rx) && !isNum(o.str));
        if (t.length) { title = textOf(t); titleGy = up.gy; break; }
      }
      return { li, Lx, Rx, title, titleGy, headGy: ln.gy, page: ln.page };
    });

    // barrier items: other section titles + standalone labels
    const barriers = [];
    secDefs.forEach((s) => barriers.push({ gy: s.titleGy, Lx: s.Lx, Rx: s.Rx }));
    lines.forEach((ln) => ln.items.forEach((it) => {
      const k = key(it.str);
      if (L.payInfo.includes(k) || /^solde de vacances|^accumulation de vacances|^vacation balance|^montant total de la demande$|^total claim amount$/.test(k) || isLabel(it.str, L.federal)) {
        barriers.push({ gy: ln.gy, Lx: it.x0, Rx: it.x1 });
      }
    }));

    for (const sd of secDefs) {
      const hl = lines[sd.li];
      const headItems = hl.items.filter((o) => within(o, sd.Lx, sd.Rx));
      const cols = [];
      for (const o of headItems) for (const part of splitHeader(o)) cols.push(part);
      // header continuation lines
      let j = sd.li + 1;
      for (; j < lines.length; j++) {
        const ln = lines[j];
        if (ln.page !== hl.page || ln.gy - hl.gy > 22) break;
        const its = ln.items.filter((o) => within(o, sd.Lx, sd.Rx));
        if (!its.length) continue;
        const startsAtDesc = its.some((o) => Math.abs(o.x0 - cols[0].x0) < 4);
        if (startsAtDesc || its.some((o) => isNum(o.str))) break;
        for (const o of its) {
          const c = cols.filter((c) => c !== cols[0]).sort((a, b) => Math.abs(a.x1 - o.x1) - Math.abs(b.x1 - o.x1))[0];
          if (c && Math.abs(c.x1 - o.x1) < 6) { c.label = c.label + ' ' + o.str; c.x0 = Math.min(c.x0, o.x0); }
        }
      }
      cols.forEach((c) => (c.role = colRole(c.label)));
      // Workday always puts year-to-date columns to the right of current ones: a repeated
      // "Hours"/"Amount" header further right is the YTD version.
      const seenRoles = new Set();
      cols.slice().sort((a, b) => a.x0 - b.x0).forEach((c) => {
        if (seenRoles.has(c.role)) c.role = c.role === 'hours' ? 'ytdHours' : c.role === 'amount' ? 'ytd' : c.role;
        seenRoles.add(c.role);
      });
      const numCols = cols.filter((c) => !['desc', 'dates'].includes(c.role));
      const datesCol = cols.find((c) => c.role === 'dates');
      const firstNumX0 = numCols.length ? Math.min(...numCols.map((c) => c.x0)) - 4 : sd.Rx;

      const rows = [];
      let total = null;
      for (; j < lines.length; j++) {
        const ln = lines[j];
        if (barriers.some((b) => b.gy > sd.headGy + 0.5 && Math.abs(b.gy - ln.gy) < 1.6 && b.Lx < sd.Rx && b.Rx > sd.Lx)) break;
        const its = ln.items.filter((o) => within(o, sd.Lx, sd.Rx));
        if (!its.length) continue;
        // skip repeated header lines on new pages
        if (its.some((o) => isLabel(o.str, L.description))) continue;
        const numItems = [], descParts = [];
        let datesStr = '';
        for (const o of its) {
          if (isNum(o.str) && o.x0 >= firstNumX0 - 30 && numCols.length) { numItems.push(o); continue; }
          if (datesCol && DATE_RANGE_RE.test(o.str) && !/[a-z]/i.test(o.str.replace(DATE_RANGE_RE, ''))) { datesStr = o.str; continue; }
          descParts.push(o);
        }
        let desc = textOf(descParts);
        const m = desc.match(DATE_RANGE_RE);
        if (m) { datesStr = datesStr || m[0]; desc = norm(desc.slice(0, m.index)); }
        const row = { desc, numItems, values: {}, gy: ln.gy };
        if (datesStr) {
          const dm = datesStr.match(DATE_RANGE_RE);
          row.dates = { from: toISOAny(dm[1]), to: toISOAny(dm[2]), raw: norm(dm[0]) };
        }
        if (sd.title && key(desc) === key(sd.title)) { total = row; break; }
        if (!numItems.length && rows.length && ln.gy - rows[rows.length - 1].gy < 9.6 && desc && !row.dates) {
          rows[rows.length - 1].desc = norm(rows[rows.length - 1].desc + ' ' + desc);
          continue;
        }
        if (!desc && !numItems.length) continue;
        rows.push(row);
      }
      // Numbers are right-aligned: cluster their right edges, then map clusters to the
      // numeric header columns in left-to-right order (robust to header misalignment).
      const all = rows.concat(total ? [total] : []);
      const edges = all.flatMap((r) => r.numItems.map((o) => o.x1)).sort((a, b) => a - b);
      const clusters = [];
      for (const x of edges) {
        const c = clusters[clusters.length - 1];
        if (c && x - c.max <= 4) { c.max = x; c.sum += x; c.n++; } else clusters.push({ min: x, max: x, sum: x, n: 1 });
      }
      clusters.forEach((c) => (c.x = c.sum / c.n));
      const colsByX = numCols.slice().sort((a, b) => a.x1 - b.x1);
      const roleFor = (x1) => {
        if (clusters.length === colsByX.length) {
          const i = clusters.findIndex((c) => x1 >= c.min - 0.5 && x1 <= c.max + 0.5);
          if (i >= 0) return colsByX[i].role;
        }
        const c = colsByX.slice().sort((a, b) => Math.abs(a.x1 - x1) - Math.abs(b.x1 - x1))[0];
        return c && Math.abs(c.x1 - x1) < 12 ? c.role : null;
      };
      for (const r of all) {
        for (const o of r.numItems) {
          const role = roleFor(o.x1);
          if (role && !(role in r.values)) r.values[role] = parseNum(o.str);
          else r.desc = norm(r.desc + ' ' + o.str);
        }
        delete r.numItems;
      }
      out.sections.push({ title: sd.title, columns: cols.map((c) => ({ label: c.label, role: c.role })), rows, total, page: sd.page, x: sd.Lx });
    }

    /* --- vacation balances (label line, values below) --- */
    lines.forEach((ln, li) => {
      const labs = ln.items.filter((i) => L.vacation.test(key(i.str)) && !isNum(i.str));
      if (!labs.length || ln.items.some((i) => isNum(i.str)) || ln.items.some((i) => isLabel(i.str, L.description))) return;
      if (!labs.every((l) => /solde|accumul|balance|accrual|courant/.test(key(l.str)))) return;
      const nx = lines[li + 1];
      if (!nx) return;
      for (const lab of labs) {
        const v = nx.items.find((i) => isNum(i.str) && Math.abs(i.x0 - lab.x0) < 8);
        if (v) out.vacation.push({ label: lab.str, value: parseNum(v.str) });
      }
    });

    /* --- withholding (TD1 / TP-1015.3) table --- */
    const fedIdx = lines.findIndex((ln) => ln.items.some((i) => isLabel(i.str, L.federal)) && ln.items.some((i) => isLabel(i.str, L.province)));
    if (fedIdx >= 0) {
      const fl = lines[fedIdx];
      const fed = fl.items.find((i) => isLabel(i.str, L.federal));
      const prov = fl.items.find((i) => isLabel(i.str, L.province));
      const Rx = prov.x1 + 4;
      for (let j = fedIdx + 1; j < lines.length; j++) {
        const ln = lines[j];
        if (ln.page !== fl.page) break;
        const its = ln.items.filter((o) => o.x1 <= Rx);
        if (!its.length) continue;
        if (its.some((o) => L.payInfo.includes(key(o.str)))) break;
        const f = its.find((o) => isNum(o.str) && Math.abs(o.x1 - fed.x1) < 6);
        const p = its.find((o) => isNum(o.str) && Math.abs(o.x1 - prov.x1) < 6);
        const lab = textOf(its.filter((o) => o !== f && o !== p));
        if (!f && !p) {
          if (lab && out.withholding.length) out.withholding[out.withholding.length - 1].label += ' ' + lab;
          continue;
        }
        out.withholding.push({ label: lab, federal: f ? parseNum(f.str) : null, provincial: p ? parseNum(p.str) : null });
      }
    }

    /* --- payment information --- */
    const payIdx = lines.findIndex((ln) => ln.items.some((i) => L.payInfo.includes(key(i.str))));
    if (payIdx >= 0) {
      const hdr = lines[payIdx + 1];
      if (hdr) {
        const cols = hdr.items.map((i) => ({ label: i.str, k: key(i.str), x0: i.x0, x1: i.x1 }));
        for (let j = payIdx + 2; j < lines.length; j++) {
          const ln = lines[j];
          if (ln.page !== hdr.page && j > payIdx + 2) break;
          if (ln.gy - lines[j - 1].gy > 30) break;
          const row = { bank: '', accountName: '', accountNumber: '', amount: null, currency: '' };
          for (const it of ln.items) {
            if (isNum(it.str) && /\./.test(it.str)) { row.amount = parseNum(it.str); continue; }
            if (/^[A-Z]{3}$/.test(it.str)) { row.currency = it.str; continue; }
            const c = cols.slice().sort((a, b) => Math.abs(a.x0 - it.x0) - Math.abs(b.x0 - it.x0))[0];
            if (!c) continue;
            if (/banque|^bank$/.test(c.k)) row.bank = it.str;
            else if (/nom du compte|account name/.test(c.k)) row.accountName = it.str;
            else if (/compte|account/.test(c.k)) row.accountNumber = it.str;
          }
          if (row.amount != null || row.bank) out.payments.push(row);
        }
      }
    }
    return out;
  }
  PD.parsePayslip = parsePayslip;

  /* ---------- pdf.js glue ---------- */
  PD.extractPages = async function (pdfjs, data) {
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: true }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const [a, , , d, e, f] = it.transform;
        const size = Math.abs(d) || Math.abs(a) || it.height;
        items.push({ str: it.str, x0: e, x1: e + it.width, y: vp.height - f, h: size });
      }
      pages.push({ width: vp.width, height: vp.height, items });
    }
    return { doc, pages };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
