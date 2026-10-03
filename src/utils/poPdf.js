// Professional Purchase Order PDF built from the REAL data of the clicked PO.
// jsPDF + autotable are imported dynamically so they only load when the user
// actually downloads a PDF (keeps the main app bundle small).
//
// Note: the built-in PDF fonts don't carry the ₹ glyph, so money is printed as
// "Rs." in the PDF (the on-screen UI still uses ₹).

const TEAL = [15, 118, 110];     // --accent-ink
const INK = [17, 24, 39];
const MUTE = [107, 114, 128];
const LINE = [226, 232, 240];

const rs = (n) => 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-IN');
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
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;                 // page margin
  let y = 44;

  const logo = await loadLogo();
  if (logo) { try { doc.addImage(logo, 'PNG', M, y - 6, 34, 34); } catch { /* ignore bad image */ } }

  // ── Company header ──
  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(16);
  doc.text('Tesco Structures', logo ? M + 44 : M, y + 8);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  doc.text('Procurement Portal', logo ? M + 44 : M, y + 22);

  // Title (right)
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...TEAL);
  doc.text('PURCHASE ORDER', W - M, y + 6, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK);
  doc.text(String(data.po || ''), W - M, y + 24, { align: 'right' });

  y += 48;
  doc.setDrawColor(...LINE).setLineWidth(1).line(M, y, W - M, y);
  y += 20;

  // ── Meta + Supplier (two columns) ──
  const colR = W / 2 + 10;
  const label = (t, x, yy) => { doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE); doc.text(t.toUpperCase(), x, yy); };
  const val = (t, x, yy) => { doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK); doc.text(String(t || '—'), x, yy); };

  label('Supplier', M, y);
  let ly = y + 15;
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
  doc.text(String(data.vendor?.name || '—'), M, ly); ly += 14;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  const vlines = [
    data.vendor?.vid,
    data.vendor?.contact && `Contact: ${data.vendor.contact}`,
    data.vendor?.mobile && `Mobile: ${data.vendor.mobile}`,
    data.vendor?.email,
    data.vendor?.address,
    data.vendor?.gst && `GSTIN: ${data.vendor.gst}`,
  ].filter(Boolean);
  for (const t of vlines) { const wrapped = doc.splitTextToSize(String(t), colR - M - 20); doc.text(wrapped, M, ly); ly += 12 * wrapped.length; }

  // Right column meta
  let ry = y;
  const metaRow = (k, v) => { label(k, colR, ry); doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK); doc.text(String(v || '—'), W - M, ry, { align: 'right' }); ry += 18; };
  metaRow('PO Date', data.poDateFmt);
  metaRow('Delivery Date', data.deliveryDateFmt);
  metaRow('Delivery Status', data.delivery + (data.overdueDays > 0 ? ` (${data.overdueDays}d overdue)` : ''));
  metaRow('Delivery Progress', data.delPct + '%');
  metaRow('Payment Status', data.payment);

  y = Math.max(ly, ry) + 12;

  // ── Items table ──
  const body = data.items.map((it, i) => [
    i + 1,
    [it.material, it.spec && `Spec: ${it.spec}`, it.description].filter(Boolean).join('\n'),
    it.hsn || '-',
    qn(it.qty),
    it.unit || '',
    rs(it.rate),
    rs(it.amount),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description of goods', 'HSN/SAC', 'Qty', 'Per', 'Rate', 'Amount']],
    body,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.5, valign: 'top' },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 24 },
      2: { halign: 'center', cellWidth: 58 },
      3: { halign: 'right', cellWidth: 52 },
      4: { halign: 'center', cellWidth: 36 },
      5: { halign: 'right', cellWidth: 70 },
      6: { halign: 'right', cellWidth: 78 },
    },
  });

  let ty = doc.lastAutoTable.finalY + 16;

  // ── Totals (right aligned block) ──
  const tx0 = W / 2 + 20;
  const totRow = (k, v, bold) => {
    if (ty > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); ty = 50; }
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 10);
    doc.setTextColor(...(bold ? TEAL : INK));
    doc.text(k, tx0, ty);
    doc.text(v, W - M, ty, { align: 'right' });
    ty += bold ? 20 : 16;
  };
  totRow('Sub Total', rs(data.totals.sub));
  if (data.totals.loading) totRow('Loading Charges', rs(data.totals.loading));
  if (data.totals.transport) totRow('Transport Charge', rs(data.totals.transport));
  totRow('Taxable Value', rs(data.totals.taxable));
  totRow(`CGST @ ${data.totals.gstPct / 2}%`, rs(data.totals.cgst));
  totRow(`SGST @ ${data.totals.gstPct / 2}%`, rs(data.totals.sgst));
  if (Math.abs(data.totals.roundOff) >= 0.005) totRow('Round Off', (data.totals.roundOff >= 0 ? '+ ' : '- ') + rs(Math.abs(data.totals.roundOff)));
  doc.setDrawColor(...LINE).line(tx0, ty - 6, W - M, ty - 6);
  totRow('Grand Total', rs(data.totals.grand), true);

  // Amount in words (left)
  doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...MUTE);
  const words = doc.splitTextToSize('Amount in words: ' + data.amountWords, W / 2 - M);
  doc.text(words, M, doc.lastAutoTable.finalY + 20);

  // ── Notes / remarks ──
  let ny = Math.max(ty, doc.lastAutoTable.finalY + 20 + words.length * 12) + 14;
  if (ny > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); ny = 50; }
  if (data.notes && data.notes.length) {
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...MUTE);
    doc.text('NOTES / REMARKS', M, ny); ny += 14;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
    const nn = doc.splitTextToSize(data.notes.join('  •  '), W - 2 * M);
    doc.text(nn, M, ny); ny += nn.length * 12 + 8;
  }

  // ── Footer on every page ──
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LINE).line(M, h - 40, W - M, h - 40);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTE);
    doc.text(`Generated ${new Date().toLocaleString('en-IN')}  ·  Tesco Structures Procurement`, M, h - 26);
    doc.text(`Page ${p} of ${pages}`, W - M, h - 26, { align: 'right' });
  }

  doc.save(`${String(data.po || 'purchase-order').replace(/[^\w.-]+/g, '_')}.pdf`);
}
