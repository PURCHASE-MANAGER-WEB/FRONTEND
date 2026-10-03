// Procurement calculations — ported from the Purchase Register reference.
// All derived values (totals, pending, outstanding, status, progress) are computed
// here from the raw records, so nothing on the dashboard is hard-coded.

export const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
export const inr = (n) => '₹' + Math.round(num(n)).toLocaleString('en-IN');
export const qfmt = (n) => num(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const dfmt = (s) => { if (!s) return '—'; const [y,m,d] = String(s).split('-'); return `${d}-${MON[+m-1]}-${y}`; };
export const today = () => { const t = new Date(); return new Date(t.getTime() - t.getTimezoneOffset()*60000).toISOString().slice(0,10); };

export const UNITS = ['MT','Kg','Nos','Sq.ft','Sq.m','Rft','Mtr','Ltr','Bag','Set','Lot'];
export const TERMS = ['Advance','7 Days','15 Days','30 Days','45 Days','60 Days'];
export const VENDOR_STATUS = ['Active','Inactive','Blocked'];

// Whole-day difference (a − b) between two YYYY-MM-DD date strings.
// Built on Date.UTC from the parsed parts, so it is immune to local-timezone
// / DST drift (comparing date-only values, never wall-clock instants).
export function daysDiff(aStr, bStr) {
  if (!aStr || !bStr) return 0;
  const [ay, am, ad] = String(aStr).split('-').map(Number);
  const [by, bm, bd] = String(bStr).split('-').map(Number);
  if (!ay || !by) return 0;
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

// One PO line's derived figures.
//  • Delivery/payment PROGRESS is received/paid vs ordered/value — the real
//    source of truth. Nothing received ⇒ 0% (honest, never hard-coded).
//  • The expected / due DATE vs today drives the Overdue · Due-today state and
//    the overdue-day count. Dates are plain YYYY-MM-DD, compared as strings
//    (chronological == lexicographic) and differenced with daysDiff — no UTC bug.
export function calcLine(l) {
  const qty = num(l.qty), rate = num(l.rate), rec = num(l.received), paid = num(l.paid);
  const total = qty * rate, pending = Math.max(qty - rec, 0), out = total - paid;
  const t = today();

  // Delivery
  const delPct = qty > 0 ? Math.min(100, Math.max(0, Math.round(rec / qty * 100))) : 0;
  const delivered = qty > 0 && rec >= qty;
  const delOverdueDays = (!delivered && l.expDate && l.expDate < t) ? daysDiff(t, l.expDate) : 0;
  const delDueToday = !delivered && !!l.expDate && l.expDate === t;
  const delivery = delivered ? 'Completed'
    : delOverdueDays > 0 ? 'Overdue'
    : delDueToday ? 'Due today'
    : rec > 0 ? 'Partial'
    : 'Pending';

  // Payment
  const payPct = total > 0 ? Math.min(100, Math.max(0, Math.round(paid / total * 100))) : 0;
  const settled = total > 0 && out <= 0;
  const payOverdueDays = (!settled && l.dueDate && l.dueDate < t) ? daysDiff(t, l.dueDate) : 0;
  const payDueToday = !settled && !!l.dueDate && l.dueDate === t;
  const payment = settled ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';

  // Back-compat flags (older callers used lateDel / latePay).
  const lateDel = delOverdueDays > 0;
  const latePay = payOverdueDays > 0;

  return { total, pending, out, delivery, payment, delPct, payPct, delivered, settled,
    delOverdueDays, delDueToday, payOverdueDays, payDueToday, lateDel, latePay };
}

export const vendorName = (vendors, vid) => (vendors.find(v => v.vid === vid) || {}).name || 'Unknown vendor';

// Roll PO lines up into one row per PO number.
export function groupPOs(lines) {
  const map = new Map();
  for (const l of lines) {
    const c = calcLine(l);
    const g = map.get(l.po) || { po: l.po, vid: l.vid, project: l.project, date: l.poDate, value: 0, paid: 0, out: 0, qty: 0, rec: 0, pend: 0, units: new Set(), delOverdue: 0, payOverdue: 0, dueToday: false, payDueToday: false };
    g.value += c.total; g.paid += num(l.paid); g.out += c.out;
    g.qty += num(l.qty); g.rec += Math.min(num(l.received), num(l.qty)); g.pend += c.pending; g.units.add(l.unit);
    g.delOverdue = Math.max(g.delOverdue, c.delOverdueDays);
    g.payOverdue = Math.max(g.payOverdue, c.payOverdueDays);
    g.dueToday = g.dueToday || c.delDueToday;
    g.payDueToday = g.payDueToday || c.payDueToday;
    map.set(l.po, g);
  }
  return [...map.values()].map(g => {
    g.unit = g.units.size === 1 ? [...g.units][0] : 'mixed units';
    const delivered = g.qty > 0 && g.rec >= g.qty;
    const settled = g.value > 0 && g.out <= 0;
    g.delPct = g.qty ? Math.min(100, Math.max(0, Math.round(g.rec / g.qty * 100))) : 0;
    g.payPct = g.value ? Math.min(100, Math.max(0, Math.round(g.paid / g.value * 100))) : 0;
    g.overdueDays = delivered ? 0 : g.delOverdue;       // only while not yet delivered
    g.payOverdueDays = settled ? 0 : g.payOverdue;
    g.delivery = delivered ? 'Completed'
      : g.overdueDays > 0 ? 'Overdue'
      : (g.dueToday && g.rec < g.qty) ? 'Due today'
      : g.rec > 0 ? 'Partial'
      : 'Pending';
    g.payment = settled ? 'Paid' : g.paid > 0 ? 'Partial' : 'Unpaid';
    return g;
  }).sort((a,b) => String(a.po).localeCompare(String(b.po), undefined, { numeric: true }));
}

// Portfolio KPIs across all lines.
export function kpis(lines) {
  let value = 0, paid = 0, out = 0, pend = 0, over = 0;
  for (const l of lines) {
    const c = calcLine(l);
    value += c.total; paid += num(l.paid); out += c.out;
    if (c.pending > 0) pend++;
    if (c.delOverdueDays > 0 || c.payOverdueDays > 0) over++;
  }
  return { value, paid, out, pend, over };
}

// ── PO document totals ──────────────────────────────────────────────
// Invoice-style roll-up for one PO: sub total of its item lines, plus
// loading & transport charges, GST (split into CGST/SGST halves like the
// tax invoice), a round-off to the nearest rupee, and the grand total.
// gstPct defaults to 18 (CGST 9% + SGST 9%) and is editable per PO.
export function calcPO({ sub = 0, loading = 0, transport = 0, gstPct = 18 } = {}) {
  sub = num(sub); loading = num(loading); transport = num(transport);
  const rate = (gstPct === '' || gstPct === null || gstPct === undefined) ? 18 : num(gstPct);
  const taxable = sub + loading + transport;
  const gst = taxable * rate / 100;
  const cgst = gst / 2, sgst = gst / 2;
  const pre = taxable + gst;
  const grand = Math.round(pre);
  const roundOff = grand - pre;          // + or − a few paise, rounded to ₹1
  return { sub, loading, transport, taxable, gstPct: rate, gst, cgst, sgst, roundOff, grand };
}

// Pull a PO's shared charge fields off any one of its lines (they are stored
// identically on every line of the PO).
export const poCharges = (line = {}) => ({
  loading: num(line.loading),
  transport: num(line.transport),
  gstPct: (line.gstPct === '' || line.gstPct === null || line.gstPct === undefined) ? 18 : num(line.gstPct),
});

// Amount in words, Indian numbering (Crore / Lakh / Thousand). Integer rupees.
export function amountInWords(n) {
  n = Math.round(num(n));
  if (n <= 0) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
  const three = (x) => x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x);
  let out = '';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) out += three(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (n) out += three(n) + ' ';
  return out.trim() + ' Rupees Only';
}

export const nextVid = (vendors) => {
  const n = vendors.map(v => parseInt(String(v.vid || '').replace(/\D/g, '')) || 0);
  return 'VEN-' + String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0');
};
export const nextPo = (lines) => {
  const n = lines.map(l => parseInt(String(l.po || '').replace(/\D/g, '')) || 0);
  return 'PO-' + String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0');
};
