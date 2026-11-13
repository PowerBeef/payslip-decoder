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

  /* candidate key material from a payslip header: "<first word of employer>|<city>" */
  PD.agreementMaterial = (h) => {
    const comp = PD.key((h && h.company) || '').replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';
    const addr = PD.key((h && h.companyAddress) || '');
    const out = [];
    const m1 = addr.match(new RegExp(`([a-z][a-z'-]+)\\s*,\\s*(?:${PROV})\\b`));
    if (m1) out.push(m1[1]);
    const m2 = addr.match(/([a-z][a-z'-]{2,})\s*,?\s*(?:[a-z]{2}\s+)?[a-z]\d[a-z]\s?\d[a-z]\d/);
    if (m2 && !out.includes(m2[1])) out.push(m2[1]);
    return comp ? out.slice(0, 2).map((w) => `${comp}|${w}`) : [];
  };

  async function tryDecrypt(pack, material) {
    const subtle = G.crypto && G.crypto.subtle;
    if (!subtle) return null;
    try {
      const base = await subtle.importKey('raw', new TextEncoder().encode(material), 'PBKDF2', false, ['deriveKey']);
      const k = await subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(pack.salt), iterations: pack.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(pack.iv) }, k, fromB64(pack.ct));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { return null; }
  }

  /* Unlock the pack that matches this payslip, if any. Safe to call for every payslip. */
  PD.unlockFor = async (h) => {
    const mats = PD.agreementMaterial(h);
    if (!mats.length) return null;
    const known = PD.AGREEMENTS.find((a) => mats.includes(a._material));
    if (known) return known;
    for (const pack of PD.PACKS) {
      if (pack._open) continue;
      for (const m of mats) {
        const ag = await tryDecrypt(pack, m);
        if (ag) { ag._material = m; pack._open = true; PD.AGREEMENTS.push(ag); return ag; }
      }
    }
    return null;
  };
  PD.findAgreement = (h) => { const mats = PD.agreementMaterial(h); return PD.AGREEMENTS.find((a) => mats.includes(a._material)) || null; };

  /* agreement wording with {placeholders} */
  PD.agText = (ag, lang, k, vars = {}) => {
    const t = ((ag && ag.text && (ag.text[lang] || ag.text.en)) || {})[k] || '';
    return t.replace(/\{(\w+)\}/g, (_, n) => (vars[n] == null ? '' : String(vars[n])));
  };

  /* Statutory holidays for a year, as ISO dates. Saturday → the Friday before, Sunday → the Monday after. */
  PD.holidayDates = (year, ids) => {
    if (!ids || !ids.length) return [];
    const D = (m, d) => new Date(Date.UTC(year, m - 1, d));
    const add = (t, n) => new Date(t.getTime() + n * 864e5);
    const Y = year, a = Y % 19, b = Math.floor(Y / 100), c = Y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const easter = D(Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
    const mondayBefore = (mo, day) => { let t = D(mo, day); do { t = add(t, -1); } while (t.getUTCDay() !== 1); return t; };
    const nthMonday = (mo, n) => { let t = D(mo, 1); while (t.getUTCDay() !== 1) t = add(t, 1); return add(t, 7 * (n - 1)); };
    const H = {
      newYear: () => D(1, 1), dayAfterNewYear: () => D(1, 2), goodFriday: () => add(easter, -2), easterMonday: () => add(easter, 1),
      patriots: () => mondayBefore(5, 25), stJean: () => D(6, 24), canada: () => D(7, 1), labour: () => nthMonday(9, 1),
      thanksgiving: () => nthMonday(10, 2), christmasEve: () => D(12, 24), christmas: () => D(12, 25), boxing: () => D(12, 26), newYearsEve: () => D(12, 31),
    };
    return ids.map((id) => (H[id] ? H[id]() : null)).map((t) => (t ? (t.getUTCDay() === 6 ? add(t, -1) : t.getUTCDay() === 0 ? add(t, 1) : t).toISOString().slice(0, 10) : null));
  };

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
        for (const p of ag.otherPremiums || []) if (Math.abs(base + p.amount - rate) < 0.005) hits.push({ cls: +cls, level, base, premium: p });
      }
    }
    hits.sort((x, y) => (x.premium ? 1 : 0) - (y.premium ? 1 : 0));
    return { scale: sc, hits };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
