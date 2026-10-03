import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Printer, Pencil } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, StateRow } from '../components/ui';
import { calcLine, calcPO, poCharges, amountInWords, groupPOs, vendorName, num, inr, qfmt, dfmt } from '../utils/procurement';
import { downloadPoPdf } from '../utils/poPdf';

const dtfmt = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); };

export default function PurchaseOrderDetail() {
  const { poId } = useParams();
  const po = decodeURIComponent(poId || '');
  const navigate = useNavigate();
  const toast = useToast();
  const { vendors, lines, loading, error } = usePurchaseData();
  const [pdfBusy, setPdfBusy] = useState(false);

  const model = useMemo(() => {
    const group = lines.filter(l => l.po === po);
    if (!group.length) return null;
    const h = group[0];
    const ch = poCharges(h);
    const items = group.map(l => ({ l, c: calcLine(l), amount: num(l.qty) * num(l.rate) }));
    const sub = items.reduce((s, x) => s + x.amount, 0);
    const totals = calcPO({ sub, loading: ch.loading, transport: ch.transport, gstPct: ch.gstPct });
    const g = groupPOs(lines).find(x => x.po === po) || {};
    const vendor = vendors.find(v => v.vid === h.vid) || null;

    const expDates = [...new Set(group.map(l => l.expDate).filter(Boolean))].sort();
    const deliveryDateFmt = expDates.length === 0 ? '—' : expDates.length === 1 ? dfmt(expDates[0]) : `${dfmt(expDates[0])} → ${dfmt(expDates[expDates.length - 1])}`;
    const createdAt = group.map(l => l.createdAt).filter(Boolean).sort()[0];
    const updatedAt = group.map(l => l.updatedAt).filter(Boolean).sort().slice(-1)[0];
    const notes = [...new Set(group.map(l => l.description).filter(Boolean))];

    return { group, h, ch, items, sub, totals, g, vendor, expDates, deliveryDateFmt, createdAt, updatedAt, notes };
  }, [lines, vendors, po]);

  const onDownload = async () => {
    if (!model) return;
    setPdfBusy(true);
    try {
      await downloadPoPdf({
        po,
        poDateFmt: dfmt(model.h.poDate),
        deliveryDateFmt: model.deliveryDateFmt,
        vendor: model.vendor,
        delivery: model.g.delivery || '—',
        payment: model.g.payment || '—',
        delPct: model.g.delPct ?? 0,
        overdueDays: model.g.overdueDays ?? 0,
        items: model.items.map(({ l, amount }) => ({
          material: l.material, spec: l.spec, description: l.description, hsn: l.hsn,
          qty: num(l.qty), unit: l.unit, rate: num(l.rate), amount,
        })),
        totals: model.totals,
        amountWords: amountInWords(model.totals.grand),
        notes: model.notes,
      });
    } catch (e) {
      toast(e.message || 'Could not generate the PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  // Loading / error / not-found
  if (loading || error || !model) {
    return (
      <section>
        <button className="btn" onClick={() => navigate('/purchase-orders')}><ArrowLeft size={15} style={{ verticalAlign: '-2px' }} /> Back to list</button>
        <div className="tbl" style={{ marginTop: 14 }}>
          <table><tbody>
            <StateRow cols={1} loading={loading} error={error} empty={`Purchase order “${po}” was not found. It may have been removed.`} />
          </tbody></table>
        </div>
      </section>
    );
  }

  const { h, ch, items, sub, totals, g, vendor, notes } = model;

  const money = (n) => num(n) ? inr(n) : '₹0';

  return (
    <section className="pod">
      {/* ── Action bar ── */}
      <div className="pod-bar no-print">
        <button className="btn" onClick={() => navigate('/purchase-orders')}><ArrowLeft size={15} style={{ verticalAlign: '-2px' }} /> Back</button>
        <div className="pod-bar-right">
          <button className="btn" onClick={() => navigate(`/purchase-orders?edit=${encodeURIComponent(po)}`)}><Pencil size={15} style={{ verticalAlign: '-2px' }} /> Edit</button>
          <button className="btn" onClick={() => window.print()}><Printer size={15} style={{ verticalAlign: '-2px' }} /> Print</button>
          <button className="btn primary" onClick={onDownload} disabled={pdfBusy}><Download size={15} style={{ verticalAlign: '-2px' }} /> {pdfBusy ? 'Preparing…' : 'Download PDF'}</button>
        </div>
      </div>

      {/* ── Title ── */}
      <div className="pod-head">
        <div>
          <div className="pod-po">{po}</div>
          <div className="pod-sub">Purchase order · raised on {dfmt(h.poDate)}</div>
        </div>
        <div className="pod-pills">
          <Pill s={g.delivery} />{g.overdueDays > 0 ? <span className="pod-od">{g.overdueDays}d overdue</span> : null}
          <Pill s={g.payment} />
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="pod-grid">
        <div className="card pod-card">
          <h3>Order</h3>
          <Row k="PO Number" v={po} />
          <Row k="PO Date" v={dfmt(h.poDate)} />
          <Row k="Delivery Date" v={model.deliveryDateFmt} />
          <Row k="Project" v={h.project} />
          <Row k="GST Rate" v={`${totals.gstPct}%`} />
        </div>
        <div className="card pod-card">
          <h3>Supplier</h3>
          <Row k="Vendor" v={vendor ? `${vendor.name}` : vendorName(vendors, h.vid)} />
          <Row k="Vendor ID" v={h.vid} />
          <Row k="Contact" v={vendor?.contact} />
          <Row k="Mobile" v={vendor?.mobile} />
          <Row k="Email" v={vendor?.email} />
          <Row k="Address" v={vendor?.address} />
          <Row k="GSTIN" v={vendor?.gst} />
        </div>
        <div className="card pod-card">
          <h3>Status</h3>
          <Row k="Delivery" v={<><b>{g.delivery}</b>{g.overdueDays > 0 ? ` · ${g.overdueDays} day${g.overdueDays > 1 ? 's' : ''} overdue` : ''}</>} />
          <Row k="Delivery progress" v={`${g.delPct}%`} />
          <Row k="Payment" v={<><b>{g.payment}</b>{g.payOverdueDays > 0 ? ` · ${g.payOverdueDays}d overdue` : ''}</>} />
          <Row k="Payment progress" v={`${g.payPct}% · ${money(g.out)} due`} />
          <Row k="Ordered / Received" v={`${qfmt(g.qty)} / ${qfmt(g.rec)}`} />
        </div>
      </div>

      {/* ── Items ── */}
      <div className="tbl" style={{ marginTop: 16 }}>
        <table>
          <thead><tr>
            <th>#</th><th>Material</th><th>Specification</th><th>Description</th><th>HSN/SAC</th>
            <th className="num">Qty</th><th>Per</th><th className="num">Rate</th><th className="num">Amount</th>
            <th className="num">Received</th><th className="num">Pending</th><th>Delivery</th>
          </tr></thead>
          <tbody>
            {items.map(({ l, c, amount }, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td><b>{l.material || '—'}</b></td>
                <td>{l.spec || '—'}</td>
                <td>{l.description || '—'}</td>
                <td>{l.hsn || '—'}</td>
                <td className="num">{qfmt(l.qty)}</td>
                <td>{l.unit}</td>
                <td className="num">{inr(l.rate)}</td>
                <td className="num calc">{inr(amount)}</td>
                <td className="num">{qfmt(l.received)}</td>
                <td className="num calc">{qfmt(c.pending)}</td>
                <td><Pill s={c.delivery} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Totals ── */}
      <div className="pod-totals-wrap">
        <div className="pod-totals card">
          <Row k="Sub Total (materials)" v={money(totals.sub)} />
          {totals.loading ? <Row k="Loading Charges" v={money(totals.loading)} /> : null}
          {totals.transport ? <Row k="Transport Charge" v={money(totals.transport)} /> : null}
          <Row k="Taxable Value" v={money(totals.taxable)} />
          <Row k={`CGST @ ${totals.gstPct / 2}%`} v={money(totals.cgst)} />
          <Row k={`SGST @ ${totals.gstPct / 2}%`} v={money(totals.sgst)} />
          {Math.abs(totals.roundOff) >= 0.005 ? <Row k="Round Off" v={(totals.roundOff >= 0 ? '+' : '−') + '₹' + Math.abs(totals.roundOff).toFixed(2)} /> : null}
          <Row k="Grand Total" v={inr(totals.grand)} strong />
          <div className="pod-words">{amountInWords(totals.grand)}</div>
        </div>
      </div>

      {/* ── Notes + meta ── */}
      <div className="pod-grid2">
        <div className="card pod-card">
          <h3>Notes / remarks</h3>
          {notes.length ? <ul className="pod-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : <p className="pod-empty">No notes recorded for this PO.</p>}
        </div>
        <div className="card pod-card">
          <h3>Record</h3>
          <Row k="Created" v={dtfmt(model.createdAt)} />
          <Row k="Last updated" v={dtfmt(model.updatedAt)} />
          <Row k="Line items" v={items.length} />
        </div>
      </div>

      <style>{`
        .pod-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
        .pod-bar-right{display:flex;gap:8px;flex-wrap:wrap}
        .pod-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:16px 0 6px}
        .pod-po{font:800 26px var(--f-display);color:var(--fg);letter-spacing:-.01em}
        .pod-sub{color:var(--muted);font-size:13.5px;margin-top:2px}
        .pod-pills{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .pod-od{font-size:12px;font-weight:700;color:var(--bad)}
        .pod-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:12px}
        .pod-grid2{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-top:16px}
        .pod-card{padding:16px 18px;min-width:0}
        .pod-card h3{font:700 12px var(--f-body);text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:0 0 10px}
        .pod-row{display:flex;justify-content:space-between;gap:14px;padding:6px 0;font-size:13.5px;border-bottom:1px dashed var(--line)}
        .pod-row:last-child{border-bottom:0}
        .pod-row .k{color:var(--muted);flex:0 0 auto}
        .pod-row .v{color:var(--fg);text-align:right;word-break:break-word}
        .pod-row.strong{padding:10px 0}
        .pod-row.strong .k{color:var(--fg);font-weight:700}
        .pod-row.strong .v{color:var(--accent-ink);font-weight:800;font-size:16px}
        .pod-totals-wrap{display:flex;justify-content:flex-end;margin-top:16px}
        .pod-totals{width:100%;max-width:420px;padding:10px 18px}
        .pod-words{padding:9px 0 2px;font-size:12.5px;font-style:italic;color:var(--muted);border-top:1px solid var(--line);margin-top:4px}
        .pod-notes{margin:0;padding-left:18px;font-size:13.5px;color:var(--fg)}
        .pod-notes li{margin:3px 0}
        .pod-empty{color:var(--muted);font-size:13.5px;margin:0}
        @media (max-width:900px){.pod-grid{grid-template-columns:1fr}.pod-grid2{grid-template-columns:1fr}.pod-totals{max-width:none}}
        @media print{
          .sidebar,.topbar,.hamburger,.backdrop,.no-print{display:none!important}
          .main,.content{margin:0!important;padding:0!important}
          .pod-totals-wrap{break-inside:avoid}
          body{background:#fff}
        }
      `}</style>
    </section>
  );
}

const Row = ({ k, v, strong }) => (
  <div className={`pod-row ${strong ? 'strong' : ''}`}>
    <span className="k">{k}</span><span className="v">{v || '—'}</span>
  </div>
);
