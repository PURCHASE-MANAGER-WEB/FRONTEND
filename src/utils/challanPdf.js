// Delivery Challan PDF — plain boxed template (matches the Tesco Structures DC sheet):
// a yellow "Delivery Challan" title bar, a company block (name / address / GSTIN) with
// D.C No / Date / Vehicle on the right, a "Delivery Challan From" vs "Shipping To" block
// (consignor and consignee, each with address / phone / email / GSTIN), a bordered item
// grid (Sl No · Description · Qty · Uom · Value · Remarks) with a TOTAL row, a Note +
// "For Tesco Structures LLP" box, and a Customer's Seal & Signature strip.
// jsPDF only, imported dynamically. Drawing lives in renderChallanDoc so it can be tested.

const YELLOW = [255, 242, 0];
const INK = [0, 0, 0];
const BORDER = [0, 0, 0];

// Company (consignor) — fixed Tesco Structures details printed on every challan.
const COMPANY = {
  name: 'TESCO STRUCTURES LLP',
  address: 'No.37, Ground Floor, 15th Street, Malligaipo Nagar, Ashok Nagar, Chennai - 600083',
  gstin: '33AAXFT8541N1Z8',
};

const nz = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const qn = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderChallanDoc(doc, data) {
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const CW = W - 2 * M;
  const R = W - M;                 // right edge
  doc.setLineWidth(0.7);

  const rect = (x, y, w, h) => { doc.setDrawColor(...BORDER).rect(x, y, w, h); };
  const fillRect = (x, y, w, h, c) => { doc.setFillColor(...c).rect(x, y, w, h, 'F'); doc.setDrawColor(...BORDER).rect(x, y, w, h); };
  const vline = (x, y1, y2) => { doc.setDrawColor(...BORDER).line(x, y1, x, y2); };
  const line = (x1, y1, x2, y2) => { doc.setDrawColor(...BORDER).line(x1, y1, x2, y2); };
  const label = (s, x, y) => { doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...INK).text(String(s), x, y); };
  const normal = (s, x, y, size = 8.5) => { doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...INK).text(String(s), x, y); };
  const bold = (s, x, y, size = 9) => { doc.setFont('helvetica', 'bold').setFontSize(size).setTextColor(...INK).text(String(s), x, y); };
  const center = (s, cx, y, size = 9, b = true) => { doc.setFont('helvetica', b ? 'bold' : 'normal').setFontSize(size).setTextColor(...INK).text(String(s), cx, y, { align: 'center' }); };

  let y = M;

  // ── Title bar ──
  const titleH = 26;
  fillRect(M, y, CW, titleH, YELLOW);
  center('Delivery Challan', W / 2, y + 18, 14, true);
  y += titleH;

  // ── Company block: left (name / address / gstin), right (D.C No / Date / Vehicle) ──
  const leftW = 318;
  const divX = M + leftW;
  const labW = 54;
  const h1 = 24, h2 = 34, h3 = 20;
  const compH = h1 + h2 + h3;

  rect(M, y, CW, compH);
  vline(divX, y, y + compH);
  line(M, y + h1, divX, y + h1);
  line(M, y + h1 + h2, divX, y + h1 + h2);
  vline(M + labW, y + h1, y + compH);
  line(divX, y + h1 + h2, R, y + h1 + h2);

  center(COMPANY.name, M + leftW / 2, y + 16, 10.5, true);
  label('Address:', M + 4, y + h1 + 14);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
  doc.text(doc.splitTextToSize(COMPANY.address, leftW - labW - 10), M + labW + 5, y + h1 + 12);
  label('GSTIN:', M + 4, y + h1 + h2 + 14);
  bold(COMPANY.gstin, M + labW + 5, y + h1 + h2 + 14, 9);

  const rx = divX + 6;
  normal('D.C No: ' + (data.dcNo || ''), rx, y + 14, 8.5);
  normal('DATE: ' + (data.dateFmt || ''), rx, y + 28, 8.5);
  normal('Vehicle No: ' + (data.vehicleNo || ''), rx, y + 42, 8.5);
  y += compH + 8;

  // ── From / Shipping To ──
  const midX = M + CW / 2;
  const cons = data.consignee || {};
  const hdrH = 18, nameH = 18, addrH = 34, rowH = 16;
  const fromH = hdrH + nameH + addrH + rowH * 3;

  rect(M, y, CW, fromH);
  vline(midX, y, y + fromH);
  line(M, y + hdrH, R, y + hdrH);
  normal('Delivery Challan From :', M + 5, y + 13, 8.5);
  normal('Shipping To:', midX + 5, y + 13, 8.5);

  const nameY = y + hdrH;
  line(M, nameY + nameH, R, nameY + nameH);
  center(COMPANY.name, M + CW / 4, nameY + 13, 9, true);
  center(cons.name || '', midX + CW / 4, nameY + 13, 9, true);

  const lw2 = 54;
  const valLx = M + lw2, valRx = midX + lw2;
  vline(valLx, nameY + nameH, y + fromH);
  vline(valRx, nameY + nameH, y + fromH);
  let ry = nameY + nameH;
  line(M, ry + addrH, R, ry + addrH);
  label('Address:', M + 4, ry + 13);
  label('Address:', midX + 4, ry + 13);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...INK);
  doc.text(doc.splitTextToSize(String(COMPANY.address), (midX - valLx) - 8), valLx + 3, ry + 11);
  doc.text(doc.splitTextToSize(String(cons.address || ''), (R - valRx) - 8), valRx + 3, ry + 11);
  ry += addrH;
  const leftKeys = ['Phone No:', 'Email:', 'GSTIN:'];
  const leftVals = ['', '', COMPANY.gstin];
  const rightVals = [cons.phone || '', cons.email || '', cons.gstin || ''];
  for (let i = 0; i < 3; i++) {
    if (i < 2) line(M, ry + rowH, R, ry + rowH);
    label(leftKeys[i], M + 4, ry + 12);
    label(leftKeys[i], midX + 4, ry + 12);
    normal(leftVals[i], valLx + 3, ry + 12, 8);
    normal(rightVals[i], valRx + 3, ry + 12, 8);
    ry += rowH;
  }
  y += fromH + 8;

  // ── Item grid ──
  const cols = [
    { w: 42, title: 'Sl No:', align: 'center' },
    { w: CW - 42 - 50 - 50 - 70 - 120, title: 'DESCRIPTION', align: 'left' },
    { w: 50, title: 'QTY', align: 'center' },
    { w: 50, title: 'Uom', align: 'center' },
    { w: 70, title: 'Value', align: 'right' },
    { w: 120, title: 'REMARKS', align: 'left' },
  ];
  const xOf = (i) => M + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const cellTxt = (i, s, ty, opt = {}) => {
    const c = cols[i]; const a = opt.align || c.align; const x0 = xOf(i);
    const tx = a === 'right' ? x0 + c.w - 5 : a === 'center' ? x0 + c.w / 2 : x0 + 5;
    doc.setFont('helvetica', opt.bold ? 'bold' : 'normal').setFontSize(opt.size || 8.5).setTextColor(...INK);
    doc.text(String(s), tx, ty, { align: a });
  };

  const ihH = 20;
  fillRect(M, y, CW, ihH, YELLOW);
  cols.forEach((c, i) => { if (i) vline(xOf(i), y, y + ihH); cellTxt(i, c.title, y + 13, { bold: true, align: 'center', size: 8.5 }); });
  y += ihH;

  const items = Array.isArray(data.items) ? data.items : [];
  const bodyRows = Math.max(items.length, 8);
  const brH = 22;
  for (let i = 0; i < bodyRows; i++) {
    rect(M, y, CW, brH);
    cols.forEach((c, k) => { if (k) vline(xOf(k), y, y + brH); });
    const it = items[i];
    if (it) {
      cellTxt(0, i + 1, y + 14, { align: 'center' });
      cellTxt(1, it.material || '', y + 14, { bold: true, align: 'left' });
      cellTxt(2, (it.qty != null && it.qty !== '') ? qn(it.qty) : '', y + 14, { align: 'center' });
      cellTxt(3, it.unit || '', y + 14, { align: 'center' });
      cellTxt(4, (it.value != null && it.value !== '' && nz(it.value)) ? money(it.value) : '', y + 14, { align: 'right' });
      cellTxt(5, it.remarks || '', y + 14, { align: 'left' });
    }
    y += brH;
  }

  const totH = 22;
  rect(M, y, CW, totH);
  cols.forEach((c, k) => { if (k) vline(xOf(k), y, y + totH); });
  cellTxt(1, 'TOTAL', y + 14, { bold: true, align: 'right', size: 9.5 });
  cellTxt(2, qn(data.totalQty != null ? data.totalQty : items.reduce((s, it) => s + nz(it.qty), 0)), y + 14, { bold: true, align: 'center', size: 9.5 });
  y += totH + 8;

  // ── Note + "For Tesco Structures LLP" ──
  const noteH = 92;
  const noteDiv = M + CW * 0.66;
  rect(M, y, CW, noteH);
  vline(noteDiv, y, y + noteH);
  bold('Note:', M + 6, y + 15, 10);
  if (data.notes) {
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
    doc.text(doc.splitTextToSize(String(data.notes), noteDiv - M - 16), M + 6, y + 30);
  }
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK).text('For ' + COMPANY.name, noteDiv + (R - noteDiv) / 2, y + 16, { align: 'center' });
  y += noteH;

  // ── Customer's Seal & Signature ──
  const csLabelH = 20, csBlankH = 44;
  rect(M, y, CW, csLabelH);
  bold("Customer's Seal & Signature", M + 6, y + 14, 9);
  y += csLabelH;
  rect(M, y, CW, csBlankH);
  y += csBlankH;

  return y;
}

export async function downloadChallanPdf(data) {
  const mod = await import('jspdf');
  const jsPDF = mod.jsPDF || mod.default;
  if (!jsPDF) throw new Error('PDF engine failed to load.');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  renderChallanDoc(doc, data);
  doc.save(`${String(data.fileName || data.dcNo || 'delivery-challan').replace(/[^\w.-]+/g, '_')}.pdf`);
}
