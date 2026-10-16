import React, { useState, useMemo } from 'react';
import { Store, Factory, CheckCircle2, IndianRupee, Wallet, Coins, Clock } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { isRestrictedPM } from '../api/client';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { calcLine, num, inr, TERMS, VENDOR_STATUS, kpis, groupPOs, MATERIALS, FAB_SERVICES } from '../utils/procurement';

// Shared master for purchase partners. kind = 'Supplier' (Vendors) or 'Fabricator'
// (Fabricators). Both live in the same purchase_suppliers collection, distinguished
// by `type`. The restricted Purchase Manager designation never sees accounts/outstanding.
export default function VendorManager({ kind = 'Supplier' }) {
  const isFab = kind === 'Fabricator';
  const Label = isFab ? 'Fabricator' : 'Vendor';
  const label = Label.toLowerCase();
  const pm = isRestrictedPM();

  const { vendors, lines, loading, error, saveVendor, deleteVendor } = usePurchaseData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  // Scope to this kind (legacy rows with no type are Suppliers).
  const scoped = useMemo(() => vendors.filter(v => (v.type || 'Supplier') === kind), [vendors, kind]);
  const nextId = () => {
    const pfx = isFab ? 'FAB-' : 'VEN-';
    const n = vendors.filter(v => String(v.vid || '').startsWith(pfx)).map(v => parseInt(String(v.vid).replace(/\D/g, ''), 10) || 0);
    return pfx + String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0');
  };
  const blank = () => ({ vid: nextId(), name: '', contact: '', mobile: '', email: '', address: '', gst: '', material: '', creditLimit: '', terms: '30 Days', status: 'Active', type: kind });

  const outstandingFor = (vid) => lines.filter(l => l.vid === vid).reduce((s, l) => s + calcLine(l).out, 0);
  const k = useMemo(() => kpis(lines), [lines]);
  const pendingPayments = useMemo(() => groupPOs(lines).filter(g => g.payment !== 'Paid').length, [lines]);
  const activeCount = scoped.filter(v => String(v.status || 'Active') === 'Active').length;

  const rows = useMemo(() => scoped
    .filter(v => !q || Object.values(v).join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(a.vid).localeCompare(String(b.vid), undefined, { numeric: true })), [scoped, q]);

  const open = (v) => { setFormErr(''); setConfirmDel(false); setEditing(v ? { isNew: false, data: { ...v, creditLimit: v.creditLimit ?? '' } } : { isNew: true, data: blank() }); };
  const close = () => { setEditing(null); setConfirmDel(false); };
  const set = (kk, val) => setEditing(e => ({ ...e, data: { ...e.data, [kk]: val } }));

  const submit = async () => {
    const d = editing.data;
    const vid = String(d.vid).trim().toUpperCase();
    const err = !vid ? `Enter a ${Label} ID.`
      : !/^[A-Z0-9_.~:@+-]+$/.test(vid) ? `${Label} ID can use letters, numbers and dashes only.`
      : (editing.isNew && vendors.some(x => x.vid === vid)) ? `${vid} already exists. Use a different ${Label} ID.`
      : !String(d.name).trim() ? `Enter the ${label} name.`
      : (d.mobile && !/^\d{10}$/.test(String(d.mobile).trim())) ? 'Mobile number should be 10 digits.'
      : (!isFab && d.gst && String(d.gst).trim().length !== 15) ? 'GSTIN should be 15 characters.' : '';
    if (err) { setFormErr(err); return; }
    const payload = {
      vid, name: d.name.trim(), contact: d.contact.trim(), mobile: d.mobile.trim(), email: d.email.trim(),
      address: d.address.trim(), gst: isFab ? '' : String(d.gst).trim().toUpperCase(), material: d.material.trim(),
      creditLimit: num(d.creditLimit), terms: d.terms, status: d.status, type: d.type || kind,
    };
    setBusy(true);
    try { await saveVendor(editing.isNew, vid, payload); close(); toast(editing.isNew ? `${Label} added` : `${Label} saved`); }
    catch (e) { setFormErr(e.message || `Could not save ${label}.`); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteVendor(editing.data.vid); close(); toast(`${Label} deleted`); }
    catch (e) { setFormErr(e.message || `Could not delete ${label}.`); }
    finally { setBusy(false); }
  };

  const cols = 7 + (isFab ? 0 : 4) + (pm ? 0 : 1) + ((!pm && !isFab) ? 1 : 0);

  return (
    <section>
      <section className="kpis" aria-label={`${Label} summary`} style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic">{isFab ? <Factory size={16} /> : <Store size={16} />}</span><div className="l">Total {Label}s</div><div className="v">{scoped.length}</div></div>
        <div className="kpi"><span className="kpi-ic"><CheckCircle2 size={16} /></span><div className="l">Active {Label}s</div><div className="v">{activeCount}</div></div>
        <div className="kpi"><span className="kpi-ic"><IndianRupee size={16} /></span><div className="l">Total Purchase Value</div><div className="v">{inr(k.value)}</div></div>
        {!pm && <div className="kpi"><span className="kpi-ic"><Wallet size={16} /></span><div className="l">Paid Amount</div><div className="v">{inr(k.paid)}</div></div>}
        {!pm && <div className="kpi"><span className="kpi-ic"><Coins size={16} /></span><div className="l">Outstanding</div><div className="v">{inr(k.out)}</div></div>}
        {!pm && <div className="kpi"><span className="kpi-ic"><Clock size={16} /></span><div className="l">Pending Payments</div><div className="v">{pendingPayments}</div></div>}
      </section>
      <div className="toolbar">
        <h2>{Label} Registration</h2>
        <div className="right">
          <input className="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${label}s…`} aria-label={`Search ${label}s`} />
          <button className="btn primary" onClick={() => open(null)}>+ Add {label}</button>
        </div>
      </div>
      <div className="tbl" style={{ marginTop: 12 }}>
        <table>
          <thead><tr>
            <th>{Label} ID</th><th>{Label} Name</th><th>Contact</th><th>Mobile</th>{!isFab && <th>Email</th>}
            {!isFab && <th>GST Number</th>}<th>{isFab ? 'Service' : 'Material / Service'}</th>{!isFab && <th className="num">Credit Limit</th>}{!isFab && <th>Terms</th>}<th>Status</th>
            {!pm && <th className="num">Outstanding</th>}
            {!pm && !isFab && <th className="num">Available Credit</th>}
            <th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={cols} loading={loading} error={error}
                empty={scoped.length ? `No ${label}s match your search.` : `No ${label}s yet. Add your first ${label} to start raising purchase orders.`} />
            ) : rows.map(v => {
              const out = outstandingFor(v.vid);
              const avail = num(v.creditLimit) - out;
              return (
                <tr key={v.vid}>
                  <td className="id">{v.vid}</td>
                  <td><b>{v.name}</b></td>
                  <td>{v.contact || '—'}</td>
                  <td className="id">{v.mobile || '—'}</td>
                  {!isFab && <td>{v.email || '—'}</td>}
                  {!isFab && <td className="id">{v.gst || '—'}</td>}
                  <td>{v.material || '—'}</td>
                  {!isFab && <td className="num">{inr(v.creditLimit)}</td>}
                  {!isFab && <td>{v.terms || '—'}</td>}
                  <td><Pill s={v.status || 'Active'} /></td>
                  {!pm && <td className="num calc">{inr(out)}</td>}
                  {!pm && !isFab && <td className={`num calc ${avail < 0 ? 'overdue' : ''}`}>{inr(avail)}{avail < 0 ? ' ⚠' : ''}</td>}
                  <td><button className="link" onClick={() => open(v)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? `Add ${label}` : `Edit ${label}`}</h3>
          <p className="hint">Fields marked * are required.{pm ? '' : ' Outstanding and available credit are calculated from purchase orders.'}</p>
          <div className="grid">
            <Field label={`${Label} ID *`}><input value={editing.data.vid} readOnly={!editing.isNew} onChange={e => set('vid', e.target.value)} /></Field>
            <Field label="Status"><select value={editing.data.status} onChange={e => set('status', e.target.value)}>{VENDOR_STATUS.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label={`${Label} Name *`} full><input value={editing.data.name} onChange={e => set('name', e.target.value)} /></Field>
            <Field label="Contact Person"><input value={editing.data.contact} onChange={e => set('contact', e.target.value)} /></Field>
            <Field label="Mobile Number"><input inputMode="tel" value={editing.data.mobile} onChange={e => set('mobile', e.target.value)} placeholder="10-digit mobile" /></Field>
            {!isFab && <Field label="Email" full><input type="email" value={editing.data.email} onChange={e => set('email', e.target.value)} /></Field>}
            <Field label="Address" full><input value={editing.data.address} onChange={e => set('address', e.target.value)} /></Field>
            {!isFab && <Field label="GST Number"><input value={editing.data.gst} maxLength={15} style={{ textTransform: 'uppercase' }} onChange={e => set('gst', e.target.value)} placeholder="15-character GSTIN" /></Field>}
            <Field label={isFab ? 'Service' : 'Material / Service'}>
              {(() => {
                const LIST = isFab ? FAB_SERVICES : MATERIALS;
                const KNOWN = LIST.filter(m => m !== 'Other');
                const mat = editing.data.material || '';
                const isOther = mat === 'Other' || (mat !== '' && !KNOWN.includes(mat));
                return (<>
                  <select value={isOther ? 'Other' : mat} onChange={e => set('material', e.target.value)}>
                    <option value="">{isFab ? 'Select service' : 'Select material'}</option>
                    {KNOWN.map(m => <option key={m} value={m}>{m}</option>)}
                    <option value="Other">Other</option>
                  </select>
                  {isOther && <input placeholder={isFab ? 'Enter service' : 'Enter material / service'} value={mat === 'Other' ? '' : mat} onChange={e => set('material', e.target.value)} style={{ marginTop: 6 }} />}
                </>);
              })()}
            </Field>
            {!isFab && <Field label="Credit Limit (₹)"><input type="number" min="0" step="1000" value={editing.data.creditLimit} onChange={e => set('creditLimit', e.target.value)} /></Field>}
            {!isFab && <Field label="Payment Terms"><select value={editing.data.terms} onChange={e => set('terms', e.target.value)}>{TERMS.map(t => <option key={t}>{t}</option>)}</select></Field>}
          </div>
          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{!editing.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete {label}</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing.isNew ? `Add ${label}` : 'Save changes'}</button>
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
