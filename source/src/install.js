/* Home-screen install: device detection, first-launch guide, one-tap install where the browser allows it. */
(function () {
  'use strict';
  const PD = window.PD;
  const BUILD = PD.BUILD || {};
  const ENABLED = BUILD.target === 'pages';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  let api = { lang: () => 'en', toast: () => {} };
  let bip = null; // deferred beforeinstallprompt event (Chromium browsers)
  let env = null;
  let chosen = null; // manual override from "Not your device?"
  let picking = false;

  /* ---------- detection ---------- */
  const standalone = () => {
    try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true; } catch (e) { return false; }
  };
  const inFrame = () => { try { return window.self !== window.top; } catch (e) { return true; } };
  function detect() {
    const ua = navigator.userAgent || '';
    const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
    const os = /iPhone|iPod/.test(ua) ? 'ios' : (/iPad/.test(ua) || iPadOS) ? 'ipados' : /Android/.test(ua) ? 'android'
      : /Windows/.test(ua) ? 'windows' : /CrOS/.test(ua) ? 'chromeos' : /Macintosh/.test(ua) ? 'macos' : /Linux/.test(ua) ? 'linux' : 'other';
    const inApp = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|LinkedInApp|Snapchat|musical_ly|BytedanceWebview|\bLine\/|GSA\/|Teams\/|; wv\)/.test(ua);
    let browser = 'other';
    if (inApp) browser = 'inapp';
    else if (os === 'ios' || os === 'ipados') browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : /OPT\//.test(ua) ? 'opera' : /Safari/.test(ua) ? 'safari' : 'other';
    else browser = /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : /EdgA?\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Chrome/.test(ua) ? 'chrome' : /Safari/.test(ua) ? 'safari' : 'other';
    const form = os === 'ios' ? 'phone' : os === 'ipados' ? 'tablet' : os === 'android' ? (/Mobile/.test(ua) ? 'phone' : 'tablet') : 'computer';
    let osVersion = null;
    if (os === 'android' && browser === 'firefox') { const m = ua.match(/Android (\d+)/); if (m) osVersion = m[1]; }
    if ((os === 'ios' || os === 'ipados') && browser !== 'safari') { const m = ua.match(/OS (\d+)[_.]/); if (m) osVersion = m[1]; }
    return { os, browser, form, model: null, osVersion, inApp };
  }
  async function enrich(e) {
    const uad = navigator.userAgentData;
    if (!uad || !uad.getHighEntropyValues) return e;
    try {
      const h = await uad.getHighEntropyValues(['model', 'platformVersion', 'formFactors']);
      if (h.model) e.model = h.model;
      if (e.os === 'android' && h.platformVersion) e.osVersion = h.platformVersion.split('.')[0];
      if (Array.isArray(h.formFactors) && h.formFactors.includes('Tablet') && e.os === 'android') e.form = 'tablet';
    } catch (err) { /* not available */ }
    return e;
  }

  /* ---------- steps per platform ---------- */
  const IC = {
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5H6v10h12v-10h-2.5"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>',
    kebab: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5.5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="18.5" r="1.8"/></svg>',
    burger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.5 7h15M4.5 12h15M4.5 17h15"/></svg>',
    plusSq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
    addHome: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4"/><path d="M12 9v6M9 12h6"/></svg>',
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6"/><path d="M10.5 18h3"/></svg>',
    tablet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.8" y="2.8" width="16.4" height="18.4" rx="2.4"/><path d="M10.5 18h3"/></svg>',
    laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="5" width="15" height="10.5" rx="1.6"/><path d="M2.5 19h19"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg>',
  };
  const tok = (txt) => esc(txt).replace(/\{(\w+)\}/g, (m, n) => (IC[n] ? `<span class="ic-in" aria-hidden="true">${IC[n]}</span>` : m));

  /* UI mock-ups that look like the button or menu row the person will tap */
  const M = {
    btns: (...names) => `<div class="mk mk-btns">${names.map((n) => `<span class="mk-btn">${IC[n]}</span>`).join('')}</div>`,
    row: (label, icon, android) => `<div class="mk mk-row ${android ? 'and' : ''}">${android ? `<span class="mk-ri">${IC[icon]}</span><span>${esc(label)}</span>` : `<span>${esc(label)}</span><span class="mk-ri">${IC[icon]}</span>`}</div>`,
    toggle: (label, add) => `<div class="mk mk-tg"><div class="mk-tgr"><span>${esc(label)}</span><span class="mk-sw" aria-hidden="true"></span></div><span class="mk-add">${esc(add)}</span></div>`,
    pill: (label) => `<div class="mk mk-dlg"><span class="mk-pill">${esc(label)}</span></div>`,
  };

  function plan(e) {
    const S = PD.STR[api.lang()].install, U = S.ui;
    const key = chosen || (e.inApp ? (e.os === 'android' ? 'androidInApp' : 'iosInApp')
      : (e.os === 'ios' || e.os === 'ipados') ? (e.browser === 'safari' ? 'iosSafari' : e.browser === 'chrome' ? 'iosChrome' : 'iosOther')
      : e.os === 'android' ? (bip ? 'prompt' : e.browser === 'samsung' ? 'androidSamsung' : e.browser === 'firefox' ? 'androidFirefox' : e.browser === 'chrome' ? 'androidChrome' : 'androidOther')
      : (bip ? 'prompt' : e.browser === 'safari' && e.os === 'macos' ? 'macSafari' : 'desktop'));
    const T = S.steps;
    const P = {
      iosSafari: [[T.iosShare, M.btns('dots', 'share')], [T.iosAdd, M.row(U.iosAdd, 'plusSq'), T.iosAddHint], [T.iosToggle, M.toggle(U.iosToggle, U.iosAddBtn)]],
      iosChrome: [[T.iosChromeShare, M.btns('share')], [T.iosAdd, M.row(U.iosAdd, 'plusSq')], [T.iosConfirm, M.toggle(U.iosToggle, U.iosAddBtn)]],
      iosOther: [[T.iosOtherShare, M.btns('dots', 'share')], [T.iosAdd, M.row(U.iosAdd, 'plusSq')], [T.iosConfirm, ''], [T.iosOtherFallback, '']],
      iosInApp: [[T.inAppWhy, ''], [T.inAppOpen, M.btns('dots', 'compass')], [T.inAppPickIos, ''], [T.inAppThen, '']],
      androidInApp: [[T.inAppWhy, ''], [T.inAppOpen, M.btns('kebab')], [T.inAppPickAndroid, ''], [T.inAppThen, '']],
      androidChrome: [[T.andMenu, M.btns('kebab')], [T.andAdd, M.row(U.andAdd, 'addHome', true)], [T.andInstall, M.pill(U.andInstall)]],
      androidSamsung: [[T.samMenu, M.btns('burger')], [T.samAdd, M.row(U.samAdd, 'plusSq', true), T.samHint], [T.samHome, M.row(U.samHome, 'addHome', true)]],
      androidFirefox: [[T.andMenu, M.btns('kebab')], [T.ffAdd, M.row(U.andAdd, 'addHome', true)], [T.ffConfirm, '']],
      androidOther: [[T.otherMenu, M.btns('kebab', 'dots')], [T.otherFind, ''], [T.otherConfirm, '']],
      macSafari: [[T.macSafari, '']],
      desktop: [[T.desktop, '']],
      prompt: [],
    };
    return { key, steps: P[key] || P.desktop };
  }

  function deviceLabel(e) {
    const S = PD.STR[api.lang()].install;
    let dev;
    if (e.os === 'ios') dev = S.dev.iphone;
    else if (e.os === 'ipados') dev = S.dev.ipad;
    else if (e.os === 'android') dev = e.model ? (/^SM-/i.test(e.model) ? S.dev.samsung(e.model) : e.model) : e.form === 'tablet' ? S.dev.androidTablet : S.dev.androidPhone;
    else dev = S.dev.computer;
    const parts = [];
    if (e.os === 'android') parts.push(e.osVersion ? `Android ${e.osVersion}` : 'Android');
    else if (e.os === 'ios' || e.os === 'ipados') parts.push(e.osVersion ? `${e.os === 'ios' ? 'iOS' : 'iPadOS'} ${e.osVersion}` : e.os === 'ios' ? 'iOS' : 'iPadOS');
    parts.push(S.br[e.browser] || S.br.other);
    return { dev, sub: parts.join(', '), icon: e.form === 'tablet' ? IC.tablet : e.form === 'phone' ? IC.phone : IC.laptop };
  }

  /* ---------- sheet ---------- */
  function html() {
    const lang = api.lang(), S = PD.STR[lang].install;
    const p = plan(env), d = deviceLabel(env);
    const picker = picking ? `<div class="sh-pick" role="group" aria-label="${esc(S.pick)}">${['iosSafari', 'androidChrome', 'androidSamsung', 'androidFirefox'].map((k) => `<button data-ins="pick" data-k="${k}" aria-pressed="${p.key === k}">${esc(S.pickNames[k])}</button>`).join('')}</div>` : '';
    const steps = p.key === 'prompt'
      ? `<div class="sh-one"><button class="btn primary big" data-ins="prompt">${IC.down}${esc(S.installBtn)}</button><p>${esc(S.oneTap)}</p></div>`
      : `<ol class="sh-steps">${p.steps.map(([t, mock, hint]) => `<li><div class="st-t"><p>${tok(t)}</p>${hint ? `<small>${tok(hint)}</small>` : ''}</div>${mock || ''}</li>`).join('')}</ol>`;
    const copy = p.key === 'iosInApp' || p.key === 'androidInApp' ? `<button class="btn" data-ins="copy">${IC.link}${esc(S.copy)}</button>` : '';
    const ipadNote = env.os === 'ipados' && p.key === 'iosSafari' && !chosen ? `<p class="sh-note">${esc(S.ipadNote)}</p>` : '';
    return `<div class="sh-bg" data-ins="close"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t" tabindex="-1">
        <div class="sh-grab" aria-hidden="true"></div>
        <div class="sh-h">
          <img class="sh-icon" src="icons/icon-192.png" alt="" width="52" height="52">
          <div><h2 id="sh-t">${esc(S.title)}</h2><p>${esc(S.sub)}</p></div>
          <button class="iconbtn sh-x" data-ins="close" aria-label="${esc(S.close)}">${IC.x}</button>
        </div>
        <div class="sh-dev"><span class="sh-devi" aria-hidden="true">${d.icon}</span><div><b>${esc(d.dev)}</b><small>${esc(d.sub)}${chosen ? '' : ` (${esc(S.detected)})`}</small></div><button class="link" data-ins="choose" aria-expanded="${picking}">${esc(S.notMine)}</button></div>
        ${picker}
        ${steps}${ipadNote}
        <div class="sh-f">${copy}<button class="btn ghost" data-ins="dismiss">${esc(S.dismiss)}</button></div>
        <p class="sh-later">${esc(S.later)}</p>
      </section>`;
  }
  function render() { const box = document.getElementById('sheet'); if (box && !box.hidden) box.innerHTML = html(); }
  let lastFocus = null;
  function open() {
    if (!env) env = detect();
    const box = document.getElementById('sheet');
    if (!box) return;
    lastFocus = document.activeElement;
    picking = false; chosen = null;
    box.hidden = false; box.innerHTML = html();
    document.documentElement.classList.add('sheet-open');
    requestAnimationFrame(() => requestAnimationFrame(() => { box.classList.add('on'); const s = box.querySelector('.sheet'); if (s) s.focus({ preventScroll: true }); }));
  }
  function close() {
    const box = document.getElementById('sheet');
    if (!box || box.hidden) return;
    store.set('pd-install-seen', '1');
    box.classList.remove('on');
    document.documentElement.classList.remove('sheet-open');
    setTimeout(() => { if (!box.classList.contains('on')) { box.hidden = true; box.innerHTML = ''; } }, 420);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  async function promptInstall() {
    if (!bip) return;
    const ev = bip;
    try { ev.prompt(); const r = await ev.userChoice; if (r && r.outcome === 'accepted') { bip = null; close(); } } catch (e) { /* refused */ }
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-ins]');
    if (!t) return;
    const a = t.dataset.ins, S = PD.STR[api.lang()].install;
    if (a === 'close' || a === 'dismiss') close();
    else if (a === 'choose') { picking = !picking; render(); }
    else if (a === 'pick') { chosen = t.dataset.k; render(); }
    else if (a === 'prompt') promptInstall();
    else if (a === 'copy') {
      const done = () => api.toast(S.copied);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href.split('#')[0]).then(done, () => api.toast(location.href.split('#')[0]));
      else api.toast(location.href.split('#')[0]);
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); bip = e; render(); if (api.refresh) api.refresh(); });
  window.addEventListener('appinstalled', () => { bip = null; store.set('pd-installed', '1'); close(); api.toast(PD.STR[api.lang()].install.installed); });

  /* ---------- public ---------- */
  PD.Install = {
    canOffer: () => ENABLED && !inFrame() && !standalone(),
    standalone,
    open,
    syncLang(lang) {
      const S = PD.STR[lang].install;
      const m = document.getElementById('pd-manifest');
      if (m) { const href = `manifest.${lang}.webmanifest`; if (!m.getAttribute('href').endsWith(href)) m.setAttribute('href', href); }
      const t = document.getElementById('pd-apptitle');
      if (t) t.setAttribute('content', S.shortName);
      render();
    },
    async boot(hooks) {
      api = Object.assign(api, hooks);
      if (!ENABLED || inFrame()) return;
      if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
      env = await enrich(detect());
      if (standalone()) {
        if (!store.get('pd-welcomed')) { store.set('pd-welcomed', '1'); setTimeout(() => api.toast(PD.STR[api.lang()].install.welcome), 900); }
        return;
      }
      if (env.form !== 'computer' && !store.get('pd-install-seen')) setTimeout(() => { if (document.getElementById('psheet').hidden) open(); }, 2200);
    },
  };
})();
