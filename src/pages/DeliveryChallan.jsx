import React, { useState, useMemo } from 'react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Truck, CheckCircle2, Clock, AlertTriangle, FileDown } from 'lucide-react';
import { Drawer, Field, StateRow } from '../components/ui';
import ComboBox from '../components/ComboBox';
import { num, qfmt, dfmt, today, groupPOs, vendorName, MATERIALS, UNITS } from '../utils/procurement';
import { readFileBase64, openChallanDoc, downloadChallanDoc, DOC_MAX_BYTES } from '../utils/challanDoc';
import { downloadChallanPdf } from '../utils/challanPdf';

const DC_STATUS = ['Pending', 'Partial', 'Received'];
const DC_CLS = { Received: 'p-ok', Partial: 'p-warn', Pending: 'p-mute' };
const PURPOSES = ['Supply to Site', 'Job Work', 'Returnable', 'Non-Returnable'];
const DCStatus = ({ s }) => <span className={`pill ${DC_CLS[s] || 'p-mute'}`}>{s}</span>;
const blankItem = () => ({ _id: Math.random().toString(36).slice(2), material: '', qty: '', unit: 'Nos', make: '', weight: '', remarks: '' });
const blank = () => ({
  date: today(), vid: '', project: '', po: '', status: 'Received', items: [blankItem()], notes: '',
  supplierRef: '', vehicleNo: '', driverName: '', driverMobile: '',
  consigneeName: '', consigneeAddress: '', consigneeMobile: '', purpose: 'Supply to Site',
  docName: '', docType: '', docSize: 0,
});

// DC/PO reference formatting for the printed challan.
const numOf = (id) => String(id || '').replace(/\D/g, '') || '';
const fyOf = (ymd) => { const [y, m] = String(ymd || '').split('-').map(Number); if (!y) return ''; const s = (m >= 4) ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; };
const ddmmyyyy = (ymd) => { const [y, m, d] = String(ymd || '').split('-'); return (y && m && d) ? `${d}.${m}.${y}` : ''; };

export default function DeliveryChallan() {
  const { challans, vendors, projects, lines, loading, error, saveChallan, deleteChallan } = usePurchaseData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editing, setEditing] = useState(null);
  const [newFile, setNewFile] = useState(null);
  const [removeDoc, setRemoveDoc] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const poList = useMemo(() => groupPOs(lines), [lines]);

  const matText = (c) => {
    const its = Array.isArray(c.items) ? c.items.filter((x) => x.material) : [];
    if (!its.length) return '—';
    return its.length === 1 ? its[0].material : `${its[0].material} (+${its.length - 1} more)`;
  };
  const qtyText = (c) => {
    const its = Array.isArray(c.items) ? c.items : [];
    const total = its.reduce((s, x) => s + num(x.qty), 0);
    const units = [...new Set(its.map((x) => x.unit).filter(Boolean))];
    return total ? `${qfmt(total)} ${units.length === 1 ? units[0] : ''}`.trim() : '—';
  };

  // Build the data the PDF generator needs from a challan record (saved or in-progress).
  const makeDcData = (c) => {
    const fy = fyOf(c.date);
    const vName = c.vid ? vendorName(vendors, c.vid) : '';
    const supplierRef = [vName, String(c.supplierRef || '').trim()].filter(Boolean).join(' – ');
    const its = (Array.isArray(c.items) ? c.items : []).filter((x) => String(x.material).trim() || num(x.qty));
    return {
      dcNo: `TES / ${(numOf(c.id) || '').padStart(3, '0')}`,
      dateFmt: String(c.date || '').split('-').reverse().join('/'),
      poRef: c.po ? `TSPL/PO/${numOf(c.po)}/${fy || '2026-27'}` : '',
      supplierRef,
      vehicleNo: c.vehicleNo || '',
      driver: [c.driverName, c.driverMobile].filter(Boolean).join(' / '),
      consignee: { name: c.consigneeName || '', address: c.consigneeAddress || '', phone: c.consigneeMobile || '', email: c.consigneeEmail || '', gstin: c.consigneeGstin || '' },
      purpose: c.purpose || '',
      items: its.map((it) => ({ material: it.material, make: it.make || '', unit: it.unit || 'Nos', qty: num(it.qty), weight: num(it.weight), remarks: it.remarks || '' })),
      totalQty: its.reduce((s, it) => s + num(it.qty), 0),
      fileName: c.id || 'delivery-challan',
    };
  };
  const genPdf = async (c) => { try { await downloadChallanPdf(makeDcData(c)); } catch (e) { toast(e.message || 'Could not generate the challan PDF'); } };

  const rows = useMemo(() => challans
    .filter((c) => statusF === 'all' || (c.status || 'Received') === statusF)
    .filter((c) => !q || [c.id, c.po, c.project, vendorName(vendors, c.vid), c.date, matText(c)].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())),
    [challans, q, statusF, vendors]);

  const open = (c) => {
    setFormErr(''); setConfirmDel(false); setNewFile(null); setRemoveDoc(false);
    setEditing(c
      ? { isNew: false, data: { ...blank(), ...c, items: (Array.isArray(c.items) && c.items.length ? c.items.map((it) => ({ ...blankItem(), ...it })) : [blankItem()]) } }
      : { isNew: true, data: blank() });
  };
  const close = () => { setEditing(null); setConfirmDel(false); setNewFile(null); setRemoveDoc(false); };
  const set = (k, val) => setEditing((e) => ({ ...e, data: { ...e.data, [k]: val } }));
  const setItem = (id, k, val) => setEditing((e) => ({ ...e, data: { ...e.data, items: e.data.items.map((it) => it._id === id ? { ...it, [k]: val } : it) } }));
  const addItem = () => setEditing((e) => ({ ...e, data: { ...e.data, items: [...e.data.items, blankItem()] } }));
  const removeItem = (id) => setEditing((e) => ({ ...e, data: { ...e.data, items: e.data.items.length > 1 ? e.data.items.filter((it) => it._id !== id) : e.data.items } }));

  const onPO = (po) => {
    const g = poList.find((x) => x.po === po);
    setEditing((e) => ({ ...e, data: { ...e.data, po, vid: e.data.vid || (g ? g.vid : ''), project: e.data.project || (g ? g.project : '') } }));
  };

  const onFile = (file) => {
    setFormErr('');
    if (!file) { setNewFile(null); return; }
    const okType = file.type === 'application/pdf' || /^image\//.test(file.type) || /\.(pdf|png|jpe?g|webp)$/i.test(file.name || '');
    if (!okType) { setFormErr('Attach a PDF or image file.'); return; }
    if (file.size > DOC_MAX_BYTES) { setFormErr('That file is larger than 12 MB.'); return; }
    setNewFile(file); setRemoveDoc(false);
  };

  const submit = async () => {
    const d = editing.data;
    const items = d.items.filter((it) => String(it.material).trim() || num(it.qty));
    if (!d.date) { setFormErr('Pick the challan date.'); return; }
    if (!items.length) { setFormErr('Add at least one material line.'); return; }
    if (items.some((it) => !String(it.material).trim())) { setFormErr('Every material line needs a description.'); return; }
    const payload = {
      date: d.date, vid: d.vid || '', project: d.project || '', po: d.po || '',
      status: d.status || 'Received',
      items: items.map((it) => ({ material: it.material.trim(), qty: num(it.qty), unit: it.unit || 'Nos', make: String(it.make || '').trim(), weight: num(it.weight), remarks: String(it.remarks || '').trim() })),
      supplierRef: String(d.supplierRef || '').trim(),
      vehicleNo: String(d.vehicleNo || '').trim(),
      driverName: String(d.driverName || '').trim(),
      driverMobile: String(d.driverMobile || '').trim(),
      consigneeName: String(d.consigneeName || '').trim(),
      consigneeAddress: String(d.consigneeAddress || '').trim(),
      consigneeMobile: String(d.consigneeMobile || '').trim(),
      purpose: d.purpose || 'Supply to Site',
      notes: String(d.notes || '').trim(),
    };
    try {
      if (newFile) { payload.docData = await readFileBase64(newFile); payload.docName = newFile.name; payload.docType = newFile.type || 'application/octet-stream'; payload.docSize = newFile.size; }
      else if (removeDoc) { payload.docData = ''; payload.docName = ''; payload.docType = ''; payload.docSize = 0; }
    } catch (e) { setFormErr(e.message || 'Could not read the document.'); return; }
    setBusy(true);
    try { await saveChallan(editing.isNew, editing.data.id, payload); close(); toast(editing.isNew ? 'Delivery challan created' : 'Challan saved'); }
    catch (e) { setFormErr(e.message || 'Could not save challan.'); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteChallan(editing.data.id); close(); toast('Challan deleted'); }
    catch (e) { setFormErr(e.message || 'Could not delete challan.'); }
    finally { setBusy(false); }
  };

  const hasDoc = editing && !removeDoc && (newFile || editing.data.docName);
  const byStatus = (s) => challans.filter((c) => (c.status || 'Received') === s).length;

  return (
    <section>
      <section className="kpis" aria-label="Delivery challan summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><Truck size={16} /></span><div className="l">Total Challans</div><div className="v">{challans.length}</div></div>
        <div className="kpi"><span className="kpi-ic"><CheckCircle2 size={16} /></span><div className="l">Received</div><div className="v">{byStatus('Received')}</div></div>
        <div className="kpi"><span className="kpi-ic"><Clock size={16} /></span><div className="l">Partial</div><div className="v">{byStatus('Partial')}</div></div>
        <div className="kpi"><span className="kpi-ic"><AlertTriangle size={16} /></span><div className="l">Pending</div><div className="v">{byStatus('Pending')}</div></div>
      </section>

      <div className="toolbar">
        <h2>Delivery Challans</h2>
        <div className="right">
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by status" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }}>
            <option value="all">All status</option>
            {DC_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search DC, vendor, project, PO…" aria-label="Search challans" />
          <button className="btn primary" onClick={() => open(null)}>+ New challan</button>
        </div>
      </div>

      <div className="tbl" style={{ marginTop: 12 }}>
        <table>
          <thead><tr>
            <th>DC Number</th><th>DC Date</th><th>Vendor</th><th>Project</th><th>PO</th>
            <th>Material</th><th className="num">Quantity</th><th>Status</th><th>Challan PDF</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={10} loading={loading} error={error}
                empty={challans.length ? 'No challans match your filter.' : 'No delivery challans yet. Create one to record a material delivery.'} />
            ) : rows.map((c) => (
              <tr key={c.id}>
                <td className="id"><b>{c.id}</b></td>
                <td>{dfmt(c.date)}</td>
                <td>{c.vid ? vendorName(vendors, c.vid) : '—'}</td>
                <td>{c.project || '—'}</td>
                <td className="id">{c.po || '—'}</td>
                <td>{matText(c)}</td>
                <td className="num">{qtyText(c)}</td>
                <td><DCStatus s={c.status || 'Received'} /></td>
                <td><button className="link" onClick={() => genPdf(c)}><FileDown size={13} style={{ verticalAlign: '-2px' }} /> PDF</button>{c.docName ? <> · <button className="link" onClick={() => openChallanDoc(c.id).catch(() => toast('Could not open document'))}>Doc</button></> : null}</td>
                <td><button className="link" onClick={() => open(c)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'New delivery challan' : `Edit ${editing.data.id}`}</h3>
          <p className="hint">Record a material delivery. The DC number is generated automatically. Fill the dispatch details to print a delivery challan.</p>
          <div className="grid">
            <Field label="DC Date *"><input type="date" value={editing.data.date} onChange={(e) => set('date', e.target.value)} /></Field>
            <Field label="Delivery Status"><select value={editing.data.status} onChange={(e) => set('status', e.target.value)}>{DC_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Vendor"><select value={editing.data.vid} onChange={(e) => set('vid', e.target.value)}><option value="">— Select vendor —</option>{vendors.map((v) => <option key={v.vid} value={v.vid}>{v.name}</option>)}</select></Field>
            <Field label="Project">
              <ComboBox value={editing.data.project} onChange={(v) => set('project', v)} options={projects.map((p) => p.name)} placeholder="Type or pick a project" />
            </Field>
            <Field label="Related PO"><select value={editing.data.po} onChange={(e) => onPO(e.target.value)}><option value="">— None —</option>{poList.map((g) => <option key={g.po} value={g.po}>{g.po}</option>)}</select></Field>
            <Field label="Supplier Ref (Quotation No.)"><input value={editing.data.supplierRef} onChange={(e) => set('supplierRef', e.target.value)} placeholder="e.g. Quotation No. 334" /></Field>
          </div>

          <div className="po-items" style={{ marginTop: 6 }}>
            <div className="po-items-head"><span>Materials delivered</span><button type="button" className="link" onClick={addItem}>+ Add material</button></div>
            {editing.data.items.map((it) => {
              const KNOWN = MATERIALS.filter((m) => m !== 'Other');
              const isOther = it.material === 'Other' || (it.material !== '' && !KNOWN.includes(it.material));
              return (
                <div key={it._id} className="dc-item">
                  <div style={{ flex: '2 1 180px' }}>
                    <select value={isOther ? 'Other' : it.material} onChange={(e) => setItem(it._id, 'material', e.target.value)}>
                      <option value="">Select material</option>
                      {KNOWN.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="Other">Other</option>
                    </select>
                    {isOther && <input placeholder="Material description" value={it.material === 'Other' ? '' : it.material} onChange={(e) => setItem(it._id, 'material', e.target.value)} style={{ marginTop: 6 }} />}
                  </div>
                  <input style={{ flex: '1 1 80px' }} placeholder="Make" value={it.make} onChange={(e) => setItem(it._id, 'make', e.target.value)} />
                  <input style={{ flex: '1 1 60px' }} type="number" min="0" step="any" placeholder="Qty" value={it.qty} onChange={(e) => setItem(it._id, 'qty', e.target.value)} />
                  <select style={{ flex: '1 1 72px' }} value={it.unit} onChange={(e) => setItem(it._id, 'unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                  <input style={{ flex: '1 1 80px' }} type="number" min="0" step="any" placeholder="Wt (MT)" value={it.weight} onChange={(e) => setItem(it._id, 'weight', e.target.value)} />
                  <button type="button" className="link danger" onClick={() => removeItem(it._id)} disabled={editing.data.items.length <= 1} title="Remove">✕</button>
                </div>
              );
            })}
          </div>

          <div className="po-items-head" style={{ margin: '14px 0 8px' }}><span>Dispatch & consignee details</span></div>
          <div className="grid">
            <Field label="Vehicle No."><input value={editing.data.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value)} placeholder="TN-00-XX-0000" /></Field>
            <Field label="Purpose of Movement"><select value={editing.data.purpose} onChange={(e) => set('purpose', e.target.value)}>{PURPOSES.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Driver Name"><input value={editing.data.driverName} onChange={(e) => set('driverName', e.target.value)} /></Field>
            <Field label="Driver Mobile"><input value={editing.data.driverMobile} onChange={(e) => set('driverMobile', e.target.value)} /></Field>
            <Field label="Consignee / Site Name"><input value={editing.data.consigneeName} onChange={(e) => set('consigneeName', e.target.value)} placeholder="Delivery site / customer" /></Field>
            <Field label="Consignee Mobile"><input value={editing.data.consigneeMobile} onChange={(e) => set('consigneeMobile', e.target.value)} /></Field>
            <Field label="Site / Delivery Address" full><textarea rows={2} value={editing.data.consigneeAddress} onChange={(e) => set('consigneeAddress', e.target.value)} /></Field>
          </div>

          <div className="grid" style={{ marginTop: 10 }}>
            <Field label="Challan Document (optional PDF / image)" full>
              {hasDoc ? (
                <div className="dc-doc">
                  <span className="dc-doc-name">{newFile ? newFile.name : editing.data.docName}</span>
                  {!newFile && !editing.isNew && <button type="button" className="link" onClick={() => downloadChallanDoc(editing.data.id, editing.data.docName).catch(() => toast('Could not download'))}>Download</button>}
                  <button type="button" className="link danger" onClick={() => { setNewFile(null); setRemoveDoc(true); }}>Remove</button>
                </div>
              ) : (
                <input type="file" accept="application/pdf,image/*" onChange={(e) => onFile(e.target.files && e.target.files[0])} />
              )}
            </Field>
            <Field label="Notes" full><input value={editing.data.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>

          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{!editing.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => genPdf(editing.data)}><FileDown size={15} /> Download PDF</button>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing.isNew ? 'Create challan' : 'Save changes'}</button>
            </div>
          </div>
          {confirmDel && (
            <div className="confirm">
              Delete {editing.data.id} permanently?
              <button className="btn danger" onClick={doDelete} disabled={busy}>Delete</button>
              <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
            </div>
          )}
        </Drawer>
      )}

      <style>{`
        .po-items-head{display:flex;justify-content:space-between;align-items:center;font:700 13px var(--f-body);margin-bottom:8px}
        .dc-item{display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap}
        .dc-item select,.dc-item input{width:100%}
        .dc-doc{display:flex;align-items:center;gap:12px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--sunk,#f8fafc)}
        .dc-doc-name{font-size:13px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .link.danger{color:var(--bad)}
      `}</style>
    </section>
  );
}
