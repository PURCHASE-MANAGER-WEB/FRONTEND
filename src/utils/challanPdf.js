// Delivery Challan PDF — matches the Tesco Structures brand DC template exactly:
// copies strip (Original/Duplicate/Triplicate), logo + centered "DELIVERY CHALLAN"
// between green rules, two-column meta (DC No / PO Ref / Supplier Ref · Date /
// Vehicle No / Driver), FROM (CONSIGNOR) / TO (CONSIGNEE) blocks, a bordered item
// table with a DARK header (S.No · Description · Make · Unit · Qty (Nos) ·
// Approx. Wt (MT) · Remarks) and a green TOTAL row, quantity-in-words line, a
// Purpose-of-Movement checkbox row, NOTES, three signature boxes, an authorised
// signatory line and the three-column green footer. jsPDF only, imported dynamically.

const GREEN  = [74, 125, 47];
const GREENL = [233, 242, 221];
const CHAR   = [51, 51, 51];       // dark table header
const INK    = [33, 37, 41];
const MUTE   = [110, 116, 124];
const LINE   = [205, 210, 216];

const COMPANY = {
  name: 'Tesco Structures Pvt. Ltd.',
  addr: ['37, 15th Street, Gandhi Nagar, Ashok Nagar,', 'Chennai – 600 083, Tamil Nadu, India', 'Ph: +91 77088 33911  |  tescostructures@gmail.com'],
  web: 'www.tescostructures.com',
  email: 'tescostructures@gmail.com',
  phones: ['+91 77088 33911', '+91 90033 28229'],
  footAddr: ['37, 15th St, Gandhi Nagar, Ashok Nagar,', 'Chennai, Greater Chennai, Tamil Nadu 600083'],
};

const DEFAULT_NOTES = [
  'Material is dispatched in good condition. Please check quantity and condition at the time of unloading.',
  'Any shortage or damage must be recorded on this challan before signing and informed to us within 24 hours.',
  'This is a delivery challan only, not a tax invoice. Weights are approximate; billing as per actual weighment.',
  'Unloading at site is in the consignee’s scope.',
];
const PURPOSES = ['Supply to Site', 'Job Work', 'Returnable', 'Non-Returnable'];

const nz = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const wt3 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const qn = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// Small integer-to-words (for "Five Nos only").
function intWords(n) {
  n = Math.round(nz(n));
  if (n <= 0) return 'Nil';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
  const three = (x) => x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x);
  let out = '';
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (n) out += three(n) + ' ';
  return out.trim();
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

export async function downloadChallanPdf(data) {
  const mod = await import('jspdf');
  const jsPDF = mod.jsPDF || mod.default;
  if (!jsPDF) throw new Error('PDF engine failed to load.');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const CW = W - 2 * M;
  const FOOT = 54;

  const logo = await loadLogo();
  let ld = null;
  if (logo) { try { const p = doc.getImageProperties(logo); ld = { w: p.width, h: p.height }; } catch { ld = null; } }

  // ── Copies strip (top-right) ──
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...MUTE);
  doc.text('Original – Consignee  |  Duplicate – Transporter  |  Triplicate – Office', W - M, 30, { align: 'right' });

  // ── Header: logo ──
  let y = 40;
  if (logo && ld) {
    const sc = Math.min(168 / ld.w, 58 / ld.h); const lw = ld.w * sc, lh = ld.h * sc;
    try { doc.addImage(logo, 'PNG', M, y, lw, lh); } catch { /* ignore */ }
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK);
    doc.text('TESCO', M, y + 16);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
    doc.text('S T R U C T U R E S', M, y + 30);
  }

  // ── Title between green rules ──
  let ty = y + 80;
  doc.setDrawColor(...GREEN).setLineWidth(1.3).line(M, ty - 20, W - M, ty - 20);
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...INK);
  doc.text('DELIVERY CHALLAN', W / 2, ty, { align: 'center' });
  doc.setDrawColor(...GREEN).setLineWidth(1.3).line(M, ty + 9, W - M, ty + 9);
  y = ty + 26;

  // ── Meta (two columns) ──
  const colR = M + CW * 0.56;
  const blankLine = (x, x2, yy) => { doc.setDrawColor(...LINE).setLineWidth(0.5); doc.line(x, yy + 2, x2, yy + 2); };
  let yL = y, yR = y;
  const metaRow = (side, label, val, lead) => {
    const x = side === 'L' ? M : colR;
    const lw = lead;
    const yy = side === 'L' ? yL : yR;
    const endX = side === 'L' ? colR - 16 : W - M;
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
    doc.text(label, x, yy);
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    const v = (val == null ? '' : String(val)).trim();
    if (v) doc.text(': ' + v, x + lw, yy);
    else { doc.text(':', x + lw, yy); blankLine(x + lw + 8, endX, yy); }
    if (side === 'L') yL += 16; else yR += 16;
  };
  metaRow('L', 'DC No.', data.dcNo, 72);
  metaRow('L', 'PO Ref.', data.poRef, 72);
  metaRow('L', 'Supplier Ref.', data.supplierRef, 72);
  metaRow('R', 'Date', data.dateFmt, 78);
  metaRow('R', 'Vehicle No.', data.vehicleNo, 78);
  metaRow('R', 'Driver / Mobile', data.driver, 78);
  y = Math.max(yL, yR) + 12;

  // ── FROM / TO blocks ──
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
  doc.text('FROM (CONSIGNOR)', M, y);
  doc.text('TO (CONSIGNEE / DELIVERY SITE)', colR, y);
  const top = y + 13;
  const rightW = W - M - colR;

  let ly = top;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
  doc.text(COMPANY.name, M, ly); ly += 13;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  COMPANY.addr.forEach((t) => { const w = doc.splitTextToSize(String(t), colR - M - 16); doc.text(w, M, ly); ly += 12 * w.length; });

  const cons = data.consignee || {};
  let ry = top;
  const consRow = (label, val) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
    doc.text(label, colR, ry);
    const lx = colR + 78;
    const v = (val == null ? '' : String(val)).trim();
    if (v) { const w = doc.splitTextToSize(v, W - M - lx); doc.text(w, lx, ry); ry += Math.max(12 * w.length, 16); }
    else { blankLine(lx, W - M, ry); ry += 16; }
  };
  consRow('Name', cons.name);
  consRow('Site Address', cons.address);
  consRow('Contact / Mobile', cons.contact);
  y = Math.max(ly, ry) + 10;

  // ── Item table ──
  const items = Array.isArray(data.items) ? data.items : [];
  const totQty = items.reduce((s, it) => s + nz(it.qty), 0);
  const totWeight = items.reduce((s, it) => s + nz(it.weight), 0);
  const cols = [
    { w: 30,  align: 'center', title: 'S.No' },
    { w: CW - 30 - 56 - 40 - 50 - 78 - 70, align: 'left', title: 'Description of Material' },
    { w: 56,  align: 'center', title: 'Make' },
    { w: 40,  align: 'center', title: 'Unit' },
    { w: 50,  align: 'center', title: 'Qty (Nos)' },
    { w: 78,  align: 'right',  title: 'Approx. Wt (MT)' },
    { w: 70,  align: 'left',   title: 'Remarks' },
  ];
  const xOf = (i) => M + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const cell = (i, text, topY, align) => {
    const c = cols[i]; const a = align || c.align; const x0 = xOf(i);
    const tx = a === 'right' ? x0 + c.w - 5 : a === 'center' ? x0 + c.w / 2 : x0 + 5;
    doc.text(text, tx, topY, { align: a, baseline: 'top' });
  };
  const lineH = 11;
  const descW = cols[1].w - 10;

  const drawHead = (t) => {
    doc.setFillColor(...CHAR); doc.rect(M, t, CW, 22, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(255, 255, 255);
    cols.forEach((c, i) => cell(i, c.title, t + 7));
    return t + 22;
  };

  y = drawHead(y);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  items.forEach((it, idx) => {
    const matLines = doc.splitTextToSize(String(it.material || '-'), descW);
    const remLines = it.remarks ? doc.splitTextToSize(String(it.remarks), cols[6].w - 8) : [];
    const rowH = Math.max(matLines.length * lineH + 8, remLines.length * lineH + 8, 22);

    if (y + rowH > H - FOOT - 120) { doc.addPage(); y = drawHead(50); doc.setFont('helvetica', 'normal').setFontSize(9); }

    doc.setDrawColor(...LINE).setLineWidth(0.5); doc.rect(M, y, CW, rowH);
    cols.forEach((c, i) => { if (i > 0) doc.line(xOf(i), y, xOf(i), y + rowH); });

    const tY = y + 5;
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    cell(0, String(idx + 1), tY);
    cell(2, it.make ? String(it.make) : '', tY);
    cell(3, it.unit ? String(it.unit) : 'Nos', tY);
    cell(4, qn(it.qty), tY);
    cell(5, nz(it.weight) ? wt3(it.weight) : '', tY);
    let dy = tY;
    doc.setFont('helvetica', 'bold').setTextColor(...INK);
    matLines.forEach((l) => { doc.text(l, xOf(1) + 5, dy, { baseline: 'top' }); dy += lineH; });
    if (remLines.length) { doc.setFont('helvetica', 'normal').setTextColor(...MUTE); remLines.forEach((l, k) => doc.text(l, xOf(6) + 4, tY + k * lineH, { baseline: 'top' })); }
    y += rowH;
  });

  // TOTAL row (green tint)
  const trH = 20;
  doc.setFillColor(...GREENL); doc.rect(M, y, CW, trH, 'F');
  doc.setDrawColor(...LINE).setLineWidth(0.5); doc.rect(M, y, CW, trH);
  cols.forEach((c, i) => { if (i > 0) doc.line(xOf(i), y, xOf(i), y + trH); });
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
  cell(3, 'TOTAL', y + 6);
  cell(4, qn(totQty), y + 6);
  cell(5, totWeight ? wt3(totWeight) : '', y + 6);
  y += trH + 12;

  // ── Quantity in words ──
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
  doc.text('Total Quantity:', M, y);
  doc.setFont('helvetica', 'normal');
  const wtxt = `${intWords(totQty)} Nos only` + (totWeight ? `  |  Approx. weight ${wt3(totWeight)} MT (actual weighment to apply)` : '');
  doc.text(wtxt, M + 72, y);
  y += 20;

  // ── Purpose of Movement ──
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
  doc.text('Purpose of Movement:', M, y);
  let px = M + 118;
  const chosen = String(data.purpose || '').trim();
  doc.setFontSize(9);
  PURPOSES.forEach((p) => {
    const box = 9;
    doc.setDrawColor(...INK).setLineWidth(0.7); doc.rect(px, y - box + 1, box, box);
    if (p === chosen) { doc.setLineWidth(1.1); doc.line(px + 1.5, y - 3, px + 3.5, y - 0.5); doc.line(px + 3.5, y - 0.5, px + 7.5, y - box + 2.5); }
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    doc.text(p, px + box + 5, y);
    px += box + 10 + doc.getTextWidth(p) + 16;
  });
  y += 20;

  // ── Notes ──
  const notes = Array.isArray(data.notes) && data.notes.length ? data.notes : DEFAULT_NOTES;
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
  doc.text('NOTES', M, y); y += 13;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
  notes.forEach((t, i) => {
    const n = `${i + 1}. `;
    const indent = doc.getTextWidth(n);
    const wrapped = doc.splitTextToSize(String(t), CW - indent);
    doc.text(n, M, y);
    doc.text(wrapped, M + indent, y);
    y += wrapped.length * 11 + 2;
  });
  y += 10;

  // ── Signature boxes ──
  if (y > H - FOOT - 110) { doc.addPage(); y = 50; }
  const boxW = (CW - 2 * 14) / 3, boxH = 64;
  const boxes = [
    { t: 'Prepared / Checked By', b: 'Tesco Structures' },
    { t: 'Driver’s Signature', b: 'Name & Mobile' },
    { t: 'Received By (Consignee)', b: 'Name, Sign, Date & Seal' },
  ];
  boxes.forEach((bx, i) => {
    const x = M + i * (boxW + 14);
    doc.setDrawColor(...LINE).setLineWidth(0.6); doc.rect(x, y, boxW, boxH);
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
    doc.text(bx.t, x + 8, y + 15);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTE);
    doc.text(bx.b, x + 8, y + boxH - 10);
  });
  y += boxH + 18;

  // ── Authorised signatory ──
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
  doc.text('For ' + COMPANY.name, W - M, y, { align: 'right' });
  y += 26;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
  doc.text('Authorised Signatory', W - M, y, { align: 'right' });

  // ── Footer on every page ──
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GREEN).setLineWidth(1).line(M, H - FOOT + 6, W - M, H - FOOT + 6);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTE);
    doc.text(COMPANY.web, M, H - FOOT + 20);
    doc.text(COMPANY.email, M, H - FOOT + 31);
    doc.text(COMPANY.phones[0], W / 2, H - FOOT + 20, { align: 'center' });
    doc.text(COMPANY.phones[1], W / 2, H - FOOT + 31, { align: 'center' });
    doc.text(COMPANY.footAddr[0], W - M, H - FOOT + 20, { align: 'right' });
    doc.text(COMPANY.footAddr[1], W - M, H - FOOT + 31, { align: 'right' });
    if (pages > 1) doc.text(`Page ${p} of ${pages}`, W / 2, H - 12, { align: 'center' });
  }

  doc.save(`${String(data.fileName || data.dcNo || 'delivery-challan').replace(/[^\w.-]+/g, '_')}.pdf`);
}
