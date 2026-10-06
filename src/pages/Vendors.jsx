import React, { useState, useMemo } from 'react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { calcLine, num, inr, nextVid, TERMS, VENDOR_STATUS, kpis, groupPOs, MATERIALS } from '../utils/procurement';

const blank = (vendors) => ({ vid: nextVid(vendors), name: '', contact: '', mobile: '', email: '', address: '', gst: '', material: '', creditLimit: '', terms: '30 Days', status: 'Active' });

export default function Vendors() {
  const { vendors, lines, loading, error, saveVendor, deleteVendor } = usePurchaseData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // {isNew, data}
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const outstandingFor = (vid) => lines.filter(l => l.vid === vid).reduce((s, l) => s + calcLine(l).out, 0);

  // Summary cards — all figures derived from real vendor + PO records.
  const k = useMemo(() => kpis(lines), [lines]);
  const pendingPayments = useMemo(() => groupPOs(lines).filter(g => g.payment !== 'Paid').length, [lines]);
  const activeVendors = vendors.filter(v => String(v.status || 'Active') === 'Active').length;

  const rows = useMemo(() => vendors
    .filter(v => !q || Object.values(v).join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(a.vid).localeCompare(String(b.vid), undefined, { numeric: true })), [vendors, q]);

  const open = (v) => { setFormErr(''); setConfirmDel(false); setEditing(v ? { isNew: false, data: { ...v, creditLimit: v.creditLimit ?? '' } } : { isNew: true, data: blank(vendors) }); };
  const close = () => { setEditing(null); setConfirmDel(false); };
  const set = (k, val) => setEditing(e => ({ ...e, data: { ...e.data, [k]: val } }));

  const submit = async () => {
    const d = editing.data;
    const vid = String(d.vid).trim().toUpperCase();
    const err = !vid ? 'Enter a Vendor ID.'
      : !/^[A-Z0-9_.~:@+-]+$/.test(vid) ? 'Vendor ID can use letters, numbers and dashes only.'
      : (editing.isNew && vendors.some(x => x.vid === vid)) ? `${vid} already exists. Use a different Vendor ID.`
      : !String(d.name).trim() ? 'Enter the vendor name.'
      : (d.mobile && !/^\d{10}$/.test(String(d.mobile).trim())) ? 'Mobile number should be 10 digits.'
      : (d.gst && String(d.gst).trim().length !== 15) ? 'GSTIN should be 15 characters.' : '';
    if (err) { setFormErr(err); return; }
    const payload = {
      vid, name: d.name.trim(), contact: d.contact.trim(), mobile: d.mobile.trim(), email: d.email.trim(),
      address: d.address.trim(), gst: String(d.gst).trim().toUpperCase(), material: d.material.trim(),
      creditLimit: num(d.creditLimit), terms: d.terms, status: d.status,
    };
    setBusy(true);
    try { await saveVendor(editing.isNew, vid, payload); close(); toast(editing.isNew ? 'Vendor added' : 'Vendor saved'); }
    catch (e) { setFormErr(e.message || 'Could not save vendor.'); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteVendor(editing.data.vid); close(); toast('Vendor deleted'); }
    catch (e) { setFormErr(e.message || 'Could not delete vendor.'); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <section className="kpis" aria-label="Vendor summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="l">Total Vendors</div><div className="v">{vendors.length}</div></div>
        <div className="kpi"><div className="l">Active Vendors</div><div className="v">{activeVendors}</div></div>
        <div className="kpi"><div className="l">Total Purchase Value</div><div className="v">{inr(k.value)}</div></div>
        <div className="kpi"><div className="l">Paid Amount</div><div className="v">{inr(k.paid)}</div></div>
        <div className="kpi"><div className="l">Outstanding</div><div className="v">{inr(k.out)}</div></div>
        <div className="kpi"><div className="l">Pending Payments</div><div className="v">{pendingPayments}</div></div>
      </section>
      <div className="toolbar">
        <h2>Vendor Registration</h2>
        <div className="right">
          <input className="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search vendors…" aria-label="Search vendors" />
          <button className="btn primary" onClick={() => open(null)}>+ Add vendor</button>
        </div>
      </div>
      <div className="tbl" style={{ marginTop: 12 }}>
        <table>
          <thead><tr>
            <th>Vendor ID</th><th>Vendor Name</th><th>Contact</th><th>Mobile</th><th>Email</th><th>GST Number</th>
            <th>Material / Service</th><th className="num">Credit Limit</th><th>Terms</th><th>Status</th>
            <th className="num">Outstanding</th><th className="num">Available Credit</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={13} loading={loading} error={error}
                empty={vendors.length ? 'No vendors match your search.' : 'No vendors yet. Add your first vendor to start raising purchase orders.'} />
            ) : rows.map(v => {
              const out = outstandingFor(v.vid);
              const avail = num(v.creditLimit) - out;
              return (
                <tr key={v.vid}>
                  <td className="id">{v.vid}</td>
                  <td><b>{v.name}</b></td>
                  <td>{v.contact || '—'}</td>
                  <td className="id">{v.mobile || '—'}</td>
                  <td>{v.email || '—'}</td>
                  <td className="id">{v.gst || '—'}</td>
                  <td>{v.material || '—'}</td>
                  <td className="num">{inr(v.creditLimit)}</td>
                  <td>{v.terms || '—'}</td>
                  <td><Pill s={v.status || 'Active'} /></td>
                  <td className="num calc">{inr(out)}</td>
                  <td className={`num calc ${avail < 0 ? 'overdue' : ''}`}>{inr(avail)}{avail < 0 ? ' ⚠' : ''}</td>
                  <td><button className="link" onClick={() => open(v)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'Add vendor' : 'Edit vendor'}</h3>
          <p className="hint">Fields marked * are required. Outstanding and available credit are calculated from purchase orders.</p>
          <div className="grid">
            <Field label="Vendor ID *"><input value={editing.data.vid} readOnly={!editing.isNew} onChange={e => set('vid', e.target.value)} /></Field>
            <Field label="Status"><select value={editing.data.status} onChange={e => set('status', e.target.value)}>{VENDOR_STATUS.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Vendor Name *" full><input value={editing.data.name} onChange={e => set('name', e.target.value)} /></Field>
            <Field label="Contact Person"><input value={editing.data.contact} onChange={e => set('contact', e.target.value)} /></Field>
            <Field label="Mobile Number"><input inputMode="tel" value={editing.data.mobile} onChange={e => set('mobile', e.target.value)} placeholder="10-digit mobile" /></Field>
            <Field label="Email" full><input type="email" value={editing.data.email} onChange={e => set('email', e.target.value)} /></Field>
            <Field label="Address" full><input value={editing.data.address} onChange={e => set('address', e.target.value)} /></Field>
            <Field label="GST Number"><input value={editing.data.gst} maxLength={15} style={{ textTransform: 'uppercase' }} onChange={e => set('gst', e.target.value)} placeholder="15-character GSTIN" /></Field>
            <Field label="Material / Service"><select value={editing.data.material || ''} onChange={e => set('material', e.target.value)}>
              <option value="">Select material</option>
              {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              {editing.data.material && !MATERIALS.includes(editing.data.material) && <option value={editing.data.material}>{editing.data.material}</option>}
            </select></Field>
            <Field label="Credit Limit (₹)"><input type="number" min="0" step="1000" value={editing.data.creditLimit} onChange={e => set('creditLimit', e.target.value)} /></Field>
            <Field label="Payment Terms"><select value={editing.data.terms} onChange={e => set('terms', e.target.value)}>{TERMS.map(t => <option key={t}>{t}</option>)}</select></Field>
          </div>
          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{!editing.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete vendor</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing.isNew ? 'Add vendor' : 'Save changes'}</button>
            </div>
          </div>
          {confirmDel && (
            <div className="confirm">
              Delete {editing.data.name} permanently?
              <button className="btn danger" onClick={doDelete} disabled={busy}>Delete</button>
              <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
            </div>
          )}
        </Drawer>
      )}
    </section>
  );
}
