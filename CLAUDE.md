# Payslip Decoder

A web app that opens a Workday payslip PDF in the browser and explains every line in plain English or French. It also checks the math, the federal and Québec deductions, the yearly maximums and, for supported workplaces, the collective agreement. Live at https://powerbeef.github.io/payslip-decoder/ (GitHub Pages, `main` branch, root folder). People install it to their home screen and it runs offline.

## Rules that always apply

1. **Nothing personal, nothing about the employer, in readable form.** The repo is public. Never commit payslips (any `.pdf` is gitignored), screenshots of real payslips, names, employee IDs, addresses or bank details. Never write the employer's name, the union, the plant's city, or collective-agreement figures or article numbers in code, comments, docs, commit messages or this file. Workplace-specific data lives only in the encrypted pack (see below).
2. **Run the leak check before every commit:** `cd source && node tools/leak_scan.mjs`. It looks for the words in `source/private/forbidden.txt` (ignoring case and accents), every wage rate and premium in the private pack and every contract reference it cites, and any contract-style reference ("art." or "annexe" followed by a number). Before publishing, also run `node tools/leak_scan.mjs --history --images` (every file in every commit, commit messages and authors, and the text in images). `--show` lists what was found, on your own screen only. Without the private folder only the PDF and contract-reference checks run: ask the owner before publishing.
3. **Payslips never leave the device.** No analytics, no network calls with payslip data, no storage of payslips (only language and "guide seen" flags go in localStorage).
4. **Ask before publishing:** pushing to `main` updates the live app for everyone within minutes.

## Layout

- **Repo root (`index.html`, `sw.js`, `manifest.*.webmanifest`, `icons/`, `screenshots/`, `vendor/`, `licenses/`, `.nojekyll`, `README.md`):** the published site. Build output only, never edited by hand.
- **`source/`:** everything the site is built from.
  - `src/` holds the code, concatenated in this order: `parser.js` (PDF text → sections), `agreement.js` (encrypted packs, wage scales, holidays), `analyze.js` (meaning, checks, projections, government parameters `PD.GOV`), `i18n.js` (all EN/FR text), `sample.js` (the fictional example payslip), `assistant-model.js` (generated question model), `assistant.js` (the assistant: features, model, rules, answers), `install.js` (device detection, install guide, service worker registration), `ui.js` (views and shell). Also `style.css`, `index.html` (shell with build markers), `sw.js` (template) and `README.md` (copied to the repo root).
  - `build.mjs` builds all targets into `source/dist/`.
  - `packs.enc.json` holds the encrypted agreement packs (ciphertext only, safe to commit).
  - `assets/` has the icons (`mark.svg` maskable, `any.svg` rounded) and the store screenshots.
  - `assistant/` trains the assistant's question model (Python, numpy and scipy): `gen_data.py` (training questions), `features.py`, `train.py`, and the hand-written test sets.
  - `tests/` and `tools/` are described below.
- **`source/private/` (gitignored, never committed):** the plaintext agreement pack, its key material, the pack generator and `forbidden.txt`. The owner keeps a copy outside GitHub.

## Build and publish

```
cd source
npm ci
node build.mjs                 # builds into source/dist/
PUBLISH=1 node build.mjs       # also copies dist/pages/ to the repo root (what GitHub Pages serves)
APP_URL=https://powerbeef.github.io/payslip-decoder/ node build.mjs   # adds the app link to the About section of the offline build
```

Two targets come from the same source. GitHub Pages is the product; there is no claude.ai version anymore (retired on 2026-11-13, don't bring it back):

- **`dist/pages/` (GitHub Pages, the main product):** loads pdf.js from `vendor/pdfjs-6.5.438/` on the same site, has a manifest and service worker, and shows the install guide.
- **`dist/payslip-decoder.html` (offline single file):** pdf.js is embedded as gzip+base64. Has print and CSV export. Mainly used by `tests/ui.mjs`, which runs from `file://`.

The build reuses `packs.enc.json` unless `source/private/pack-config.json` exists, in which case it re-encrypts from the plaintext and rewrites `packs.enc.json`. A clean clone builds byte-identical output to the live site.

## The encrypted agreement pack

- Agreement data is AES-256-GCM encrypted. This covers wage scales, job titles, premiums, holidays, vacation table, workplace-specific explanations and check wording.
- The key is derived with PBKDF2-SHA-256 (250,000 iterations) from `"<first word of employer name>|<city>"`, taken from the payslip header (`PD.agreementMaterial`).
- `PD.unlockFor(header)` runs before `PD.analyze()` for each opened payslip. If decryption succeeds, the pack becomes `A.agreement` and the agreement checks, insights and Guide sections appear. Otherwise the app stays generic.
- This hides the data from casual reading and search, not from someone who guesses the key: anyone who knows the employer and the city can open it (that is how coworkers' payslips open it), and a determined person with a list of employers and cities could find it. The contract itself is a public document. A wrong key can't decrypt anything (AES-GCM rejects it), so a payslip from another workplace never gets this agreement; if Workday ever prints the company or city differently, the pack simply stays closed and the app stays generic.
- **Workplace-specific wording lives in the pack too,** not only figures: the names of the workplace's systems, its own payslip labels, how its codes work. The pack's `glossary` rows are added to the Guide's glossary, and `text.codesIntro` replaces the generic introduction to the codes. Public text stays generic ("your employer's time clock").
- Agreement wording comes from `PD.agText(ag, lang, key, vars)`, and per-kind explanations from `ag.kinds`. Generic fallbacks live in `i18n.js`.
- **Changing agreement data:**
  1. Edit the plaintext in `source/private/`. `mk_pack_src.mjs` regenerates the pack JSON.
  2. Run `node build.mjs` and commit the new `packs.enc.json`.
  3. Never commit the plaintext.
- The example payslip uses a made-up employer, so it never unlocks a pack. It must not resemble a real workplace either: generic payroll labels, and no rate, premium or percentage from a real agreement or payslip (`tools/mk_sample.mjs` builds it; the leak check compares its rates with the pack's).

## The assistant (Questions tab)

- **What it is:** a tiny question model plus rules, all on the device. No language model, no network. The model only decides what kind of question it is (37 types: net, sick time left, a line's amount, a term, a holiday, compare...). Every number in an answer comes from the analysis (`A`), the agreement pack or `PD.KINDS`, never from the model.
- **Model:** fastText style. Words, word pairs and 3 to 5 letter chunks are hashed (FNV-1a) into 4,096 buckets; their 32-number embeddings are averaged and fed to one linear layer. Weights are 4-bit (two per byte, one scale per row): about 85 KB of weights, 114 KB as `assistant-model.js`. A question takes about 0.02 ms; the first one also decodes the weights.
- **Rules on top (`decide`):** greetings and thanks, T4 and RL-1 boxes, codes in brackets, holiday names, and a question type that needs a line or term when none is named falls back to the next best type. Below 35% confidence the assistant says it isn't sure and offers suggestions.
- **Language:** each answer is in the language of the question (`langOf`), whatever the app language.
- **Compare:** the open payslip against the one before it by date (or after, for the oldest), drivers ranked by their effect on net pay. With one payslip open it offers a button to open another; the question is answered as soon as the second payslip is read (`state.pendingAsk`).
- **Privacy:** questions and answers live in `state.chat` only, never in storage, and are cleared when leaving the example.
- **Retraining** after changing `gen_data.py`, `features.py` or the answer types:
  ```
  cd source && npm run train      # sweeps sizes, writes src/assistant-model.js and assistant/parity.json
  PAYSLIP=... PAYSLIP2=... node tests/assistant.mjs
  ```
  `normalize` and the hashing must stay identical in `features.py` and `assistant.js` (the parity check catches drift). `test_questions.tsv` and `test_final.tsv` shaped the training questions and pick the model size; `test_blind.tsv` was written after the last change to the training questions and is the honest score. If you change `gen_data.py` because of a blind miss, move those questions to `test_final.tsv` and write new blind ones.
- **Training questions are generic:** never put the employer, the agreement's figures or article numbers in `gen_data.py` or the test sets (they are public). Agreement answers come from the pack at run time.
- **Answers are lists or paragraphs:** `P()` adds a paragraph, `Li()` a bullet; `PD.Ask.text(out)` flattens an answer for tests.

## Each payslip is held to the rules of its own date

- **Government:** `PD.GOV` has 2023 to 2027, picked by the pay date's year (the year of the pay date decides, as for source deductions). A year missing from it skips the contribution and tax checks with a notice. A part of a year can be `null` (not published yet, or not estimated): only the checks that need it are skipped, and a notice names them (`partParams`). The federal estimate needs QPP, EI and QPIP (their credits); the taxable-wages explanation needs QPP (its deductible part).
- **Québec tax estimate:** Revenu Québec writes the tax as rate × income − K and publishes each K cut to the dollar (2026: 2 717, 8 151, 10 465). `rqTax` does the same; with the exact K the estimate was 1–2¢ below Workday on both real payslips, and now matches to the cent.
- **Mid-year changes:** `fed` or `qc` can be a list of editions, each with the first pay date it applies to (`edition()`). Federal 2025: lowest rate 15% for pays before July 1, 14% after. Québec 2023 also changed mid-year and is not estimated (`qc: null`).
- **53 pays in a year:** weekly pay dates fall 53 times in some years (27 for biweekly). The QPP exemption and annualized income then divide by 53. `PD.payDatesInYear` counts the pay dates; the checks try the usual count and the year's count and say which one fits. Workday used 53 in 2025 (federal tax matched to the cent).
- **Agreement:** each line's rate is compared with the wage scale in effect on that line's own dates (`PD.scaleFor`; either end of the line's period counts, for a raise in the middle of a week). A period older than every scale in the pack gets a notice instead of a wrong-rate warning, and a line for an earlier period that matches no scale (back pay) is a note, not a warning.
- **Sick time:** the agreement's reference period isn't the calendar year, so the time-off panel trusts Workday's balance for the current period rather than year-to-date sick hours.
- **Shown to the worker:** the checks view always says which date's rules were used; the checks card says it for a payslip from an earlier year.
- **Wording for an earlier year:** "this year" in the text means the payslip's year, so `makeL(lang, ag, year)` rewrites it ("Where it went in 2025", "en 2025"; "cette année-là" stays). Pass the payslip's year wherever text about a payslip is made. Balances (time-off card, assistant) say "as of your payslip of …" once the payslip is more than 14 days old. The assistant's wage-scale answer gives today's scale and adds the payslip's when they differ; a comparison across years names both years.
- **Lines that aren't pay:** an unpaid absence (`unpaid`) shows hours at $0 on purpose and is not recalculated.
- **Checks that must not be fooled:** EI may differ from rate × gross by a few cents only when the year-to-date total is right (Workday rounds on the year); the year-to-date check adds up each section's lines, not just the totals; once QPP, EI or QPIP reaches its yearly maximum, the federal estimate uses the maximum for the credit (CRA rule), so late-year payslips of high earners don't show a false gap.
- `tests/rules.mjs` checks every year's maximums against its own rates and ceilings, the calendar and the 2025 editions, Easter and the holiday weekend rule, that real payslips pass with their own date's rules, and that a figure changed on purpose on a real payslip (EI, QPP, QPIP, a year-to-date line, net pay, hours × rate) is caught by its own check.

## Testing

Keep test payslips outside the repo and point to them with environment variables.

```
cd source
node tests/analyze.mjs /path/payslip.pdf            # every check, line by line (unlock time too)
PAYSLIPS="a.pdf b.pdf" node tests/rules.mjs        # date-aware rules: each year's figures are consistent, 53-pay years, mid-year editions, Easter and the weekend rule, real payslips of any year pass, planted errors are caught
PAYSLIP=... PAYSLIP2=... node tests/assistant.mjs [--show]   # assistant: JS matches Python, accuracy on the test sets, suggested questions, answers carry the payslip's numbers
python3 tools/mkvariant.py in.pdf out.pdf "12.34=>13.34"   # edited copy (e.g. a wrong QPP amount) to test warnings
PAYSLIP=... NOT_PAYSLIP=... VARIANTS=/dir node tests/ui.mjs   # 56 checks on the offline build: share sheet (QR reads as the address, copy, Escape), assistant (typed question, suggestions, links, clear, compare, open-then-compare), time-off panel, welcome screen, wrong-file popup (X, Escape, outside tap, with payslips open), PDF help sheet (switch, Escape, swipe), #demo, tabs, jump bars, back button, menu, privacy blur, language, glossary, errors, multi-payslip, check order, original PDF, CSV, print
(cd dist/pages && python3 -m http.server 8765) &
BASE=http://localhost:8765/ PAYSLIP=... node tests/pages.mjs       # Chrome installability (must be zero errors), offline reload, install guide on 8 emulated devices
BASE=http://localhost:8765/ node tests/pages-standalone.mjs        # launched from home screen; Android one-tap install
BASE=http://localhost:8765/ PAYSLIP=... node tests/privacy.mjs     # opens a real payslip, uses every view and the assistant: no request leaves the site, nothing is sent, nothing from the payslip or the unlocked agreement is stored or cached, no security-policy violation
BASE=http://localhost:8765/ node tests/fullscreen.mjs              # full screen: iOS 26.1 layout below the status bar, 5 iPhone sizes with their safe areas (FR, EN), iOS 26 top-edge rule, welcome fits, only the content scrolls; Safari tab, Instagram viewer, Android, iPad, desktop app window
node tests/shot.mjs $PWD/dist/payslip-decoder.html out.png 390 844 fr dark pay 1   # screenshot any view, size, language, theme (WAIT=3000 to let the welcome motion finish; DEMO=1 opens the example; ASK='question||question' asks the assistant)
```

`tests/*` use `/usr/bin/google-chrome` unless `CHROME` is set; add `PROXY=$HTTPS_PROXY` to test the live site. Check layouts at 360, 390, 412, 820 and 1280 px wide, in light and dark, EN and FR. The scripts report horizontal overflow. After changing the example (`tools/mk_sample.mjs`), regenerate the store screenshots with `tools/mkshots.mjs`.

## Things learned the hard way

- **pdf.js:** pinned to 6.5.438, legacy build for older phones. It runs on the main thread via `window.pdfjsWorker = await import(worker)` ("fake worker"), which works from `file://`, blob URLs and the site's own vendor folder alike. Pass `isEvalSupported: false`.
- **Parser:** groups text items by y (tolerance 1.6), finds sections by their "Description" header, maps numbers to columns by right edge (x1) clusters, and treats a repeated Hours/Amount header further right as the year-to-date column. Employers rename sections, so roles are inferred from columns and content, never from titles.
- **iPad Safari reports a Mac user agent:** detect it as Macintosh plus `maxTouchPoints > 1`.
- **User agents hide versions:** Safari on iOS 26 freezes the iOS version in its user agent, so don't show one. Chrome on Android reports "Android 10; K", so the real model and version come from `navigator.userAgentData.getHighEntropyValues`. Samsung models look like `SM-S921W`.
- **Safari layouts:** on iOS 26, Share sits behind ••• in the compact layout, and "Open as Web App" is on by default. Messenger, Instagram and other in-app browsers can't install; the guide tells people to reopen the page in Safari or Chrome.
- **Home-screen apps on iOS** have storage separate from Safari.
- **Headless Chrome limits:** it can't emulate `display-mode: standalone`, so tests fake `navigator.standalone`. Puppeteer reloads the page when `isMobile` changes, which resets state mid-test.
- **Security policy (CSP):** the published page declares `default-src 'none'` with only its own site allowed (`CSP` in `build.mjs`): scripts, styles, fonts and images from itself, data and blob URLs for images and fonts, `connect-src 'self'`. The browser then blocks any request to another site (fetch, beacon, image, script), so a payslip can't leave the device even through a bug. Anything new from another site will be blocked by design. `tests/privacy.mjs` fails on any violation. Inline scripts are still allowed (`'unsafe-inline'`): the app is one page with its code inline.
- **Service worker:** it is network-first for the page (4 s timeout, then cache) and cache-first for everything else. Its cache name comes from a content hash, so every build updates installed copies on their next online launch.
- **Full screen (iOS especially):** two layouts, picked by a script at the top of `src/index.html`. `mode-doc` (Safari tabs, desktop browsers): the page scrolls under a sticky header. `mode-shell` (installed app, iOS and Android in-app viewers): the page is exactly `--app-h` tall (measured from `window.innerHeight`, re-measured on resize, rotation, `pageshow`, return to the app and safe-area changes), the header is fixed and only `#main` scrolls; a touch guard keeps the page itself from moving. Use `toTop()` and `scroller()` in `ui.js`, never `window.scrollTo` alone. Safe areas go through `--sa-top` and `--sa-bottom`, which drop to 0 when an in-app viewer already insets the page (`host-top`, `host-bottom`). Approach taken from the owner's discpress project.
- **Since iOS 26.1 an installed app starts below the status bar** (WebKit bug 301994): no top inset, the page is about 62 pt shorter than the screen, but it still reaches under the home bar and reports a 34 pt bottom inset. The in-app-viewer guess (page shorter than the screen, so the host already insets it) must never run in an installed app (`is-standalone`), or the home bar lands on the tab labels. `tests/fullscreen.mjs` replays this layout.
- **iOS 26 blurs the top of a Home Screen web app** (status bar and about 40 pt below, which covers the header) unless a fixed or sticky box with a plain `background-color` and no `backdrop-filter` spans the top edge (WebKit's `LocalFrameView::fixedContainerEdges`). The header always has the page colour as its background; in the app layout it never gets the frosted look. `tests/fullscreen.mjs` replays the rule.
- **No `apple-mobile-web-app-status-bar-style` tag:** `black-translucent` always draws white status-bar text (invisible on the light theme) and a WebKit engineer called it deprecated (WebKit bug 210597). Without the tag, iOS 26 colours the status bar from the header and picks the text colour. An app already on a Home Screen keeps the status-bar style it was added with (WebKit bug 260508); removing and re-adding the icon applies the new one. WebKit only swaps the blur for the header colour when iOS reserves the status-bar area as an obscured inset (`WKWebView _updateFixedColorExtensionViews`: no colour extension when the top inset is 0), which an icon added with `black-translucent` doesn't get.
- **The welcome screen never scrolls when it can fit:** it fills the space between header and footer, and `fitWelcome()` drops sample lines (down to 2), then the picture, until it fits. Headless Chrome emulates iPhone safe areas with `Emulation.setSafeAreaInsetsOverride`.
- **Share the app:** a link under the welcome buttons and an item in the ••• menu open a sheet with a QR code of the published address, the address written out, Send (the phone's share sheet, when `navigator.share` exists) and Copy. The QR is drawn at build time (`qrcode-generator` in `build.mjs`, `BUILD.share`), so it works offline and adds no code to the page. Only the address is shared. If the address changes, change `SITE_URL` in `build.mjs`. `tests/ui.mjs` reads the QR back with jsQR.
- **File problems are a popup** (`showAlert`, `#alert`): a PDF that isn't a Workday payslip, a non-PDF file or a reader that won't load opens a centred card with only an X (Escape and a tap outside also close it). No action buttons: the welcome buttons are right behind it. Nothing is added inline, so the screen underneath never moves.
- **Hash routing:** four tabs, `#pay`, `#year`, `#ask`, `#guide` (`TABS`), so the phone tab bar has room for bigger icons. Overview and Pay used to be two tabs showing the same money twice; they are one view now, and an old `#overview` link opens Pay (`ALIAS`). `#checks` is a view without a tab: it is reached from the end of Pay, the warning card at the top of Pay and the assistant, and keeps the Pay tab selected (`tabOf`).
- **Start screen:** with no payslip open, the app shows the welcome screen (Open your payslip, How to get the PDF, Share the app) and hides the tabs; the view hash is ignored. The made-up example lives at `#demo` (tests and `tools/mkshots.mjs` use it). Opening a file from the example returns to the welcome screen, which shows progress and errors.
- **Language:** French is the default (the workplace is in Québec). English only when the person picks it (`pd-lang` in localStorage). The Pages head script swaps the manifest and home-screen title to English in that case.
- **Information order:** each view leads with what a worker needs most. Pay, top (the `.ov` grid): net pay, a checks card only when something fails, time off left (`A.timeOff`: sick time = the agreement's yearly allowance plus Workday's balance, never below 0, since Workday counts hours used without loading the allowance; banked hours; vacation balance, probably dollars, with an hours estimate), where the money went, then points to note. Then a jump bar and each line in payslip order (earned, with hours and pay per hour; taxes; deductions; employer; taxable income), ending with the checks summary. Don't bring back a separate hours card or a gross-to-net list: they repeated these. Questions: the box first (the iPhone keyboard never covers it), suggestions, then answers, newest on top. Checks: groups with a problem first, then agreement, government, arithmetic; inside a group, problems, then notes, then passes. Year: time off and banks first. Guide: agreement, glossary, reading the payslip, then help with the app. Long views have a jump bar.
- **Motion:** only `transform` and `opacity` animate (`--ease-ios`, `--ease-out`, `--spring` tokens). Views get `.anim` (payslip opened) or `.anim-soft` (tab change) for 1.5 s. The welcome intro waits (`.hold`) until start-up work is done, at most 900 ms. `html.lite` (2 GB of memory or less, data saver, reduced transparency) drops blur and staggering; `prefers-reduced-motion` turns motion off. The PDF reader loads when someone reaches for a file, never during start-up. Benchmark at 6x CPU throttling (`Emulation.setCPUThrottlingRate`) after changing motion.
- **Dark mode:** colours are defined twice, once for `:root[data-theme="dark"]` and once for `prefers-color-scheme`, both inside `@media screen` so printing stays light. Keep the two blocks identical.
- **Phone tab bar:** a panel docked to the bottom edge, full width, with a hairline on top; its bottom padding is `--sa-bottom`, so the buttons sit above the home bar. Not a floating pill: rounded screen corners clip a docked panel the way they clip a system tab bar, but look odd next to a floating one. `tests/fullscreen.mjs` checks the edges and the labels.
- **Header cells:** cells with `.num` don't wrap, so header cells need `.hd .num { white-space: normal }` or narrow tables overflow on phones.
- **French formatting:** dates need "1er" (handled in `makeL`), and numbers in check text must go through `L.num`, never be printed raw.
- **Holiday clashes:** when the weekend rule moves a holiday onto another holiday, the Guide and the assistant show "date to confirm" rather than guessing. The assistant matches holiday names most specific first (`HOLIDAY_NAMES`: "lendemain de Noël" before "Noël") and uses the local date, never UTC (after 8 p.m. in Québec, UTC is already tomorrow).
- **Easter:** `PD.holidayDates` uses the standard Gregorian computus; `tests/rules.mjs` checks it against published dates (an earlier formula put Easter 2027 a week late).
- **Design:** don't use middle-dot separators, ALL-CAPS labels or arrow characters in text. Use the `I.*` SVG icons.

## Yearly upkeep

- **From late November to January,** complete the new year in `PD.GOV` in `analyze.js` as the figures come out: QPP/QPP2 rates and ceilings, EI and QPIP rates and maximums, federal and Québec brackets, basic amounts, the Québec worker deduction maximum. Keep the older years: payslips are checked against their own year. If a rate changes mid-year, add an edition with its start date. Run `tests/rules.mjs`. Until a part is filled in, its checks are skipped with a notice.
- **2027, as of November 13, 2026:** only EI is in (Québec rate 1.29%, maximum insurable earnings $70,800, from the Canada Employment Insurance Commission). Still to add: QPP (the CRA confirmed the 2027 ceilings on 2026-10-28: $76,700 and $87,400; Retraite Québec hadn't published the 2027 rate yet), QPIP, and the federal and Québec tax tables (CRA and Revenu Québec publish them in late November and December).
- **When a new collective agreement is signed,** update the private pack: new scales and the expiry wording.

## Working with the owner

- Explain results in plain language.
- Show evidence for every change: test output, screenshots, numbers. The owner judges changes by tests in real conditions, not by code review, so run the relevant suites and look at the screenshots before calling something done.
- Things only real devices can confirm (installing on iPhone or Android, the exact wording of system menus) should be called out as untested until the owner tries them.
