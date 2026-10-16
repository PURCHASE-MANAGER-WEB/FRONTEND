// Fabricator Purchase Order PDF — a LABOUR work order (Fabrication, Erection,
// Painting & Sheet Laying), matching the Tesco Structures reference template:
// logo + centered "FABRICATOR PURCHASE ORDER" with a labour-work subtitle,
// two-column meta (PO/Project · Date/Client), TO (FABRICATOR / SUBCONTRACTOR) and
// SITE CONTACT blocks, a bordered work table with a DARK header
// (S.No · Description of Work · Unit · Qty · Rate (Rs.) · Amount (Rs.)), a
// right-aligned Total + green GRAND TOTAL (no GST — fabricator labour), amount in
// words, numbered terms, "Accepted by Fabricator" / Authorised Signatory lines, and
// the three-column green footer. jsPDF only, imported dynamically.

import { formatTerms, FAB_TERMS } from './procurement';

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

const nz = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const money2 = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qn = (n) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

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

export async function downloadFabricatorPoPdf(data) {
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
    const sc = Math.min(175 / ld.w, 62 / ld.h); const lw = ld.w * sc, lh = ld.h * sc;
    try { doc.addImage(logo, 'PNG', M, y, lw, lh); } catch { /* ignore */ }
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK);
    doc.text('TESCO', M, y + 16);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
    doc.text('S T R U C T U R E S', M, y + 30);
  }

  // ── Title + subtitle with green rules ──
  let ty = y + 86;
  doc.setDrawColor(...GREEN).setLineWidth(1.3).line(M, ty - 20, W - M, ty - 20);
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...INK);
  doc.text('FABRICATOR PURCHASE ORDER', W / 2, ty, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTE);
  doc.text('(Labour Work Order – Fabrication, Erection, Painting & Sheet Laying)', W / 2, ty + 12, { align: 'center' });
  doc.setDrawColor(...GREEN).setLineWidth(1.3).line(M, ty + 21, W - M, ty + 21);
  y = ty + 36;

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
  metaRow('L', 'Project / Site', data.project);
  metaRow('R', 'Date', data.poDateFmt);
  metaRow('R', 'Client', data.client);
  y = Math.max(yL, yR) + 10;

  // ── TO (FABRICATOR) / SITE CONTACT ──
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
  doc.text('TO (FABRICATOR / SUBCONTRACTOR)', M, y);
  doc.text('SITE CONTACT', colR, y);
  const bodyTop = y + 13;
  const leftW = colR - M - 14, rightW = W - M - colR;

  const fab = data.fab || {};
  let ly = bodyTop;
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text(String(fab.name || '—'), M, ly); ly += 14;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  const fabLines = [
    fab.address,
    fab.mobile && ('Mobile: ' + fab.mobile),
  ].filter(Boolean);
  fabLines.forEach((t) => { const w = doc.splitTextToSize(String(t), leftW); doc.text(w, M, ly); ly += 12 * w.length; });

  let ry = bodyTop;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
  const siteRow = (label, val) => {
    doc.setFont('helvetica', 'bold').setTextColor(...MUTE);
    doc.text(label, colR, ry);
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    const w = doc.splitTextToSize(String(val == null || val === '' ? '—' : val), rightW - 72);
    doc.text(w, colR + 72, ry);
    ry += 12 * Math.max(w.length, 1) + 2;
  };
  siteRow('Site Engineer', data.siteEngineer);
  siteRow('Mobile', data.siteMobile);
  siteRow('Site Address', data.siteAddress);

  y = Math.max(ly, ry) + 7;

  // ── Intro ──
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
  const intro = doc.splitTextToSize('We are pleased to award you the following labour work at the above site, as per the rates and terms & conditions given below.', CW);
  doc.text(intro, M, y); y += intro.length * 12 + 8;

  // ── Work table ──
  const items = data.items || [];
  const cols = [
    { w: 28,  align: 'center', title: 'S.No' },
    { w: CW - 28 - 52 - 56 - 76 - 86, align: 'left', title: 'Description of Work' },
    { w: 52,  align: 'center', title: 'Unit' },
    { w: 56,  align: 'right',  title: 'Qty' },
    { w: 76,  align: 'right',  title: 'Rate (Rs.)' },
    { w: 86,  align: 'right',  title: 'Amount (Rs.)' },
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
  let total = 0;
  items.forEach((it, idx) => {
    const amt = nz(it.amount != null ? it.amount : nz(it.qty) * nz(it.rate));
    total += amt;
    const descLines = doc.splitTextToSize(String(it.desc || '-'), descW);
    const rowH = Math.max(descLines.length * lineH + 8, 24);

    if (y + rowH > H - FOOT - 12) { doc.addPage(); y = drawHead(50); doc.setFont('helvetica', 'normal').setFontSize(9); }

    doc.setDrawColor(...LINE).setLineWidth(0.5); doc.rect(M, y, CW, rowH);
    cols.forEach((c, i) => { if (i > 0) doc.line(xOf(i), y, xOf(i), y + rowH); });

    const top = y + 5;
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    cell(0, String(idx + 1), top);
    cell(2, it.unit ? String(it.unit) : '', top);
    cell(3, qn(it.qty), top);
    cell(4, money2(it.rate), top);
    cell(5, money2(amt), top);

    let dy = top;
    doc.setFont('helvetica', 'bold').setTextColor(...INK);
    descLines.forEach((l) => { doc.text(l, xOf(1) + 5, dy, { baseline: 'top' }); dy += lineH; });

    y += rowH;
  });

  // ── Totals (continue the grid; no GST for labour work) ──
  const grand = data.total != null ? nz(data.total) : total;
  const xRate = xOf(4);
  const rowTH = 18;
  if (y + rowTH * 2 > H - FOOT - 10) { doc.addPage(); y = 50; }

  // Total row (plain)
  doc.setDrawColor(...LINE).setLineWidth(0.5);
  doc.rect(xRate, y, xOf(5) - xRate, rowTH);
  doc.rect(xOf(5), y, W - M - xOf(5), rowTH);
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
  doc.text('Total', xOf(5) - 8, y + 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(money2(total), W - M - 6, y + 12, { align: 'right' });
  y += rowTH;

  // Grand total (green highlight)
  const netH = 20;
  doc.setFillColor(...GREENL);
  doc.rect(xRate, y, W - M - xRate, netH, 'F');
  doc.setDrawColor(...GREEN).setLineWidth(0.8);
  doc.rect(xRate, y, xOf(5) - xRate, netH);
  doc.rect(xOf(5), y, W - M - xOf(5), netH);
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text('GRAND TOTAL', xOf(5) - 8, y + 15, { align: 'right' });
  doc.text(money2(grand), W - M - 6, y + 15, { align: 'right' });
  y += netH + 16;

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
    : FAB_TERMS;
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

  // ── Signatures: Accepted by Fabricator / For Tesco Structures ──
  if (y > H - FOOT - 70) { doc.addPage(); y = 50; }
  y += 6;
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
  doc.text('Accepted by Fabricator', M, y);
  doc.text('For ' + COMPANY.name, W - M, y, { align: 'right' });
  y += 34;
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...MUTE);
  doc.text('Name, Signature & Date', M, y);
  doc.setTextColor(...INK);
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

  doc.save(`${String(data.po || 'fabricator-po').replace(/[^\w.-]+/g, '_')}.pdf`);
}
