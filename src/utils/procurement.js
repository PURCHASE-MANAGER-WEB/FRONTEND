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
export const PAYMENT_METHODS = ['UPI','Cash','Cheque','Bank Transfer','Card','Other'];

// ── Fabricator (labour) work order ──────────────────────────────────
// Default scope-of-work rows for a Fabricator Purchase Order (labour work order),
// each with the unit it is normally measured in. 'Other' lets the user type a
// custom scope. Weight work (fabrication/erection) is billed per Kg; area work
// (painting / sheet laying) per Sq.ft.
export const FAB_WORKS = [
  { desc: 'Fabrication of structural steel', unit: 'Kg' },
  { desc: 'Erection of fabricated structure', unit: 'Kg' },
  { desc: 'Painting – 1 coat primer + 2 coats enamel', unit: 'Sq.ft' },
  { desc: 'Roof / wall sheet laying with fixing', unit: 'Sq.ft' },
];

// Contract-work service categories offered by fabricators / subcontractors.
export const FAB_SERVICES = ['Civil Works', 'Painting Works', 'Structural Steel Works', 'Roofing Sheet Installation', 'Electrical Works', 'Wall Panel Works', 'Fabrication Works', 'Plumbing Works', 'Flooring & Tiling Works', 'Waterproofing Works', 'Interior & Exterior Works', 'False Ceiling Works', 'Glass & Aluminium Works'];

// Standard terms & conditions printed on a Fabricator Purchase Order. Editable per
// PO in the form; this is the default/fallback used by the form and the PDF.
export const FAB_TERMS = [
  'Scope of Tesco Structures: Supply of all structural steel, roofing sheets, paint and drawings at site/yard. Crane / hydra for erection, if required, will be arranged by us unless stated otherwise.',
  'Scope of Fabricator: Skilled labour, welding machines, cutting & grinding tools, scaffolding, ropes and all hand tools. Welding rods and grinding/cutting wheels are in the fabricator\'s scope unless stated otherwise.',
  'Workmanship: Work to be done strictly as per approved drawings and site engineer\'s instructions. Rejected or faulty work to be rectified at fabricator\'s cost.',
  'Measurement: Fabrication & erection on weight basis (kg) as per drawing / actual weighment. Painting and sheet laying on area basis (sq.ft) as per actual measurement at site.',
  'Safety: Fabricator to ensure all workers use PPE (helmet, safety belt, shoes, gloves, goggles). Fabricator is fully responsible for the safety, insurance and wages of his workers.',
  'Material Care: Fabricator is responsible for material handed over. Any loss or damage due to negligence will be deducted from the bill. Excess material / scrap to be returned to us.',
  'Completion: Work to be completed within the agreed number of days from the date of this PO. Delay without valid reason may attract deduction as decided by management.',
  'Payment: Running bills on work progress, verified by our site engineer. 5% retention released after final completion & handover. TDS deducted as applicable.',
  'Termination: Tesco Structures may cancel this PO for poor quality, slow progress or unsafe working, and pay only for work completed and verified.',
];

// Canonical materials list — shared by the Vendor form and the Purchase Order form so the
// material choices stay consistent across the portal. Edit this one list to manage them.
export const MATERIALS = ['MS Round Tube','MS Square Tube','MS Rectangular Tube','MS Plate','MS Angle','MS Channel','MS Beam','MS Flat','MS Sheet','GI Sheet','Roofing Sheet','Steel Rod / TMT','Cement','Fasteners / Bolts','Hardware & Fittings','Paint','Welding Consumables','Fabrication','Transport / Logistics','Other'];

// Purchase-order approval workflow statuses. An existing/older PO with no stored status is
// treated as 'Approved' (it is an active order).
export const PO_STATUSES = ['Draft','Pending Approval','Approved','Completed','Cancelled'];
export const poStatusOf = (v) => { const s = String(v == null ? '' : v).trim(); return PO_STATUSES.includes(s) ? s : 'Approved'; };

// Is a single PO line overdue (delivery date passed & not received, or payment
// due date passed & still owed)?
export const isLineOverdue = (l) => { const c = calcLine(l); return c.delOverdueDays > 0 || c.payOverdueDays > 0; };

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

  // Delivery — only 100% when fully received; otherwise capped at 99% so a
  // near-complete receipt never rounds up to a misleading "100%".
  const delivered = qty > 0 && rec >= qty;
  const delPct = qty > 0 ? (delivered ? 100 : Math.min(99, Math.max(0, Math.round(rec / qty * 100)))) : 0;
  const delOverdueDays = (!delivered && l.expDate && l.expDate < t) ? daysDiff(t, l.expDate) : 0;
  const delDueToday = !delivered && !!l.expDate && l.expDate === t;
  const delivery = delivered ? 'Completed'
    : delOverdueDays > 0 ? 'Overdue'
    : delDueToday ? 'Due today'
    : rec > 0 ? 'Partial'
    : 'Pending';

  // Payment — only 100% when fully settled; otherwise capped at 99% so an
  // outstanding balance (even ₹450) never shows a misleading "100% paid".
  const settled = total > 0 && out <= 0;
  const payPct = total > 0 ? (settled ? 100 : Math.min(99, Math.max(0, Math.round(paid / total * 100)))) : 0;
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
    const g = map.get(l.po) || { po: l.po, vid: l.vid, vendorName: l.vendorName || '', project: l.project, projects: (Array.isArray(l.projects) && l.projects.length) ? l.projects : (l.project ? [l.project] : []), date: l.poDate, status: l.status, poType: l.poType || '', loading: num(l.loading), transport: num(l.transport), gstPct: (l.gstPct === '' || l.gstPct === null || l.gstPct === undefined) ? 18 : num(l.gstPct), transportGst: l.transportGst !== false, value: 0, paid: 0, out: 0, qty: 0, rec: 0, pend: 0, units: new Set(), delOverdue: 0, payOverdue: 0, dueToday: false, payDueToday: false, count: 0, exps: [], dues: [] };
    g.value += c.total; g.paid += num(l.paid); g.out += c.out;
    g.qty += num(l.qty); g.rec += Math.min(num(l.received), num(l.qty)); g.pend += c.pending; g.units.add(l.unit);
    g.delOverdue = Math.max(g.delOverdue, c.delOverdueDays);
    g.payOverdue = Math.max(g.payOverdue, c.payOverdueDays);
    g.dueToday = g.dueToday || c.delDueToday;
    g.payDueToday = g.payDueToday || c.payDueToday;
    g.count += 1;
    if (l.expDate) g.exps.push(l.expDate);
    if (l.dueDate) g.dues.push(l.dueDate);
    map.set(l.po, g);
  }
  return [...map.values()].map(g => {
    g.unit = g.units.size === 1 ? [...g.units][0] : 'mixed units';
    g.expDate = g.exps.length ? g.exps.slice().sort()[0] : '';
    g.dueDate = g.dues.length ? g.dues.slice().sort()[0] : '';
    const delivered = g.qty > 0 && g.rec >= g.qty;
    const settled = g.value > 0 && g.out <= 0;
    g.delPct = g.qty ? (delivered ? 100 : Math.min(99, Math.max(0, Math.round(g.rec / g.qty * 100)))) : 0;
    g.payPct = g.value ? (settled ? 100 : Math.min(99, Math.max(0, Math.round(g.paid / g.value * 100)))) : 0;
    g.overdueDays = delivered ? 0 : g.delOverdue;       // only while not yet delivered
    g.payOverdueDays = settled ? 0 : g.payOverdue;
    g.status = poStatusOf(g.status);
    g.delivery = delivered ? 'Completed'
      : g.overdueDays > 0 ? 'Overdue'
      : (g.dueToday && g.rec < g.qty) ? 'Due today'
      : g.rec > 0 ? 'Partial'
      : 'Pending';
    g.payment = settled ? 'Paid' : g.paid > 0 ? 'Partial' : 'Unpaid';
    g.valueGst = calcPO({ sub: g.value, loading: g.loading, transport: g.transport, gstPct: g.gstPct, transportGst: g.transportGst }).grand;
    return g;
  }).sort((a,b) => String(a.po).localeCompare(String(b.po), undefined, { numeric: true }));
}

// Portfolio KPIs. Money is summed across lines; counts are per PO (grouped),
// so "Pending / Completed / Overdue POs" mean whole purchase orders, not lines.
// Everything here is derived from the real backend records — nothing hard-coded.
export function kpis(lines) {
  let value = 0, paid = 0, out = 0;
  for (const l of lines) { const c = calcLine(l); value += c.total; paid += num(l.paid); out += c.out; }

  const groups = groupPOs(lines);
  let pend = 0, completed = 0, overdueCount = 0, overdueAmount = 0, maxOverdueDays = 0;
  for (const g of groups) {
    const od = Math.max(g.overdueDays || 0, g.payOverdueDays || 0);
    if (g.delivery === 'Completed') completed++; else pend++;
    if (od > 0) { overdueCount++; overdueAmount += g.out; maxOverdueDays = Math.max(maxOverdueDays, od); }
  }
  // `over` kept for backwards compatibility (= overdue PO count).
  return { value, paid, out, pend, completed, over: overdueCount, overdueCount, overdueAmount, maxOverdueDays, poCount: groups.length };
}

// Overdue roll-up for the notification bell: count, total outstanding, and the
// list of overdue POs (PO number + worst overdue-day figure), newest first.
export function overdueStats(lines) {
  const groups = groupPOs(lines);
  const list = groups
    .map(g => ({ po: g.po, days: Math.max(g.overdueDays || 0, g.payOverdueDays || 0), out: g.out, delivery: g.delivery, payment: g.payment }))
    .filter(g => g.days > 0)
    .sort((a, b) => b.days - a.days);
  return { count: list.length, amount: list.reduce((s, g) => s + g.out, 0), list };
}

// ── PO document totals ──────────────────────────────────────────────
// Invoice-style roll-up for one PO: sub total of its item lines, plus
// loading & transport charges, GST (split into CGST/SGST halves like the
// tax invoice), a round-off to the nearest rupee, and the grand total.
// gstPct defaults to 18 (CGST 9% + SGST 9%) and is editable per PO.
export function calcPO({ sub = 0, loading = 0, transport = 0, gstPct = 18, transportGst = true } = {}) {
  sub = num(sub); loading = num(loading); transport = num(transport);
  const rate = (gstPct === '' || gstPct === null || gstPct === undefined) ? 18 : num(gstPct);
  const taxGst = transportGst !== false;                 // true ⇒ transport is taxed
  const taxable = sub + loading + (taxGst ? transport : 0);
  const gst = taxable * rate / 100;
  const cgst = gst / 2, sgst = gst / 2;
  const pre = taxable + gst + (taxGst ? 0 : transport);  // untaxed transport added after GST
  const grand = Math.round(pre);
  const roundOff = grand - pre;          // + or − a few paise, rounded to ₹1
  return { sub, loading, transport, transportGst: taxGst, taxable, gstPct: rate, gst, cgst, sgst, roundOff, grand };
}

// Pull a PO's shared charge fields off any one of its lines (they are stored
// identically on every line of the PO).
export const poCharges = (line = {}) => ({
  loading: num(line.loading),
  transport: num(line.transport),
  gstPct: (line.gstPct === '' || line.gstPct === null || line.gstPct === undefined) ? 18 : num(line.gstPct),
  transportGst: line.transportGst !== false,
});

// Total purchase value INCLUDING GST (and loading/transport) — group lines per PO,
// run each PO through calcPO (using that PO's shared charges), and sum the grand
// totals. Fabricator work orders carry no GST, so they add at their plain value.
export function poValueWithGst(lines) {
  const byPo = new Map();
  for (const l of lines) {
    const g = byPo.get(l.po) || { sub: 0, head: l };
    g.sub += num(l.qty) * num(l.rate);
    byPo.set(l.po, g);
  }
  let total = 0;
  for (const { sub, head } of byPo.values()) {
    const ch = poCharges(head);
    total += calcPO({ sub, loading: ch.loading, transport: ch.transport, gstPct: ch.gstPct, transportGst: ch.transportGst }).grand;
  }
  return total;
}

// Tidy terms & conditions for display: drop tabs, collapse runs of spaces, and
// put each numbered clause (1. 2. 3. …) on its own line. Decimals like "2.5%"
// are left intact (a digit right after the dot is not treated as a new clause).
export function formatTerms(t) {
  if (!t) return '';
  return String(t)
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\s+(?=\d{1,2}\.(?:\s|[A-Za-z]))/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

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

// ── Project payment schedule helpers (milestone-based, like the Order Confirmation form) ──
// A schedule has a quoted/order value and payment-term milestones, each a term, a
// percentage, the value (quoted × %/100) and a paid date/flag. Legacy flat records
// (p1..p5) are read as milestones too, so nothing stored earlier is lost.
export const ppMilestones = (r = {}) => {
  if (Array.isArray(r.milestones) && r.milestones.length) {
    return r.milestones.map((m) => ({ term: m.term || '', percentage: num(m.percentage), value: num(m.value), date: m.date || '', paid: !!m.paid }));
  }
  const out = [];
  for (const i of [1, 2, 3, 4, 5]) { const v = num(r['p' + i]); const d = r['p' + i + 'Date']; if (v || d) out.push({ term: 'Payment ' + i, percentage: 0, value: v, date: d || '', paid: v > 0 }); }
  return out;
};
export const ppQuoted = (r) => { const q = num(r && r.quotedValue); return q || ppMilestones(r).reduce((s, m) => s + m.value, 0); };
export const ppScheduled = (r) => ppMilestones(r).reduce((s, m) => s + num(m.value), 0);
export const ppPaidAmount = (r) => ppMilestones(r).filter((m) => m.paid).reduce((s, m) => s + num(m.value), 0);
export const ppOutstanding = (r) => Math.max(ppQuoted(r) - ppPaidAmount(r), 0);
export const ppPercentTotal = (ms) => (ms || []).reduce((s, m) => s + (parseFloat(m.percentage) || 0), 0);
export const ppStatus = (r) => {
  const ms = ppMilestones(r); const paid = ms.filter((m) => m.paid).length;
  if (!ms.length || paid === 0) return 'Pending';
  return paid >= ms.length ? 'Completed' : 'Partial';
};
// Back-compat aliases (older callers).
export const ppInstallments = ppMilestones;
export const ppTotal = ppScheduled;
export const ppTermsCount = (terms) => String(terms || '').split(',').map((s) => s.trim()).filter(Boolean).length;

// ── Project budget helper ───────────────────────────────────────────
// Allocated budget lives on the project (project.budget). "Utilized" is the
// COMMITTED spend = total PO value raised against the project (paid + outstanding
// are sub-parts of it, shown separately — never subtracted again). Pass the
// pre-grouped POs (groupPOs(lines)) so the figures match every other screen.
export const BUDGET_STATUS_CLS = { 'On Track': 'p-ok', 'Near Limit': 'p-warn', 'Over Budget': 'p-bad', 'No Budget': 'p-mute' };
export function budgetFor(project, groups) {
  const allocated = num(project && project.budget);
  const g = (groups || []).filter((x) => (x.project || '') === (project && project.name));
  const utilized = g.reduce((s, x) => s + x.value, 0);   // committed PO value
  const paid = g.reduce((s, x) => s + x.paid, 0);
  const out = g.reduce((s, x) => s + x.out, 0);
  const remaining = allocated - utilized;
  const utilPct = allocated > 0 ? Math.round((utilized / allocated) * 100) : 0;
  const status = allocated <= 0 ? 'No Budget'
    : utilized > allocated ? 'Over Budget'
    : utilPct >= 85 ? 'Near Limit'
    : 'On Track';
  return { allocated, utilized, paid, out, remaining, utilPct, status, poCount: g.length };
}


// ── Client payment helpers (money RECEIVED from the client, per project order) ──
// A client record carries an order value, payment terms and a receipts ledger
// (payments[]). Received = sum of receipts when any exist, else the manual
// collectionSoFar; outstanding, status and overdue all derive from that. Kept
// entirely separate from vendor payments (which live in purchase_payments).
export const cpReceipts = (r = {}) => (Array.isArray(r.payments) ? r.payments : [])
  .map((p) => ({ amount: num(p.amount), date: p.date || '', method: p.method || '', refNo: p.refNo || '', remarks: p.remarks || '', dueDate: p.dueDate || '' }));
export const cpOrderValue = (r) => num(r && r.totalOrderValue);
export const cpReceived = (r = {}) => {
  const rs = cpReceipts(r);
  return rs.length ? rs.reduce((s, p) => s + p.amount, 0) : num(r.collectionSoFar);
};
export const cpOutstanding = (r) => Math.max(cpOrderValue(r) - cpReceived(r), 0);
export const cpStatus = (r) => {
  const v = cpOrderValue(r), rec = cpReceived(r);
  if (rec <= 0) return 'Unpaid';
  return v > 0 && rec >= v ? 'Paid' : 'Partial';
};
export const cpOverdueDays = (r) => {
  const t = today();
  return (cpOutstanding(r) > 0 && r && r.dueDate && r.dueDate < t) ? daysDiff(t, r.dueDate) : 0;
};
export const cpLastDate = (r) => {
  const rs = cpReceipts(r).filter((p) => p.date).map((p) => p.date).sort();
  return rs.length ? rs[rs.length - 1] : ((r && r.collectionDate) || '');
};
