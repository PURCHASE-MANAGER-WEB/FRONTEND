import React, { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, FileText, Upload } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { purchaseApi } from '../api/client';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { calcLine, calcPO, poCharges, amountInWords, groupPOs, num, inr, qfmt, dfmt, today, vendorName, nextPo, UNITS, PAYMENT_METHODS } from '../utils/procurement';
import { uploadInvoice, openInvoice, downloadInvoice } from '../utils/cloudinary';

const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

const newId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// One blank item row for the PO form.
const blankItem = () => ({
  _id: newId(), isNew: true,
  material: '', description: '', spec: '', hsn: '',
  qty: '', unit: 'MT', rate: '', received: 0, expDate: '', dueDate: '', paid: 0,
});

// A fresh PO (header + charges + one empty item).
const blankPO = (lines, vendors) => ({
  isNew: true,
  po: nextPo(lines), poDate: today(), vid: vendors[0]?.vid || '', project: '',
  loading: '', transport: '', gstPct: 18, notes: '', paymentMethod: '', terms: '', invoice: null,
  items: [blankItem()], origIds: [],
});

export default function PurchaseOrders() {
  const { vendors, lines, loading, error, reload } = usePurchaseData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const [invErr, setInvErr] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  const filter = searchParams.get('filter') || 'all';
  const setFilter = (f) => { const n = new URLSearchParams(searchParams); if (f === 'all') n.delete('filter'); else n.set('filter', f); setSearchParams(n, { replace: true }); };

  const statusOkG = (g) => {
    if (filter === 'overdue') return g.overdueDays > 0 || g.payOverdueDays > 0;
    if (filter === 'pending') return g.delivery !== 'Completed';
    if (filter === 'completed') return g.delivery === 'Completed';
    return true;
  };

  // One row per PO (rolled up from its material lines), like Purchase Progress.
  const rows = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    const matchLine = (po) => lines.some(l => l.po === po && [l.material, l.spec, l.description].filter(Boolean).join(' ').toLowerCase().includes(q2));
    return groupPOs(lines)
      .map(g => ({ g, vn: vendorName(vendors, g.vid) }))
      .filter(({ g, vn }) => statusOkG(g) && (!q2 || [g.po, g.vid, vn, g.project].filter(Boolean).join(' ').toLowerCase().includes(q2) || matchLine(g.po)))
      .sort((a, b) => String(a.g.po).localeCompare(String(b.g.po), undefined, { numeric: true }));
  }, [lines, vendors, q, filter]);

  const totals = rows.reduce((s, { g }) => ({ total: s.total + g.value, paid: s.paid + g.paid, out: s.out + g.out }), { total: 0, paid: 0, out: 0 });
  const poNums = [...new Set(lines.map(l => l.po))];

  // Open the whole PO (all its material lines) in one editor. poKey === null → new PO.
  const open = (poKey) => {
    if (!vendors.length) { toast('Add a vendor first'); return; }
    setFormErr('');
    if (!poKey) { setEditing(blankPO(lines, vendors)); return; }
    const group = lines.filter(l => l.po === poKey);
    const h = group[0] || {};
    const ch = poCharges(h);
    setEditing({
      isNew: false,
      po: h.po || poKey, poDate: h.poDate || today(), vid: h.vid || vendors[0]?.vid || '', project: h.project || '',
      loading: ch.loading || '', transport: ch.transport || '', gstPct: ch.gstPct, notes: h.notes || '',
      paymentMethod: h.paymentMethod || '', terms: h.terms || '', invoice: h.invoice || null,
      items: group.map(l => ({
        _id: l.id, isNew: false,
        material: l.material || '', description: l.description || '', spec: l.spec || '', hsn: l.hsn || '',
        qty: l.qty ?? '', unit: l.unit || 'MT', rate: l.rate ?? '', received: l.received ?? 0,
        expDate: l.expDate || '', dueDate: l.dueDate || '', paid: l.paid ?? 0,
      })),
      origIds: group.map(l => l.id),
    });
  };
  const close = () => { setEditing(null); setFormErr(''); };

  const setHdr = (k, val) => setEditing(e => ({ ...e, [k]: val }));
  const setItem = (id, k, val) => setEditing(e => ({ ...e, items: e.items.map(it => it._id === id ? { ...it, [k]: val } : it) }));
  const addItem = () => setEditing(e => ({ ...e, items: [...e.items, blankItem()] }));
  const removeItem = (id) => setEditing(e => ({ ...e, items: e.items.length > 1 ? e.items.filter(it => it._id !== id) : e.items }));

  // Picking an existing PO number pre-fills the shared header fields (new PO only).
  const onPoBlur = () => {
    if (!editing?.isNew) return;
    const key = String(editing.po).trim().toUpperCase();
    const ex = lines.find(x => x.po === key);
    if (ex) { const ch = poCharges(ex); setEditing(e => ({ ...e, poDate: ex.poDate || e.poDate, vid: ex.vid, project: ex.project || '', loading: ch.loading || '', transport: ch.transport || '', gstPct: ch.gstPct })); }
  };

  // Live invoice totals for the open PO.
  const itemAmts = editing ? editing.items.map(it => num(it.qty) * num(it.rate)) : [];
  const sub = itemAmts.reduce((s, a) => s + a, 0);
  const poTot = editing ? calcPO({ sub, loading: editing.loading, transport: editing.transport, gstPct: editing.gstPct }) : null;

  const submit = async () => {
    const d = editing;
    const po = String(d.po).trim().toUpperCase();
    if (!po) return setFormErr('Enter a PO number.');
    if (!d.poDate) return setFormErr('Choose the PO date.');
    if (!d.vid) return setFormErr('Select a vendor.');
    if (!String(d.project).trim()) return setFormErr('Enter the project name.');

    const items = d.items.filter(it => String(it.material).trim() || num(it.qty) || num(it.rate));
    if (!items.length) return setFormErr('Add at least one material item.');
    for (let i = 0; i < items.length; i++) {
      const it = items[i], n = i + 1, qty = num(it.qty), rate = num(it.rate);
      if (!String(it.material).trim()) return setFormErr(`Item ${n}: enter the material.`);
      if (qty <= 0) return setFormErr(`Item ${n}: ordered quantity must be more than 0.`);
      if (rate <= 0) return setFormErr(`Item ${n}: rate must be more than 0.`);
      if (num(it.received) > qty) return setFormErr(`Item ${n}: received can't be more than ordered.`);
      if (num(it.paid) > qty * rate) return setFormErr(`Item ${n}: paid can't be more than the item value.`);
    }

    const loading = num(d.loading), transport = num(d.transport);
    const gstPct = (d.gstPct === '' || d.gstPct === null || d.gstPct === undefined) ? 18 : num(d.gstPct);
    const shared = { po, poDate: d.poDate, vid: d.vid, project: d.project.trim(), loading, transport, gstPct, notes: String(d.notes || '').trim(), paymentMethod: d.paymentMethod || '', terms: String(d.terms || '').trim(), invoice: d.invoice || null };

    setBusy(true);
    try {
      for (const it of items) {
        const payload = {
          ...shared,
          material: String(it.material).trim(), description: String(it.description || '').trim(),
          spec: String(it.spec || '').trim(), hsn: String(it.hsn || '').trim(),
          qty: num(it.qty), unit: it.unit, rate: num(it.rate), received: num(it.received),
          expDate: it.expDate || '', dueDate: it.dueDate || '', paid: num(it.paid),
        };
        if (it.isNew) await purchaseApi.createLine({ ...payload, id: it._id });
        else await purchaseApi.updateLine(it._id, payload);
      }
      // Remove any lines that were deleted in the editor.
      const keep = new Set(items.map(it => it._id));
      for (const id of d.origIds) if (!keep.has(id)) await purchaseApi.deleteLine(id);
      await reload();
      close();
      toast(d.isNew ? 'Purchase order added' : 'Purchase order saved');
    } catch (e) {
      setFormErr(e.message || 'Could not save the purchase order.');
    } finally {
      setBusy(false);
    }
  };

  // Deep link from the PO Details page: /purchase-orders?edit=PO-003 opens that PO.
  useEffect(() => {
    const ep = searchParams.get('edit');
    if (ep && !editing && vendors.length && lines.some(l => l.po === ep)) {
      open(ep);
      const next = new URLSearchParams(searchParams); next.delete('edit'); setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, vendors, lines]);

  const onInvoice = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setInvErr(''); setInvBusy(true);
    try { const inv = await uploadInvoice(file, String(editing?.po || '').trim().toUpperCase()); setHdr('invoice', inv); toast('Invoice uploaded'); }
    catch (err) { setInvErr(err.message || 'Could not upload the invoice.'); }
    finally { setInvBusy(false); }
  };

  const money = (n) => num(n) ? inr(n) : '₹0';

  return (
    <section>
      <div className="toolbar">
        <h2>Purchase Order &amp; Material Tracking</h2>
        <div className="right">
          <select className="po-filter" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter purchase orders by status">
            <option value="all">All POs</option>
            <option value="pending">Pending delivery</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
          <input className="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO, vendor, material…" aria-label="Search purchase orders" />
          <button className="btn primary" onClick={() => open(null)}>+ New PO</button>
        </div>
      </div>
      {filter !== 'all' && (
        <div className="filter-note">
          Showing <b>{filter === 'pending' ? 'pending-delivery' : filter}</b> purchase orders ({rows.length}).
          <button className="link" onClick={() => setFilter('all')}>Clear filter</button>
        </div>
      )}
      <p className="legend" style={{ margin: '8px 0 0' }}>One row per PO — a PO with several materials is rolled up. Click the PO number to view full details, or Edit to change the whole PO.</p>
      <div className="tbl" style={{ marginTop: 10 }}>
        <table>
          <thead><tr>
            <th>PO Number</th><th>PO Date</th><th>Vendor</th><th>Project</th><th className="num">Items</th>
            <th className="num">Ordered</th><th className="num">PO Value</th><th className="num">Received</th><th className="num">Pending</th>
            <th>Exp. Delivery</th><th className="num">Paid</th><th className="num">Outstanding</th><th>Delivery</th><th>Payment</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={15} loading={loading} error={error}
                empty={lines.length ? 'No purchase orders match your search.' : (vendors.length ? 'No purchase orders yet. Add a PO to start tracking.' : 'Add a vendor first, then raise purchase orders against them.')} />
            ) : rows.map(({ g, vn }) => {
              const u = g.unit === 'mixed units' ? '' : ' ' + g.unit;
              return (
                <tr key={g.po}>
                  <td className="id"><Link className="po-link" to={`/purchase-orders/${encodeURIComponent(g.po)}`}>{g.po}</Link></td>
                  <td>{dfmt(g.date)}</td><td>{vn}</td><td>{g.project || '—'}</td>
                  <td className="num">{g.count}</td>
                  <td className="num">{qfmt(g.qty)}{u}</td>
                  <td className="num calc">{inr(g.value)}</td>
                  <td className="num">{qfmt(g.rec)}{u}</td>
                  <td className="num calc">{qfmt(g.pend)}{u}</td>
                  <td className={g.overdueDays > 0 ? 'overdue' : ''}>{dfmt(g.expDate)}{g.overdueDays > 0 ? ` · ${g.overdueDays}d overdue` : (g.dueToday && g.delivery !== 'Completed' ? ' · due today' : '')}</td>
                  <td className="num">{inr(g.paid)}</td><td className="num calc">{inr(g.out)}</td>
                  <td className="calc"><Pill s={g.delivery} /></td><td className="calc"><Pill s={g.payment} /></td>
                  <td><button className="link" onClick={() => open(g.po)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr>
              <td colSpan={6}>Total ({rows.length} PO{rows.length > 1 ? 's' : ''})</td>
              <td className="num">{inr(totals.total)}</td><td colSpan={3}></td>
              <td className="num">{inr(totals.paid)}</td><td className="num">{inr(totals.out)}</td><td colSpan={3}></td>
            </tr></tfoot>
          )}
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'New purchase order' : `Edit ${editing.po}`}</h3>
          <p className="hint">Add every material as an item row. Loading, transport and GST apply once to the whole PO.</p>

          {/* ── PO header ── */}
          <div className="grid">
            <Field label="PO Number *">
              <input list="po-list" value={editing.po} onChange={e => setHdr('po', e.target.value)} onBlur={onPoBlur} />
              <datalist id="po-list">{poNums.map(p => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label="PO Date *"><input type="date" value={editing.poDate} onChange={e => setHdr('poDate', e.target.value)} /></Field>
            <Field label="Vendor *" full>
              <select value={editing.vid} onChange={e => setHdr('vid', e.target.value)}>
                {vendors.map(v => <option key={v.vid} value={v.vid}>{v.vid} · {v.name}{v.status !== 'Active' ? ` (${v.status})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Project Name *" full><input value={editing.project} onChange={e => setHdr('project', e.target.value)} /></Field>
          </div>

          {/* ── Item rows ── */}
          <div className="po-items">
            <div className="po-items-head">
              <span>Materials &amp; specification</span>
            </div>
            {editing.items.map((it, i) => {
              const amt = num(it.qty) * num(it.rate);
              const tc = calcLine({ qty: it.qty, rate: it.rate, received: it.received, paid: it.paid, expDate: it.expDate, dueDate: it.dueDate });
              return (
                <div className="po-item" key={it._id}>
                  <div className="po-item-top">
                    <span className="po-sno">#{i + 1}</span>
                    <div className="po-amt">{money(amt)}</div>
                    {editing.items.length > 1 && (
                      <button type="button" className="icon-btn" title="Remove item" onClick={() => removeItem(it._id)}><Trash2 size={15} /></button>
                    )}
                  </div>
                  <div className="po-fields">
                    <label className="pf wide">Material *<input value={it.material} onChange={e => setItem(it._id, 'material', e.target.value)} placeholder="e.g. TMT Steel Bar" /></label>
                    <label className="pf">Specification<input value={it.spec} onChange={e => setItem(it._id, 'spec', e.target.value)} placeholder="e.g. Fe 500D, 16mm" /></label>
                    <label className="pf">HSN / SAC<input value={it.hsn} onChange={e => setItem(it._id, 'hsn', e.target.value)} placeholder="e.g. 7214" /></label>
                    <label className="pf full">Description of goods<input value={it.description} onChange={e => setItem(it._id, 'description', e.target.value)} placeholder="Longer description as it should read on the order / invoice" /></label>
                    <label className="pf">Qty *<input type="number" min="0" step="any" value={it.qty} onChange={e => setItem(it._id, 'qty', e.target.value)} /></label>
                    <label className="pf">Unit (Per)<select value={it.unit} onChange={e => setItem(it._id, 'unit', e.target.value)}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></label>
                    <label className="pf">Rate (₹) *<input type="number" min="0" step="any" value={it.rate} onChange={e => setItem(it._id, 'rate', e.target.value)} /></label>
                  </div>
                  <details className="po-track">
                    <summary>Delivery &amp; payment tracking</summary>
                    <div className="po-fields">
                      <label className="pf">Received Qty<input type="number" min="0" step="any" value={it.received} onChange={e => setItem(it._id, 'received', e.target.value)} /></label>
                      <label className="pf">Expected Delivery<input type="date" value={it.expDate} onChange={e => setItem(it._id, 'expDate', e.target.value)} /></label>
                      <label className="pf">Payment Due<input type="date" value={it.dueDate} onChange={e => setItem(it._id, 'dueDate', e.target.value)} /></label>
                      <label className="pf">Paid Amount (₹)<input type="number" min="0" step="any" value={it.paid} onChange={e => setItem(it._id, 'paid', e.target.value)} /></label>
                    </div>
                    <div className="po-track-stat">
                      <span>Delivery: <b>{tc.delivery}</b>{tc.delOverdueDays > 0 ? ` · ${tc.delOverdueDays} day${tc.delOverdueDays > 1 ? 's' : ''} overdue` : (tc.delDueToday ? ' · due today' : '')} · {tc.delPct}% received</span>
                      <span>Payment: <b>{tc.payment}</b>{tc.payOverdueDays > 0 ? ` · ${tc.payOverdueDays} day${tc.payOverdueDays > 1 ? 's' : ''} overdue` : (tc.payDueToday ? ' · due today' : '')} · {tc.payPct}% paid</span>
                    </div>
                  </details>
                </div>
              );
            })}
            <button type="button" className="btn ghost add-item-btn" onClick={addItem}><Plus size={16} /> Add item</button>
          </div>

          {/* ── Charges ── */}
          <div className="po-charges">
            <div className="po-items-head"><span>Charges &amp; tax</span></div>
            <div className="po-fields">
              <label className="pf">Loading Charges (₹)<input type="number" min="0" step="any" value={editing.loading} onChange={e => setHdr('loading', e.target.value)} placeholder="0" /></label>
              <label className="pf">Transport Charge (₹)<input type="number" min="0" step="any" value={editing.transport} onChange={e => setHdr('transport', e.target.value)} placeholder="0" /></label>
              <label className="pf">GST %<input type="number" min="0" step="any" value={editing.gstPct} onChange={e => setHdr('gstPct', e.target.value)} placeholder="18" /></label>
              <label className="pf">Payment Method
                <select value={editing.paymentMethod} onChange={e => setHdr('paymentMethod', e.target.value)}>
                  <option value="">— Select —</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
          </div>

          {/* ── Terms & conditions ── */}
          <div className="po-charges">
            <div className="po-items-head"><span>Terms &amp; conditions</span></div>
            <div className="po-fields">
              <label className="pf full"><textarea rows={3} value={editing.terms} onChange={e => setHdr('terms', e.target.value)} placeholder="Payment terms, delivery terms, warranty, penalties, or any conditions for this PO (shown on the details page and the PDF)." /></label>
            </div>
          </div>

          {/* ── Notes ── */}
          <div className="po-charges">
            <div className="po-items-head"><span>Notes / remarks</span></div>
            <div className="po-fields">
              <label className="pf full"><textarea rows={3} value={editing.notes} onChange={e => setHdr('notes', e.target.value)} placeholder="Terms, delivery instructions, or any remarks for this PO (shown on the details page and the PDF)." /></label>
            </div>
          </div>

          {/* ── Invoice PDF ── */}
          <div className="po-charges">
            <div className="po-items-head"><span>Invoice (PDF)</span></div>
            {editing.invoice ? (
              <div className="inv-row">
                <FileText size={18} />
                <button type="button" className="link inv-name" onClick={() => openInvoice(editing.invoice)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>{editing.invoice.name || 'Invoice.pdf'}</button>
                {editing.invoice.size ? <span className="inv-size">{kb(editing.invoice.size)}</span> : null}
                <button type="button" className="link" onClick={() => downloadInvoice(editing.invoice)}>Download</button>
                <label className="link inv-replace">{invBusy ? 'Uploading…' : 'Replace'}<input type="file" accept="application/pdf" hidden onChange={onInvoice} disabled={invBusy} /></label>
                <button type="button" className="link inv-remove" onClick={() => setHdr('invoice', null)}>Remove</button>
              </div>
            ) : (
              <label className={`inv-drop ${invBusy ? 'busy' : ''}`}>
                <input type="file" accept="application/pdf" hidden onChange={onInvoice} disabled={invBusy} />
                <Upload size={17} /> {invBusy ? 'Uploading…' : 'Upload invoice PDF'}
                <span className="inv-hint">PDF only · up to 12 MB</span>
              </label>
            )}
            {invErr && <div className="err" style={{ marginTop: 8 }}>{invErr}</div>}
          </div>

          {/* ── Invoice-style totals ── */}
          <div className="po-totals">
            <Row label="Sub Total (materials)" val={money(poTot.sub)} />
            {poTot.loading ? <Row label="Loading Charges" val={money(poTot.loading)} /> : null}
            {poTot.transport ? <Row label="Transport Charge" val={money(poTot.transport)} /> : null}
            <Row label="Taxable Value" val={money(poTot.taxable)} />
            <Row label={`CGST @ ${(poTot.gstPct / 2)}%`} val={money(poTot.cgst)} />
            <Row label={`SGST @ ${(poTot.gstPct / 2)}%`} val={money(poTot.sgst)} />
            {Math.abs(poTot.roundOff) >= 0.005 ? <Row label="Round Off" val={(poTot.roundOff >= 0 ? '+' : '−') + '₹' + Math.abs(poTot.roundOff).toFixed(2)} /> : null}
            <Row label="Grand Total" val={inr(poTot.grand)} strong />
            <div className="po-words">{amountInWords(poTot.grand)}</div>
          </div>

          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing.isNew ? 'Create PO' : 'Save changes'}</button>
            </div>
          </div>
        </Drawer>
      )}

      <style>{`
        .po-filter{font:600 13.5px var(--f-body)}
        .filter-note{margin:10px 0 0;font-size:13px;color:var(--muted);display:flex;align-items:center;gap:8px}
        .filter-note b{color:var(--accent-ink);text-transform:capitalize}
        .po-link{color:var(--accent-ink);font-weight:700;text-decoration:none;border-bottom:1px dotted var(--accent);cursor:pointer}
        .po-link:hover{text-decoration:none;border-bottom-style:solid}
        .sub-desc{font-size:11.5px;color:var(--muted);margin-top:2px;max-width:240px;white-space:normal;line-height:1.35}
        .po-items,.po-charges{margin-top:18px}
        .po-items-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 10px}
        .po-items-head span{font:700 12px var(--f-body);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
        .btn.ghost{background:var(--accent-soft);color:var(--accent-ink);border:1px solid transparent}
        .btn.sm{padding:7px 11px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px}
        .add-item-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;border:1px dashed var(--accent);font-weight:600;padding:12px}
        .po-item{border:1px solid var(--line);border-radius:12px;padding:13px 13px 11px;margin-bottom:12px;background:var(--surface)}
        .po-item-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}
        .po-sno{font:700 12.5px var(--f-mono,var(--f-body));color:var(--accent-ink);background:var(--accent-soft);padding:3px 9px;border-radius:7px}
        .po-amt{margin-left:auto;font:700 14px var(--f-body);color:var(--fg)}
        .icon-btn{background:none;border:1px solid var(--line);border-radius:8px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--bad)}
        .icon-btn:hover{background:var(--bad-bg)}
        .po-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .pf{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:600;color:var(--muted);min-width:0}
        .pf.wide{grid-column:span 2}
        .pf.full{grid-column:1/-1}
        .pf input,.pf select{width:100%;box-sizing:border-box;max-width:100%;font:400 14px var(--f-body);padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--fg);outline:none;min-width:0}
        .pf input[type=date],.pf input[type=number]{-webkit-appearance:none;appearance:none}
        .pf textarea{width:100%;box-sizing:border-box;font:400 14px var(--f-body);padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--fg);outline:none;resize:vertical;min-height:62px}
        .pf textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .pf input:focus,.pf select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .po-track{margin-top:10px;border-top:1px dashed var(--line);padding-top:10px}
        .po-track summary{cursor:pointer;font-size:12px;font-weight:600;color:var(--accent-ink);list-style:none;user-select:none}
        .po-track summary::-webkit-details-marker{display:none}
        .po-track summary:before{content:'▸ ';color:var(--muted)}
        .po-track[open] summary:before{content:'▾ '}
        .po-track .po-fields{margin-top:10px}
        .po-track-stat{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;color:var(--muted)}
        .po-track-stat b{color:var(--fg)}
        .inv-drop{display:flex;align-items:center;gap:9px;flex-wrap:wrap;border:1px dashed var(--accent);border-radius:11px;padding:14px 16px;cursor:pointer;color:var(--accent-ink);font-weight:600;font-size:14px;background:var(--accent-soft)}
        .inv-drop.busy{opacity:.7;cursor:default}
        .inv-hint{font-weight:400;color:var(--muted);font-size:12px;margin-left:auto}
        .inv-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--line);border-radius:11px;padding:12px 14px;background:var(--surface)}
        .inv-name{color:var(--accent-ink);font-weight:600;text-decoration:none;word-break:break-all}
        .inv-name:hover{text-decoration:underline}
        .inv-size{color:var(--muted);font-size:12px}
        .inv-replace{margin-left:auto}
        .po-totals{margin-top:18px;border:1px solid var(--line);border-radius:12px;padding:6px 14px;background:var(--surface)}
        .po-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;font-size:13.5px;border-bottom:1px dashed var(--line)}
        .po-row:last-of-type{border-bottom:0}
        .po-row .l{color:var(--muted)}
        .po-row .v{font-weight:600;color:var(--fg)}
        .po-row.strong{padding:11px 0}
        .po-row.strong .l{color:var(--fg);font-weight:700;font-size:14.5px}
        .po-row.strong .v{color:var(--accent-ink);font-weight:800;font-size:16px}
        .po-words{padding:9px 0 4px;font-size:12.5px;font-style:italic;color:var(--muted);border-top:1px solid var(--line);margin-top:2px}
        @media (max-width:720px){.po-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.pf.wide{grid-column:1/-1}}
      `}</style>
    </section>
  );
}

const Row = ({ label, val, strong }) => (
  <div className={`po-row ${strong ? 'strong' : ''}`}>
    <span className="l">{label}</span><span className="v">{val}</span>
  </div>
);
