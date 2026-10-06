// Payment receipt / slip PDF for one purchase payment — jsPDF only (dynamic import).
// Built-in fonts lack the ₹ glyph, so money prints as "Rs." (the UI still shows ₹).
import { amountInWords } from './procurement';

const INK = [17, 24, 39], MUTE = [107, 114, 128], LINE = [219, 227, 239], ACCENT = [29, 78, 216], SOFT = [219, 234, 254], BAD = [161, 43, 32];
const rs = (n) => 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-IN');

async function loadLogo() {
  try {
    const r = await fetch('/logo.png');
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch { return null; }
}

export async function downloadPaymentSlip(data) {
  const mod = await import('jspdf');
  const jsPDF = mod.jsPDF || mod.default;
  if (!jsPDF) throw new Error('PDF engine failed to load.');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44, CW = W - 2 * M;
  const logo = await loadLogo();
  let logoDims = null;
  if (logo) { try { const p = doc.getImageProperties(logo); logoDims = { w: p.width, h: p.height }; } catch { logoDims = null; } }

  let y = 46;
  const LOGO_W = 162;
  let logoH = 0;
  if (logo && logoDims) {
    logoH = Math.min(58, LOGO_W * logoDims.h / logoDims.w);
    try { doc.addImage(logo, 'PNG', M, y, LOGO_W, logoH); } catch { /* ignore */ }
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTE);
    doc.text('Procurement Portal', M + 2, y + logoH + 12);
  } else {
    doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(16);
    doc.text('Tesco Structures', M, y + 16);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
    doc.text('Procurement Portal', M, y + 30);
    logoH = 24;
  }
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...ACCENT);
  doc.text('PAYMENT RECEIPT', W - M, y + 18, { align: 'right' });
  doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...INK);
  doc.text(String(data.id || ''), W - M, y + 36, { align: 'right' });
  y += Math.max(logoH + 20, 56);
  doc.setDrawColor(...ACCENT).setLineWidth(1.4).line(M, y, W - M, y); y += 24;

  const col2 = M + CW * 0.52;
  const field = (label, val, x, yy) => {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFont('helvetica', 'normal').setFontSize(10.5).setTextColor(...INK);
    doc.text(String(val || '—'), x, yy + 14);
  };
  field('Vendor', data.vendorName, M, y); field('Purchase Order', data.po, col2, y); y += 36;
  field('Payment Date', data.dateFmt, M, y); field('Payment Method', data.method, col2, y); y += 36;
  field('Reference / Txn No', data.refNo, M, y); field('Payment Due', data.dueFmt, col2, y); y += 44;

  doc.setFillColor(...SOFT).roundedRect(M, y, CW, 60, 8, 8, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...MUTE);
  doc.text('AMOUNT PAID', M + 16, y + 22);
  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...ACCENT);
  doc.text(rs(data.amount), M + 16, y + 48);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK);
  doc.text(amountInWords(data.amount), W - M - 16, y + 48, { align: 'right' });
  y += 60 + 24;

  const rows = [
    ['Total PO Amount', rs(data.poAmount), false],
    ['Paid to date', rs(data.paidToDate), false],
    ['Remaining Balance', rs(data.balance), Number(data.balance) > 0],
    ['Payment Status', String(data.status || '—'), false, true],
  ];
  rows.forEach((r, i) => {
    const ry = y + i * 24;
    doc.setFont('helvetica', r[3] ? 'bold' : 'normal').setFontSize(10.5).setTextColor(...(r[2] ? BAD : INK));
    doc.text(r[0], M, ry); doc.text(String(r[1]), W - M, ry, { align: 'right' });
    doc.setDrawColor(...LINE).setLineWidth(0.5).line(M, ry + 7, W - M, ry + 7);
  });
  y += rows.length * 24 + 22;

  if (data.remarks) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE); doc.text('REMARKS', M, y); y += 14;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK);
    const rl = doc.splitTextToSize(String(data.remarks), CW); doc.text(rl, M, y); y += 12 * rl.length + 10;
  }

  const sy = Math.max(y + 20, H - 110);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK);
  doc.text(String(data.authorizedBy || 'Tesco Structures'), W - M, sy, { align: 'right' });
  doc.setDrawColor(...LINE).setLineWidth(1).line(W - M - 170, sy + 10, W - M, sy + 10);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  doc.text('Authorized Signatory', W - M, sy + 24, { align: 'right' });
  doc.setFontSize(8).setTextColor(...MUTE);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}  ·  Tesco Structures Procurement`, M, H - 30);

  doc.save(`Payment-${data.id || data.po}.pdf`);
}
