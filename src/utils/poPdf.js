// Purchase Order PDF — matches the Tesco Structures brand template exactly:
// logo + centered "PURCHASE ORDER" between green rules, two-column meta,
// TO (SUPPLIER) / BILL TO blocks, a bordered item table with a DARK header
// (S.No · Description · Make · Qty (Nos) · Approx. Wt (MT) · Rate / MT (Rs.) ·
// Amount (Rs.)), a right-aligned totals block with weight notes on the left and a
// green NET PAYABLE highlight, amount in words, numbered terms, an authorised
// signatory line and a three-column green footer. jsPDF only, imported dynamically.

import { formatTerms } from './procurement';

const GREEN  = [74, 125, 47];
const GREENL = [233, 242, 221];
const CHAR   = [51, 51, 51];       // dark table header
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

const nz = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wt3 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
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
  const FOOT = 54;

  const logo = await loadLogo();
  let ld = null;
  if (logo) { try { const p = doc.getImageProperties(logo); ld = { w: p.width, h: p.height }; } catch { ld = null; } }

  // ── Header: logo ──
  let y = 38;
  if (logo && ld) {
    const lw = 180, lh = Math.min(60, lw * ld.h / ld.w);
    try { doc.addImage(logo, 'PNG', M, y, lw, lh); } catch { /* ignore */ }
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK);
    doc.text('TESCO', M, y + 16);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
    doc.text('S T R U C T U R E S', M, y + 30);
  }

  // ── Title with green rules ──
  let ty = y + 84;
  doc.setDrawColor(...GREEN).setLineWidth(1.3).line(M, ty - 20, W - M, ty - 20);
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...INK);
  doc.text('PURCHASE ORDER', W / 2, ty, { align: 'center' });
  doc.setDrawColor(...GREEN).setLineWidth(1.3).line(M, ty + 9, W - M, ty + 9);
  y = ty + 24;

  // ── Meta ──
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

  let ly = bodyTop;
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text(String((data.vendor && (data.vendor.name || data.vendorName)) || '—'), M, ly); ly += 14;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  const supLines = [
    data.vendor && data.vendor.address,
    data.vendor && data.vendor.contact && ('Contact: ' + data.vendor.contact),
    data.vendor && [data.vendor.mobile && ('Ph: ' + data.vendor.mobile), data.vendor.email].filter(Boolean).join('  |  '),
    data.vendor && data.vendor.gst && ('GSTIN: ' + data.vendor.gst),
  ].filter(Boolean);
  supLines.forEach((t) => { const w = doc.splitTextToSize(String(t), leftW); doc.text(w, M, ly); ly += 12 * w.length; });

  let ry = bodyTop;
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text(COMPANY.name, colR, ry); ry += 14;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  [...COMPANY.addr, COMPANY.attn, COMPANY.phEmail].forEach((t) => { const w = doc.splitTextToSize(String(t), rightW); doc.text(w, colR, ry); ry += 12 * w.length; });

  y = Math.max(ly, ry) + 7;

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
  const items = data.items || [];
  const totWeight = items.reduce((s, it) => s + nz(it.weight), 0);
  const cols = [
    { w: 26,  align: 'center', title: 'S.No' },
    { w: CW - 26 - 42 - 46 - 66 - 76 - 84, align: 'left', title: 'Description' },
    { w: 42,  align: 'center', title: 'Make' },
    { w: 46,  align: 'center', title: 'Qty (Nos)' },
    { w: 66,  align: 'right',  title: 'Approx. Wt (MT)' },
    { w: 76,  align: 'right',  title: 'Rate / MT (Rs.)' },
    { w: 84,  align: 'right',  title: 'Amount (Rs.)' },
  ];
  const xOf = (i) => M + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const cell = (i, text, top, align) => {
    const c = cols[i]; const a = align || c.align; const x0 = xOf(i);
    const tx = a === 'right' ? x0 + c.w - 5 : a === 'center' ? x0 + c.w / 2 : x0 + 5;
    doc.text(text, tx, top, { align: a, baseline: 'top' });
  };
  const lineH = 11;
  const descW = cols[1].w - 10;

  const drawHead = (top) => {
    doc.setFillColor(...CHAR); doc.rect(M, top, CW, 22, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(255, 255, 255);
    cols.forEach((c, i) => cell(i, c.title, top + 7));
    return top + 22;
  };

  y = drawHead(y);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  items.forEach((it, idx) => {
    const matLines = doc.splitTextToSize(String(it.material || '-'), descW);
    const specLines = it.spec ? doc.splitTextToSize('Spec: ' + it.spec, descW) : [];
    const descLines = it.description ? doc.splitTextToSize(String(it.description), descW) : [];
    const rowH = Math.max((matLines.length + specLines.length + descLines.length) * lineH + 8, 24);

    if (y + rowH > H - FOOT - 12) { doc.addPage(); y = drawHead(50); doc.setFont('helvetica', 'normal').setFontSize(9); }

    doc.setDrawColor(...LINE).setLineWidth(0.5); doc.rect(M, y, CW, rowH);
    cols.forEach((c, i) => { if (i > 0) doc.line(xOf(i), y, xOf(i), y + rowH); });

    const top = y + 5;
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    cell(0, String(idx + 1), top);
    cell(2, it.make ? String(it.make) : '', top);
    cell(3, qn(it.qty), top);
    cell(4, nz(it.weight) ? wt3(it.weight) : '', top);
    cell(5, money2(it.rate), top);
    cell(6, money2(it.amount), top);

    let dy = top;
    doc.setFont('helvetica', 'bold').setTextColor(...INK);
    matLines.forEach((l) => { doc.text(l, xOf(1) + 5, dy, { baseline: 'top' }); dy += lineH; });
    doc.setFont('helvetica', 'normal').setTextColor(...MUTE);
    [...specLines, ...descLines].forEach((l) => { doc.text(l, xOf(1) + 5, dy, { baseline: 'top' }); dy += lineH; });

    y += rowH;
  });

  // ── Totals (continue the grid) ──
  const T = data.totals || {};
  const gstPct = T.gstPct || 18;
  const gstVal = T.gst != null ? T.gst : (nz(T.cgst) + nz(T.sgst));
  const ap = totWeight > 0 ? ' (approx.)' : '';
  const totRows = [['Sub Total' + ap, money2(T.sub)]];
  if (T.loading) totRows.push(['Loading Charges', money2(T.loading)]);
  if (T.transport) totRows.push(['Transport Charge', money2(T.transport)]);
  totRows.push([`GST @ ${gstPct}%`, money2(gstVal)]);
  if (Math.abs(nz(T.roundOff)) >= 0.005) totRows.push(['Round Off', (T.roundOff >= 0 ? '' : '-') + money2(Math.abs(T.roundOff))]);

  const notesEnd = xOf(2);
  const xAmt = xOf(6);
  const rowTH = 17, netH = 20;
  const totalH = totRows.length * rowTH + netH;
  if (y + totalH > H - FOOT - 10) { doc.addPage(); y = 50; }

  // left weight notes
  doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...MUTE);
  const noteLines = totWeight > 0
    ? ['Total approx. weight: ' + wt3(totWeight) + ' MT', '(standard 6 m length; final billing', 'on actual weighment)']
    : ['All rates and taxes are as per the agreed quotation.', 'Final billing as applicable.'];
  noteLines.forEach((t, i) => doc.text(t, M, y + 12 + i * 12));

  let ry2 = y;
  doc.setFontSize(9.5);
  totRows.forEach(([k, v]) => {
    doc.setDrawColor(...LINE).setLineWidth(0.5);
    doc.rect(notesEnd, ry2, xAmt - notesEnd, rowTH);
    doc.rect(xAmt, ry2, W - M - xAmt, rowTH);
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    doc.text(k, xAmt - 8, ry2 + 12, { align: 'right' });
    doc.text(v, W - M - 6, ry2 + 12, { align: 'right' });
    ry2 += rowTH;
  });
  doc.setFillColor(...GREENL);
  doc.rect(notesEnd, ry2, W - M - notesEnd, netH, 'F');
  doc.setDrawColor(...GREEN).setLineWidth(0.8);
  doc.rect(notesEnd, ry2, xAmt - notesEnd, netH);
  doc.rect(xAmt, ry2, W - M - xAmt, netH);
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text('NET PAYABLE' + ap, xAmt - 8, ry2 + 15, { align: 'right' });
  doc.text(money2(T.grand), W - M - 6, ry2 + 15, { align: 'right' });
  y = ry2 + netH + 16;

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

  // ── Terms ──
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
      doc.setFont('helvetica', 'bold').setTextColor(...INK);
      doc.text(lead, M, y);
      const leadW = doc.getTextWidth(lead);
      doc.setFont('helvetica', 'normal');
      doc.text(' ' + (wrapped[0] || ''), M + leadW, y);
      for (let k = 1; k < wrapped.length; k++) { y += 11; doc.text(wrapped[k], M + indent, y); }
      y += 13;
    });
  }

  // ── Signatory ──
  if (y > H - FOOT - 60) { doc.addPage(); y = 50; }
  y += 2;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
  doc.text('For ' + COMPANY.name, W - M, y, { align: 'right' });
  y += 30;
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK);
  doc.text('Authorised Signatory', W - M, y, { align: 'right' });

  // ── Footer ──
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

  doc.save(`${String(data.po || 'purchase-order').replace(/[^\w.-]+/g, '_')}.pdf`);
}
