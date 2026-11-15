// Draws a payslip (in the parser's own form, e.g. from fake_payslip.mjs) as a PDF in Workday's layout:
// same page size, font size, column edges and section order as a real Workday payslip, so the app's parser
// reads it the way it reads the real thing. Used only by the tests; the PDFs it makes are never committed.
import zlib from 'zlib';
import { PDFDocument, StandardFonts, PDFName, PDFHexString } from 'pdf-lib';

const W = 612,
  H = 792,
  FS = 6.8,
  ROW = 8.5;
const LBL = {
  fr: {
    name: 'Nom',
    company: 'Société',
    id: ['Numéro', "d'employé"],
    start: ['Début de la période', 'de paie'],
    end: ['Fin de la période de', 'paie'],
    date: 'Date du chèque',
    check: ['Numéro de', 'chèque'],
    position: 'Position',
    current: 'Actuel',
    ytd: 'Cumul annuel',
    desc: 'Description',
    dates: 'Dates',
    hours: 'Heures',
    rate: 'Taux',
    amount: 'Montant',
    ytdHours: ['Heures', 'annuelles', 'cumulées'],
    ytdAmount: ['Montant', 'annuel cumulé'],
    amountYtd: 'Montant Cumul annuel',
    accrued: 'Cumulé',
    reduced: 'Réduit',
    available: 'Disponible',
    fed: 'Fédéral',
    prov: 'Province',
    pay: 'Information sur le paiement',
    bank: 'Banque',
    acctName: 'Nom du compte',
    acctNo: 'Nº de compte',
    curAmount: 'CAD Montant',
  },
  en: {
    name: 'Name',
    company: 'Company',
    id: ['Employee', 'ID'],
    start: ['Pay Period', 'Begin'],
    end: ['Pay Period', 'End'],
    date: 'Check Date',
    check: ['Check', 'Number'],
    position: 'Position',
    current: 'Current',
    ytd: 'YTD',
    desc: 'Description',
    dates: 'Dates',
    hours: 'Hours',
    rate: 'Rate',
    amount: 'Amount',
    ytdHours: ['YTD Hours'],
    ytdAmount: ['YTD Amount'],
    amountYtd: 'Amount YTD',
    accrued: 'Accrued',
    reduced: 'Reduced',
    available: 'Available',
    fed: 'Federal',
    prov: 'Provincial',
    pay: 'Payment Information',
    bank: 'Bank',
    acctName: 'Account Name',
    acctNo: 'Account Number',
    curAmount: 'CAD Amount',
  },
};

const money = (v) =>
  v == null
    ? ''
    : (v < 0 ? '-' : '') +
      Math.abs(v)
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plain = (v) => (v == null ? '' : String(Math.round(v * 100) / 100)); // hours, rates: 8, 651.7, 1.25
const fixed = (v) => (v == null ? '' : v.toFixed(2)); // balances and claim amounts: 16452.00
const mdy = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;

/* parsed: one payslip or a list (several payslips in one file); opts: { lang } */
export async function payslipPdf(parsed, opts = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle('Payslip');
  doc.setProducer('payslip-decoder tests');
  doc.setCreator('payslip-decoder tests');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of [].concat(parsed)) drawPayslip(doc, font, p, LBL[opts.lang || p.lang || 'fr']);
  return doc.save({ useObjectStreams: false });
}

function drawPayslip(doc, font, p, L) {
  let page = doc.addPage([W, H]);
  const width = (s) => font.widthOfTextAtSize(s, FS);
  const text = (s, x, y) => {
    s = String(s);
    if (s) page.drawText(s, { x, y: H - y, size: FS, font });
  };
  const right = (s, x1, y) => {
    s = String(s);
    if (s) text(s, x1 - width(s), y);
  };
  const centre = (s, x0, x1, y) => text(s, (x0 + x1) / 2 - width(s) / 2, y);
  // Workday wraps a long description inside its column; the parser joins the pieces back
  const wrap = (s, max) => {
    const out = [];
    let cur = '';
    for (const w of String(s).split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (cur && width(t) > max) {
        out.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  };
  const h = p.header;

  /* header: employer and employee lines, then the label row and the values row */
  text(h.company, 202.6, 122);
  text(h.companyAddress, 202.6 + width(h.company) + 8, 122);
  text(h.name, 180.3, 131);
  const ea = 180.3 + width(h.name) + 8;
  text(h.employeeAddress, ea, 131);
  text(`${L.position} ${h.position}`, Math.max(373.1, ea + width(h.employeeAddress) + 8), 131);
  text(L.name, 37, 140);
  text(L.company, 144.7, 140);
  right(L.id[0], 325.8, 140);
  right(L.id[1], 325.8, 148);
  right(L.start[0], 391.0, 140);
  right(L.start[1], 391.0, 148);
  right(L.end[0], 456.1, 140);
  right(L.end[1], 456.1, 148);
  right(L.date, 521.3, 140);
  right(L.check[0], 574.5, 140);
  right(L.check[1], 574.5, 148);
  text(h.name, 37, 157.5);
  text(h.company, 144.7, 157.5);
  right(h.employeeId, 325.8, 157.5);
  right(mdy(h.periodStart), 391.0, 157.5);
  right(mdy(h.periodEnd), 456.1, 157.5);
  right(mdy(h.payDate), 521.3, 157.5);

  /* summary */
  const SX = [246.4, 328.6, 410.8, 493.0, 574.5];
  p.summary.columns.forEach((c, i) => {
    right(c.label, SX[i], 172.5);
    right(money(c.current), SX[i], 182);
    right(money(c.ytd), SX[i], 192);
  });
  text(L.current, 37, 182);
  text(L.ytd, 37, 192);

  const S = p.sections;
  const byRole = (has) => S.find((s) => s.columns.some((c) => has.includes(c.role)));
  const earn = byRole(['hours']),
    abs = byRole(['accrued', 'available']);
  const rest = S.filter((s) => s !== earn && s !== abs);

  /* a two-column-wide section of the earnings kind (left) and a narrow one (right), side by side */
  let y = 206.5;
  const narrow = (s, x0, x1, top, amountX1, ytdX1) => {
    if (!s) return top;
    centre(s.title, x0, x1, top);
    text(L.desc, x0, top + 10);
    right(L.amountYtd, ytdX1, top + 10);
    let yy = top + 19.5;
    for (const r of s.rows) {
      const lines = wrap(r.desc, amountX1 - x0 - 45);
      lines.forEach((ln, i) => text(ln, x0, yy + i * ROW));
      right(money(r.values.amount), amountX1, yy);
      right(money(r.values.ytd), ytdX1, yy);
      yy += lines.length * ROW;
    }
    if (s.total) {
      text(s.total.desc, x0 + 1.5, yy + 2.5);
      right(money(s.total.values.amount), amountX1 - 1.5, yy + 2.5);
      right(money(s.total.values.ytd), ytdX1 - 0.5, yy + 2.5);
      yy += ROW + 2.5;
    }
    return yy;
  };

  // earnings (left, wide) beside the first narrow section (right)
  let left = y;
  if (earn) {
    centre(earn.title, 37, 366.9, y);
    const hy = y + 10;
    text(L.desc, 37, hy);
    text(L.dates, 96.4, hy);
    right(L.hours, 206.6, hy);
    right(L.rate, 235.4, hy);
    right(L.amount, 282.2, hy);
    L.ytdHours.forEach((t, i) => right(t, 321.1, hy + i * 7.75));
    L.ytdAmount.forEach((t, i) => right(t, 366.9, hy + i * 7.5));
    let yy = hy + 25;
    for (const r of earn.rows) {
      const v = r.values;
      const lines = wrap(r.desc, r.dates ? 57 : 140);
      lines.forEach((ln, i) => text(ln, 37, yy + i * ROW));
      if (r.dates) text(`${mdy(r.dates.from)} - ${mdy(r.dates.to)}`, 96.4, yy);
      right(plain(v.hours), 206.6, yy);
      right(plain(v.rate), 235.4, yy);
      right(money(v.amount), 282.2, yy);
      right(plain(v.ytdHours), 321.1, yy);
      right(money(v.ytd), 366.9, yy);
      yy += lines.length * ROW;
    }
    if (earn.total) {
      yy += 2.5;
      text(earn.total.desc, 38.5, yy);
      right(money(earn.total.values.amount), 280.7, yy);
      right(money(earn.total.values.ytd), 366.4, yy);
      yy += ROW;
    }
    left = yy;
  }
  const right1 = narrow(rest[0], 372.9, 574.5, y, 528.7, 574.5);
  y = Math.max(left, right1) + 4;

  /* vacation balances */
  if (p.vacation.length) {
    p.vacation.forEach((v, i) => {
      const x = i ? 306.2 : 37;
      text(v.label, x, y + 9);
      text(fixed(v.value), x + 1.5, y + 20.5);
    });
    y += 33;
  }

  /* the other sections, two by two */
  for (let i = 1; i < rest.length; i += 2) {
    const a = narrow(rest[i], 37, 307.3, y, 261.5, 307.3);
    const b = narrow(rest[i + 1], 313.3, 574.5, y, 528.7, 574.5);
    y = Math.max(a, b) + 7;
    if (y > 640) {
      page = doc.addPage([W, H]);
      y = 110;
    }
  }

  /* tax claim amounts (left) beside the absence plans (right) */
  if (y > 700) {
    page = doc.addPage([W, H]);
    y = 110;
  }
  right(L.fed, 216.6, y);
  right(L.prov, 307.3, y);
  if (abs) centre(abs.title, 313.3, 574.5, y);
  let wy = y + 9.5;
  for (const w of p.withholding) {
    const lines = wrap(w.label, 105);
    lines.forEach((ln, i) => text(ln, 37, wy + i * ROW));
    right(fixed(w.federal), 216.6, wy);
    right(fixed(w.provincial), 307.3, wy);
    wy += lines.length * ROW;
  }
  if (abs) {
    const ay = y + 9.5;
    text(L.desc, 313.3, ay);
    right(L.accrued, 481.9, ay);
    right(L.reduced, 528.7, ay);
    right(L.available, 574.5, ay);
    abs.rows.forEach((r, i) => {
      const yy = ay + 9.5 + i * ROW;
      text(r.desc, 313.3, yy);
      right(plain(r.values.accrued), 481.9, yy);
      right(plain(r.values.reduced), 528.7, yy);
      right(plain(r.values.available), 574.5, yy);
    });
  }

  /* payment information, on a page of its own as Workday does */
  if (p.payments && p.payments.length) {
    page = doc.addPage([W, H]);
    centre(L.pay, 265, 347.4, 125);
    text(L.bank, 37, 134.5);
    text(L.acctName, 172.3, 134.5);
    text(L.acctNo, 319.7, 134.5);
    text(L.curAmount, 444.4, 134.5);
    text(L.amount, 530.1, 134.5);
    p.payments.forEach((x, i) => {
      const yy = 144.5 + i * 10;
      text(x.bank, 37, yy);
      text(x.accountName, 172.3, yy);
      text(x.accountNumber, 319.7, yy);
      right(money(x.amount), 550.6, yy);
      text(x.currency, 560.1, yy);
    });
  }
}

/* A PDF that isn't a payslip (an invoice), for the wrong-file tests */
export async function otherPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([W, H]);
  ['Facture 2026-114', 'Quincaillerie Fictive', 'Vis à bois, boîte de 100        12,49 $', 'Total        14,36 $'].forEach((t, i) =>
    page.drawText(t, { x: 60, y: H - 100 - i * 18, size: 11, font }),
  );
  return doc.save({ useObjectStreams: false });
}

/* A PDF that asks for a password before it opens. The content isn't really encrypted: the reader stops at the
   password prompt, which is all the test needs. */
export async function lockedPdf(bytes) {
  const doc = await PDFDocument.load(bytes);
  const ctx = doc.context;
  const rnd = (n) => PDFHexString.of(Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255)).toString('hex'));
  const enc = ctx.obj({ Filter: PDFName.of('Standard'), V: 1, R: 2, Length: 40, P: -44, O: rnd(32), U: rnd(32) });
  ctx.trailerInfo.Encrypt = ctx.register(enc);
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of('00112233445566778899aabbccddeeff'), PDFHexString.of('00112233445566778899aabbccddeeff')]);
  return doc.save({ useObjectStreams: false });
}

/* A scan: one page holding only a picture, no text */
export async function scanPdf(png) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([W, H]);
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: 40, y: 80, width: W - 80, height: H - 160 });
  return doc.save({ useObjectStreams: false });
}

/* A small grey PNG with a few dark bars, like a photo of a printed payslip */
export function png(w = 120, h = 160) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const bar = y % 12 < 3 && x > 10 && x < w - 10 - ((y * 7) % 40);
      const v = bar ? 60 : 225;
      row[1 + x * 3] = v;
      row[2 + x * 3] = v;
      row[3 + x * 3] = v - 5;
    }
    rows.push(row);
  }
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
