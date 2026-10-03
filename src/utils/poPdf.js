// Professional Purchase Order PDF built from the REAL data of the clicked PO.
// Uses ONLY jsPDF (no autotable plugin) so there is no ESM-interop fragility —
// the item table is drawn manually. jsPDF is imported dynamically so it only
// loads when the user actually downloads a PDF.
//
// Note: the built-in PDF fonts don't carry the ₹ glyph, so money is printed as
// "Rs." in the PDF (the on-screen UI still uses ₹).

const TEAL = [29, 78, 216];   // CRM blue accent (name kept for minimal churn)
const INK = [17, 24, 39];
const MUTE = [107, 114, 128];
const LINE = [219, 227, 239];
const SOFT = [219, 234, 254];

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
  const mod = await import('jspdf');
  const jsPDF = mod.jsPDF || mod.default;
  if (!jsPDF) throw new Error('PDF engine failed to load.');

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const CW = W - 2 * M;

  const logo = await loadLogo();

  // ── Header ──
  let y = 46;
  if (logo) { try { doc.addImage(logo, 'PNG', M, y - 8, 34, 34); } catch { /* ignore */ } }
  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(16);
  doc.text('Tesco Structures', logo ? M + 44 : M, y + 6);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  doc.text('Procurement Portal', logo ? M + 44 : M, y + 20);

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...TEAL);
  doc.text('PURCHASE ORDER', W - M, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
  doc.text(String(data.po || ''), W - M, y + 22, { align: 'right' });

  y += 42;
  doc.setDrawColor(...LINE).setLineWidth(1).line(M, y, W - M, y);
  y += 22;

  // ── Supplier (left) + meta (right) ──
  const midX = M + CW * 0.52;
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
  doc.text('SUPPLIER', M, y);
  let ly = y + 15;
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
  doc.text(String(data.vendor?.name || '—'), M, ly); ly += 14;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTE);
  [
    data.vendor?.vid,
    data.vendor?.contact && `Contact: ${data.vendor.contact}`,
    data.vendor?.mobile && `Mobile: ${data.vendor.mobile}`,
    data.vendor?.email,
    data.vendor?.address,
    data.vendor?.gst && `GSTIN: ${data.vendor.gst}`,
  ].filter(Boolean).forEach((t) => {
    const wrapped = doc.splitTextToSize(String(t), midX - M - 16);
    doc.text(wrapped, M, ly); ly += 12 * wrapped.length;
  });

  let ry = y;
  const metaRow = (k, v) => {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
    doc.text(k.toUpperCase(), midX, ry);
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK);
    doc.text(String(v || '—'), W - M, ry, { align: 'right' });
    ry += 17;
  };
  metaRow('PO Date', data.poDateFmt);
  metaRow('Delivery Date', data.deliveryDateFmt);
  metaRow('Project', data.project);
  metaRow('Delivery', data.delivery + (data.overdueDays > 0 ? ` (${data.overdueDays}d overdue)` : '') + ` · ${data.delPct}%`);
  metaRow('Payment', data.payment);
  if (data.paymentMethod) metaRow('Payment Method', data.paymentMethod);

  y = Math.max(ly, ry) + 10;

  // ── Item table (manual) ──
  const cols = [
    { k: 'sno', w: 24, align: 'center', title: '#' },
    { k: 'desc', w: CW - 24 - 52 - 48 - 34 - 70 - 82, align: 'left', title: 'Description of goods' },
    { k: 'hsn', w: 52, align: 'center', title: 'HSN' },
    { k: 'qty', w: 48, align: 'right', title: 'Qty' },
    { k: 'per', w: 34, align: 'center', title: 'Per' },
    { k: 'rate', w: 70, align: 'right', title: 'Rate' },
    { k: 'amt', w: 82, align: 'right', title: 'Amount' },
  ];
  const xOf = (i) => M + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const cellText = (c, i, text, top, rowH) => {
    const x0 = xOf(i);
    const tx = c.align === 'right' ? x0 + c.w - 5 : c.align === 'center' ? x0 + c.w / 2 : x0 + 5;
    doc.text(text, tx, top, { align: c.align, baseline: 'top' });
  };
  const lineH = 11;
  const descW = cols[1].w - 10;

  const drawHeader = (top) => {
    doc.setFillColor(...TEAL);
    doc.rect(M, top, CW, 20, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(255, 255, 255);
    cols.forEach((c, i) => cellText(c, i, c.title, top + 6, 20));
    return top + 20;
  };

  y = drawHeader(y);

  doc.setFont('helvetica', 'normal').setFontSize(9);
  data.items.forEach((it, idx) => {
    const matLines = doc.splitTextToSize(String(it.material || '-'), descW);
    const specLines = it.spec ? doc.splitTextToSize('Spec: ' + it.spec, descW) : [];
    const descLines = it.description ? doc.splitTextToSize(String(it.description), descW) : [];
    const total = matLines.length + specLines.length + descLines.length;
    const rowH = Math.max(total * lineH + 9, 24);

    if (y + rowH > H - 60) { doc.addPage(); y = drawHeader(46); doc.setFont('helvetica', 'normal').setFontSize(9); }

    // zebra
    if (idx % 2 === 1) { doc.setFillColor(...SOFT); doc.rect(M, y, CW, rowH, 'F'); }
    // borders
    doc.setDrawColor(...LINE).setLineWidth(0.5);
    doc.rect(M, y, CW, rowH);
    cols.forEach((c, i) => { if (i > 0) { const x = xOf(i); doc.line(x, y, x, y + rowH); } });

    const top = y + 5;
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    cellText(cols[0], 0, String(idx + 1), top);
    cellText(cols[2], 2, String(it.hsn || '-'), top);
    cellText(cols[3], 3, qn(it.qty), top);
    cellText(cols[4], 4, String(it.unit || ''), top);
    cellText(cols[5], 5, rs(it.rate), top);
    cellText(cols[6], 6, rs(it.amount), top);

    // description block (material bold, then spec/desc muted)
    let dy = top;
    doc.setFont('helvetica', 'bold').setTextColor(...INK);
    matLines.forEach((l) => { doc.text(l, xOf(1) + 5, dy, { baseline: 'top' }); dy += lineH; });
    doc.setFont('helvetica', 'normal').setTextColor(...MUTE);
    [...specLines, ...descLines].forEach((l) => { doc.text(l, xOf(1) + 5, dy, { baseline: 'top' }); dy += lineH; });

    y += rowH;
  });

  // ── Table totals row ──
  const totQty = data.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  const totAmt = data.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const tUnits = [...new Set(data.items.map(it => it.unit).filter(Boolean))];
  const tUnit = tUnits.length === 1 ? tUnits[0] : '';
  const fh = 22;
  if (y + fh > H - 60) { doc.addPage(); y = drawHeader(46); }
  doc.setFillColor(235, 242, 241);
  doc.rect(M, y, CW, fh, 'F');
  doc.setDrawColor(...LINE).setLineWidth(0.8);
  doc.rect(M, y, CW, fh);
  cols.forEach((c, i) => { if (i > 0) { const x = xOf(i); doc.line(x, y, x, y + fh); } });
  doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...INK);
  cellText(cols[1], 1, `Total (${data.items.length} item${data.items.length > 1 ? 's' : ''})`, y + 6);
  cellText(cols[3], 3, qn(totQty), y + 6);
  if (tUnit) cellText(cols[4], 4, tUnit, y + 6);
  cellText(cols[6], 6, rs(totAmt), y + 6);
  y += fh;

  y += 20;

  // ── Totals (boxed panel, right) + amount in words (left) ──
  const T = data.totals;
  const rows = [['Sub Total', rs(T.sub)]];
  if (T.loading) rows.push(['Loading Charges', rs(T.loading)]);
  if (T.transport) rows.push(['Transport Charge', rs(T.transport)]);
  rows.push(['Taxable Value', rs(T.taxable)]);
  rows.push([`CGST @ ${T.gstPct / 2}%`, rs(T.cgst)]);
  rows.push([`SGST @ ${T.gstPct / 2}%`, rs(T.sgst)]);
  if (Math.abs(T.roundOff) >= 0.5) rows.push(['Round Off', (T.roundOff >= 0 ? '+ ' : '- ') + rs(Math.abs(T.roundOff))]);

  const boxW = 250, boxX = W - M - boxW, pad = 12, rowH2 = 17, grandH = 30;
  const boxH = pad + rows.length * rowH2 + grandH;
  if (y + boxH > H - 70) { doc.addPage(); y = 50; }
  const boxTop = y;

  doc.setDrawColor(...LINE).setLineWidth(1);
  doc.roundedRect(boxX, boxTop, boxW, boxH, 5, 5, 'S');

  let ty = boxTop + pad + 4;
  doc.setFontSize(10);
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal').setTextColor(...MUTE);
    doc.text(k, boxX + 12, ty);
    doc.setFont('helvetica', 'normal').setTextColor(...INK);
    doc.text(v, boxX + boxW - 12, ty, { align: 'right' });
    ty += rowH2;
  });
  // Grand total band
  const gTop = boxTop + boxH - grandH;
  doc.setFillColor(...SOFT);
  doc.rect(boxX + 0.5, gTop, boxW - 1, grandH - 0.5, 'F');
  doc.setDrawColor(...LINE).line(boxX, gTop, boxX + boxW, gTop);
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...TEAL);
  doc.text('Grand Total', boxX + 12, gTop + 19);
  doc.text(rs(T.grand), boxX + boxW - 12, gTop + 19, { align: 'right' });

  // Amount in words (left, aligned with box top)
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
  doc.text('AMOUNT IN WORDS', M, boxTop + 10);
  doc.setFont('helvetica', 'italic').setFontSize(9.5).setTextColor(...INK);
  const words = doc.splitTextToSize(data.amountWords, boxX - M - 20);
  doc.text(words, M, boxTop + 26);

  y = boxTop + boxH + 20;

  // ── Terms & conditions ──
  if (data.terms) {
    if (y > H - 90) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
    doc.text('TERMS & CONDITIONS', M, y); y += 14;
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK);
    // Normalise: drop tabs, collapse runs of spaces, keep real line breaks —
    // otherwise the viewer's tab/space layout renders as big uneven gaps.
    const tLines = String(data.terms).replace(/\t/g, ' ').split(/\r?\n/)
      .flatMap(p => { const c = p.replace(/ {2,}/g, ' ').trim(); return c ? doc.splitTextToSize(c, CW) : ['']; });
    tLines.forEach(l => { if (y > H - 55) { doc.addPage(); y = 50; } doc.text(l, M, y); y += 13; });
    y += 10;
  }

  // ── Invoice ──
  if (data.invoiceUrl) {
    if (y > H - 70) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
    doc.text('INVOICE', M, y); y += 13;
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK);
    doc.text(`${data.invoiceName || 'Invoice.pdf'} — attached`, M, y); y += 13;
    doc.setFont('helvetica', 'bold').setTextColor(...TEAL);
    doc.textWithLink('View / download invoice', M, y, { url: data.invoiceUrl }); y += 16;
  }

  // ── Notes ──
  if (data.notes && data.notes.length) {
    if (y > H - 80) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...MUTE);
    doc.text('NOTES / REMARKS', M, y); y += 14;
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK);
    const nn = doc.splitTextToSize(data.notes.join('  •  '), CW);
    doc.text(nn, M, y);
  }

  // ── Footer ──
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE).setLineWidth(0.5).line(M, H - 40, W - M, H - 40);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTE);
    doc.text(`Generated ${new Date().toLocaleString('en-IN')}  ·  Tesco Structures Procurement`, M, H - 26);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 26, { align: 'right' });
  }

  doc.save(`${String(data.po || 'purchase-order').replace(/[^\w.-]+/g, '_')}.pdf`);
}
