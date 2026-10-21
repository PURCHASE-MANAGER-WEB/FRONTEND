import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Printer, Pencil, FileText, Trash2 } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, StateRow } from '../components/ui';
import { calcLine, calcPO, poCharges, amountInWords, groupPOs, vendorName, num, inr, qfmt, dfmt, formatTerms } from '../utils/procurement';
import { downloadPoPdf } from '../utils/poPdf';
import { downloadFabricatorPoPdf } from '../utils/fabricatorPoPdf';
import { openInvoice, downloadInvoice } from '../utils/cloudinary';
import { isRestrictedPM } from '../api/client';

const dtfmt = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); };

export default function PurchaseOrderDetail() {
  const { poId } = useParams();
  const po = decodeURIComponent(poId || '');
  const navigate = useNavigate();
  const toast = useToast();
  const { vendors, lines, payments, deletePO, loading, error } = usePurchaseData();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');

  const model = useMemo(() => {
    const group = lines.filter(l => l.po === po);
    if (!group.length) return null;
    const h = group[0];
    const ch = poCharges(h);
    const items = group.map(l => ({ l, c: calcLine(l), amount: num(l.qty) * num(l.rate) }));
    const sub = items.reduce((s, x) => s + x.amount, 0);
    const totals = calcPO({ sub, loading: ch.loading, transport: ch.transport, gstPct: ch.gstPct, transportGst: ch.transportGst });
    const g = groupPOs(lines).find(x => x.po === po) || {};
    const vendor = vendors.find(v => v.vid === h.vid) || null;

    const expDates = [...new Set(group.map(l => l.expDate).filter(Boolean))].sort();
    const deliveryDateFmt = expDates.length === 0 ? '—' : expDates.length === 1 ? dfmt(expDates[0]) : `${dfmt(expDates[0])} → ${dfmt(expDates[expDates.length - 1])}`;
    const createdAt = group.map(l => l.createdAt).filter(Boolean).sort()[0];
    const updatedAt = group.map(l => l.updatedAt).filter(Boolean).sort().slice(-1)[0];
    // PO-level notes (entered in the editor) first, then any per-item descriptions.
    const poNote = group.map(l => l.notes).find(Boolean) || '';
    const notes = [...new Set([poNote, ...group.map(l => l.description)].filter(Boolean))];

    // Item-table totals
    const totQty = group.reduce((s, l) => s + num(l.qty), 0);
    const totRec = group.reduce((s, l) => s + num(l.received), 0);
    const totPend = items.reduce((s, x) => s + x.c.pending, 0);
    const units = [...new Set(group.map(l => l.unit).filter(Boolean))];
    const unit = units.length === 1 ? units[0] : '';

    return { group, h, ch, items, sub, totals, g, vendor, expDates, deliveryDateFmt, createdAt, updatedAt, notes, totQty, totRec, totPend, unit };
  }, [lines, vendors, po]);

  const onDownload = async () => {
    if (!model) return;
    setPdfBusy(true);
    try {
      if ((model.h.poType || '') === 'fabricator') {
        await downloadFabricatorPoPdf({
          po,
          poDateFmt: dfmt(model.h.poDate),
          project: (model.h.projects && model.h.projects.length ? model.h.projects.join(', ') : model.h.project),
          client: model.h.client,
          fab: {
            name: model.h.vendorName || (model.vendor && model.vendor.name) || '',
            address: model.h.fabAddress || (model.vendor && model.vendor.address) || '',
            mobile: model.h.fabMobile || (model.vendor && model.vendor.mobile) || '',
          },
          siteEngineer: model.h.siteEngineer,
          siteMobile: model.h.siteMobile,
          siteAddress: model.h.siteAddress,
          items: model.items.map(({ l, amount }) => ({ desc: l.material, unit: l.unit, qty: num(l.qty), rate: num(l.rate), amount })),
          total: model.sub,
          amountWords: amountInWords(model.sub),
          terms: model.h.terms,
        });
        return;
      }
      await downloadPoPdf({
        po,
        poDateFmt: dfmt(model.h.poDate),
        deliveryDateFmt: model.h.deliveryDate ? dfmt(model.h.deliveryDate) : model.deliveryDateFmt,
        deliveryAddress: model.h.deliveryAddress || '',
        status: model.h.status || 'Approved',
        project: (model.h.projects && model.h.projects.length ? model.h.projects.join(', ') : model.h.project),
        paymentMethod: model.h.paymentMethod,
        terms: model.h.terms,
        invoiceUrl: model.h.invoice?.url,
        invoiceName: model.h.invoice?.name,
        vendor: model.vendor,
        delivery: model.g.delivery || '—',
        payment: model.g.payment || '—',
        delPct: model.g.delPct ?? 0,
        overdueDays: model.g.overdueDays ?? 0,
        items: model.items.map(({ l, amount }) => ({
          material: l.material, spec: l.spec, description: l.description, hsn: l.hsn, make: l.make, weight: num(l.weight),
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

  const onDeletePO = async () => {
    const hasPay = (payments || []).some(p => p.po === po) || (model && model.group || []).some(l => num(l.paid) > 0);
    if (hasPay) { setConfirmDel(false); setDelErr('This PO has recorded payments and cannot be deleted. Delete its payments first.'); return; }
    setDelBusy(true);
    try { await deletePO(po); toast('Purchase order deleted'); navigate('/purchase-orders'); }
    catch (e) { setDelErr(e.message || 'Could not delete the purchase order.'); }
    finally { setDelBusy(false); }
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
  const pm = isRestrictedPM();
  const fab = (h.poType || '') === 'fabricator';

  const money = (n) => num(n) ? inr(n) : '₹0';

  return (
    <section className="pod">
      {/* ── Action bar ── */}
      <div className="pod-bar no-print">
        <button className="btn" onClick={() => navigate('/purchase-orders')}><ArrowLeft size={15} style={{ verticalAlign: '-2px' }} /> Back</button>
        <div className="pod-bar-right">
          {h.invoice && <button type="button" className="btn" onClick={() => openInvoice(h.invoice)}><FileText size={15} style={{ verticalAlign: '-2px' }} /> View Invoice</button>}
          {h.invoice && <button type="button" className="btn" onClick={() => downloadInvoice(h.invoice)}><Download size={15} style={{ verticalAlign: '-2px' }} /> Download Invoice</button>}
          <button className="btn" onClick={() => navigate(`/purchase-orders?edit=${encodeURIComponent(po)}`)}><Pencil size={15} style={{ verticalAlign: '-2px' }} /> Edit</button>
          <button className="btn" onClick={() => window.print()}><Printer size={15} style={{ verticalAlign: '-2px' }} /> Print</button>
          <button className="btn primary" onClick={onDownload} disabled={pdfBusy}><Download size={15} style={{ verticalAlign: '-2px' }} /> {pdfBusy ? 'Preparing…' : 'Download PDF'}</button>
          <button className="btn danger" onClick={() => { setDelErr(''); setConfirmDel(true); }}><Trash2 size={15} style={{ verticalAlign: '-2px' }} /> Delete</button>
        </div>
      </div>
      {confirmDel && (
        <div className="confirm no-print" style={{ marginTop: 12 }}>
          Delete purchase order {po} and all its items permanently?
          <button className="btn danger" onClick={onDeletePO} disabled={delBusy}>Delete</button>
          <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
        </div>
      )}
      {delErr && <div className="err no-print" style={{ marginTop: 10 }}>{delErr}</div>}

      {/* ── Title ── */}
      <div className="pod-head">
        <div>
          <div className="pod-po">{po}</div>
          <div className="pod-sub">{fab ? 'Fabricator work order' : 'Purchase order'} · raised on {dfmt(h.poDate)}</div>
        </div>
        <div className="pod-pills">
          <Pill s={g.delivery} />{g.overdueDays > 0 ? <span className="pod-od">{g.overdueDays}d overdue</span> : null}
          {!pm && <Pill s={g.payment} />}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="pod-grid">
        <div className="card pod-card">
          <h3>Order</h3>
          <Row k="PO Number" v={po} />
          <Row k="PO Date" v={dfmt(h.poDate)} />
          <Row k="Delivery Date" v={h.deliveryDate ? dfmt(h.deliveryDate) : model.deliveryDateFmt} />
          <Row k="Delivery Address" v={h.deliveryAddress || '—'} />
          <Row k={(h.projects && h.projects.length > 1) ? "Projects" : "Project"} v={(h.projects && h.projects.length ? h.projects.join(', ') : h.project)} />
          {!fab && <Row k="GST Rate" v={`${totals.gstPct}%`} />}
          <Row k="Payment Method" v={h.paymentMethod} />
          {!pm && <Row k="Invoice" v={h.invoice ? (
            <span>
              <button type="button" onClick={() => openInvoice(h.invoice)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-ink)', fontWeight: 600, font: 'inherit' }}>View</button>
              <span style={{ margin: '0 8px', color: 'var(--muted, #94a3b8)' }}>·</span>
              <button type="button" onClick={() => downloadInvoice(h.invoice)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-ink)', fontWeight: 600, font: 'inherit' }}>Download</button>
            </span>
          ) : 'Not uploaded'} />}
        </div>
        <div className="card pod-card">
          <h3>{fab ? 'Fabricator / Subcontractor' : 'Supplier'}</h3>
          <Row k={fab ? 'Fabricator' : 'Vendor'} v={vendor ? vendor.name : (h.vendorName || vendorName(vendors, h.vid))} />
          <Row k="Vendor ID" v={h.vid} />
          <Row k="Contact" v={vendor?.contact} />
          <Row k="Mobile" v={vendor?.mobile || h.fabMobile} />
          <Row k="Email" v={vendor?.email} />
          <Row k="Address" v={vendor?.address || h.fabAddress} />
          {!fab && <Row k="GSTIN" v={vendor?.gst} />}
        </div>
        <div className="card pod-card">
          <h3>Status</h3>
          <Row k="Delivery" v={<><b>{g.delivery}</b>{g.overdueDays > 0 ? ` · ${g.overdueDays} day${g.overdueDays > 1 ? 's' : ''} overdue` : ''}</>} />
          <Row k="Delivery progress" v={`${g.delPct}%`} />
          {!pm && <Row k="Payment" v={<><b>{g.payment}</b>{g.payOverdueDays > 0 ? ` · ${g.payOverdueDays}d overdue` : ''}</>} />}
          {!pm && <Row k="Payment progress" v={`${g.payPct}% · ${money(g.out)} due`} />}
          <Row k="Ordered / Received" v={`${qfmt(g.qty)} / ${qfmt(g.rec)}`} />
        </div>
      </div>

      {/* ── Items ── */}
      <div className="tbl" style={{ marginTop: 16 }}>
        <table>
          <thead><tr>
            <th>#</th><th>{fab ? 'Description of Work' : 'Material'}</th><th>Project</th><th>Specification</th><th>Description</th>
            <th className="num">Qty</th><th>Per</th><th className="num">Rate</th><th className="num">Amount</th>
            <th className="num">Received</th><th className="num">Pending</th><th>Delivery</th>
          </tr></thead>
          <tbody>
            {items.map(({ l, c, amount }, i) => (
              <tr key={l.id}>
                <td>{i + 1}</td>
                <td><b>{l.material || '—'}</b></td>
                <td>{l.project || '—'}</td>
                <td>{l.spec || '—'}</td>
                <td>{l.description || '—'}</td>
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
          <tfoot><tr>
            <td colSpan={5}>Total · {items.length} item{items.length > 1 ? 's' : ''}</td>
            <td className="num">{qfmt(model.totQty)}{model.unit ? ` ${model.unit}` : ''}</td>
            <td></td><td></td>
            <td className="num">{inr(sub)}</td>
            <td className="num">{qfmt(model.totRec)}</td>
            <td className="num">{qfmt(model.totPend)}</td>
            <td></td>
          </tr></tfoot>
        </table>
      </div>

      {/* ── Notes / record (left) + totals (right) ── */}
      <div className="pod-bottom">
        <div className="pod-bottom-left">
          <div className="card pod-card">
            <h3>Terms &amp; conditions</h3>
            {h.terms ? <p className="pod-terms">{formatTerms(h.terms)}</p> : <p className="pod-empty">No terms &amp; conditions recorded for this PO.</p>}
          </div>
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
        <div className="card pod-totals">
          <h3>Order summary</h3>
          {fab ? (
            <>
              <Row k="Total work value" v={money(totals.sub)} />
              <Row k="Grand Total" v={inr(totals.sub)} strong />
              <div className="pod-words">{amountInWords(totals.sub)}</div>
            </>
          ) : (
            <>
              <Row k="Sub Total (materials)" v={money(totals.sub)} />
              {totals.loading ? <Row k="Loading Charges" v={money(totals.loading)} /> : null}
              {totals.transport && totals.transportGst ? <Row k="Transport Charge" v={money(totals.transport)} /> : null}
              <Row k="Taxable Value" v={money(totals.taxable)} />
              <Row k={`CGST @ ${totals.gstPct / 2}%`} v={money(totals.cgst)} />
              <Row k={`SGST @ ${totals.gstPct / 2}%`} v={money(totals.sgst)} />
              {totals.transport && !totals.transportGst ? <Row k="Transport Charge (no GST)" v={money(totals.transport)} /> : null}
              {Math.abs(totals.roundOff) >= 0.005 ? <Row k="Round Off" v={(totals.roundOff >= 0 ? '+' : '−') + '₹' + Math.abs(totals.roundOff).toFixed(2)} /> : null}
              <Row k="Grand Total" v={inr(totals.grand)} strong />
              <div className="pod-words">{amountInWords(totals.grand)}</div>
            </>
          )}
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
        .pod-bottom{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:14px;margin-top:16px;align-items:start}
        .pod-bottom-left{display:flex;flex-direction:column;gap:14px;min-width:0}
        .pod-totals{padding:16px 18px;min-width:0}
        .pod-totals h3{font:700 12px var(--f-body);text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:0 0 8px}
        .pod-words{padding:9px 0 2px;font-size:12.5px;font-style:italic;color:var(--muted);border-top:1px solid var(--line);margin-top:4px}
        .pod-notes{margin:0;padding-left:18px;font-size:13.5px;color:var(--fg)}
        .pod-notes li{margin:3px 0}
        .pod-terms{margin:0;font-size:13.5px;color:var(--fg);line-height:1.6;white-space:pre-line}
        .pod-empty{color:var(--muted);font-size:13.5px;margin:0}
        @media (max-width:900px){.pod-grid{grid-template-columns:1fr}.pod-bottom{grid-template-columns:1fr}}
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
