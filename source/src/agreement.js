/* Collective agreements. The code here is employer-neutral: agreement data ships as encrypted packs
   (PD.PACKS, added at build time). A pack is unlocked only by a payslip from the workplace it covers:
   the key is derived from the employer name and city printed on that payslip. */
(function (G) {
  'use strict';
  const PD = (G.PD = G.PD || {});
  PD.PACKS = PD.PACKS || [];
  PD.AGREEMENTS = PD.AGREEMENTS || [];
  const PROV = 'qc|on|nb|ns|pe|nl|mb|sk|ab|bc|yt|nt|nu|quebec|ontario';
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /* Candidate key material from a payslip header: "<employer word>|<city>". Workday may print the employer's name
     in either language's word order and the city in several ways, so a few spellings are tried: either of the first
     two words of the name (legal words like "inc." skipped), and the word before the province or the postal code.
     A pack lists the spellings it accepts (each one wraps its key); the rest simply fail. At most 4 tries. */
  const LEGAL = /^(inc|ltd|ltee|limitee|corp|corporation|co|cie|llc|ulc|lp|sec|senc|the|le|la|les|l|de|du|des|of)$/;
  const place = (w) => w.replace(/^st-/, 'saint-').replace(/^ste-/, 'sainte-');
  PD.agreementMaterial = (h) => {
    const words = PD.key((h && h.company) || '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    // the first word as printed (how packs were keyed from the start), then the next word that isn't a legal one
    const names = [...new Set([words[0], ...words.filter((w) => !LEGAL.test(w))])].filter(Boolean).slice(0, 2);
    const addr = PD.key((h && h.companyAddress) || '');
    const cities = [];
    const m1 = addr.match(new RegExp(`([a-z][a-z'-]+)\\s*,?\\s*(?:${PROV})\\b(?!.*\\b(?:${PROV})\\b)`));
    if (m1) cities.push(place(m1[1]));
    const m2 = addr.match(/([a-z][a-z'-]{2,})\s*,?\s*(?:[a-z]{2}\s+)?[a-z]\d[a-z]\s?\d[a-z]\d/);
    if (m2 && !new RegExp(`^(?:${PROV})$`).test(m2[1]) && !cities.includes(place(m2[1]))) cities.push(place(m2[1]));
    const out = [];
    for (const n of names) for (const c of cities.slice(0, 2)) out.push(`${n}|${c}`);
    return out.slice(0, 4);
  };

  async function deriveKey(subtle, material, pack) {
    const base = await subtle.importKey('raw', new TextEncoder().encode(material), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: fromB64(pack.salt), iterations: pack.iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
  }
  async function tryDecrypt(pack, material) {
    const subtle = G.crypto && G.crypto.subtle;
    if (!subtle) return null;
    let fit = false;
    try {
      const k = await deriveKey(subtle, material, pack);
      let content = k;
      if (pack.v === 2) {
        // format 2: the derived key unwraps the pack's own key, one wrap per accepted spelling
        content = null;
        for (const s of pack.slots || []) {
          try {
            const raw = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(s.iv) }, k, fromB64(s.k));
            content = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
            fit = !!s.fit; // a fallback spelling: the pack applies only to pay that fits its scales
            break;
          } catch (e) {
            /* not this spelling's wrap */
          }
        }
        if (!content) return null;
      }
      const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(pack.iv) }, content, fromB64(pack.ct));
      return { ag: JSON.parse(new TextDecoder().decode(pt)), fit };
    } catch (e) {
      return null;
    }
  }

  /* Unlock the pack that matches this payslip's header, if any. Safe to call for every payslip. Each opened agreement
     remembers the spellings that opened it (ag._mats: spelling → whether it is a fallback that needs the fit test). */
  PD.unlockFor = async (h) => {
    const mats = PD.agreementMaterial(h);
    if (!mats.length) return null;
    const known = PD.AGREEMENTS.find((a) => mats.some((m) => m in a._mats));
    if (known) return known;
    for (const pack of PD.PACKS) {
      for (const m of mats) {
        const r = await tryDecrypt(pack, m);
        if (!r) continue;
        let ag = PD.AGREEMENTS.find((a) => a.id === r.ag.id);
        if (!ag) PD.AGREEMENTS.push((ag = Object.assign(r.ag, { _mats: {} })));
        ag._mats[m] = r.fit;
        return ag;
      }
    }
    return null;
  };
  /* the agreement for a payslip: opened through its header's spelling, and when that spelling is only a fallback, the
     payslip's main hourly rate (the line with the most hours) must be on the agreement's scale for that date or the one
     before it. pay: { rows: [{ rate, hours }], date } */
  PD.findAgreement = (h, pay) => {
    const mats = PD.agreementMaterial(h);
    const ag = PD.AGREEMENTS.find((a) => mats.some((m) => m in a._mats));
    if (!ag) return null;
    if (mats.some((m) => ag._mats[m] === false)) return ag;
    return pay && PD.payFits(ag, pay) ? ag : null;
  };
  PD.payFits = (ag, { rows, date }) => {
    // a shift premium is paid on every hour but is a few dollars an hour, never a wage
    const main = rows.filter((r) => r.rate >= 10 && r.hours > 0).sort((a, b) => b.hours - a.hours)[0];
    const now = date && PD.scaleFor(ag, date);
    if (!main || !now) return false;
    const i = ag.scales.indexOf(now);
    const near = [now, ag.scales[i - 1]].filter(Boolean);
    return near.some((sc) =>
      Object.values(sc.rates || {}).some((c) => Object.values(c).some((v) => Math.round(v * 100) === Math.round(main.rate * 100))),
    );
  };

  /* agreement wording with {placeholders} */
  PD.agText = (ag, lang, k, vars = {}) => {
    const t = ((ag && ag.text && (ag.text[lang] || ag.text.en)) || {})[k] || '';
    return t.replace(/\{(\w+)\}/g, (_, n) => (vars[n] == null ? '' : String(vars[n])));
  };

  /* Statutory holidays for a year, as ISO dates. Saturday → the Friday before, Sunday → the Monday after. */
  PD.holidayDates = (year, ids, nominal = false) => {
    if (!ids || !ids.length) return [];
    const D = (m, d) => new Date(Date.UTC(year, m - 1, d));
    const add = (t, n) => new Date(t.getTime() + n * 864e5);
    const Y = year,
      a = Y % 19,
      b = Math.floor(Y / 100),
      c = Y % 100,
      d = Math.floor(b / 4),
      e = b % 4,
      f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4),
      k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easter = D(Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
    const mondayBefore = (mo, day) => {
      let t = D(mo, day);
      do {
        t = add(t, -1);
      } while (t.getUTCDay() !== 1);
      return t;
    };
    const nthMonday = (mo, n) => {
      let t = D(mo, 1);
      while (t.getUTCDay() !== 1) t = add(t, 1);
      return add(t, 7 * (n - 1));
    };
    const H = {
      newYear: () => D(1, 1),
      dayAfterNewYear: () => D(1, 2),
      goodFriday: () => add(easter, -2),
      easterMonday: () => add(easter, 1),
      patriots: () => mondayBefore(5, 25),
      stJean: () => D(6, 24),
      canada: () => D(7, 1),
      labour: () => nthMonday(9, 1),
      thanksgiving: () => nthMonday(10, 2),
      christmasEve: () => D(12, 24),
      christmas: () => D(12, 25),
      boxing: () => D(12, 26),
      newYearsEve: () => D(12, 31),
    };
    const days = ids.map((id) => (H[id] ? H[id]() : null));
    if (nominal) return days.map((t) => (t ? t.toISOString().slice(0, 10) : null));
    return days.map((t) =>
      t ? (t.getUTCDay() === 6 ? add(t, -1) : t.getUTCDay() === 0 ? add(t, 1) : t).toISOString().slice(0, 10) : null,
    );
  };

  /* Each holiday of a year: the day it is observed, and whether that day has to be confirmed. The weekend rule can move
     a holiday onto another one, even across New Year (New Year's Day on a Saturday moves to December 31, which may
     already be a holiday): the holiday that moved is then for the employer to set. */
  PD.holidayList = (year, ids) => {
    if (!ids || !ids.length) return [];
    const all = [];
    for (const y of [year - 1, year, year + 1]) {
      const nom = PD.holidayDates(y, ids, true),
        obs = PD.holidayDates(y, ids);
      ids.forEach((id, i) => all.push({ id, i, year: y, nominal: nom[i], date: obs[i] }));
    }
    return all
      .filter((h) => h.year === year)
      .map((h) => ({ ...h, clash: !!h.date && h.date !== h.nominal && all.some((o) => o !== h && o.date === h.date) }));
  };
  /* the holidays a calendar year holds, its neighbours' moved ones included: each day once, first to last */
  PD.holidaysIn = (year, ids) =>
    [...new Set([year - 1, year, year + 1].flatMap((y) => PD.holidayDates(y, ids)).filter((d) => d && +d.slice(0, 4) === year))].sort();

  PD.scaleFor = (ag, isoDate) => {
    const s = ag.scales.filter((x) => x.from <= isoDate);
    return s.length ? s[s.length - 1] : null;
  };

  /* Which class/level a rate corresponds to (optionally with a known premium on top). */
  PD.lookupRate = (ag, isoDate, rate) => {
    const sc = PD.scaleFor(ag, isoDate);
    if (!sc || !rate) return null;
    const hits = [];
    for (const [cls, lv] of Object.entries(sc.rates)) {
      for (const level of ['A', 'B', 'C']) {
        const base = lv[level];
        if (Math.abs(base - rate) < 0.005) hits.push({ cls: +cls, level, base, premium: null });
        for (const p of ag.otherPremiums || [])
          if (Math.abs(base + p.amount - rate) < 0.005) hits.push({ cls: +cls, level, base, premium: p });
      }
    }
    hits.sort((x, y) => (x.premium ? 1 : 0) - (y.premium ? 1 : 0));
    return { scale: sc, hits };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
