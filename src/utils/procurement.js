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

// One PO line's derived figures.
export function calcLine(l) {
  const qty = num(l.qty), rate = num(l.rate), rec = num(l.received), paid = num(l.paid);
  const total = qty * rate, pending = Math.max(qty - rec, 0), out = total - paid;
  const delivery = rec <= 0 ? 'Pending' : pending <= 0 ? 'Completed' : 'Partial';
  const payment = paid <= 0 ? 'Unpaid' : out <= 0 ? 'Paid' : 'Partial';
  const t = today();
  const lateDel = l.expDate && l.expDate < t && pending > 0;
  const latePay = l.dueDate && l.dueDate < t && out > 0;
  return { total, pending, out, delivery, payment, lateDel, latePay };
}

export const vendorName = (vendors, vid) => (vendors.find(v => v.vid === vid) || {}).name || 'Unknown vendor';

// Roll PO lines up into one row per PO number.
export function groupPOs(lines) {
  const map = new Map();
  for (const l of lines) {
    const c = calcLine(l);
    const g = map.get(l.po) || { po: l.po, vid: l.vid, project: l.project, date: l.poDate, value: 0, paid: 0, out: 0, qty: 0, rec: 0, pend: 0, units: new Set() };
    g.value += c.total; g.paid += num(l.paid); g.out += c.out;
    g.qty += num(l.qty); g.rec += Math.min(num(l.received), num(l.qty)); g.pend += c.pending; g.units.add(l.unit);
    map.set(l.po, g);
  }
  return [...map.values()].map(g => {
    g.unit = g.units.size === 1 ? [...g.units][0] : 'mixed units';
    g.delivery = g.rec <= 0 ? 'Pending' : g.pend <= 0 ? 'Completed' : 'Partial';
    g.payment = g.paid <= 0 ? 'Unpaid' : g.out <= 0 ? 'Paid' : 'Partial';
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
    if (c.lateDel || c.latePay) over++;
  }
  return { value, paid, out, pend, over };
}

export const nextVid = (vendors) => {
  const n = vendors.map(v => parseInt(String(v.vid || '').replace(/\D/g, '')) || 0);
  return 'VEN-' + String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0');
};
export const nextPo = (lines) => {
  const n = lines.map(l => parseInt(String(l.po || '').replace(/\D/g, '')) || 0);
  return 'PO-' + String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0');
};
