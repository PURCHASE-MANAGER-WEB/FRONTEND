import React, { useState, useMemo } from 'react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { calcLine, num, inr, qfmt, dfmt, today, vendorName, nextPo, UNITS } from '../utils/procurement';

const blank = (lines, vendors) => ({
  po: nextPo(lines), poDate: today(), vid: vendors[0]?.vid || '', project: '', material: '', spec: '',
  qty: '', unit: 'MT', rate: '', received: 0, expDate: '', dueDate: '', paid: 0,
});
const newId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function PurchaseOrders() {
  const { vendors, lines, loading, error, saveLine, deleteLine } = usePurchaseData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // {isNew, id, data}
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => lines
    .map(l => ({ l, c: calcLine(l), vn: vendorName(vendors, l.vid) }))
    .filter(({ l, vn }) => !q || [l.po, l.vid, vn, l.project, l.material, l.spec].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(a.l.po).localeCompare(String(b.l.po), undefined, { numeric: true }) || String(a.l.spec || '').localeCompare(String(b.l.spec || ''))), [lines, vendors, q]);

  const totals = rows.reduce((s, { l, c }) => ({ total: s.total + c.total, paid: s.paid + num(l.paid), out: s.out + c.out }), { total: 0, paid: 0, out: 0 });
  const poNums = [...new Set(lines.map(l => l.po))];

  const open = (l) => {
    if (!vendors.length) { toast('Add a vendor first'); return; }
    setFormErr(''); setConfirmDel(false);
    setEditing(l ? { isNew: false, id: l.id, data: { ...l, qty: l.qty ?? '', rate: l.rate ?? '', received: l.received ?? 0, paid: l.paid ?? 0 } }
                  : { isNew: true, id: newId(), data: blank(lines, vendors) });
  };
  const close = () => { setEditing(null); setConfirmDel(false); };
  const set = (k, val) => setEditing(e => ({ ...e, data: { ...e.data, [k]: val } }));

  // Picking an existing PO number pre-fills the shared header fields (new lines only).
  const onPoBlur = () => {
    if (!editing?.isNew) return;
    const ex = lines.find(x => x.po === String(editing.data.po).trim().toUpperCase());
    if (ex) setEditing(e => ({ ...e, data: { ...e.data, poDate: ex.poDate || '', vid: ex.vid, project: ex.project || '', expDate: ex.expDate || '', dueDate: ex.dueDate || '' } }));
  };

  const live = editing ? calcLine({ qty: num(editing.data.qty), rate: num(editing.data.rate), received: num(editing.data.received), paid: num(editing.data.paid), expDate: editing.data.expDate, dueDate: editing.data.dueDate }) : null;

  const submit = async () => {
    const d = editing.data;
    const po = String(d.po).trim().toUpperCase();
    const qty = num(d.qty), rate = num(d.rate), received = num(d.received), paid = num(d.paid);
    const err = !po ? 'Enter a PO number.' : !d.poDate ? 'Choose the PO date.' : !d.vid ? 'Select a vendor.'
      : !String(d.project).trim() ? 'Enter the project name.' : !String(d.material).trim() ? 'Enter the material.'
      : qty <= 0 ? 'Ordered quantity must be more than 0.' : rate <= 0 ? 'Rate must be more than 0.'
      : received > qty ? "Received quantity can't be more than ordered quantity." : paid > qty * rate ? "Paid amount can't be more than the total value." : '';
    if (err) { setFormErr(err); return; }
    const payload = { po, poDate: d.poDate, vid: d.vid, project: d.project.trim(), material: d.material.trim(), spec: String(d.spec || '').trim(), qty, unit: d.unit, rate, received, expDate: d.expDate, dueDate: d.dueDate, paid };
    setBusy(true);
    try { await saveLine(editing.isNew, editing.id, payload); close(); toast(editing.isNew ? 'PO line added' : 'PO line saved'); }
    catch (e) { setFormErr(e.message || 'Could not save PO line.'); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteLine(editing.id); close(); toast('PO line deleted'); }
    catch (e) { setFormErr(e.message || 'Could not delete PO line.'); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <div className="toolbar">
        <h2>Purchase Order &amp; Material Tracking</h2>
        <div className="right">
          <input className="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO, vendor, material…" aria-label="Search purchase orders" />
          <button className="btn primary" onClick={() => open(null)}>+ Add PO line</button>
        </div>
      </div>
      <p className="legend" style={{ margin: '8px 0 0' }}>Shaded columns are calculated automatically. One line per material — a PO with several materials shares one PO number.</p>
      <div className="tbl" style={{ marginTop: 10 }}>
        <table>
          <thead><tr>
            <th>PO Number</th><th>PO Date</th><th>Vendor</th><th>Project</th><th>Material</th><th>Spec</th>
            <th className="num">Ordered</th><th>Unit</th><th className="num">Rate</th><th className="num">Total</th>
            <th className="num">Received</th><th className="num">Pending</th><th>Exp. Delivery</th><th>Payment Due</th>
            <th className="num">Paid</th><th className="num">Outstanding</th><th>Delivery</th><th>Payment</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={19} loading={loading} error={error}
                empty={lines.length ? 'No PO lines match your search.' : (vendors.length ? 'No purchase orders yet. Add a PO line to start tracking.' : 'Add a vendor first, then raise purchase orders against them.')} />
            ) : rows.map(({ l, c, vn }) => (
              <tr key={l.id}>
                <td className="id">{l.po}</td><td>{dfmt(l.poDate)}</td><td>{vn}</td><td>{l.project || '—'}</td>
                <td>{l.material || '—'}</td><td>{l.spec || '—'}</td>
                <td className="num">{qfmt(l.qty)}</td><td>{l.unit}</td><td className="num">{inr(l.rate)}</td>
                <td className="num calc">{inr(c.total)}</td><td className="num">{qfmt(l.received)}</td><td className="num calc">{qfmt(c.pending)}</td>
                <td className={c.lateDel ? 'overdue' : ''}>{dfmt(l.expDate)}{c.lateDel ? ' · late' : ''}</td>
                <td className={c.latePay ? 'overdue' : ''}>{dfmt(l.dueDate)}{c.latePay ? ' · overdue' : ''}</td>
                <td className="num">{inr(l.paid)}</td><td className="num calc">{inr(c.out)}</td>
                <td className="calc"><Pill s={c.delivery} /></td><td className="calc"><Pill s={c.payment} /></td>
                <td><button className="link" onClick={() => open(l)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr>
              <td colSpan={9}>Totals ({rows.length} line{rows.length > 1 ? 's' : ''})</td>
              <td className="num">{inr(totals.total)}</td><td colSpan={4}></td>
              <td className="num">{inr(totals.paid)}</td><td className="num">{inr(totals.out)}</td><td colSpan={3}></td>
            </tr></tfoot>
          )}
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'Add PO line' : 'Edit PO line'}</h3>
          <p className="hint">One line per material. For a PO with several materials, add each with the same PO number.</p>
          <div className="grid">
            <Field label="PO Number *">
              <input list="po-list" value={editing.data.po} onChange={e => set('po', e.target.value)} onBlur={onPoBlur} />
              <datalist id="po-list">{poNums.map(p => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label="PO Date *"><input type="date" value={editing.data.poDate} onChange={e => set('poDate', e.target.value)} /></Field>
            <Field label="Vendor *" full>
              <select value={editing.data.vid} onChange={e => set('vid', e.target.value)}>
                {vendors.map(v => <option key={v.vid} value={v.vid}>{v.vid} · {v.name}{v.status !== 'Active' ? ` (${v.status})` : ''}</option>)}
              </select>
            </Field>
            <Field label="Project Name *" full><input value={editing.data.project} onChange={e => set('project', e.target.value)} /></Field>
            <Field label="Material *"><input value={editing.data.material} onChange={e => set('material', e.target.value)} /></Field>
            <Field label="Specification"><input value={editing.data.spec} onChange={e => set('spec', e.target.value)} placeholder="e.g. ISMB 300" /></Field>
            <Field label="Ordered Qty *"><input type="number" min="0" step="any" value={editing.data.qty} onChange={e => set('qty', e.target.value)} /></Field>
            <Field label="Unit"><select value={editing.data.unit} onChange={e => set('unit', e.target.value)}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Rate (₹ per unit) *"><input type="number" min="0" step="any" value={editing.data.rate} onChange={e => set('rate', e.target.value)} /></Field>
            <Field label="Received Qty"><input type="number" min="0" step="any" value={editing.data.received} onChange={e => set('received', e.target.value)} /></Field>
            <Field label="Expected Delivery"><input type="date" value={editing.data.expDate} onChange={e => set('expDate', e.target.value)} /></Field>
            <Field label="Payment Due Date"><input type="date" value={editing.data.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
            <Field label="Paid Amount (₹)" full><input type="number" min="0" step="any" value={editing.data.paid} onChange={e => set('paid', e.target.value)} /></Field>
            <div className="calcbox">
              <div><div className="l">Total Value</div><div className="b">{inr(live.total)}</div></div>
              <div><div className="l">Pending Qty</div><div className="b">{qfmt(live.pending)}</div></div>
              <div><div className="l">Outstanding</div><div className="b">{inr(live.out)}</div></div>
              <div><div className="l">Delivery</div><div className="b"><Pill s={live.delivery} /></div></div>
              <div><div className="l">Payment</div><div className="b"><Pill s={live.payment} /></div></div>
            </div>
          </div>
          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{!editing.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete line</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing.isNew ? 'Add line' : 'Save changes'}</button>
            </div>
          </div>
          {confirmDel && (
            <div className="confirm">
              Delete this {editing.data.material} line from {editing.data.po}?
              <button className="btn danger" onClick={doDelete} disabled={busy}>Delete</button>
              <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
            </div>
          )}
        </Drawer>
      )}
    </section>
  );
}
