// Proposal (Commercial Quotation) and Handover (Sales → Project Handover Form) PDFs —
// built to match the Tesco Structures sample sheets: centered green-ruled title, bordered
// label/value detail tables with a tinted label column, green-header item tables with
// Total / GST / Grand Total rows, amount-in-words, bulleted terms, signature strips and a
// three-line green footer on every page. jsPDF only, imported dynamically; all drawing
// lives in render* functions so they can be unit-tested without saving a file.

const GREEN   = [74, 125, 47];    // brand green
const GREENBAR= [120, 170, 70];   // lighter green used in sample table headers
const GREENL  = [233, 242, 221];  // tinted label cell
const INK     = [33, 37, 41];
const MUTE    = [110, 116, 124];
const BORDER  = [170, 178, 170];
const WHITE   = [255, 255, 255];

const COMPANY = {
  name: 'TESCO STRUCTURES LLP',
  gstin: '33AAXFT8541N1Z8',
  web: 'www.tescostructures.com',
  email: 'tescostructures@gmail.com',
  phones: '+91 77088 33911  /  +91 90033 28229',
  footAddr: 'Old No. 88, No 18, New, 1, Aryagowda Rd, West Mambalam, Chennai, Tamil Nadu 600033',
  bank: { name: 'Kotak Mahindra Bank', holder: 'Tesco Structures LLP', account: '7750837566', ifsc: 'KKBK0008485', branch: 'Mount Road, Chennai' },
};

const nz = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qn = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Indian rupee amount in words, e.g. 313242.80 -> "Rupees Three Lakh Thirteen Thousand ... and Eighty Paise Only".
export function amountInWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  const three = (n) => (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n));
  const words = (n) => {
    if (n === 0) return 'Zero';
    let out = '';
    const cr = Math.floor(n / 10000000); n %= 10000000;
    const lk = Math.floor(n / 100000); n %= 100000;
    const th = Math.floor(n / 1000); n %= 1000;
    const hu = n;
    if (cr) out += three(cr) + ' Crore ';
    if (lk) out += three(lk) + ' Lakh ';
    if (th) out += three(th) + ' Thousand ';
    if (hu) out += three(hu);
    return out.trim();
  };
  const a = Math.max(0, Number(amount) || 0);
  const rupees = Math.floor(a);
  const paise = Math.round((a - rupees) * 100);
  let s = 'Rupees ' + words(rupees);
  if (paise) s += ' and ' + words(paise) + ' Paise';
  return s + ' Only';
}

async function loadLogo() {
  try {
    const res = await fetch('/images/tescologo2.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

// Shared drawing context + primitives.
function makeCtx(doc) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 42;
  const FOOT = 50;
  return { doc, W, H, M, FOOT, CW: W - 2 * M, R: W - M, y: M };
}

const setFill = (doc, c) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc, c) => doc.setDrawColor(c[0], c[1], c[2]);
const setText = (doc, c) => doc.setTextColor(c[0], c[1], c[2]);

function ensureSpace(ctx, h) {
  if (ctx.y + h > ctx.H - ctx.FOOT) { ctx.doc.addPage(); ctx.y = ctx.M; }
}

function header(ctx, logo, ld, { centered }) {
  const { doc, W, M } = ctx;
  let y = 34;
  if (logo && ld) {
    const sc = Math.min(160 / ld.w, 56 / ld.h); const lw = ld.w * sc, lh = ld.h * sc;
    const x = centered ? (W - lw) / 2 : M;
    try { doc.addImage(logo, 'PNG', x, y, lw, lh); } catch { /* ignore */ }
    y += lh + 6;
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(17); setText(doc, INK);
    doc.text('TESCO', centered ? W / 2 : M, y + 16, centered ? { align: 'center' } : undefined);
    doc.setFont('helvetica', 'normal').setFontSize(8.5); setText(doc, MUTE);
    doc.text('S T R U C T U R E S', centered ? W / 2 : M, y + 29, centered ? { align: 'center' } : undefined);
    y += 40;
  }
  ctx.y = y + 6;
}

function titleBlock(ctx, title, sub, ref) {
  const { doc, W, M, R } = ctx;
  setDraw(doc, GREEN); doc.setLineWidth(1.3);
  doc.line(M, ctx.y, R, ctx.y);
  ctx.y += 22;
  doc.setFont('helvetica', 'bold').setFontSize(16); setText(doc, INK);
  doc.text(title, W / 2, ctx.y, { align: 'center' });
  ctx.y += 4;
  if (sub) { ctx.y += 12; doc.setFont('helvetica', 'italic').setFontSize(9.5); setText(doc, MUTE); doc.text(sub, W / 2, ctx.y, { align: 'center' }); }
  if (ref) { ctx.y += 13; doc.setFont('helvetica', 'bold').setFontSize(9.5); setText(doc, GREEN); doc.text(ref, W / 2, ctx.y, { align: 'center' }); }
  ctx.y += 10;
  setDraw(doc, GREEN); doc.setLineWidth(1.3);
  doc.line(M, ctx.y, R, ctx.y);
  ctx.y += 16;
}

function sectionTitle(ctx, text) {
  const { doc, M, R } = ctx;
  ensureSpace(ctx, 42);
  ctx.y += 16;
  doc.setFont('helvetica', 'bold').setFontSize(12); setText(doc, GREEN);
  doc.text(text, M, ctx.y + 2);
  ctx.y += 7;
  setDraw(doc, GREEN); doc.setLineWidth(1);
  doc.line(M, ctx.y, R, ctx.y);
  ctx.y += 12;
}

// Full-width tinted bar with centered bold label (sample "CLIENT DETAILS" header).
function greenBar(ctx, text) {
  const { doc, M, CW } = ctx;
  const h = 22;
  ensureSpace(ctx, h);
  setFill(doc, GREENBAR); setDraw(doc, BORDER); doc.setLineWidth(0.7);
  doc.rect(M, ctx.y, CW, h, 'FD');
  doc.setFont('helvetica', 'bold').setFontSize(10.5); setText(doc, WHITE);
  doc.text(text, M + CW / 2, ctx.y + 15, { align: 'center' });
  ctx.y += h;
}

// Bordered label/value table. rows = [[label, value], ...]. Long values wrap.
function kvTable(ctx, rows, { labelW = 150 } = {}) {
  const { doc, M, CW } = ctx;
  const valX = M + labelW;
  const valW = CW - labelW;
  doc.setLineWidth(0.7);
  for (const [label, value] of rows) {
    const text = (value === null || value === undefined || value === '') ? '—' : String(value);
    doc.setFont('helvetica', 'normal').setFontSize(9);
    const lines = doc.splitTextToSize(text, valW - 10);
    const rowH = Math.max(20, 8 + lines.length * 11);
    ensureSpace(ctx, rowH);
    const y = ctx.y;
    // label cell (tinted)
    setFill(doc, GREENL); setDraw(doc, BORDER);
    doc.rect(M, y, labelW, rowH, 'FD');
    doc.rect(valX, y, valW, rowH, 'S');
    doc.setFont('helvetica', 'bold').setFontSize(9); setText(doc, INK);
    doc.text(doc.splitTextToSize(String(label), labelW - 10), M + 5, y + 13);
    doc.setFont('helvetica', 'normal').setFontSize(9); setText(doc, INK);
    doc.text(lines, valX + 5, y + 13);
    ctx.y += rowH;
  }
}

// Item table with a green header. cols = [{key,title,w,align,bold}]. Returns nothing (advances y).
function itemTable(ctx, cols, items, totals) {
  const { doc, M, CW } = ctx;
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const scale = CW / totalW;
  cols = cols.map((c) => ({ ...c, w: c.w * scale }));
  const xOf = (i) => M + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const cell = (i, s, ty, opt = {}) => {
    const c = cols[i]; const a = opt.align || c.align || 'left'; const x0 = xOf(i);
    const tx = a === 'right' ? x0 + c.w - 5 : a === 'center' ? x0 + c.w / 2 : x0 + 5;
    doc.setFont('helvetica', opt.bold ? 'bold' : 'normal').setFontSize(opt.size || 8.5);
    setText(doc, opt.color || INK);
    doc.text(doc.splitTextToSize(String(s), c.w - 8), tx, ty, { align: a });
  };
  doc.setLineWidth(0.7);
  // header (wrap each title + vertically centre within the row)
  doc.setFont('helvetica', 'bold').setFontSize(8.5);
  const hLines = cols.map((c) => doc.splitTextToSize(String(c.title), c.w - 6));
  const hH = Math.max(20, 6 + Math.max(...hLines.map((l) => l.length)) * 10);
  ensureSpace(ctx, hH + 24);
  setFill(doc, GREENBAR); setDraw(doc, BORDER);
  doc.rect(M, ctx.y, CW, hH, 'FD');
  setText(doc, WHITE);
  cols.forEach((c, i) => {
    if (i) { setDraw(doc, BORDER); doc.line(xOf(i), ctx.y, xOf(i), ctx.y + hH); }
    const lines = hLines[i];
    const startY = ctx.y + (hH - lines.length * 10) / 2 + 8;
    lines.forEach((ln, k) => doc.text(ln, xOf(i) + c.w / 2, startY + k * 10, { align: 'center' }));
  });
  ctx.y += hH;
  // body
  for (const it of items) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    const descIdx = cols.findIndex((c) => c.key === 'description');
    const descLines = descIdx >= 0 ? doc.splitTextToSize(String(it.description || ''), cols[descIdx].w - 8) : [''];
    const specIdx = cols.findIndex((c) => c.key === 'specification');
    const specLines = specIdx >= 0 ? doc.splitTextToSize(String(it.specification || ''), cols[specIdx].w - 8) : [''];
    const rowH = Math.max(22, 8 + Math.max(descLines.length, specLines.length) * 10);
    ensureSpace(ctx, rowH);
    const y = ctx.y;
    setDraw(doc, BORDER); doc.rect(M, y, CW, rowH, 'S');
    cols.forEach((c, i) => { if (i) doc.line(xOf(i), y, xOf(i), y + rowH); });
    cols.forEach((c, i) => {
      if (c.key === 'description' || c.key === 'specification') {
        const lines = c.key === 'description' ? descLines : specLines;
        doc.setFont('helvetica', c.key === 'description' ? 'bold' : 'normal').setFontSize(8.5); setText(doc, INK);
        doc.text(lines, xOf(i) + 5, y + 13);
        return;
      }
      let v = '';
      if (c.key === 'sl') v = it._sl;
      else if (c.key === 'rate') v = (it.rate === '' || it.rate == null) ? '—' : (isFinite(Number(it.rate)) ? money(it.rate) : String(it.rate));
      else if (c.key === 'amount') v = (it.amount === '' || it.amount == null) ? '' : (isFinite(Number(it.amount)) ? money(it.amount) : String(it.amount));
      else if (c.key === 'qty') v = (it.qty === '' || it.qty == null) ? '' : (isFinite(Number(it.qty)) ? qn(it.qty) : String(it.qty));
      else v = it[c.key] != null ? it[c.key] : '';
      cell(i, v, y + 13, { align: c.align });
    });
    ctx.y += rowH;
  }
  // totals rows (label spans up to the amount column)
  const amtIdx = cols.findIndex((c) => c.key === 'amount');
  const amtX = xOf(amtIdx);
  const amtW = cols[amtIdx].w;
  const drawTotal = (label, val, { strong } = {}) => {
    const rowH = 20;
    ensureSpace(ctx, rowH);
    const y = ctx.y;
    if (strong) { setFill(doc, GREENBAR); doc.rect(M, y, CW, rowH, 'F'); }
    setDraw(doc, BORDER); doc.rect(M, y, CW, rowH, 'S');
    doc.line(amtX, y, amtX, y + rowH);
    doc.setFont('helvetica', 'bold').setFontSize(9); setText(doc, strong ? WHITE : INK);
    doc.text(label, amtX - 6, y + 13, { align: 'right' });
    doc.text(money(val), amtX + amtW - 5, y + 13, { align: 'right' });
    ctx.y += rowH;
  };
  if (totals) {
    drawTotal('TOTAL AMOUNT', totals.total);
    drawTotal(`GST @ ${totals.gstPct}%`, totals.gst);
    drawTotal(totals.grandLabel || 'GRAND TOTAL', totals.grand, { strong: true });
  }
}

function paragraph(ctx, text, { size = 9, bold = false, italic = false, color = INK, gap = 6 } = {}) {
  const { doc, M, CW } = ctx;
  doc.setFont('helvetica', bold ? (italic ? 'bolditalic' : 'bold') : (italic ? 'italic' : 'normal')).setFontSize(size);
  setText(doc, color);
  const lines = doc.splitTextToSize(String(text), CW);
  ensureSpace(ctx, lines.length * (size + 3) + gap);
  doc.text(lines, M, ctx.y + size);
  ctx.y += lines.length * (size + 3) + gap;
}

// Bulleted list. items = [{ label, text }] or [string].
function bullets(ctx, items) {
  const { doc, M, CW } = ctx;
  for (const it of items) {
    const label = typeof it === 'string' ? '' : (it.label || '');
    const text = typeof it === 'string' ? it : (it.text || '');
    if (!label && !text) continue;
    doc.setFont('helvetica', 'normal').setFontSize(9); setText(doc, INK);
    const full = label ? `${label}: ${text}` : text;
    const lines = doc.splitTextToSize(full, CW - 16);
    const h = lines.length * 12 + 2;
    ensureSpace(ctx, h);
    setText(doc, GREEN); doc.text('•', M + 2, ctx.y + 9);
    setText(doc, INK);
    // render with bold label prefix on first line
    if (label) {
      doc.setFont('helvetica', 'bold').setFontSize(9);
      const lw = doc.getTextWidth(label + ': ');
      doc.text(label + ':', M + 14, ctx.y + 9);
      doc.setFont('helvetica', 'normal').setFontSize(9);
      const rest = doc.splitTextToSize(text, CW - 16 - lw);
      doc.text(rest[0] || '', M + 14 + lw, ctx.y + 9);
      if (rest.length > 1) { doc.text(rest.slice(1), M + 14, ctx.y + 9 + 12); }
      ctx.y += Math.max(1, rest.length) * 12 + 2;
    } else {
      doc.text(lines, M + 14, ctx.y + 9);
      ctx.y += h;
    }
  }
}

function footerAll(ctx) {
  const { doc, W, M, H } = ctx;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const fy = H - 34;
    setDraw(doc, GREEN); doc.setLineWidth(1);
    doc.line(M, fy, W - M, fy);
    doc.setFont('helvetica', 'bold').setFontSize(8); setText(doc, GREEN);
    doc.text(`${COMPANY.web}   |   ${COMPANY.email}   |   ${COMPANY.phones}`, W / 2, fy + 12, { align: 'center' });
    doc.setFont('helvetica', 'normal').setFontSize(7.5); setText(doc, MUTE);
    doc.text(COMPANY.footAddr, W / 2, fy + 22, { align: 'center' });
  }
}

// ───────────────────────────── PROPOSAL ─────────────────────────────
export function renderProposal(doc, data, logo, ld) {
  const ctx = makeCtx(doc);
  const items = (Array.isArray(data.items) ? data.items : []).map((it, i) => ({ ...it, _sl: i + 1 }));
  const total = items.reduce((s, it) => s + nz(it.amount), 0);
  const gstPct = data.gstPct != null && data.gstPct !== '' ? nz(data.gstPct) : 18;
  const gst = total * gstPct / 100;
  const grand = total + gst;

  header(ctx, logo, ld, { centered: false });
  titleBlock(ctx, 'COMMERCIAL QUOTATION');

  greenBar(ctx, 'CLIENT DETAILS');
  kvTable(ctx, [
    ['CLIENT NAME', data.clientName],
    ['LOCATION', data.location],
    ['STRUCTURE', data.structure],
    ['REFERENCE CODE', data.referenceCode],
    ['DATE', data.date],
  ], { labelW: 140 });
  ctx.y += 10;

  if (data.subject) { paragraph(ctx, 'Subject: ' + data.subject, { bold: true, italic: true, gap: 8 }); }
  paragraph(ctx, data.salutation || 'Dear Sir/Madam,', { gap: 4 });
  if (data.intro) paragraph(ctx, data.intro, { gap: 10 });

  sectionTitle(ctx, 'COST ESTIMATION');
  itemTable(ctx,
    [
      { key: 'sl', title: 'SL. NO', w: 36, align: 'center' },
      { key: 'description', title: 'DESCRIPTION', w: 150, align: 'left' },
      { key: 'specification', title: 'SPECIFICATION', w: 150, align: 'left' },
      { key: 'unit', title: 'UNIT', w: 42, align: 'center' },
      { key: 'qty', title: 'QTY', w: 42, align: 'center' },
      { key: 'rate', title: 'RATE (Rs.)', w: 58, align: 'right' },
      { key: 'amount', title: 'AMOUNT (Rs.)', w: 70, align: 'right' },
    ],
    items,
    { total, gst, gstPct, grand, grandLabel: 'GRAND TOTAL' }
  );
  ctx.y += 6;
  paragraph(ctx, 'Amount in words: ' + (data.amountInWords || amountInWords(grand)), { bold: true, italic: true, gap: 4 });
  if (data.areaBasis) paragraph(ctx, 'Area basis: ' + data.areaBasis, { italic: true, size: 8.5, color: MUTE, gap: 8 });

  if (Array.isArray(data.scope) && data.scope.some((s) => s.label || s.text)) {
    sectionTitle(ctx, 'SCOPE & SPECIFICATIONS');
    bullets(ctx, data.scope);
  }
  if (Array.isArray(data.paymentTerms) && data.paymentTerms.some((s) => s.label || s.text)) {
    sectionTitle(ctx, 'PAYMENT TERMS');
    bullets(ctx, data.paymentTerms);
  }
  if (data.validity) {
    sectionTitle(ctx, 'PROPOSAL VALIDITY');
    bullets(ctx, String(data.validity).split('\n').map((t) => t.trim()).filter(Boolean));
  }

  const bank = data.bank || COMPANY.bank;
  sectionTitle(ctx, 'BANK DETAILS');
  [['Bank Name', bank.name], ['Account Holder', bank.holder], ['Account Number', bank.account], ['IFSC Code', bank.ifsc], ['Branch', bank.branch], ['GSTIN', bank.gstin || COMPANY.gstin]].forEach(([k, v]) => {
    ensureSpace(ctx, 14);
    doc.setFont('helvetica', 'bold').setFontSize(9); setText(doc, INK);
    doc.text(k + ':', ctx.M, ctx.y + 9);
    doc.setFont('helvetica', 'normal').setFontSize(9);
    doc.text(String(v || '—'), ctx.M + 96, ctx.y + 9);
    ctx.y += 13;
  });

  ctx.y += 14;
  ensureSpace(ctx, 60);
  doc.setFont('helvetica', 'bold').setFontSize(9.5); setText(doc, INK);
  doc.text('Best Regards,', ctx.M, ctx.y + 10);
  doc.text(data.signName || 'Praveen Raja', ctx.M, ctx.y + 24);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text(data.signTitle || 'Business Development Manager', ctx.M, ctx.y + 37);
  doc.text(COMPANY.name, ctx.M, ctx.y + 49);
  if (data.signMobile) doc.text('Mobile: ' + data.signMobile, ctx.M, ctx.y + 61);

  footerAll(ctx);
}

// ───────────────────────────── HANDOVER ─────────────────────────────
export function renderHandover(doc, data, logo, ld) {
  const ctx = makeCtx(doc);
  const items = (Array.isArray(data.items) ? data.items : []);
  const total = items.reduce((s, it) => s + nz(it.amount), 0);
  const gstPct = data.gstPct != null && data.gstPct !== '' ? nz(data.gstPct) : 18;
  const gst = total * gstPct / 100;
  const grand = total + gst;

  header(ctx, logo, ld, { centered: true });
  const sub = data.structureSummary ? `Project: ${data.projectName || ''}  —  ${data.structureSummary}` : (data.projectName ? `Project: ${data.projectName}` : '');
  const ref = [data.proposalRef ? 'Proposal Ref: ' + data.proposalRef : '', data.purchaseOrder ? 'Purchase Order: ' + data.purchaseOrder : ''].filter(Boolean).join('    ·    ');
  titleBlock(ctx, 'SALES TO PROJECT HANDOVER FORM', sub, ref);

  sectionTitle(ctx, '1.  Client & Project Details');
  kvTable(ctx, [
    ['Client Name', data.clientName],
    ['Project Location', data.projectLocation],
    ['Contact Details (Phone / Email)', data.contactDetails],
    ['Billing Name', data.billingName],
    ['Mobile Number', data.mobileNumber],
    ['Alternate Mobile Number', data.altMobile],
    ['Site Address', data.siteAddress],
    ['Billing Address', data.billingAddress],
    ['GST Number', data.gstNumber],
    ['Email ID / WhatsApp Number', data.emailWhatsapp],
    ['Salesperson Name', data.salespersonName],
    ['Date of Order', data.dateOfOrder],
    ['Proposal Ref No.', data.proposalRefNo],
  ], { labelW: 170 });

  sectionTitle(ctx, '2.  Scope of Work');
  kvTable(ctx, [
    ['Type of Project', data.typeOfProject],
    ['Project Size / Area', data.projectSize],
    ['3D Design', data.design3D],
    ['2D Design', data.design2D],
    ['Transportation – Client Scope', data.transportationScope],
    ['Scaffolding – Client Scope', data.scaffoldingScope],
  ], { labelW: 170 });

  sectionTitle(ctx, '3.  Timeline & Delivery Commitment');
  kvTable(ctx, [
    ['Tentative Start Date', data.tentativeStartDate],
    ['Tentative Completion Date', data.tentativeCompletionDate],
    ['Lead Time Promised', data.leadTimePromised],
  ], { labelW: 170 });

  sectionTitle(ctx, '4.  Pricing & Payment Terms');
  paragraph(ctx, 'PO-ted Price:  ' + (data.potedPrice || 'Yes'), { bold: true, gap: 6 });
  itemTable(ctx,
    [
      { key: 'description', title: 'Description', w: 220, align: 'left' },
      { key: 'qty', title: 'Qty', w: 55, align: 'center' },
      { key: 'rate', title: 'Rate (Rs.)', w: 65, align: 'right' },
      { key: 'amount', title: 'Amount (Rs.)', w: 70, align: 'right' },
    ],
    items,
    { total, gst, gstPct, grand, grandLabel: data.purchaseOrder ? `Grand Total (${data.purchaseOrder})` : 'Grand Total' }
  );
  ctx.y += 6;
  paragraph(ctx, 'Amount in words: ' + (data.amountInWords || amountInWords(grand)), { italic: true, gap: 8 });

  if (data.paymentSchedule) {
    paragraph(ctx, 'Payment Schedule:', { bold: true, gap: 2 });
    bullets(ctx, String(data.paymentSchedule).split('\n').map((t) => t.trim()).filter(Boolean));
  }
  paragraph(ctx, 'If not applicable, alternate payment terms:  ' + (data.alternateTerms || 'N/A'), { gap: 10 });

  sectionTitle(ctx, '5.  Site Engineer Visit Completed');
  ensureSpace(ctx, 22);
  doc.setFont('helvetica', 'normal').setFontSize(9); setText(doc, INK);
  doc.text('Site Engineer Sign:  ' + (data.siteEngineerSign || '____________________________'), ctx.M, ctx.y + 10);
  ctx.y += 22;
  paragraph(ctx, '“' + (data.confirmationStatement || 'I confirm that all details communicated to the client and project team are accurate and agreed upon. I also acknowledge that the project will commence once the design is confirmed.') + '”', { italic: true, gap: 12 });
  ensureSpace(ctx, 30);
  doc.setFont('helvetica', 'normal').setFontSize(9); setText(doc, INK);
  doc.text('Signature of Salesperson:  ' + (data.salespersonSign || '____________________________'), ctx.M, ctx.y + 10);
  ctx.y += 16;
  doc.setFont('helvetica', 'normal').setFontSize(8.5); setText(doc, MUTE);
  doc.text('Name:  ' + (data.salespersonName || 'Praveen Raja') + '   ·   ' + (data.salespersonTitle || 'Business Development Manager') + '   ·   ' + COMPANY.name, ctx.M, ctx.y + 10);

  footerAll(ctx);
}

async function build(renderFn, data, fileBase) {
  const mod = await import('jspdf');
  const jsPDF = mod.jsPDF || mod.default;
  if (!jsPDF) throw new Error('PDF engine failed to load.');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const logo = await loadLogo();
  let ld = null;
  if (logo) { try { const p = doc.getImageProperties(logo); ld = { w: p.width, h: p.height }; } catch { ld = null; } }
  renderFn(doc, data || {}, logo, ld);
  doc.save(`${String(fileBase || 'form').replace(/[^\w.-]+/g, '_')}.pdf`);
}

export async function downloadProposalPdf(data) {
  return build(renderProposal, data, data && (data.referenceCode || data.clientName) ? `Proposal_${data.referenceCode || data.clientName}` : 'Proposal');
}

export async function downloadHandoverPdf(data) {
  return build(renderHandover, data, data && (data.projectName || data.proposalRef) ? `Handover_${data.projectName || data.proposalRef}` : 'Handover');
}
