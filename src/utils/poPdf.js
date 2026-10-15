// Purchase Order PDF — matches the Tesco Structures brand template:
// logo + centered "PURCHASE ORDER" between green rules, two-column meta,
// TO (SUPPLIER) / BILL TO blocks, a bordered item table with a grey header,
// a right-aligned totals block with a green NET PAYABLE highlight, amount in
// words, numbered terms, an authorised-signatory line and a three-column green
// footer. Built with jsPDF only (no autotable), imported dynamically.
//
// Built-in PDF fonts don't carry the ₹ glyph, so money prints as "Rs." here
// (the on-screen UI keeps ₹). Same data shape / call as before.

import { formatTerms } from './procurement';

const GREEN  = [74, 125, 47];     // brand green — rules, signatory, footer line
const GREENL = [233, 242, 221];   // light green — NET PAYABLE highlight
const HEAD   = [228, 228, 228];   // table header grey
const INK    = [33, 37, 41];
const MUTE   = [110, 116, 124];
const LINE   = [205, 210, 216];

const COMPANY = {
  name: 'Tesco Structures Pvt. Ltd.',
  addr: ['37, 15th Street, Gandhi Nagar, Ashok Nagar,', 'Chennai – 600 083,', 'Tamil Nadu, India'],
  attn: 'Kind Attn: Mr. Vishnu',
  phEmail: 'Ph: +91 77088 33911  |  tescostructures@gmail.com',
  web: 'www.tescostructures.com',
  email: 'tescostructures@gmail.com',
  phones: ['+91 77088 33911', '+91 90033 28229'],
  footAddr: ['37, 15th St, Gandhi Nagar, Ashok Nagar,', 'Chennai, Greater Chennai, Tamil Nadu 600083'],
};

const DEFAULT_TERMS = [
  'Prices: Rates are firm for this order. GST extra as shown above.',
  'Quantity & Billing: Supply strictly as per the ordered quantity and agreed specifications.',
  'Delivery: As per the delivery date mentioned above or as mutually agreed.',
  'Payment: As per the agreed payment terms for this order.',
  'Invoice: Tax invoice to be raised in the name of Tesco Structures Pvt. Ltd. with this PO number quoted.',
  'Correspondence: This PO number must be quoted on all invoices, delivery notes and correspondence.',
];

const rs = (n) => 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
const rs2 = (n) => 'Rs. ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qn = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

async function loadLogo() {
  try {
    const res = await fetch('/logo.png');
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

export async function downloadPoPdf(data) {
  const mod = await import('jspdf');
  const jsPDF = mod.jsPDF || mod.default;
  if (!jsPDF) throw new Error('PDF engine failed to load.');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const CW = W - 2 * M;
  const FOOT = 54;               // reserved footer height

  const logo = await loadLogo();
  let ld = null;
  if (logo) { try { const p = doc.getImageProperties(logo); ld = { w: p.width, h: p.height }; } catch { ld = null; } }

  // ── Header: logo (left) ──
  let y = 38;
  if (logo && ld) {
    const lw = 150, lh = Math.min(48, lw * ld.h / ld.w);
    try { doc.addImage(logo, 'PNG', M, y, lw, lh); } catch { /* ignore */ }
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK);
    doc.text('TESCO', M, y + 16);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
    doc.text('S T R U C T U R E S', M, y + 30);
  }

  // ── Title with green rules ──
  let ty = y + 70;
  doc.setDrawColor(...GREEN).setLineWidth(1.3).line(M, ty - 20, W - M, ty - 20);
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...INK);
  doc.text('PURCHASE ORDER', W / 2, ty, { align: 'center' });
  doc.setDrawColor(...GREEN).setLineWidth(1.3).line(M, ty + 9, W - M, ty + 9);
  y = ty + 24;

  // ── Meta: two columns ──
  const colR = M + CW * 0.53;
  let yL = y, yR = y;
  const metaRow = (side, label, val) => {
    const x = side === 'L' ? M : colR;
    const lw = side === 'L' ? 82 : 78;
    const yy = side === 'L' ? yL : yR;
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
    doc.text(label, x, yy);
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    doc.text(': ' + (val == null || val === '' ? '—' : String(val)), x + lw, yy);
    if (side === 'L') yL += 15; else yR += 15;
  };
  metaRow('L', 'PO No.', data.po);
  metaRow('L', 'Project', data.project);
  metaRow('L', 'Vendor GSTIN', data.vendor && data.vendor.gst);
  metaRow('R', 'Date', data.poDateFmt);
  metaRow('R', 'Delivery Date', data.deliveryDateFmt);
  metaRow('R', 'Status', data.status);
  y = Math.max(yL, yR) + 10;

  // ── TO (SUPPLIER) / BILL TO ──
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
  doc.text('TO (SUPPLIER)', M, y);
  doc.text('BILL TO / SHIP TO', colR, y);
  const bodyTop = y + 13;
  const leftW = colR - M - 14, rightW = W - M - colR;

  // left (supplier)
  let ly = bodyTop;
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text(String((data.vendor && data.vendor.name) || '—'), M, ly); ly += 14;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  const supLines = [
    data.vendor && data.vendor.address,
    data.vendor && data.vendor.contact && ('Contact: ' + data.vendor.contact),
    data.vendor && [data.vendor.mobile && ('Ph: ' + data.vendor.mobile), data.vendor.email].filter(Boolean).join('  |  '),
    data.vendor && data.vendor.gst && ('GSTIN: ' + data.vendor.gst),
  ].filter(Boolean);
  supLines.forEach((t) => { const w = doc.splitTextToSize(String(t), leftW); doc.text(w, M, ly); ly += 12 * w.length; });

  // right (company / bill-to)
  let ry = bodyTop;
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text(COMPANY.name, colR, ry); ry += 14;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  [...COMPANY.addr, COMPANY.attn, COMPANY.phEmail].forEach((t) => { const w = doc.splitTextToSize(String(t), rightW); doc.text(w, colR, ry); ry += 12 * w.length; });

  y = Math.max(ly, ry) + 7;

  // Delivery address, if present
  if (data.deliveryAddress) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
    doc.text('DELIVERY ADDRESS', M, y); y += 12;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
    const dl = doc.splitTextToSize(String(data.deliveryAddress), CW);
    doc.text(dl, M, y); y += 12 * dl.length + 4;
  }

  // ── Intro ──
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
  const intro = doc.splitTextToSize('We are pleased to place our purchase order for the following material, as per the terms & conditions stated below.', CW);
  doc.text(intro, M, y); y += intro.length * 12 + 8;

  // ── Item table ──
  const cols = [
    { w: 30,  align: 'center', title: 'S.No' },
    { w: CW - 30 - 55 - 42 - 86 - 96, align: 'left', title: 'Description' },
    { w: 55,  align: 'right',  title: 'Qty' },
    { w: 42,  align: 'center', title: 'Per' },
    { w: 86,  align: 'right',  title: 'Rate (Rs.)' },
    { w: 96,  align: 'right',  title: 'Amount (Rs.)' },
  ];
  const xOf = (i) => M + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const cell = (i, text, top, align) => {
    const c = cols[i]; const a = align || c.align; const x0 = xOf(i);
    const tx = a === 'right' ? x0 + c.w - 6 : a === 'center' ? x0 + c.w / 2 : x0 + 6;
    doc.text(text, tx, top, { align: a, baseline: 'top' });
  };
  const lineH = 11;
  const descW = cols[1].w - 12;

  const drawHead = (top) => {
    doc.setFillColor(...HEAD); doc.rect(M, top, CW, 20, 'F');
    doc.setDrawColor(...LINE).setLineWidth(0.6); doc.rect(M, top, CW, 20);
    cols.forEach((c, i) => { if (i > 0) doc.line(xOf(i), top, xOf(i), top + 20); });
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...INK);
    cols.forEach((c, i) => cell(i, c.title, top + 6));
    return top + 20;
  };

  y = drawHead(y);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  (data.items || []).forEach((it, idx) => {
    const matLines = doc.splitTextToSize(String(it.material || '-'), descW);
    const specLines = it.spec ? doc.splitTextToSize('Spec: ' + it.spec, descW) : [];
    const descLines = it.description ? doc.splitTextToSize(String(it.description), descW) : [];
    const rowH = Math.max((matLines.length + specLines.length + descLines.length) * lineH + 8, 22);

    if (y + rowH > H - FOOT - 12) { doc.addPage(); y = drawHead(50); doc.setFont('helvetica', 'normal').setFontSize(9); }

    doc.setDrawColor(...LINE).setLineWidth(0.5); doc.rect(M, y, CW, rowH);
    cols.forEach((c, i) => { if (i > 0) doc.line(xOf(i), y, xOf(i), y + rowH); });

    const top = y + 5;
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    cell(0, String(idx + 1), top);
    cell(2, qn(it.qty), top);
    cell(3, String(it.unit || ''), top);
    cell(4, rs(it.rate), top);
    cell(5, rs2(it.amount), top);

    let dy = top;
    doc.setFont('helvetica', 'bold').setTextColor(...INK);
    matLines.forEach((l) => { doc.text(l, xOf(1) + 6, dy, { baseline: 'top' }); dy += lineH; });
    doc.setFont('helvetica', 'normal').setTextColor(...MUTE);
    [...specLines, ...descLines].forEach((l) => { doc.text(l, xOf(1) + 6, dy, { baseline: 'top' }); dy += lineH; });

    y += rowH;
  });

  // ── Totals block (continues the table grid) ──
  const T = data.totals || {};
  const xNotesEnd = xOf(2);         // left notes cell:  M .. Qty start
  const xAmt = xOf(5);              // amount cell start
  const totRows = [['Sub Total', rs2(T.sub)]];
  if (T.loading) totRows.push(['Loading Charges', rs2(T.loading)]);
  if (T.transport) totRows.push(['Transport Charge', rs2(T.transport)]);
  totRows.push(['Taxable Value', rs2(T.taxable)]);
  totRows.push([`GST @ ${T.gstPct || 18}%  (CGST ${(T.gstPct || 18) / 2}% + SGST ${(T.gstPct || 18) / 2}%)`, rs2(T.gst != null ? T.gst : (Number(T.cgst || 0) + Number(T.sgst || 0)))]);
  if (Math.abs(Number(T.roundOff || 0)) >= 0.005) totRows.push(['Round Off', (T.roundOff >= 0 ? '' : '-') + rs2(Math.abs(T.roundOff))]);

  const rowTH = 16, netH = 20;
  const totalH = totRows.length * rowTH + netH;
  if (y + totalH > H - FOOT - 10) { doc.addPage(); y = 50; }

  // left notes (italic) aligned with the totals rows
  doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...MUTE);
  doc.text(doc.splitTextToSize('All rates and taxes are as per the agreed quotation. Final billing as applicable.', xNotesEnd - M - 10), M, y + 12);

  let ry2 = y;
  doc.setFontSize(9.5);
  totRows.forEach(([k, v]) => {
    doc.setDrawColor(...LINE).setLineWidth(0.5);
    doc.rect(xNotesEnd, ry2, xAmt - xNotesEnd, rowTH);   // label cell
    doc.rect(xAmt, ry2, W - M - xAmt, rowTH);            // amount cell
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    doc.text(k, xAmt - 8, ry2 + 12, { align: 'right' });
    doc.text(v, W - M - 6, ry2 + 12, { align: 'right' });
    ry2 += rowTH;
  });
  // NET PAYABLE band (green)
  doc.setFillColor(...GREENL);
  doc.rect(xNotesEnd, ry2, W - M - xNotesEnd, netH, 'F');
  doc.setDrawColor(...GREEN).setLineWidth(0.8);
  doc.rect(xNotesEnd, ry2, xAmt - xNotesEnd, netH);
  doc.rect(xAmt, ry2, W - M - xAmt, netH);
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text('NET PAYABLE', xAmt - 8, ry2 + 15, { align: 'right' });
  doc.text(rs2(T.grand), W - M - 6, ry2 + 15, { align: 'right' });
  // left border of the whole totals area + bottom line
  doc.setDrawColor(...LINE).setLineWidth(0.5);
  y = ry2 + netH + 12;

  // ── Amount in words ──
  if (y > H - FOOT - 40) { doc.addPage(); y = 50; }
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
  const awLabel = 'Amount in words: ';
  const awW = doc.getTextWidth(awLabel);
  doc.text(awLabel, M, y);
  doc.setFont('helvetica', 'normal');
  const awLines = doc.splitTextToSize(String(data.amountWords || ''), CW - awW);
  doc.text(awLines, M + awW, y);
  y += Math.max(awLines.length * 12, 12) + 10;

  // ── Terms & conditions ──
  const termClauses = data.terms
    ? formatTerms(data.terms).split('\n').map((t) => t.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
    : DEFAULT_TERMS;
  if (termClauses.length) {
    if (y > H - FOOT - 50) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
    doc.text('TERMS & CONDITIONS', M, y); y += 13;
    doc.setFontSize(9);
    termClauses.forEach((clause, i) => {
      const n = `${i + 1}. `;
      const m = clause.match(/^([^:]{1,40}:)\s*(.*)$/);
      const lead = n + (m ? m[1] : '');
      const indent = doc.getTextWidth(n);
      const wrapped = doc.splitTextToSize((m ? m[2] : clause), CW - indent);
      if (y + wrapped.length * 12 > H - FOOT - 6) { doc.addPage(); y = 50; }
      // bold lead (number + "Label:")
      doc.setFont('helvetica', 'bold').setTextColor(...INK);
      doc.text(lead, M, y);
      const leadW = doc.getTextWidth(lead);
      doc.setFont('helvetica', 'normal');
      doc.text(' ' + (wrapped[0] || ''), M + leadW, y);
      for (let k = 1; k < wrapped.length; k++) { y += 11; doc.text(wrapped[k], M + indent, y); }
      y += 13;
    });
  }

  // ── Authorised signatory ──
  if (y > H - FOOT - 60) { doc.addPage(); y = 50; }
  y += 2;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
  doc.text('For ' + COMPANY.name, W - M, y, { align: 'right' });
  y += 30;
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK);
  doc.text('Authorised Signatory', W - M, y, { align: 'right' });

  // ── Footer (every page) ──
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GREEN).setLineWidth(1).line(M, H - FOOT + 6, W - M, H - FOOT + 6);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTE);
    // left
    doc.text(COMPANY.web, M, H - FOOT + 20);
    doc.text(COMPANY.email, M, H - FOOT + 31);
    // center
    doc.text(COMPANY.phones[0], W / 2, H - FOOT + 20, { align: 'center' });
    doc.text(COMPANY.phones[1], W / 2, H - FOOT + 31, { align: 'center' });
    // right
    doc.text(COMPANY.footAddr[0], W - M, H - FOOT + 20, { align: 'right' });
    doc.text(COMPANY.footAddr[1], W - M, H - FOOT + 31, { align: 'right' });
    if (pages > 1) doc.text(`Page ${p} of ${pages}`, W / 2, H - 12, { align: 'center' });
  }

  doc.save(`${String(data.po || 'purchase-order').replace(/[^\w.-]+/g, '_')}.pdf`);
}
