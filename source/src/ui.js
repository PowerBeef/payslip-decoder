/* Payslip decoder — UI (v3): five views, responsive shell, example payslip at rest. */
(function () {
  'use strict';
  const PD = window.PD;
  const BUILD = PD.BUILD || { target: 'offline' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const sum = (a) => r2(a.reduce((s, v) => s + (v || 0), 0));
  /* the tab bar; the full list of checks is its own view, reached from Pay, its warning card and the assistant.
     Pay holds what used to be two tabs (overview and line by line); #overview still opens it. */
  const TABS = ['pay', 'year', 'ask', 'guide'];
  const VIEWS = [...TABS, 'checks'];
  const ALIAS = { overview: 'pay' };
  const viewOf = (v) => ALIAS[v] || v;
  const tabOf = (v) => (v === 'checks' ? 'pay' : v);

  /* ---------- state ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  // French by default (Québec workplace); a choice made in the app is remembered.
  const state = {
    slips: [], cur: -1, sample: null, demo: false, lang: ['en', 'fr'].includes(store.get('pd-lang')) ? store.get('pd-lang') : 'fr',
    priv: false, view: 'pay', loading: false, printing: false, anim: null, welcomed: false, helpMode: null,
    chat: [], pendingAsk: null, // assistant questions and answers: kept in memory only, never stored
  };
  const rec = () => state.slips[state.cur] || (state.demo ? state.sample : null);
  /* motion: honour Reduce Motion; on low-memory or data-saver devices keep only light fades and drop blur */
  const mq = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  const REDUCED = mq('(prefers-reduced-motion: reduce)');
  const LITE = REDUCED || (navigator.deviceMemory && navigator.deviceMemory <= 2) || !!(navigator.connection && navigator.connection.saveData) || mq('(prefers-reduced-transparency: reduce)');
  if (LITE) document.documentElement.classList.add('lite');

  /* ---------- icons ---------- */
  const sv = (d, vb = 24, sw = 1.8) => `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    check: sv('<path d="M3.5 8.5l3 3 6-7"/>', 16, 2.2),
    warn: sv('<path d="M8 3.5v5.5"/><circle cx="8" cy="12.3" r=".7" fill="currentColor"/>', 16, 2.2),
    info: sv('<path d="M8 7v5.5"/><circle cx="8" cy="4" r=".7" fill="currentColor"/>', 16, 2.2),
    tPay: sv('<path d="M6 2.8h12v18.4l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 7.5h6M9 11h6M9 14.5h3.5"/>'),
    tAsk: sv('<path d="M5.2 4.2h13.6a2.2 2.2 0 012.2 2.2v8.6a2.2 2.2 0 01-2.2 2.2H12l-4.6 3.6V17.2H5.2A2.2 2.2 0 013 15V6.4a2.2 2.2 0 012.2-2.2z"/><path d="M9.9 8.8a2.2 2.2 0 114.1 1.1c-.6.8-2 1.1-2 2.3"/><circle cx="12" cy="14.6" r=".55" fill="currentColor"/>'),
    tYear: sv('<rect x="3" y="4.5" width="18" height="16" rx="2.4"/><path d="M3 9h18M8 2.8v3.4M16 2.8v3.4"/><path d="M8 17v-3.5M12 17v-5M16 17v-2"/>'),
    tGuide: sv('<path d="M12 6.5c-2-1.6-4.8-2-8-1.6v13c3.2-.4 6 0 8 1.6 2-1.6 4.8-2 8-1.6v-13c-3.2-.4-6 0-8 1.6z"/><path d="M12 6.5v13"/>'),
    upload: sv('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4.5 14.5v4.2h15v-4.2"/>', 24, 2),
    dots: sv('<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>', 24, 1),
    eye: sv('<path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20L20 4"/>'),
    csv: sv('<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4.5 16v4h15v-4"/>'),
    print: sv('<path d="M6.5 8.5V3.5h11v5M6.5 17.5H3.8v-9h16.4v9h-2.7"/><path d="M6.5 14h11v6.5h-11z"/>'),
    lock: sv('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>'),
    alert: sv('<path d="M12 3.5l9.3 16.5H2.7z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".8" fill="currentColor"/>'),
    undo: sv('<path d="M8.5 7.5L4.5 11.5l4 4"/><path d="M4.5 11.5h10a5 5 0 010 10h-3"/>'),
    trend: sv('<path d="M3.5 17.5l6-6 4 4 7-7.5"/><path d="M15 8h5.5v5.5"/>'),
    clock: sv('<circle cx="12" cy="12" r="8.8"/><path d="M12 7v5.2l3.4 2"/>'),
    piggy: sv('<path d="M4.5 12.5a7 5.6 0 0113.4-2.3l2.6-.7-.6 3.3a6 6 0 01-2.4 3.8V20h-3v-2.1a9 9 0 01-3.4 0V20h-3v-2.6a6 6 0 01-3.6-4.9z"/><circle cx="15.3" cy="11.3" r=".8" fill="currentColor"/>'),
    grid: sv('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17"/>'),
    sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
    pct: sv('<path d="M5 19L19 5"/><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/>'),
    arrow: sv('<path d="M4 12h15M14 7l5 5-5 5"/>', 24, 2),
    chev: sv('<path d="M6 3.5L10.5 8 6 12.5"/>', 16, 2),
    x: sv('<path d="M6 6l12 12M18 6L6 18"/>', 24, 2),
    send: sv('<path d="M12 19.5V5M6 11l6-6 6 6"/>', 24, 2.2),
    qr: sv('<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.3"/><path d="M14 14h2.6v2.6M20.5 14v.01M14 20.5h.01M17.5 20.5h3v-3"/>'),
    share: sv('<path d="M12 15V3.8M7.8 7.6L12 3.5l4.2 4.1"/><path d="M8.5 11H6.3a1.8 1.8 0 00-1.8 1.8v6.4a1.8 1.8 0 001.8 1.8h11.4a1.8 1.8 0 001.8-1.8v-6.4a1.8 1.8 0 00-1.8-1.8h-2.2"/>'),
    copy: sv('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2h3"/>'),
    help: sv('<path d="M6 2.8h8.5L19 7.3V21.2H6z"/><path d="M14.5 2.8v4.5H19"/><path d="M10 12.2a2.5 2.5 0 114.2 1.8c-.8.6-1.7 1.1-1.7 2.2"/><circle cx="12.5" cy="18.6" r=".6" fill="currentColor"/>'),
    install: sv('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4"/><path d="M12 7.5v7M9 11.5l3 3 3-3"/>'),
  };
  const TAB_ICON = { pay: I.tPay, ask: I.tAsk, year: I.tYear, guide: I.tGuide };
  const ST_RANK = { warn: 0, info: 1, okish: 2, ok: 3 };
  const byStatus = (a, b) => (ST_RANK[a.status] ?? 4) - (ST_RANK[b.status] ?? 4);
  /* agreement checks are about the worker's own rate and premiums, so they lead; arithmetic rarely fails, so it closes */
  const checkGroups = (A) => ['agreement', 'gov', 'math'].map((g) => [g, A.checks.filter((c) => c.group === g).sort(byStatus)]).filter(([, r]) => r.length).sort((a, b) => (a[1].some((c) => c.status === 'warn') ? 0 : 1) - (b[1].some((c) => c.status === 'warn') ? 0 : 1));
  const stIcon = (st) => (st === 'warn' ? I.warn : st === 'info' ? I.info : I.check);
  const brandIcon = '<svg width="30" height="23" viewBox="0 0 28 22" aria-hidden="true"><rect x="1" y="1" width="26" height="20" rx="3.5" fill="var(--s-net)"/><path d="M1 14.5h26" stroke="var(--sheet)" stroke-width="1.6" stroke-dasharray="2 2"/><path d="M5 6h10M5 9.5h6" stroke="var(--sheet)" stroke-width="1.8" stroke-linecap="round"/></svg>';

  /* ---------- locale ---------- */
  // year: the payslip's year; the text is rewritten only when it isn't the current year
  function makeL(lang, ag, year) {
    const loc = lang === 'fr' ? 'fr-CA' : 'en-CA';
    const cur = new Intl.NumberFormat(loc, { style: 'currency', currency: 'CAD' });
    const cur0 = new Intl.NumberFormat(loc, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
    const d = (iso) => new Date(iso + 'T12:00:00');
    const er = (t) => (lang === 'fr' ? t.replace(/(^|\s)1 (?=[a-zéû])/, '$11er ') : t); // « 1er février »
    return {
      lang, loc, s: year && year !== new Date().getFullYear() ? yearText(lang, year) : PD.STR[lang],
      money: (v) => (v == null || isNaN(v) ? '—' : cur.format(v)),
      money0: (v) => (v == null || isNaN(v) ? '—' : cur0.format(v)),
      moneyParts: (v) => cur.formatToParts(v || 0),
      num: (v, dd = 2) => (v == null || isNaN(v) ? '—' : new Intl.NumberFormat(loc, { maximumFractionDigits: dd }).format(v)),
      pct: (v, dd = 1) => new Intl.NumberFormat(loc, { minimumFractionDigits: dd, maximumFractionDigits: dd }).format(v) + (lang === 'fr' ? ' %' : '%'),
      date: (iso) => (iso ? er(new Intl.DateTimeFormat(loc, { dateStyle: 'long' }).format(d(iso))) : '—'),
      dateW: (iso) => (iso ? er(new Intl.DateTimeFormat(loc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d(iso))) : '—'),
      dateS: (iso) => (iso ? new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric' }).format(d(iso)) : '—'),
      dateSY: (iso) => (iso ? new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric', year: 'numeric' }).format(d(iso)) : '—'),
      month: (m) => new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(2026, m, 15)).replace('.', ''),
      range: (a, b) => {
        if (!a || !b) return '—';
        const f = new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric', year: 'numeric' });
        return f.formatRange ? f.formatRange(d(a), d(b)) : `${f.format(d(a))} – ${f.format(d(b))}`;
      },
      kind: (k) => (PD.KINDS[k] ? PD.KINDS[k][lang] : k),
      expl: (k) => { const a = ag && ag.kinds && ag.kinds[k]; if (a) return a[lang] || a.en; const K = PD.KINDS[k]; if (!K) return ''; return lang === 'fr' ? K.dfr : K.den; },
      h: (v) => (v == null ? '—' : new Intl.NumberFormat(loc, { maximumFractionDigits: 2 }).format(v) + ' h'),
    };
  }
  /* A payslip from an earlier year: "this year" in the text means that year, so name it. */
  const YEAR_TEXT = new Map();
  function yearText(lang, y) {
    const id = lang + y;
    if (YEAR_TEXT.has(id)) return YEAR_TEXT.get(id);
    const fix = lang === 'fr'
      ? (t) => (t === 'Cette année' ? String(y) : t.replace(/Plus tôt cette année/g, `Plus tôt en ${y}`).replace(/Cette année(?!-là)/g, `En ${y}`).replace(/cette année(?!-là)/g, `en ${y}`).replace(/([Dd])epuis le début de l’année/g, `$1epuis le début de ${y}`))
      : (t) => (t === 'This year' ? String(y) : t.replace(/\b(Earlier|[Ss]o far) this year\b/g, `$1 in ${y}`).replace(/\bThis year\b/g, `In ${y}`).replace(/\bthis year\b/g, `in ${y}`));
    const walk = (x) => {
      if (typeof x === 'string') return fix(x);
      if (typeof x === 'function') return (...a) => { const r = x(...a); return typeof r === 'string' ? fix(r) : r; };
      if (Array.isArray(x)) return x.map(walk);
      if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) o[k] = walk(x[k]); return o; }
      return x;
    };
    const out = walk(PD.STR[lang]);
    YEAR_TEXT.set(id, out);
    return out;
  }
  const val = (x, L) => (typeof x === 'function' ? x(L) : x);
  const catOf = (kind) => (['fedTax', 'qcTax', 'provTax'].includes(kind) ? 'incomeTax' : ['qpp', 'qpp2', 'cpp', 'cpp2', 'ei', 'qpip', 'otherTax'].includes(kind) ? 'gov' : ['pension', 'union', 'rrsp', 'ftq'].includes(kind) ? 'pensionUnion' : 'benefitsOther');
  const dk = (k) => (k === 'other' ? 'otherDed' : k);
  const maskAcct = (s) => String(s || '').replace(/\*{2,}(\d{2,})/, '••$1');
  const SHORT = { en: { qpp: 'QPP', qpp2: 'QPP2', ei: 'EI', qpip: 'QPIP' }, fr: { qpp: 'RRQ', qpp2: 'RRQ2', ei: 'AE', qpip: 'RQAP' } };
  const taxSort = (a, b) => (PD.TAX_ORDER || []).indexOf(a.kind) - (PD.TAX_ORDER || []).indexOf(b.kind);

  /* ---------- small components ---------- */
  function guilloche(seed = 0, w = 1000, h = 280, n = 28) {
    let p = '';
    for (let i = 0; i < n; i++) {
      let d = '';
      for (let x = 0; x <= w; x += 8) {
        const y = h / 2 + Math.sin(x / 96 + i * 0.23 + seed) * h * 0.3 * Math.cos(x / 420 - i * 0.045) + Math.sin(x / 31 + i * 0.7) * 4;
        d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1);
      }
      p += `<path class="${i % 3 ? '' : 'b'}" d="${d}"/>`;
    }
    return `<svg class="guil" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${p}</svg>`;
  }
  const card = (id, title, body, { intro = '', aside = '', cls = '' } = {}) =>
    `<section class="card ${cls}" id="${id}" aria-labelledby="${id}-h"><div class="card-h"><h2 id="${id}-h">${esc(title)}</h2>${aside ? `<div class="card-a">${aside}</div>` : ''}</div>${intro ? `<p class="card-i">${intro}</p>` : ''}${body}</section>`;
  const chip = (txt, cls = '', icon = '') => `<span class="chip ${cls}">${icon}${esc(txt)}</span>`;
  function li({ name, orig, calc, expl, amt, sub, chips = '', cls = '', extra = '' }) {
    const o = [orig ? `<span class="o">${esc(orig)}</span>` : '', calc ? `<span class="c">${esc(calc)}</span>` : ''].join('');
    return `<div class="li ${cls}"><div class="li-m"><div class="li-n">${esc(name)}</div>${o ? `<div class="li-o">${o}</div>` : ''}${expl ? `<p class="li-x">${esc(expl)}</p>` : ''}${extra}${chips ? `<div class="chips">${chips}</div>` : ''}</div><div class="li-a"><b>${esc(amt)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
  }
  const meter = (pct, cls = '') => `<div class="meter ${cls}" role="presentation"><i style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></i></div>`;
  function ring(ok, total, warn, size = 64) {
    const r = 18, c = 2 * Math.PI * r, f = total ? ok / total : 0;
    return `<svg class="ring ${warn ? 'has-warn' : ''}" width="${size}" height="${size}" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" class="rt"/><circle cx="22" cy="22" r="${r}" class="rf" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 22 22)"/><text x="22" y="22" text-anchor="middle" dominant-baseline="central">${ok}/${total}</text></svg>`;
  }
  // a whole percent, but never "0%" for an amount that isn't zero
  const pct0 = (L, v) => (v > 0 && v < 0.5 ? (L.lang === 'fr' ? '< 1 %' : '<1%') : L.pct(v, 0));
  // squares: the legend sits next to the 100 squares, so it shows their counts (which add up to 100);
  // elsewhere each share is simply rounded, as the year totals above it are
  function splitLegend(parts, total, L, { hover = false, squares: sqs = false } = {}) {
    const s = L.s;
    const sq = total ? (sqs ? squares(parts, total) : parts.map((x) => Math.round((x.amount / total) * 100))) : parts.map(() => 0);
    return `<ul class="legend ${hover ? 'hov' : ''}">${parts.map((x, i) => `<li ${hover ? `data-cat="${x.id}" tabindex="0"` : ''}><span class="sw c-${x.id}"></span><span class="lab">${esc(s.split[x.id])}<small>${esc(s.splitSub[x.id])}</small></span><span class="val">${esc(L.money(x.amount))}<small>${esc(sq[i] || !x.amount ? L.pct(sq[i], 0) : pct0(L, (x.amount / total) * 100))}</small></span></li>`).join('')}</ul>`;
  }
  function squares(parts, total, n = 100) {
    const raw = parts.map((p) => (p.amount / total) * n);
    const fl = raw.map(Math.floor);
    let rem = n - fl.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem > 0) { fl[i]++; rem--; } });
    return fl;
  }

  /* ================= VIEWS ================= */

  /* ---------- overview ---------- */
  function netHtml(L, v) {
    let main = '', cts = '', sym = '', after = false, seen = false;
    L.moneyParts(v).forEach((p) => {
      if (p.type === 'currency') { sym = p.value; after = seen; }
      else if (p.type === 'integer' || p.type === 'group' || p.type === 'minusSign') { main += p.value; seen = true; }
      else if (p.type === 'decimal' || p.type === 'fraction') cts += p.value;
    });
    return after ? `<span class="ni">${esc(main)}</span><span class="cts">${esc(cts)}</span><span class="cur"> ${esc(sym)}</span>` : `<span class="cur">${esc(sym)}</span><span class="ni">${esc(main)}</span><span class="cts">${esc(cts)}</span>`;
  }
  function stub(A, L) {
    const s = L.s, m = A.meta, S = A.summary, pay = A.payments[0];
    const freq = { 52: s.weekly, 26: s.biweekly, 24: s.semimonthly, 12: s.monthly }[m.P];
    const withheld = r2((S.gross || 0) - (S.net || 0));
    return `<section class="stub" aria-labelledby="net-lbl">
      <div class="stub-top">${guilloche(0)}
        <div class="stub-k"><span id="net-lbl">${esc(s.tookHome)}</span><span class="stub-d">${esc(L.dateW(m.payDate))}</span></div>
        <div class="net">${netHtml(L, S.net)}</div>
        ${pay ? `<div class="dep">${esc(s.depositedTo)} <b>${esc(pay.bank)} <span class="pii">${esc(maskAcct(pay.accountNumber || pay.accountName))}</span></b></div>` : ''}
      </div>
      <div class="perf" aria-hidden="true"></div>
      <div class="stub-bot">
        <div class="eq"><div><span>${esc(s.gross)}</span><b>${esc(L.money(S.gross))}</b></div><i aria-hidden="true">−</i><div><span>${esc(s.withheld)}</span><b>${esc(L.money(withheld))}</b></div><i aria-hidden="true">=</i><div class="n"><span>${esc(s.net)}</span><b>${esc(L.money(S.net))}</b></div></div>
        <dl class="meta">
          <div><dt>${esc(s.period)}</dt><dd>${esc(L.range(m.periodStart, m.periodEnd))}${freq ? ` <span class="muted">(${esc(freq)})</span>` : ''}</dd></div>
          ${m.name ? `<div><dt>${esc(s.employee)}</dt><dd class="pii">${esc(m.name)}</dd></div>` : ''}
          ${m.position ? `<div><dt>${esc(s.position)}</dt><dd>${esc(m.position)}</dd></div>` : ''}
        </dl>
      </div>
    </section>`;
  }
  /* balances are as of the payslip: worth saying once it is a few weeks old */
  const stale = (A) => { const d = A.meta.payDate; if (!d) return false; const t = new Date(); t.setDate(t.getDate() - 14); return d < `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  /* which rules a payslip is held to: those in force on its pay date (on the card, only for an earlier year) */
  function asOf(A, L, onlyPast) {
    const d = A.meta.rulesDate;
    if (!d || (onlyPast && +d.slice(0, 4) >= new Date().getFullYear())) return '';
    return `<p class="asof">${I.tYear}<span>${esc(L.s.rulesAsOf(L.date(d)))}</span></p>`;
  }
  function checkCard(A, L, id = '') {
    const s = L.s, st = A.checkStats, n = st.ok + st.warn;
    const ordered = checkGroups(A).flatMap(([, r]) => r);
    const warns = ordered.filter((c) => c.status === 'warn');
    const flag = (warns.length ? warns : ordered.filter((c) => c.status === 'info')).slice(0, 2);
    return `<section class="card chk ${st.warn ? 'has-warn' : ''}"${id ? ` id="${id}"` : ''} aria-labelledby="chk-h">
      ${ring(st.ok, n, st.warn)}
      <div class="chk-t"><h2 id="chk-h">${esc(st.warn ? s.checksWarn(st.warn) : s.checksLine(st.ok, n))}</h2><p>${esc(st.warn ? s.checksLine(st.ok, n) : A.agreement ? s.checksSub : s.checksSubNoAg)}</p>
      ${asOf(A, L, true)}
      ${flag.length ? `<ul class="chk-l">${flag.map((c) => `<li class="${c.status}"><span class="ic" aria-hidden="true">${stIcon(c.status)}</span><span>${esc(val(c.title, L))}<small>${esc(s.st[c.status])}</small></span></li>`).join('')}</ul>` : ''}
      <button class="link" data-go="checks">${esc(s.seeChecks)}${I.chev}</button></div>
    </section>`;
  }
  function whereCard(A, L) {
    const s = L.s, S = A.summary, g = S.gross || 1;
    const parts = A.split.filter((x) => x.amount > 0);
    const n = squares(parts, g);
    let cells = '', j = 0;
    parts.forEach((p, i) => { for (let k = 0; k < n[i]; k++, j++) cells += `<i class="c-${p.id}" data-c="${p.id}" style="--i:${(j % 10) + Math.floor(j / 10)}"></i>`; });
    return `<section class="card where" id="p-where" aria-labelledby="where-h">
      <div class="card-h"><h2 id="where-h">${esc(s.whereTitle(L.money(S.gross)))}</h2></div>
      <p class="card-i">${esc(s.whereSub)}</p>
      <div class="where-b"><div class="waffle" role="img" aria-label="${esc(parts.map((x, i) => `${s.split[x.id]} ${L.pct(n[i], 0)}`).join(', '))}">${cells}</div>
      ${splitLegend(parts, g, L, { hover: true, squares: true })}</div>
    </section>`;
  }
  /* most specific to this pay first: back pay, overtime, holiday pay, a higher rate, then yearly and general facts */
  function insights(A, L) {
    const s = L.s, out = [], curE = A.earnings.filter((e) => e.current);
    const retro = curE.filter((e) => e.retro);
    if (retro.length) out.push({ tone: 'info', icon: I.undo, title: s.ins.retroT, text: s.ins.retro(L.range(retro[0].dates.from, retro[0].dates.to), L.money(sum(retro.map((e) => e.amount)))), go: 'pay:c-earnings' });
    const ot = curE.filter((e) => e.cat === 'overtime' && e.amount);
    if (ot.length) out.push({ tone: 'neutral', icon: I.clock, title: s.ins.otT(L.num(sum(ot.map((e) => e.hours)))), text: s.ins.ot(L.money(sum(ot.map((e) => e.amount))), L.num(ot[0].mult || 1.5)), go: 'pay:c-earnings' });
    const hol = curE.filter((e) => e.cat === 'holiday' && e.hours);
    if (hol.length) out.push({ tone: 'neutral', icon: I.sun, title: s.ins.holidayT(L.num(sum(hol.map((e) => e.hours)))), text: s.ins.holiday, go: 'pay:c-earnings' });
    const higher = (A.rateMatches || []).filter((r) => r.hit && A.mainRate && r.rate > A.mainRate + 0.004);
    if (higher.length) out.push({ tone: 'neutral', icon: I.trend, title: s.ins.higherT(L.num(higher[0].hours)), text: PD.agText(A.agreement, L.lang, 'insHigher', { rate: L.money(higher[0].rate), cls: higher[0].hit.cls, lv: higher[0].hit.level }) || s.ins.higher(L.money(higher[0].rate), higher[0].hit.cls, higher[0].hit.level), go: 'pay:c-earnings' });
    const P = A.projections || {};
    const hit = ['ei', 'qpp', 'qpip', 'qpp2'].find((k) => P[k] && P[k].reached);
    const soon = ['ei', 'qpp', 'qpip', 'qpp2'].filter((k) => P[k] && P[k].thisYear).sort((a, b) => P[a].date.localeCompare(P[b].date))[0];
    if (hit) out.push({ tone: 'good', icon: I.trend, title: s.ins.maxHitT(SHORT[L.lang][hit]), text: s.ins.maxHit, go: 'year' });
    else if (soon) out.push({ tone: 'good', icon: I.trend, title: s.ins.maxSoonT(SHORT[L.lang][soon], L.dateS(P[soon].date)), text: s.ins.maxSoon(L.money(P[soon].perPay)), go: 'year' });
    const pe = A.deductions.find((d) => d.kind === 'pension' && d.amount);
    const er = A.employer.find((e) => e.kind === 'erPension');
    if (pe) out.push({ tone: 'neutral', icon: I.piggy, title: s.ins.pensionT(L.money(pe.amount + (er ? er.amount || 0 : 0))), text: s.ins.pension(L.money(pe.amount), L.money(er ? er.amount : 0), L.money((pe.ytd || 0) + (er ? er.ytd || 0 : 0))), go: 'pay:c-ded0' });
    const main = (A.rateMatches || []).find((r) => r.hit && r.rate === A.mainRate);
    if (main && A.agreement) out.push({ tone: 'neutral', icon: I.grid, title: s.ins.rateT(L.money(main.rate), main.hit.cls, main.hit.level), text: s.ins.rate(L.date(PD.scaleFor(A.agreement, A.meta.periodStart || A.meta.payDate).from)), go: 'guide:agreement' });
    const it = A.split.find((x) => x.id === 'incomeTax');
    if (it && it.amount && A.summary.gross) out.push({ tone: 'neutral', icon: I.pct, title: s.ins.taxT(L.pct((it.amount / A.summary.gross) * 100, 0)), text: s.ins.tax, go: 'pay:c-taxes' });
    return out.slice(0, 4);
  }
  function insightsBlock(A, L) {
    const list = insights(A, L);
    if (!list.length) return '';
    return `<section class="ins" aria-labelledby="ins-h"><h2 id="ins-h" class="sec-t">${esc(L.s.insTitle)}</h2><div class="ins-g">${list.map((x) => `<article class="insight t-${x.tone}"><span class="ii">${x.icon}</span><div><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>${x.go ? `<button class="link" data-go="${x.go}">${esc(L.s.seeMore)}${I.chev}</button>` : ''}</div></article>`).join('')}</div></section>`;
  }
  /* time off left: sick days (allowance minus what Workday shows as used), banked hours, vacation */
  function timeOffCard(A, L) {
    const T = A.timeOff, s = L.s, t = s.toff;
    if (!T) return '';
    const tiles = [];
    if (T.sick) {
      const d = T.sick.hoursPerDay, sub = T.sick.of ? t.daysOf(L.num(Math.round((T.sick.left / d) * 10) / 10), L.num(T.sick.of / d)) : t.workday;
      tiles.push(`<div class="tof"><span class="tof-l">${esc(t.sick)}</span><b class="tof-v">${esc(L.h(T.sick.left))}</b><small>${esc(sub)}</small>${T.sick.of ? meter((T.sick.left / T.sick.of) * 100, 'm-good') : ''}</div>`);
    }
    if (T.bank) tiles.push(`<div class="tof"><span class="tof-l">${esc(t.bank)}</span><b class="tof-v">${esc(L.h(T.bank.left))}</b><small>${esc(t.bankSub)}</small></div>`);
    if (T.vacation) {
      const v = T.vacation;
      tiles.push(`<div class="tof"><span class="tof-l">${esc(t.vacation)}</span><b class="tof-v">${esc(v.likelyDollars ? L.money(v.balance) : L.num(v.balance))}</b><small>${esc(v.hours != null ? t.vacHours(L.num(Math.round(v.hours * 10) / 10)) : t.vacUnknown)}</small></div>`);
    }
    if (T.floating) tiles.push(`<div class="tof"><span class="tof-l">${esc(t.floating)}</span><b class="tof-v">${esc(L.h(T.floating.left))}</b></div>`);
    const notes = [];
    if (T.sick && T.sick.of && A.agreement) notes.push(PD.agText(A.agreement, L.lang, 'sickLeft', { days: L.num(T.sick.of / T.sick.hoursPerDay), hours: L.num(T.sick.of) }));
    if (T.vacation && T.vacation.likelyDollars) notes.push(t.vacUnit);
    return `<section class="card toff" id="p-toff" aria-labelledby="toff-h">
      <div class="card-h"><h2 id="toff-h">${esc(t.title)}</h2></div>
      ${stale(A) ? `<p class="asof">${I.tYear}<span>${esc(t.asOf(L.date(A.meta.payDate)))}</span></p>` : ''}
      <div class="tof-g">${tiles.join('')}</div>
      ${notes.filter(Boolean).map((n) => `<p class="tof-n">${esc(n)}</p>`).join('')}
      <button class="link" data-go="year:y-off">${esc(t.details)}${I.chev}</button>
    </section>`;
  }


  /* ---------- pay ---------- */
  function earningName(e, L) { return e.cat === 'overtime' ? `${L.kind('overtime')} ×${L.num(e.mult || 1.5)}` : L.kind(e.cat); }
  function earningChips(e, A, L) {
    const s = L.s, out = [];
    if (e.retro && e.dates) out.push(chip(s.retroChip(L.dateS(e.dates.from), L.dateS(e.dates.to)), 'info'));
    if (e.scaleHit) out.push(chip(s.classLevel(e.scaleHit.cls, e.scaleHit.level), 'ok', I.check));
    if ((e.cat === 'evening' || e.cat === 'night') && A.agreement && e.rate && Math.abs(A.agreement.shiftPremium[e.cat] - e.rate) < 0.005) out.push(chip(PD.agText(A.agreement, L.lang, 'shiftRef') || L.kind(e.cat), 'ok', I.check));
    return out.join('');
  }
  function earningsCard(A, L) {
    const s = L.s;
    const cur = A.earnings.filter((e) => e.current);
    const order = ['regular', 'overtime', 'evening', 'night', 'premium', 'holiday', 'vacation', 'sick', 'bereavement', 'vacationBank', 'award', 'retro', 'misc', 'other', 'unpaid'];
    const groups = order.map((c) => [c, cur.filter((e) => e.cat === c)]).filter(([, r]) => r.length);
    const body = groups.map(([c, rows]) => {
      const h = sum(rows.map((e) => e.hours)), a = sum(rows.map((e) => e.amount));
      return `<div class="grp"><div class="grp-h"><div><h3>${esc(L.kind(c))}</h3><p>${esc(L.expl(c))}</p></div><div class="grp-a">${h ? `<span>${esc(L.h(h))}</span>` : ''}<b>${esc(L.money(a))}</b></div></div>
        ${rows.map((e) => li({ name: e.desc, calc: e.hours && e.rate ? `${L.h(e.hours)} × ${L.money(e.rate)}` : e.dates ? L.range(e.dates.from, e.dates.to) : '', amt: L.money(e.amount), chips: earningChips(e, A, L), cls: 'sm' })).join('')}</div>`;
    }).join('');
    const past = A.earnings.filter((e) => !e.current);
    const pastT = past.length ? `<details class="more"><summary>${I.chev}${esc(s.earlierThisYear(past.length))}</summary><div class="lis">${past.map((e) => li({ name: earningName(e, L), orig: e.desc, amt: L.money(e.ytd), sub: e.ytdHours ? L.h(e.ytdHours) : '', cls: 'sm' })).join('')}</div></details>` : '';
    const trunc = A.truncated.length ? `<p class="note">${esc(s.truncNote(A.truncated.map((t) => `“${t}”`).join(', ')))}</p>` : '';
    // per hour, and whether the shift premium covers the hours worked
    const S = A.summary, tot = A.hoursPaid;
    const prem = A.checks.find((c) => c.id === 'premHours');
    const premKind = cur.some((e) => e.cat === 'night') ? L.kind('night') : L.kind('evening');
    const perHour = tot ? `${prem && A.premiumHours ? `<p class="prem ${prem.status}">${prem.status === 'ok' ? I.check : I.info}<span>${esc(s.premOn(premKind, L.num(A.premiumHours), L.num(A.hoursWorked)))}</span></p>` : ''}
      <div class="minis"><div><span>${esc(s.avgHourly)}</span><b>${esc(L.money(S.gross / tot))}</b><small>${esc(s.avgHourlySub)}</small></div><div><span>${esc(s.takeHomeHourly)}</span><b>${esc(L.money(S.net / tot))}</b><small>${esc(s.takeHomeSub)}</small></div></div>` : '';
    return card('c-earnings', s.h.earnings, `<div class="lis">${body}</div>
      <div class="tot"><span>${esc(s.grossPay)}</span><span class="th">${tot ? esc(L.h(tot)) : ''}</span><b>${esc(L.money(S.gross))}</b></div>${perHour}${trunc}${pastT}`);
  }
  function taxesCard(A, L) {
    const s = L.s;
    const rows = A.taxes.slice().sort(taxSort).map((t) => {
      const c = A.checks.find((x) => x.id === t.kind);
      const st = c ? c.status : null;
      const chips = st === 'ok' || st === 'okish' ? chip(st === 'okish' ? s.st.okish : s.matchesFormula, 'ok', I.check) : st === 'warn' && t.expected != null ? chip(`${s.expected} ${L.money(t.expected)}`, 'warn', I.warn) : '';
      const extra = t.annualMax ? `<div class="mx">${meter(t.maxPct * 100, 'm-gov')}<span>${esc(t.maxReached ? s.maxReached : s.ofMax(L.pct(t.maxPct * 100, 0), L.money(t.annualMax)))}</span></div>` : '';
      return li({ name: L.kind(t.kind), orig: t.desc, expl: L.expl(t.kind), amt: L.money(t.amount), sub: t.pctOfGross != null ? `${L.pct(t.pctOfGross * 100)} ${s.pctOfGross}` : '', chips, extra });
    }).join('');
    return card('c-taxes', s.h.taxes, `<div class="lis">${rows}</div>`, { aside: `<b>${esc(L.money(A.summary.taxes))}</b>` });
  }
  function dedCards(A, L) {
    const s = L.s;
    const cards = A.dedGroups.slice().sort((a, b) => (b.pretax ? 1 : 0) - (a.pretax ? 1 : 0)).map((g, i) => card('c-ded' + i, g.pretax ? s.h.preTax : s.h.postTax,
      `<div class="lis">${g.rows.map((d) => li({ name: L.kind(dk(d.kind)), orig: d.desc, expl: L.expl(dk(d.kind)), amt: d.amount ? L.money(d.amount) : '—', sub: d.amount ? '' : s.nothingThisPay })).join('')}</div>`,
      { intro: `“${esc(g.title)}”`, aside: `<b>${esc(L.money(g.sum))}</b>` }));
    return cards.length ? `<div class="two">${cards.join('')}</div>` : '';
  }
  function employerCard(A, L) {
    const s = L.s;
    if (!A.employer.length) return '';
    const pe = A.deductions.find((d) => d.kind === 'pension'), er = A.employer.find((e) => e.kind === 'erPension');
    const note = pe && er ? `<p class="note">${esc(s.pensionTotal(L.money((pe.amount || 0) + (er.amount || 0)), L.money((pe.ytd || 0) + (er.ytd || 0))))}</p>` : '';
    return card('c-employer', s.h.employer, `<div class="lis">${A.employer.map((e) => li({ name: L.kind(e.kind), orig: e.desc, expl: L.expl(e.kind), amt: L.money(e.amount) })).join('')}</div>${note}`, { intro: esc(s.erIntro) });
  }
  function taxableCard(A, L) {
    const s = L.s;
    if (!A.recon) return '';
    const rc = (j, title) => {
      const R = A.recon[j];
      if (R.workday == null) return '';
      const ok = Math.abs(R.result - R.workday) < 0.02;
      return `<div class="rcpt"><h3>${esc(title)}</h3>${R.steps.map(([k, v]) => `<div class="ln"><span>${esc(s.step[k])}</span><span class="num">${v < 0 ? '−' : k === 'gross' ? '' : '+'}${esc(L.money(Math.abs(v)))}</span></div>`).join('')}
        <div class="ln res"><span>${esc(s.equalsTaxable)}</span><span class="num">${esc(L.money(R.result))}</span></div>
        <div class="wd ${ok ? 'ok' : 'warn'}">${ok ? I.check : I.warn}<span>${esc(s.workdaySays)}${L.lang === 'fr' ? ' :' : ':'} ${esc(L.money(R.workday))}</span></div></div>`;
    };
    const q = A.taxes.find((t) => t.kind === 'qpp');
    const notes = [];
    if (q && A.recon.enhDed && A.gov) notes.push(s.qppEnhNote(L.money(q.amount), L.money(A.recon.enhDed), L.pct(A.gov.qpp.rate * 100, 1)));
    if (A.recon.fed.steps.some(([k]) => k === 'union')) notes.push(s.unionFedNote);
    let claims = '';
    if (A.claims.fed != null) {
      const ci = A.claimInfo || {};
      claims = `<h3 class="sub">${esc(s.claimsTitle)}</h3><div class="claims"><div class="cl-h"><span></span><span>${esc(s.federal)}</span><span>${esc(s.quebec)}</span></div>${A.withholding.map((w) => `<div class="cl"><span>${esc(PD.plainLabel(w.label, L.lang))}</span><span class="num">${esc(L.money(w.federal))}</span><span class="num">${esc(L.money(w.provincial))}</span></div>`).join('')}</div>
        <p class="note">${esc(ci.fedIsBasic && ci.provIsBasic ? s.claimBasic : s.claimOther)}</p>`;
    }
    return card('c-taxable', s.h.taxable, `<div class="two in">${rc('fed', s.federal)}${rc('prov', s.quebec)}</div>${notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}${claims}`, { intro: esc(s.taxableIntro) });
  }
  const jumpBar = (label, items) => (items.length > 2 ? `<nav class="subnav" aria-label="${esc(label)}">${items.map(([id, t]) => `<button data-scroll="${id}">${esc(t)}</button>`).join('')}</nav>` : '');
  /* the same order as the payslip: what you earned, what was taken and why, what the employer added, then the tax detail */
  /* Pay: the summary first (net pay, a failed check, time off, where the money went, points to note),
     then each line in payslip order, then whether it all adds up */
  function vPay(A, L) {
    const s = L.s, N = s.payNav;
    const side = (A.checkStats.warn ? checkCard(A, L) : '') + timeOffCard(A, L);
    const top = `<div class="ov ${side ? '' : 'no-side'}">${stub(A, L)}${side ? `<div class="ov-side">${side}</div>` : ''}${whereCard(A, L)}${insightsBlock(A, L)}</div>`;
    // after the tax detail, whether it all adds up (the full list is its own view)
    const parts = [['c-earnings', N.earnings, earningsCard(A, L)], ['c-taxes', N.taxes, taxesCard(A, L)], ['c-ded0', N.ded, dedCards(A, L)], ['c-employer', N.employer, employerCard(A, L)], ['c-taxable', N.taxable, taxableCard(A, L)], ['c-checks', N.checks, A.checks.length ? checkCard(A, L, 'c-checks') : '']].filter((x) => x[2]);
    return top + jumpBar(s.tabs.pay, parts.map(([id, t]) => [id, t])) + parts.map((x) => x[2]).join('');
  }

  /* ---------- checks ---------- */
  function vChecks(A, L) {
    const s = L.s, st = A.checkStats, n = st.ok + st.warn;
    const groups = checkGroups(A);
    const head = `<section class="card chk-sum ${st.warn ? 'has-warn' : ''}" aria-labelledby="cs-h">${ring(st.ok, n, st.warn, 104)}
      <div><h2 id="cs-h">${esc(st.warn ? s.checksWarn(st.warn) : s.checksLine(st.ok, n))}</h2><p>${esc(s.checksIntro)}</p>${asOf(A, L, false)}
      <ul class="gstat">${groups.map(([g, rows]) => { const ok = rows.filter((c) => c.status === 'ok' || c.status === 'okish').length, cnt = rows.filter((c) => c.status !== 'info').length, w = rows.some((c) => c.status === 'warn'); return `<li class="${w ? 'warn' : ''}"><b>${cnt ? `${ok}/${cnt}` : '—'}</b><span>${esc(s.grp[g])}</span></li>`; }).join('')}</ul></div></section>`;
    const lists = groups.map(([g, rows]) => card('k-' + g, s.grp[g], `<ul class="checks">${rows.map((c) => `<li class="${c.status}"><span class="ic" aria-hidden="true">${stIcon(c.status)}</span><div><div class="ttl"><b>${esc(val(c.title, L))}</b><span class="st">${esc(s.st[c.status])}</span></div><p>${esc(val(c.detail, L))}</p></div></li>`).join('')}</ul>`)).join('');
    return head + lists;
  }

  /* ---------- year ---------- */
  function vYear(A, L) {
    const s = L.s, S = A.summary, g = S.grossYtd || 1;
    const tiles = `<div class="tiles"><div><span>${esc(s.ytdGross)}</span><b>${esc(L.money(S.grossYtd))}</b></div><div><span>${esc(s.ytdNet)}</span><b>${esc(L.money(S.netYtd))}</b><small>${esc(L.pct((S.netYtd / g) * 100, 0))} ${esc(s.pctOfGross)}</small></div><div><span>${esc(s.ytdWithheld)}</span><b>${esc(L.money(S.grossYtd - S.netYtd))}</b><small>${esc(L.pct(((S.grossYtd - S.netYtd) / g) * 100, 0))} ${esc(s.pctOfGross)}</small></div></div>`;
    const parts = A.splitYtd.filter((x) => x.amount > 0);
    const split = card('y-split', s.h.ytdSplit, `<div class="segbar" role="img" aria-label="${esc(parts.map((x) => `${s.split[x.id]} ${L.money(x.amount)}`).join(', '))}">${parts.map((x) => `<span class="c-${x.id}" style="flex:${x.amount}" data-tip="${esc(`<b>${esc(s.split[x.id])}</b><br>${esc(L.money(x.amount))} (${esc(L.pct((x.amount / g) * 100))})`)}"></span>`).join('')}</div>${splitLegend(parts, g, L)}`, { intro: esc(s.ytdIntro(L.date(A.meta.payDate))) });
    const mx = A.taxes.filter((t) => t.annualMax).sort(taxSort);
    const P = A.projections || {};
    const maxes = mx.length ? card('y-max', s.h.maxes, `<div class="maxes">${mx.map((t) => {
      const p = P[t.kind];
      const txt = t.maxReached ? s.projHit : p && p.thisYear ? s.projSoon(L.dateS(p.date), L.money(p.perPay)) : p ? s.projLater : '';
      return `<div class="mxr"><div class="mxr-h"><b>${esc(L.kind(t.kind))}</b><span>${esc(s.paidOfMax(L.money(t.ytd), L.money(t.annualMax)))}</span></div>${meter(t.maxPct * 100, t.maxReached ? 'm-good' : 'm-gov')}${txt ? `<p>${esc(txt)}</p>` : ''}</div>`;
    }).join('')}</div>`, { intro: esc(s.maxIntro) }) : '';
    const order = ['regular', 'overtime', 'premiums', 'holiday', 'vacation', 'sick', 'other'];
    const cats = order.filter((c) => A.ytdByCat[c] && A.ytdByCat[c].amount);
    const top = Math.max(...cats.map((c) => A.ytdByCat[c].amount), 1);
    const byType = cats.length ? card('y-type', s.h.byType, `<div class="hbars">${cats.map((c) => { const x = A.ytdByCat[c]; return `<div class="hb"><span class="hb-l">${esc(s.cat[c])}${x.hours ? `<small>${esc(L.h(x.hours))}</small>` : ''}</span><span class="hb-t"><i style="width:${((x.amount / top) * 100).toFixed(1)}%"></i></span><span class="hb-v">${esc(L.money(x.amount))}<small>${esc(pct0(L, (x.amount / g) * 100))}</small></span></div>`; }).join('')}</div>`) : '';
    const slipBox = (title, sub, rows) => `<div class="slip"><div class="slip-h"><b>${esc(title)}</b><span>${esc(sub)}</span></div><div class="boxes">${rows.map(([b, k, v]) => `<div class="bx"><span class="bn">${esc(b)}</span><span class="bl">${esc(s.slipName[k] || k)}</span><span class="bv">${esc(L.money(v))}</span></div>`).join('')}</div></div>`;
    const slips = A.slips && (A.slips.t4.length || A.slips.rl1.length) ? card('y-slips', s.h.slips, `<div class="two in">${slipBox('T4', s.t4Sub, A.slips.t4)}${slipBox(s.rl1, s.rl1Sub, A.slips.rl1)}</div><ul class="tips">${s.slipTips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`, { intro: esc(s.slipsIntro(L.date(A.meta.payDate))) }) : '';
    let toff = '';
    if (A.vacation.length || A.absences.length) {
      const vac = A.vacation.length ? `<h3 class="sub">${esc(s.vacationTitle)}</h3><div class="tiles sm">${A.vacation.map((v) => `<div><span>${esc(PD.plainLabel(v.label, L.lang))}</span><b>${esc(L.num(v.value))}</b>${L.lang === 'fr' ? '' : `<small>${esc(v.label)}</small>`}</div>`).join('')}</div><p class="note">${esc(A.agreement ? PD.agText(A.agreement, L.lang, 'vacNote') : s.vacNoteGeneric)}</p>` : '';
      const abs = A.absences.length ? `<h3 class="sub">${esc(s.plans)}</h3><div class="plans"><div class="pl-h"><span></span><span>${esc(s.accrued)}</span><span>${esc(s.used)}</span><span>${esc(s.available)}</span></div>${A.absences.map((a) => `<div class="pl ${a.available < 0 ? 'neg' : ''}"><span><b>${esc(PD.plainLabel(a.desc, L.lang))}</b><small>${esc(a.desc)}</small></span><span class="num">${esc(L.num(a.accrued))}</span><span class="num">${esc(L.num(a.reduced))}</span><span class="num"><b>${esc(L.num(a.available))}</b></span></div>`).join('')}</div>${A.absences.filter((a) => a.available < 0).map((a) => `<p class="note">${esc(s.negBank(L.num(a.available)))}</p>`).join('')}` : '';
      toff = card('y-off', s.h.timeoff, vac + abs);
    }
    let hist = '';
    if (state.slips.length > 1) {
      const max = Math.max(...state.slips.map((x) => x.A.summary.gross || 0)) || 1;
      hist = card('y-hist', s.h.history, `<div class="cols" role="img" aria-label="${esc(state.slips.map((x) => `${L.dateS(x.A.meta.payDate)}: ${L.money(x.A.summary.net)}`).join(', '))}">${state.slips.map((x, i) => `<div class="col ${i === state.cur ? 'on' : ''}" data-tip="${esc(`<b>${esc(L.date(x.A.meta.payDate))}</b><br>${esc(s.net)} ${esc(L.money(x.A.summary.net))}<br>${esc(s.gross)} ${esc(L.money(x.A.summary.gross))}`)}"><span class="cv">${esc(L.money0(x.A.summary.net))}</span><span class="cb"><i class="g" style="height:${((x.A.summary.gross || 0) / max) * 100}%"></i><i class="n" style="height:${((x.A.summary.net || 0) / max) * 100}%"></i></span><span class="cdt">${esc(L.dateS(x.A.meta.payDate))}</span></div>`).join('')}</div>
        <ul class="hleg"><li><span class="sw c-net"></span>${esc(s.net)}</li><li><span class="sw gr"></span>${esc(s.gross)}</li></ul>`, { intro: esc(s.historyIntro) });
    }
    const all = `<details class="more card-like"><summary>${I.chev}${esc(s.allLines)} (${A.earnings.length})</summary><div class="lis">${A.earnings.map((e) => li({ name: earningName(e, L), orig: e.desc, amt: L.money(e.ytd), sub: e.ytdHours ? L.h(e.ytdHours) : '', cls: 'sm' })).join('')}</div></details>`;
    const N = s.yearNav;
    const secs = [['y-off', N.off, toff], ['y-hist', N.hist, hist], ['y-max', N.max, maxes], ['y-split', N.split, split], ['y-type', N.type, byType], ['y-slips', N.slips, slips]].filter((x) => x[2]);
    return jumpBar(s.tabs.year, secs.map(([id, t]) => [id, t])) + tiles + secs.map((x) => x[2]).join('') + all;
  }

  /* ---------- ask: the assistant runs on this device; questions and answers stay in memory ---------- */
  const askCtx = () => ({ recs: state.slips.length ? state.slips : [state.sample], cur: state.slips.length ? state.cur : 0, makeL, lang: state.lang });
  function answerHtml(a) {
    const out = [];
    let ul = null;
    a.paras.forEach((p) => {
      if (p && p.li) { if (!ul) { ul = []; out.push(ul); } ul.push(p.li); } else { ul = null; out.push(p); }
    });
    return out.map((x) => (Array.isArray(x) ? `<ul>${x.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p>${esc(x)}</p>`)).join('');
  }
  function qaHtml(x, L) {
    const a = x.a, k = makeL(a.lang).s.ask;
    const when = state.slips.length > 1 && x.date ? `<small class="q-d">${esc(L.dateS(x.date))}</small>` : '';
    return `<article class="qa" lang="${a.lang}">
      <p class="q"><span class="sr">${esc(L.s.ask.you)} : </span><span class="q-t">${esc(x.q)}</span>${when}</p>
      <div class="a">${answerHtml(a)}
        ${a.open ? `<button class="btn primary a-open" data-act="open" data-then="${esc(x.q)}">${I.upload}<span>${esc(k.openSecond)}</span></button>` : ''}
        ${a.links.length ? `<div class="a-go">${a.links.map(([t, g]) => `<button class="link" data-go="${esc(g)}">${esc(t)}${I.chev}</button>`).join('')}</div>` : ''}
        ${a.chips.length ? `<div class="qchips">${a.chips.map((c) => `<button class="qchip" data-ask="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      </div></article>`;
  }
  function askLog(L) {
    if (!state.chat.length) return '';
    return `<div class="ask-lh"><h2 class="sr">${esc(L.s.ask.title)}</h2><button class="link" data-act="ask-clear">${esc(L.s.ask.clear)}</button></div>${state.chat.map((x) => qaHtml(x, L)).join('')}`;
  }
  function starters(L) {
    const k = L.s.ask;
    return (state.slips.length > 1 ? [k.starterCompare, ...k.starters.slice(0, 5)] : k.starters);
  }
  function vAsk(A, L) {
    const s = L.s, k = s.ask;
    return `<section class="ask" aria-labelledby="ask-h">
      <div class="ask-hd"><h2 id="ask-h">${esc(k.title)}</h2><p>${esc(k.sub)}</p></div>
      <form class="ask-f" id="ask-f" role="search" autocomplete="off">
        <label class="sr" for="ask-q">${esc(k.placeholder)}</label>
        <input id="ask-q" name="q" type="text" inputmode="text" enterkeyhint="send" autocapitalize="sentences" autocorrect="on" spellcheck="true" maxlength="240" placeholder="${esc(k.placeholder)}">
        <button class="ask-go" type="submit" aria-label="${esc(k.send)}">${I.send}</button>
      </form>
      <div class="qchips ask-st ${state.chat.length ? 'hide' : ''}">${starters(L).map((c) => `<button class="qchip" data-ask="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <p class="ask-pv">${I.lock}<span>${esc(s.privacy)}</span></p>
    </section>
    <div class="ask-log" id="ask-log" aria-live="polite">${askLog(L)}</div>`;
  }
  /* ask a question: the newest answer goes on top, right under the box */
  function ask(q) {
    q = String(q || '').trim().slice(0, 240);
    const r = rec();
    if (!q || !r || !PD.Ask) return;
    let a;
    try { a = PD.Ask.answer(q, askCtx()); } catch (e) { console.error(e); a = { lang: state.lang, paras: [makeL(state.lang).s.ask.unsure], links: [], chips: makeL(state.lang).s.ask.starters.slice(0, 4) }; }
    state.chat.unshift({ q, a, date: r.A.meta.payDate });
    if (state.chat.length > 30) state.chat.length = 30;
    if (state.view !== 'ask') { go('ask'); return; }
    const L = makeL(state.lang, r.A.agreement, r.A.meta.year), log = $('#ask-log');
    if (!log) return;
    log.innerHTML = askLog(L);
    const st = $('.ask-st'); if (st) st.classList.add('hide');
    const first = $('.qa', log);
    if (first && !REDUCED) { first.classList.add('qa-in'); setTimeout(() => first.classList.remove('qa-in'), 700); }
    const f = $('#ask-f');
    if (f) { const top = f.getBoundingClientRect().top; if (top < 0 || top > window.innerHeight * 0.4) f.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' }); }
  }
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'ask-f') return;
    e.preventDefault();
    const q = $('#ask-q');
    const v = q.value;
    q.value = '';
    // on phones, put the keyboard away so the answer is visible
    if (matchMedia('(pointer: coarse)').matches) q.blur();
    ask(v);
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-ask],[data-act="ask-clear"]');
    if (!t) return;
    if (t.dataset.ask) { ask(t.dataset.ask); return; }
    state.chat = [];
    const log = $('#ask-log');
    if (log) log.innerHTML = '';
    const st = $('.ask-st'); if (st) st.classList.remove('hide');
    const q = $('#ask-q'); if (q && !matchMedia('(pointer: coarse)').matches) q.focus();
  });

  /* ---------- guide ---------- */
  function codesCard(A, L) {
    const s = L.s;
    if (!A.codes || !A.codes.length) return '';
    const firsts = [...new Set(A.codes.filter((c) => c.current).map((c) => c.parts[0]))].join(', ') || '—';
    const T = A.codeTimeline;
    let tl = '';
    if (T) {
      const y = A.meta.year, t0 = Date.UTC(y, 0, 1), t1 = Date.UTC(y + 1, 0, 1);
      const pos = (iso) => (((Date.parse(iso + 'T00:00:00Z') - t0) / (t1 - t0)) * 100).toFixed(2);
      const dates = PD.holidayDates(y, A.agreement.holidayIds).filter((d, i, arr) => d <= A.meta.periodEnd && arr.indexOf(d) === i);
      const months = Array.from({ length: 12 }, (_, m) => `<span style="left:${pos(`${y}-${String(m + 1).padStart(2, '0')}-01`)}%">${esc(L.month(m))}</span>`).join('');
      tl = `<figure class="tl" aria-label="${esc(s.codesTimeline(`(${T.from})`, `(${T.to})`, T.nFrom, T.nTo, L.date(T.lastFrom), L.date(T.firstTo)))}">
        <div class="tl-track"><span class="tl-sw" style="left:${pos(T.lastFrom)}%;width:${(pos(T.firstTo) - pos(T.lastFrom)).toFixed(2)}%"></span>
        ${(() => { let last = -99, lv = 0; return dates.map((d, i) => { const p = +pos(d); lv = p - last < 2.4 ? lv + 1 : 0; last = p; return `<i class="${i < T.nFrom ? 'a' : 'b'}" style="left:${p}%;bottom:${8 + lv * 13}px" data-tip="${esc(`<b>${esc(L.date(d))}</b><br>(${esc(i < T.nFrom ? T.from : T.to)})`)}"></i>`; }).join(''); })()}
        <span class="tl-now" style="left:${pos(A.meta.periodEnd)}%"></span></div>
        <div class="tl-m">${months}</div>
        <figcaption><span><i class="a"></i>(${esc(T.from)})</span><span><i class="b"></i>(${esc(T.to)})</span><span><i class="sw"></i>${esc(s.tlSwitch)}</span><span><i class="now"></i>${esc(s.tlToday)}</span></figcaption></figure>
        <p class="callout">${esc(s.codesTimeline(`(${T.from})`, `(${T.to})`, T.nFrom, T.nTo, L.date(T.lastFrom), L.date(T.firstTo)))}</p>`;
    }
    const catLbl = (c) => s.cat[c] || L.kind(c);
    const rows = A.codes.map((c) => `<div class="cd ${c.current ? 'now' : ''}"><span class="cc">(${esc(c.code)})</span><span class="cu">${esc(c.cats.map(catLbl).join(', '))}${c.avgRegRate ? `<small>${esc(s.avgRate)}: ${esc(L.money(c.avgRegRate))}</small>` : ''}</span><span class="num">${c.curHours ? esc(L.h(c.curHours)) : '—'}</span><span class="num">${esc(L.h(c.ytdHours))}</span></div>`).join('');
    return card('g-codes', s.h.codes, `<p class="lead">${esc(s.codesMeaning(firsts))}</p>${tl}
      <div class="codes"><div class="cd hd"><span>${esc(s.codeCol)}</span><span>${esc(s.usedFor)}</span><span class="num">${esc(s.thisPay)}</span><span class="num">${esc(s.thisYear)}</span></div>${rows}</div>
      <p class="note">${esc(s.codesConfirm)}</p>`, { intro: esc(PD.agText(A.agreement, L.lang, 'codesIntro') || s.codesIntro) });
  }
  function labelsCard(A, L) {
    const s = L.s;
    const how = `<ul class="bul">${s.readHow.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
    let map = '';
    if (A.labelMap.length) {
      const RS = PD.ROLE_SHORT[L.lang];
      const loose = (x) => PD.key(x).split(/\s+/).map((w) => w.replace(/s$/, '')).join(' ');
      const sumRow = A.summary.columns.length ? `<div class="lm"><div class="lm-o"><b>${A.summary.columns.map((c) => `“${esc(c.label)}”`).join(', ')}</b></div><span class="lm-ar">${I.arrow}</span><div class="lm-r">${esc(s.summaryRow(A.summaryRoles.map((r) => RS[r]).join(', ')))}</div></div>` : '';
      const rows = A.labelMap.map((m) => {
        const wd = PD.WD_NAMES[m.role] || ['', ''];
        const same = loose(m.original) === loose(wd[1]) || loose(m.original) === loose(wd[0]);
        return `<div class="lm ${same ? '' : 'bad'}"><div class="lm-o"><b>“${esc(m.original)}”</b>${same ? '' : chip(s.notStd, 'warn')}</div><span class="lm-ar">${I.arrow}</span><div class="lm-r">${esc(s.role[m.role])}<small>${esc(s.stdName)}: ${esc(L.lang === 'fr' ? wd[1] : wd[0])}</small></div></div>`;
      }).join('');
      map = `<h3 class="sub">${esc(s.sectionTitles)}</h3><div class="lms">${sumRow}${rows}</div>`;
      if (A.labelMap.some((m) => PD.key(m.original) === 'revenus ou retenues')) map += `<p class="note">${esc(s.revOuRetNote)}</p>`;
    }
    return card('g-labels', s.h.labels, how + map, { intro: esc(s.readIntro) });
  }
  function agreementCard(A, L) {
    const s = L.s, ag = A.agreement, lang = L.lang;
    if (!ag) return card('g-agreement', s.h.agreement, `<p class="lead">${esc(s.noAgreement)}</p>`);
    const sc = PD.scaleFor(ag, A.meta.periodStart || A.meta.payDate);
    const hits = new Set((A.rateMatches || []).filter((r) => r.hit).map((r) => r.hit.cls + r.hit.level));
    const grid = sc ? `<h3 class="sub">${esc(s.scaleTitle(L.date(sc.from)))}</h3><div class="wg"><div class="wg-r hd"><span>${esc(s.cls)}</span><span class="num">A</span><span class="num">B</span><span class="num">C</span></div>
      ${Object.entries(sc.rates).map(([c, r]) => `<div class="wg-r ${['A', 'B', 'C'].some((lv) => hits.has(c + lv)) ? 'on' : ''}"><span><b>${esc(s.cls)} ${c}</b><small>${esc((ag.jobs[c] || []).join(', '))}</small></span>${['A', 'B', 'C'].map((lv) => `<span class="num ${hits.has(c + lv) ? 'hl' : ''}">${esc(L.money(r[lv]))}</span>`).join('')}</div>`).join('')}</div>
      <p class="note">${esc(s.scaleNote)}</p>` : '';
    const F = (ag.facts && (ag.facts[lang] || ag.facts.en)) || [];
    const facts = `<h3 class="sub">${esc(s.facts)}</h3><div class="facts">${F.map(([v, k, a]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span><small>${esc(a)}</small></div>`).join('')}</div>`;
    const vac = `<h3 class="sub">${esc(s.vacTable)} (${esc(PD.agText(ag, lang, 'vacRef'))})</h3><div class="vt"><div class="vt-r hd"><span>${esc(s.service)}</span><span>${esc(s.length)}</span><span class="num">${esc(s.pctPay)}</span></div>${ag.vacation.map((v) => `<div class="vt-r"><span>${esc(v.svc[lang])}</span><span>${esc(v.len[lang])}</span><span class="num">${esc(L.pct(v.pct, 1))}</span></div>`).join('')}</div>`;
    const y = A.meta.year || 2026, hd = PD.holidayDates(y, ag.holidayIds);
    const hol = `<h3 class="sub">${esc(s.holidaysTitle(ag.holidays[lang].length, y))} (${esc(PD.agText(ag, lang, 'holidaysRef'))})</h3><ol class="holi">${ag.holidays[lang].map((h, i) => { const clash = hd.indexOf(hd[i]) !== i; return `<li class="${hd[i] && hd[i] <= (A.meta.periodEnd || '') ? 'past' : ''}"><span class="hd">${clash ? '—' : esc(L.dateS(hd[i]))}</span><span>${esc(h)}${clash ? `<small>${esc(s.holClash)}</small>` : ''}</span></li>`; }).join('')}</ol>`;
    return card('g-agreement', s.h.agreement, grid + facts + vac + hol + `<p class="note">${esc(PD.agText(ag, lang, 'expires', { date: L.date(ag.expires) }))}</p>`, { intro: esc(PD.agText(ag, lang, 'intro', { title: ag.title[lang], union: ag.union[lang] })) });
  }
  function getPdfCard(L) {
    const s = L.s;
    return card('g-getPdf', s.h.getPdf, `<div class="two in"><div class="howto"><h3>${esc(s.phone)}</h3><ol class="steps">${s.phoneSteps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div><div class="howto"><h3>${esc(s.computer)}</h3><ol class="steps">${s.computerSteps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div></div>
      <p class="note">${esc(s.pdfTip)}</p><div class="cta-row"><button class="btn primary" data-act="open">${I.upload}${esc(s.open)}</button></div>`, { intro: esc(s.getPdfIntro) });
  }
  function installCard(L) {
    const s = L.s;
    if (!PD.Install || (PD.BUILD || {}).target !== 'pages') return '';
    const body = PD.Install.standalone() ? `<p class="lead">${esc(s.install.already)}</p>` : `<div class="cta-row"><button class="btn primary" data-act="install">${I.install}${esc(s.install.showMe)}</button></div>`;
    return card('g-install', s.h.install, body, { intro: esc(s.install.cardIntro) });
  }
  function glossaryCard(L, A) {
    const s = L.s;
    const rows = [...PD.GLOSSARY, ...((A && A.agreement && A.agreement.glossary) || [])]; // the workplace's own terms come from its pack
    return card('g-glossary', s.h.glossary, `<label class="search"><span class="sr">${esc(s.glossFilter)}</span><input type="search" id="gl-q" placeholder="${esc(s.glossFilter)}" autocomplete="off"></label>
      <dl class="gloss" id="gl">${rows.map(([t, en, fr]) => `<div data-q="${esc(PD.key(t + ' ' + en + ' ' + fr))}"><dt>${esc(t)}</dt><dd>${esc(L.lang === 'fr' ? fr : en)}</dd></div>`).join('')}</dl><p class="note" id="gl-none" hidden>${esc(s.glossNone)}</p>`);
  }
  function originalCard(L) {
    const s = L.s, r = rec();
    if (!r || !r.bytes) return card('g-original', s.h.original, `<p class="lead">${esc(s.originalSample)}</p>`);
    return card('g-original', s.h.original, `<details class="more" id="orig-d"><summary>${I.chev}${esc(s.showOriginal)}</summary><div class="pages" id="orig-pages"></div></details>`, { intro: esc(s.originalNote) });
  }
  function aboutCard(L) {
    const s = L.s;
    const url = (PD.BUILD || {}).appUrl;
    const app = url ? `<div><h3>${esc(s.appVersion[0])}</h3><p>${esc(s.appVersion[1])} <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https:\/\//, ''))}</a></p></div>` : '';
    return card('g-about', s.h.about, `<div class="about">${app}${s.about.map(([t, d]) => `<div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div>`);
  }
  function vGuide(A, L) {
    const s = L.s;
    /* reference people return to first (agreement, glossary), then how to read the payslip, then help with the app itself */
    const secs = [['agreement', agreementCard(A, L)], ['glossary', glossaryCard(L, A)], ['codes', codesCard(A, L)], ['labels', labelsCard(A, L)], ['original', originalCard(L)], ['getPdf', getPdfCard(L)], ['install', installCard(L)], ['about', aboutCard(L)]].filter(([, h]) => h);
    return `<nav class="subnav" aria-label="${esc(s.tabs.guide)}">${secs.map(([id]) => `<button data-scroll="g-${id}">${esc(s.guideNav[id])}</button>`).join('')}</nav>${secs.map(([, h]) => h).join('')}`;
  }

  /* ================= SHELL ================= */
  function actionsHtml(L, withLang) {
    const s = L.s, out = [];
    if (withLang) out.push(`<div class="act lang-row"><span>${esc(s.lang)}</span><div class="seg" role="group" aria-label="${esc(s.lang)}"><button data-lang="fr" aria-pressed="${state.lang === 'fr'}" lang="fr">FR</button><button data-lang="en" aria-pressed="${state.lang === 'en'}" lang="en">EN</button></div></div>`);
    if (PD.Install && PD.Install.canOffer()) out.push(`<button class="act" data-act="install" role="menuitem">${I.install}<span>${esc(s.install.menu)}</span></button>`);
    if (BUILD.share) out.push(`<button class="act" data-act="share" role="menuitem">${I.qr}<span>${esc(s.share.menu)}</span></button>`);
    out.push(`<button class="act" data-act="priv" role="menuitemcheckbox" aria-checked="${state.priv}">${I.eye}<span>${esc(s.hidePii)}</span><span class="tg" aria-hidden="true"></span></button>`);
    out.push(`<button class="act" data-act="csv" role="menuitem">${I.csv}<span>${esc(s.exportCsv)}</span></button>`);
    out.push(`<button class="act" data-act="print" role="menuitem">${I.print}<span>${esc(s.print)}</span></button>`);
    return out.join('');
  }
  function renderBar(L, r) {
    const s = L.s;
    const picker = state.slips.length > 1
      ? `<label class="picker"><span class="sr">${esc(s.slipSelect)}</span><select data-act="slip">${state.slips.map((x, i) => `<option value="${i}" ${i === state.cur ? 'selected' : ''}>${esc(L.dateSY(x.A.meta.payDate))}</option>`).join('')}</select>${I.chev}</label>`
      : state.slips.length ? `<span class="slipd">${esc(L.dateSY(state.slips[0].A.meta.payDate))}</span>` : state.demo ? `<span class="pill ex">${esc(s.example.badge)}</span>` : '';
    $('#bar').innerHTML = `<div class="bar-in">
      <div class="brand">${brandIcon}<span>${esc(s.appName)}</span></div>
      <div class="bar-slip">${picker}</div>
      <div class="bar-tools">
        ${r ? `<button class="btn primary" data-act="open">${I.upload}<span class="l-l">${esc(state.slips.length ? s.addMore : s.open)}</span><span class="l-s">${esc(s.openShort)}</span></button>` : ''}
        <div class="seg" role="group" aria-label="${esc(s.lang)}"><button data-lang="fr" aria-pressed="${state.lang === 'fr'}" lang="fr">FR</button><button data-lang="en" aria-pressed="${state.lang === 'en'}" lang="en">EN</button></div>
        <div class="menu-w"><button class="iconbtn" data-act="menu" aria-haspopup="true" aria-expanded="false" aria-label="${esc(s.more)}">${I.dots}</button><div class="menu" id="menu" role="menu" hidden>${actionsHtml(L, true)}</div></div>
      </div></div>`;
  }
  /* The tab bar is built once per language/payslip and kept, so its indicator can glide between tabs. */
  function renderTabs(L, A) {
    const s = L.s;
    const host = $('#tabs');
    const sig = [state.lang, !!(PD.Install && PD.Install.canOffer())].join('|');
    if (host.dataset.sig !== sig) {
      host.dataset.sig = sig;
      host.classList.remove('ind-ready');
      host.innerHTML = `<div class="tabs-in"><span class="tab-ind" aria-hidden="true"></span>${TABS.map((v) => `<a class="tab" href="#${v}" data-view="${v}"><span class="ti">${TAB_ICON[v]}</span><span class="tlb">${esc(s.tabs[v])}</span></a>`).join('')}</div>
        <div class="rail-x"><div class="rail-acts">${actionsHtml(L)}</div><p class="rail-note">${I.lock}<span>${esc(s.privacy)}</span></p></div>`;
    }
    $$('#tabs .tab').forEach((t) => { if (t.dataset.view === tabOf(state.view)) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    placeInd();
  }
  function placeInd() {
    const host = $('#tabs'), ind = $('#tabs .tab-ind'), tab = $(`#tabs .tab[data-view="${tabOf(state.view)}"]`);
    if (!ind || !tab || !tab.offsetParent) return;
    const tgt = window.innerWidth < 760 ? tab.querySelector('.ti') : tab;
    const box = ind.parentElement.getBoundingClientRect(), rr = tgt.getBoundingClientRect();
    ind.style.width = rr.width + 'px';
    ind.style.height = rr.height + 'px';
    ind.style.transform = `translate3d(${rr.left - box.left}px,${rr.top - box.top}px,0)`;
    if (!host.classList.contains('ind-ready')) requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('ind-ready')));
  }
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { $('#tabs').classList.remove('ind-ready'); placeInd(); }); }, { passive: true });

  function banner(L) {
    const s = L.s, e = s.example;
    if (!state.demo || state.slips.length) return '';
    return `<div class="example"><span class="pill ex">${esc(e.badge)}</span>
      <div class="ex-t"><p><b>${esc(e.title)}</b> ${esc(e.text)}</p></div>
      <div class="ex-a"><button class="btn primary" data-act="open">${I.upload}${esc(e.cta)}</button><button class="btn ghost" data-act="pdfhelp">${esc(e.how)}</button></div></div>`;
  }

  /* ---------- welcome (no payslip open) ---------- */
  function vWelcome(L) {
    const s = L.s, w = s.welcome;
    const bw = [62, 50, 42, 56, 34];
    const rows = w.rows.map(([c, word], i) => `<li style="--r:${i}"><span class="wl-x"><span class="wl-code">${esc(c)}</span><span class="wl-word">${esc(word)}</span></span><i class="wl-bar" style="--bw:${bw[i]}%"></i><span class="wl-ok">${I.check}</span></li>`).join('');
    return `<section class="welcome" aria-labelledby="wl-h">
      <div class="wl-art" aria-hidden="true"><div class="wl-stub">${guilloche(2.1, 600, 420, 20)}
        <div class="wl-top">${brandIcon}<span>${esc(w.stubTitle)}</span></div>
        <ul class="wl-rows">${rows}</ul>
        <div class="perf"></div>
        <div class="wl-net"><span>${esc(w.net)}</span><i class="wl-bar"></i></div></div></div>
      <div class="wl-copy">
        <h1 id="wl-h">${esc(w.title)}</h1>
        <p class="wl-lead">${esc(w.lead)}</p>
        <div class="wl-actions">
          <button class="btn primary xl" data-act="open" ${state.loading ? 'disabled aria-busy="true"' : ''}>${state.loading ? '<span class="spin" aria-hidden="true"></span>' : I.upload}<span>${esc(state.loading ? s.reading : w.open)}</span></button>
          <button class="btn soft xl" data-act="pdfhelp">${I.help}<span>${esc(w.how)}</span></button>
          <button class="link wl-share" data-act="share">${I.qr}<span>${esc(s.share.welcome)}</span></button>
        </div>
        <p class="wl-drop">${esc(w.drop)}</p>
        <p class="wl-priv">${I.lock}<span>${esc(w.privacy)}</span></p>
      </div>
    </section>`;
  }

  /* ---------- "How to get the PDF" sheet ---------- */
  function helpSheetHtml() {
    const L = makeL(state.lang), s = L.s, w = s.welcome;
    const m = state.helpMode;
    const steps = m === 'phone' ? s.phoneSteps : s.computerSteps;
    return `<div class="sh-bg" data-sheet="close"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="ph-t" tabindex="-1">
        <div class="sh-grab" aria-hidden="true"></div>
        <div class="sh-h2"><h2 id="ph-t">${esc(s.h.getPdf)}</h2><button class="iconbtn sh-x" data-sheet="close" aria-label="${esc(s.close)}">${I.x}</button></div>
        <p class="sh-sub">${esc(s.getPdfIntro)}</p>
        <div class="segc" role="tablist" style="--i:${m === 'phone' ? 0 : 1}"><span class="segc-t" aria-hidden="true"></span>
          <button role="tab" data-ph="phone" aria-selected="${m === 'phone'}">${esc(w.phoneTab)}</button><button role="tab" data-ph="computer" aria-selected="${m !== 'phone'}">${esc(w.computerTab)}</button></div>
        <ol class="steps">${steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        <p class="sh-note">${esc(s.pdfTip)}</p>
        <div class="sh-f"><button class="btn primary big" data-act="open">${I.upload}${esc(w.open)}</button></div>
      </section>`;
  }
  /* ---------- "Share the app" sheet: a QR code drawn at build time, the address, send or copy ---------- */
  function shareSheetHtml() {
    const L = makeL(state.lang), s = L.s, k = s.share, sh = BUILD.share;
    const n = sh.qr.n, q = 4; // quiet zone of 4 modules, as the standard asks
    const canSend = typeof navigator.share === 'function';
    return `<div class="sh-bg" data-sheet="close"></div>
      <section class="sheet share-sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t" tabindex="-1">
        <div class="sh-grab" aria-hidden="true"></div>
        <div class="sh-h2"><h2 id="sh-t">${esc(k.title)}</h2><button class="iconbtn sh-x" data-sheet="close" aria-label="${esc(s.close)}">${I.x}</button></div>
        <p class="sh-sub">${esc(k.sub)}</p>
        <figure class="qr"><svg viewBox="${-q} ${-q} ${n + 2 * q} ${n + 2 * q}" role="img" aria-label="${esc(k.qr)}" shape-rendering="crispEdges"><rect x="${-q}" y="${-q}" width="${n + 2 * q}" height="${n + 2 * q}" fill="#fff"/><path d="${sh.qr.d}" fill="#000"/></svg></figure>
        <p class="qr-url">${esc(sh.url.replace(/^https:\/\//, '').replace(/\/$/, ''))}</p>
        <div class="sh-f share-f">${canSend ? `<button class="btn primary big" data-share="send">${I.share}<span>${esc(k.send)}</span></button>` : ''}<button class="btn ${canSend ? 'soft' : 'primary'} big" data-share="copy">${I.copy}<span>${esc(k.copy)}</span></button></div>
        <p class="sh-note">${esc(k.note)}</p>
      </section>`;
  }
  const sheetHtml = () => (state.sheet === 'share' ? shareSheetHtml() : helpSheetHtml());
  async function shareAction(how) {
    const L = makeL(state.lang), k = L.s.share, url = BUILD.share.url;
    if (how === 'send') {
      try { await navigator.share({ title: L.s.appName, text: k.text, url }); } catch (e) { /* closed by the person: nothing to do */ }
      return;
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
      // older browsers and file:// pages: copy through a hidden field
      const ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (err) { ok = false; } ta.remove();
    }
    toast(ok ? k.copied : url, !ok);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-share]');
    if (t) shareAction(t.dataset.share);
  });
  let sheetFocus = null;
  function openHelp() { openSheet('pdf'); }
  function openSheet(kind) {
    const box = $('#psheet');
    state.sheet = kind;
    if (kind === 'pdf' && !state.helpMode) state.helpMode = /iPhone|iPad|Android/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'phone' : 'computer';
    sheetFocus = document.activeElement;
    box.innerHTML = sheetHtml(); box.hidden = false;
    document.documentElement.classList.add('sheet-open');
    requestAnimationFrame(() => requestAnimationFrame(() => { box.classList.add('on'); const sh = box.querySelector('.sheet'); if (sh) sh.focus({ preventScroll: true }); }));
  }
  function closeHelp() {
    const box = $('#psheet');
    if (!box || box.hidden) return;
    box.classList.remove('on');
    document.documentElement.classList.remove('sheet-open');
    setTimeout(() => { if (!box.classList.contains('on')) { box.hidden = true; box.innerHTML = ''; } }, 420);
    if (sheetFocus && sheetFocus.focus) sheetFocus.focus({ preventScroll: true });
  }

  /* swipe a sheet down to dismiss it, like iOS */
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest && e.target.closest('.sheet .sh-grab, .sheet .sh-h, .sheet .sh-h2');
    if (!h || e.target.closest('button')) return;
    const sh = h.closest('.sheet');
    drag = { sh, y0: e.clientY, t0: performance.now(), dy: 0, id: e.pointerId };
    sh.style.transition = 'none';
    try { h.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y0);
    drag.sh.style.transform = `translate3d(0,${drag.dy}px,0)`;
  }, { passive: true });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { sh, dy, t0 } = drag; drag = null;
    const v = dy / Math.max(1, performance.now() - t0);
    sh.style.transition = ''; sh.style.transform = '';
    if (dy > 110 || (dy > 30 && v > 0.55)) { const c = sh.parentElement.querySelector('[data-sheet="close"], [data-ins="close"]'); if (c) c.click(); }
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  const VIEW_FN = { pay: vPay, ask: vAsk, checks: vChecks, year: vYear, guide: vGuide };
  const PRINT_VIEWS = ['pay', 'checks', 'year'];
  function render() {
    const r = rec();
    const L = makeL(state.lang, r && r.A.agreement, r && r.A.meta.year);
    document.documentElement.lang = state.lang;
    document.title = L.s.docTitle;
    document.body.classList.toggle('private', state.priv);
    document.body.classList.toggle('at-rest', !r);
    if (PD.Install) PD.Install.syncLang(state.lang);
    renderBar(L, r);
    renderTabs(L, r && r.A);
    const main = $('#main');
    if (!r) {
      main.innerHTML = `${vWelcome(L)}<p class="foot">${esc(L.s.disclaimer)}</p>`;
      if (!state.welcomed && !REDUCED) {
        /* hold the first-launch motion until start-up work is done, so slow phones don't skip frames */
        const w = $('.welcome'); w.classList.add('intro');
        if (!LITE) {
          w.classList.add('hold');
          let done = false;
          const go = () => { if (!done) { done = true; requestAnimationFrame(() => w.classList.remove('hold')); } };
          const idle = () => (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(go, { timeout: 400 });
          if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle, { once: true });
          setTimeout(go, 900); // never wait longer than this
        }
        setTimeout(() => w.classList.remove('intro', 'hold'), 4200);
      }
      state.welcomed = true;
      fitWelcome();
      return;
    }
    if (state.printing) {
      main.innerHTML = PRINT_VIEWS.map((v) => `<div class="pv">${VIEW_FN[v](r.A, L)}</div>`).join('') + `<p class="foot">${esc(L.s.disclaimer)}</p>`;
      return;
    }
    main.innerHTML = `${banner(L)}<div class="view v-${state.view}">${VIEW_FN[state.view](r.A, L)}</div><p class="foot">${esc(L.s.disclaimer)}</p>`;
    wireView();
    const kind = state.anim; state.anim = null;
    if (kind && !REDUCED) animateView(LITE ? 'soft' : kind, r.A, L);
  }

  /* entrance motion: transform/opacity only, staggered a little, removed once done */
  function animateView(kind, A, L) {
    const v = $('#main .view');
    if (!v) return;
    const kids = Array.from(v.children).flatMap((c) => (c.classList.contains('ov') ? Array.from(c.children) : [c]));
    kids.forEach((k, i) => k.style.setProperty('--k', Math.min(i, kind === 'full' ? 7 : 3)));
    v.classList.add(kind === 'full' ? 'anim' : 'anim-soft');
    if (kind === 'full') countUp(A.summary.net, L);
    setTimeout(() => v.classList.remove('anim', 'anim-soft'), 1500);
  }
  function countUp(net, L) {
    const el = $('.stub .ni');
    if (!el || !(net > 0)) return;
    const end = Math.floor(net), final = el.textContent, t0 = performance.now(), dur = 700;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? L.num(Math.round(end * e), 0) : final;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- full screen: page or app layout ----------
     mode-doc: the page scrolls (Safari tabs, desktop browsers). mode-shell: installed app and in-app
     viewers; the page is exactly the measured screen height and only #main scrolls (set in index.html). */
  const root = document.documentElement;
  const isShell = () => root.classList.contains('mode-shell');
  const scroller = () => (isShell() ? $('#main') : document.scrollingElement || root);
  function toTop() { if (isShell()) { const m = $('#main'); if (m) m.scrollTop = 0; } window.scrollTo(0, 0); }

  /* the welcome screen fits the screen: drop sample lines (keeping at least 2) until nothing scrolls */
  function fitWelcome() {
    const w = $('.welcome');
    if (!w) return;
    const rows = $$('.wl-rows li', w);
    rows.forEach((li) => { li.hidden = false; });
    const sc = scroller();
    const over = () => sc.scrollHeight > (isShell() ? sc.clientHeight : window.innerHeight) + 1;
    const art = $('.wl-art', w); if (art) art.hidden = false;
    for (let n = rows.length; n > 2 && over(); n--) rows[n - 1].hidden = true;
    // very short screens (small phones with the browser's bars): the words and buttons matter more than the picture
    if (art && over()) art.hidden = true;
  }

  let measureQueued = false, touching = false;
  function safeInsets() {
    const p = $('#sa-probe');
    if (!p) return { top: 0, bottom: 0 };
    const cs = getComputedStyle(p);
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  }
  /* some in-app viewers already keep the page below the status bar and above the home bar, yet still
     report safe-area insets: if the visible height is already short by that inset, don't add it again */
  /* In-app viewers (Instagram, Messenger) may already keep the page clear of the status bar and home bar
     while still reporting the insets; then the page is shorter than the screen and the insets would count twice.
     An installed app never does that: since iOS 26.1 it starts below the status bar (so it is shorter than the
     screen too) but still reaches under the home bar, so it always keeps its bottom inset. */
  function detectHostInsets() {
    if (!isShell() || root.classList.contains('is-standalone')) { root.classList.remove('host-top', 'host-bottom'); return; }
    if (window.visualViewport && window.visualViewport.scale > 1.01) return;
    const ins = safeInsets();
    const landscape = window.innerWidth > window.innerHeight;
    const screenH = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const slack = screenH - window.innerHeight;
    const hostTop = ins.top > 0 && slack >= ins.top - 4;
    const hostBottom = ins.bottom > 0 && slack >= (hostTop ? ins.top : 0) + ins.bottom - 4;
    root.classList.toggle('host-top', hostTop);
    root.classList.toggle('host-bottom', hostBottom);
  }
  function measureViewport() {
    measureQueued = false;
    if (isShell()) {
      const vv = window.visualViewport;
      if (!(vv && vv.scale > 1.01)) { const h = Math.round(window.innerHeight); if (h > 120) root.style.setProperty('--app-h', h + 'px'); }
      detectHostInsets();
      // the page itself must never stay scrolled (iOS can leave it offset after the keyboard or a rotation)
      if (!root.classList.contains('kb-open') && !touching && (window.scrollY || window.scrollX)) window.scrollTo(0, 0);
    }
    fitWelcome();
    if (typeof placeInd === 'function') placeInd();
  }
  function queueMeasure() { if (!measureQueued) { measureQueued = true; requestAnimationFrame(measureViewport); } }
  function settleMeasure() { queueMeasure(); setTimeout(queueMeasure, 120); setTimeout(queueMeasure, 450); setTimeout(queueMeasure, 1000); }
  const isTextField = (n) => !!n && (n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && /^(text|search|number|email|url|tel|password)$/i.test(n.type || 'text')));
  function initViewport() {
    window.addEventListener('resize', queueMeasure);
    window.addEventListener('orientationchange', settleMeasure);
    window.addEventListener('pageshow', settleMeasure);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) settleMeasure(); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', queueMeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueMeasure).catch(() => {});
    // iOS reports safe-area insets only some time after load (WebKit bug 191872): the probe's padding is the inset
    if (window.ResizeObserver) { const p = $('#sa-probe'); if (p) new ResizeObserver(queueMeasure).observe(p, { box: 'border-box' }); }
    // a hairline under the header once the content scrolls beneath it
    $('#main').addEventListener('scroll', () => { if (!isShell()) return; const on = $('#main').scrollTop > 2; if (on !== document.body.classList.contains('scrolled')) document.body.classList.toggle('scrolled', on); }, { passive: true });
    // app layout: the page must never move under the finger; only real scroll areas may scroll,
    // and they don't hand the gesture over to the page at their ends
    let y0 = 0, x0 = 0;
    const scrollableAncestor = (n, dy) => {
      for (; n && n !== document.body && n !== root; n = n.parentElement) {
        if (n.nodeType !== 1) continue;
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll' || n.tagName === 'TEXTAREA') && n.scrollHeight > n.clientHeight + 1) {
          const atTop = n.scrollTop <= 0, atBottom = n.scrollTop + n.clientHeight >= n.scrollHeight - 1;
          if ((dy > 0 && !atTop) || (dy < 0 && !atBottom)) return n;
        }
      }
      return null;
    };
    document.addEventListener('touchstart', (e) => { touching = true; if (e.touches.length === 1) { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; } }, { passive: true });
    const end = (e) => { if (!e.touches || !e.touches.length) { touching = false; queueMeasure(); } };
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!isShell() || e.touches.length !== 1) return; // leave pinch-zoom alone
      const t = e.touches[0], dy = t.clientY - y0, dx = t.clientX - x0;
      if (Math.abs(dx) > Math.abs(dy)) return; // sideways swipes (jump bars, tables) are fine
      if (!scrollableAncestor(e.target, dy) && e.cancelable) e.preventDefault();
    }, { passive: false });
    window.addEventListener('scroll', () => { if (isShell() && !touching && !root.classList.contains('kb-open') && (window.scrollY || window.scrollX)) queueMeasure(); }, { passive: true });
    // typing (glossary search): hide the floating tab bar and let iOS scroll the field into view
    document.addEventListener('focusin', (e) => { if (isTextField(e.target) && mq('(pointer: coarse)')) root.classList.add('kb-open'); });
    document.addEventListener('focusout', () => { setTimeout(() => { if (!isTextField(document.activeElement)) { root.classList.remove('kb-open'); settleMeasure(); } }, 60); });
    settleMeasure();
  }

  /* ---------- routing ---------- */
  function fromHash() { const h = viewOf((location.hash || '').slice(1)); return VIEWS.includes(h) ? h : null; }
  function go(target, push = true) {
    const [v0, sec] = String(target).split(':');
    const v = viewOf(v0);
    if (!VIEWS.includes(v)) return;
    const changed = v !== state.view;
    state.view = v;
    if (push && location.hash.slice(1) !== v) { try { location.hash = v; } catch (e) { /* ignore */ } }
    if (changed) state.anim = 'soft';
    if (changed || sec) render();
    if (sec) requestAnimationFrame(() => { const el = document.getElementById('g-' + sec) || document.getElementById(sec); if (el) el.scrollIntoView({ block: 'start' }); });
    else if (changed) toTop();
  }
  window.addEventListener('hashchange', () => {
    if (location.hash === '#demo') { state.demo = true; state.view = 'pay'; state.anim = 'full'; render(); return; }
    const v = fromHash() || 'pay';
    if (v !== state.view) { state.view = v; state.anim = 'soft'; render(); toTop(); }
  });

  /* ---------- interactions ---------- */
  let tipEl = null;
  function tip(el, x, y) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    tipEl.innerHTML = el.dataset.tip; tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2)) + 'px';
    tipEl.style.top = (y - r.height - 14 < 8 ? y + 18 : y - r.height - 14) + 'px';
  }
  const hideTip = () => { if (tipEl) tipEl.hidden = true; };
  document.addEventListener('pointermove', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) tip(el, e.clientX, e.clientY); else hideTip(); });
  document.addEventListener('pointerdown', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && e.pointerType !== 'mouse') tip(el, e.clientX, e.clientY); });
  window.addEventListener('scroll', hideTip, { passive: true });

  function setFocusCat(cat) { const w = $('.waffle'); if (w) { if (cat) w.dataset.focus = cat; else delete w.dataset.focus; } $$('.legend.hov li').forEach((li) => li.classList.toggle('on', li.dataset.cat === cat)); }
  document.addEventListener('pointerover', (e) => { const li = e.target.closest && e.target.closest('.legend.hov li'); if (li) setFocusCat(li.dataset.cat); else if (e.target.closest && !e.target.closest('.where')) setFocusCat(null); });
  document.addEventListener('focusin', (e) => { const li = e.target.closest && e.target.closest('.legend.hov li'); setFocusCat(li ? li.dataset.cat : null); });

  function closeMenu() { const m = $('#menu'), b = $('[data-act="menu"]'); if (m) m.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-go],[data-act],[data-lang],[data-scroll],a.tab');
    if (!t) { if (!(e.target.closest && e.target.closest('.menu-w'))) closeMenu(); return; }
    if (t.matches('a.tab')) { e.preventDefault(); go(t.dataset.view); return; }
    if (t.dataset.go) { go(t.dataset.go); return; }
    if (t.dataset.scroll) { const el = document.getElementById(t.dataset.scroll); if (el) el.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' }); return; }
    if (t.dataset.lang) { state.lang = t.dataset.lang; store.set('pd-lang', state.lang); render(); if (!$('#psheet').hidden) $('#psheet').innerHTML = sheetHtml(); return; }
    const a = t.dataset.act;
    if (a === 'open') { state.pendingAsk = t.dataset.then || null; closeMenu(); closeHelp(); closeAlert(); $('#file').click(); warmPdf(); }
    else if (a === 'pdfhelp') { closeMenu(); closeAlert(); openHelp(); }
    else if (a === 'share') { closeMenu(); closeAlert(); if (BUILD.share) openSheet('share'); }
    else if (a === 'menu') { const m = $('#menu'); const open = m.hidden; m.hidden = !open; t.setAttribute('aria-expanded', String(open)); if (open) { const f = m.querySelector('button'); if (f) f.focus(); } }
    else if (a === 'priv') { state.priv = !state.priv; document.body.classList.toggle('private', state.priv); $$('[data-act="priv"]').forEach((b) => b.setAttribute('aria-checked', String(state.priv))); }
    else if (a === 'csv') { closeMenu(); exportCsv(); }
    else if (a === 'print') { closeMenu(); printAll(); }
    else if (a === 'install') { closeMenu(); if (PD.Install) PD.Install.open(); }
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-sheet],[data-ph],[data-alert]');
    if (!t) return;
    if (t.dataset.alert === 'close') { closeAlert(); return; }
    if (t.dataset.sheet === 'close') closeHelp();
    else if (t.dataset.ph) {
      state.helpMode = t.dataset.ph;
      const seg = $('#psheet .segc'); if (seg) seg.style.setProperty('--i', state.helpMode === 'phone' ? 0 : 1);
      $$('#psheet [data-ph]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ph === state.helpMode)));
      const L = makeL(state.lang); const ol = $('#psheet .steps');
      if (ol) ol.innerHTML = (state.helpMode === 'phone' ? L.s.phoneSteps : L.s.computerSteps).map((x) => `<li>${esc(x)}</li>`).join('');
    }
  });
  document.addEventListener('change', (e) => { if (e.target.matches('[data-act="slip"]')) { state.cur = +e.target.value; render(); toTop(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); hideTip(); closeHelp(); closeAlert(); } });

  function wireView() {
    const q = $('#gl-q');
    if (q) q.addEventListener('input', () => {
      const k = PD.key(q.value.trim());
      let n = 0;
      $$('#gl > div').forEach((d) => { const on = !k || d.dataset.q.includes(k); d.hidden = !on; if (on) n++; });
      $('#gl-none').hidden = n > 0;
    });
    const od = $('#orig-d');
    if (od) od.addEventListener('toggle', () => { if (od.open) renderOriginal(); });
  }

  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toast.h); toast.h = setTimeout(() => { t.className = 'toast'; }, isErr ? 6000 : 2600);
  }

  async function renderOriginal() {
    const box = $('#orig-pages');
    if (!box || box.dataset.done) return;
    box.dataset.done = '1';
    try {
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: rec().bytes.slice(), isEvalSupported: false, useSystemFonts: true }).promise;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const w = Math.min(box.clientWidth || 600, 900);
        const vp0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (w / vp0.width) * Math.min(2, window.devicePixelRatio || 1) });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height; c.setAttribute('aria-label', `Page ${p}`);
        box.appendChild(c);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
      }
    } catch (e) { box.textContent = String((e && e.message) || e); }
  }

  /* ---------- CSV / print ---------- */
  function exportCsv() {
    const r = rec(); if (!r) return;
    const L = makeL(state.lang, r.A.agreement, r.A.meta.year), A = r.A;
    const q = (v) => { const t = v == null ? '' : String(v); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = [['section', 'workday_line', 'plain_name', 'hours', 'rate', 'amount', 'ytd_hours', 'ytd_amount']];
    A.earnings.forEach((e) => rows.push(['earnings', e.desc, earningName(e, L), e.hours, e.rate, e.amount, e.ytdHours, e.ytd]));
    A.taxes.forEach((t) => rows.push(['taxes', t.desc, L.kind(t.kind), '', '', t.amount, '', t.ytd]));
    A.deductions.forEach((d) => rows.push(['deductions', d.desc, L.kind(dk(d.kind)), '', '', d.amount, '', d.ytd]));
    A.employer.forEach((e) => rows.push(['employer', e.desc, L.kind(e.kind), '', '', e.amount, '', e.ytd]));
    Object.values(A.taxableWages).forEach((t) => rows.push(['taxable_wages', t.desc, '', '', '', t.cur, '', t.ytd]));
    rows.push(['summary', 'gross', L.s.grossPay, A.hoursPaid, '', A.summary.gross, '', A.summary.grossYtd]);
    rows.push(['summary', 'net', L.s.netPay, '', '', A.summary.net, '', A.summary.netYtd]);
    const csv = '﻿' + rows.map((x) => x.map(q).join(',')).join('\r\n');
    const filename = `payslip-${A.meta.payDate || 'export'}${r.parsed.sample ? '-example' : ''}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function printAll() {
    state.printing = true; render();
    const done = () => { window.removeEventListener('afterprint', done); state.printing = false; render(); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { done(); } }, 60);
  }

  /* ---------- pdf.js ---------- */
  async function decodeEmbedded(id) {
    const b64 = document.getElementById(id).textContent.replace(/\s+/g, '');
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }
  let pdfjsPromise = null;
  /* start loading the PDF reader as soon as someone shows intent: it then loads while the file picker is open */
  const warmPdf = () => { loadPdfjs().catch(() => {}); };
  document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('[data-act="open"]')) warmPdf(); }, { passive: true });
  function loadPdfjs() {
    if (!pdfjsPromise) pdfjsPromise = (async () => {
      if (BUILD.pdfjs) {
        // GitHub Pages: the legacy build (for older phones) from the site's vendor folder; it parses on the main thread.
        const base = BUILD.pdfjs;
        try {
          window.pdfjsWorker = await import(base + 'pdf.worker.min.mjs');
          const pdfjs = await import(base + 'pdf.min.mjs');
          pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
          return pdfjs;
        } catch (e) { const err = new Error('net'); err.cause = e; throw err; }
      }
      if (!('DecompressionStream' in window)) throw new Error('no-decompression');
      const [lib, worker] = await Promise.all([decodeEmbedded('pdfjs-lib'), decodeEmbedded('pdfjs-worker')]);
      const workerUrl = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));
      const libUrl = URL.createObjectURL(new Blob([lib], { type: 'text/javascript' }));
      window.pdfjsWorker = await import(workerUrl);
      const pdfjs = await import(libUrl);
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
    return pdfjsPromise;
  }

  /* ---------- files ---------- */
  async function handleFiles(files) {
    const pdfs = Array.from(files).filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    const L0 = makeL(state.lang);
    if (!pdfs.length) { setErr(L0.s.alert.notPayslipT, L0.s.alert.notPayslip, Array.from(files).map((f) => f.name)); return; }
    state.loading = true; closeAlert();
    if (!state.slips.length) { closeHelp(); leaveDemo(); render(); } else toast(L0.s.reading);
    let pdfjs;
    try { pdfjs = await loadPdfjs(); } catch (e) { console.error(e); state.loading = false; return setErr(L0.s.alert.loadT, e && e.message === 'net' ? L0.s.loadFailNet : L0.s.loadFail); }
    const errors = [];
    let added = 0;
    for (const f of pdfs) {
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        const { pages } = await PD.extractPages(pdfjs, buf.slice());
        const parsed = PD.parsePayslip(pages);
        await PD.unlockFor(parsed.header);
        const A = PD.analyze(parsed);
        if (!A.earnings.length || A.summary.gross == null) throw new Error('not-payslip');
        const recd = { name: f.name, bytes: buf, parsed, A };
        const dup = state.slips.findIndex((x) => x.A.meta.payDate === A.meta.payDate && x.A.summary.net === A.summary.net);
        if (dup >= 0) state.slips[dup] = recd; else state.slips.push(recd);
        added++;
      } catch (e) { console.warn(f.name, e && e.message); errors.push(f.name); }
    }
    state.loading = false;
    if (!added) return setErr(L0.s.alert.notPayslipT, L0.s.alert.notPayslip, errors);
    state.slips.sort((a, b) => String(a.A.meta.payDate).localeCompare(String(b.A.meta.payDate)));
    state.cur = state.slips.length - 1;
    if (state.view === 'guide') state.view = 'pay';
    if (location.hash.slice(1) !== state.view) { try { history.replaceState(null, '', '#' + state.view); } catch (e) { /* ignore */ } }
    state.demo = false; state.anim = 'full';
    render(); toTop();
    // the assistant asked for a second payslip to compare: answer now that it is open
    const pend = state.pendingAsk; state.pendingAsk = null;
    if (pend && state.slips.length > 1 && state.view === 'ask') ask(pend);
    if (errors.length) showAlert(L0.s.alert.notPayslipT, L0.s.alert.notPayslip, errors); else toast(L0.s.opened(added));
  }
  /* reading a file from the example goes back to the welcome screen, where progress and errors are shown */
  function leaveDemo() { if (!state.demo) return; state.demo = false; state.chat = []; if (location.hash === '#demo') { try { history.replaceState(null, '', '#pay'); } catch (e) { /* ignore */ } } }
  function setErr(title, text, files) { state.loading = false; if (!state.slips.length) { leaveDemo(); render(); toTop(); } showAlert(title, text, files); }

  /* ---------- a problem with a file: a popup over the screen, so nothing underneath moves ---------- */
  let alertFocus = null;
  function showAlert(title, text, files = []) {
    const s = makeL(state.lang).s, box = $('#alert');
    if (!box) return;
    alertFocus = document.activeElement;
    box.innerHTML = `<div class="al-bg" data-alert="close"></div>
      <section class="alert" role="alertdialog" aria-modal="true" aria-labelledby="al-t" aria-describedby="al-d" tabindex="-1">
        <button class="iconbtn al-x" data-alert="close" aria-label="${esc(s.close)}">${I.x}</button>
        <span class="al-ic" aria-hidden="true">${I.warn}</span>
        <h2 id="al-t">${esc(title)}</h2>
        <p id="al-d">${esc(text)}</p>
        ${files.length ? `<p class="al-f">${esc(s.alert.files(files.length, files.join(', ')))}</p>` : ''}
      </section>`;
    box.hidden = false;
    document.documentElement.classList.add('alert-open');
    requestAnimationFrame(() => requestAnimationFrame(() => { box.classList.add('on'); const d = box.querySelector('.alert'); if (d) d.focus({ preventScroll: true }); }));
  }
  function closeAlert() {
    const box = $('#alert');
    if (!box || box.hidden) return;
    box.classList.remove('on');
    document.documentElement.classList.remove('alert-open');
    setTimeout(() => { if (!box.classList.contains('on')) { box.hidden = true; box.innerHTML = ''; } }, 320);
    if (alertFocus && alertFocus.focus && document.contains(alertFocus)) alertFocus.focus({ preventScroll: true });
  }

  /* drag & drop anywhere */
  let dragDepth = 0;
  const ov = () => $('#dropov');
  window.addEventListener('dragenter', (e) => { if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return; e.preventDefault(); dragDepth++; ov().hidden = false; warmPdf(); });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) ov().hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; ov().hidden = true; if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  /* ---------- boot ---------- */
  function boot() {
    state.view = fromHash() || 'pay';
    if (location.hash === '#demo') { state.demo = true; state.anim = 'full'; }
    try { const P = PD.SAMPLE; state.sample = { name: 'example', bytes: null, parsed: P, A: PD.analyze(P), sample: true }; } catch (e) { console.error(e); }
    $('#file').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
    $('#dropov').innerHTML = `<div>${I.upload}<p></p></div>`;
    const setOv = () => { $('#dropov p').textContent = PD.STR[state.lang].dropOverlay; };
    setOv(); new MutationObserver(setOv).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    render();
    // the PDF reader is loaded when someone reaches for a file (see warmPdf), not during start-up or animations
    if (PD.Install) PD.Install.boot({ lang: () => state.lang, toast, refresh: () => { const r = rec(), L = makeL(state.lang, r && r.A.agreement, r && r.A.meta.year); renderBar(L, r); renderTabs(L, r && r.A); } });
    initViewport();
    // page layout: the header turns to frosted material once content scrolls under it
    const sen = $('#top-sentinel');
    if (sen && 'IntersectionObserver' in window) new IntersectionObserver(([en]) => document.body.classList.toggle('scrolled', !en.isIntersecting)).observe(sen);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.PDUI = { handleFiles, state, go, render, ask };
})();
