import React, { useState, useMemo } from 'react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Drawer, Field, StateRow } from '../components/ui';
import { num, qfmt, dfmt, today, groupPOs, vendorName, MATERIALS, UNITS } from '../utils/procurement';
import { readFileBase64, openChallanDoc, downloadChallanDoc, DOC_MAX_BYTES } from '../utils/challanDoc';

const DC_STATUS = ['Pending', 'Partial', 'Received'];
const DC_CLS = { Received: 'p-ok', Partial: 'p-warn', Pending: 'p-mute' };
const DCStatus = ({ s }) => <span className={`pill ${DC_CLS[s] || 'p-mute'}`}>{s}</span>;
const blankItem = () => ({ _id: Math.random().toString(36).slice(2), material: '', qty: '', unit: 'Nos' });
const blank = () => ({ date: today(), vid: '', project: '', po: '', status: 'Received', items: [blankItem()], notes: '', docName: '', docType: '', docSize: 0 });

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
      items: items.map((it) => ({ material: it.material.trim(), qty: num(it.qty), unit: it.unit || 'Nos' })),
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
        <div className="kpi"><div className="l">Total Challans</div><div className="v">{challans.length}</div></div>
        <div className="kpi"><div className="l">Received</div><div className="v">{byStatus('Received')}</div></div>
        <div className="kpi"><div className="l">Partial</div><div className="v">{byStatus('Partial')}</div></div>
        <div className="kpi"><div className="l">Pending</div><div className="v">{byStatus('Pending')}</div></div>
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
            <th>Material</th><th className="num">Quantity</th><th>Status</th><th>Document</th><th></th>
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
                <td>{c.docName ? <button className="link" onClick={() => openChallanDoc(c.id).catch(() => toast('Could not open document'))}>View</button> : '—'}</td>
                <td><button className="link" onClick={() => open(c)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'New delivery challan' : `Edit ${editing.data.id}`}</h3>
          <p className="hint">Record a material delivery. The DC number is generated automatically. Link a vendor, project and PO where applicable.</p>
          <div className="grid">
            <Field label="DC Date *"><input type="date" value={editing.data.date} onChange={(e) => set('date', e.target.value)} /></Field>
            <Field label="Delivery Status"><select value={editing.data.status} onChange={(e) => set('status', e.target.value)}>{DC_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Vendor"><select value={editing.data.vid} onChange={(e) => set('vid', e.target.value)}><option value="">— Select vendor —</option>{vendors.map((v) => <option key={v.vid} value={v.vid}>{v.name}</option>)}</select></Field>
            <Field label="Project">
              <input list="dc-projects" value={editing.data.project} onChange={(e) => set('project', e.target.value)} placeholder="Type or pick a project" />
              <datalist id="dc-projects">{projects.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            </Field>
            <Field label="Related PO"><select value={editing.data.po} onChange={(e) => onPO(e.target.value)}><option value="">— None —</option>{poList.map((g) => <option key={g.po} value={g.po}>{g.po}</option>)}</select></Field>
          </div>

          <div className="po-items" style={{ marginTop: 6 }}>
            <div className="po-items-head"><span>Materials delivered</span><button type="button" className="link" onClick={addItem}>+ Add material</button></div>
            {editing.data.items.map((it) => {
              const KNOWN = MATERIALS.filter((m) => m !== 'Other');
              const isOther = it.material === 'Other' || (it.material !== '' && !KNOWN.includes(it.material));
              return (
                <div key={it._id} className="dc-item">
                  <div style={{ flex: '2 1 160px' }}>
                    <select value={isOther ? 'Other' : it.material} onChange={(e) => setItem(it._id, 'material', e.target.value)}>
                      <option value="">Select material</option>
                      {KNOWN.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="Other">Other</option>
                    </select>
                    {isOther && <input placeholder="Material description" value={it.material === 'Other' ? '' : it.material} onChange={(e) => setItem(it._id, 'material', e.target.value)} style={{ marginTop: 6 }} />}
                  </div>
                  <input style={{ flex: '1 1 70px' }} type="number" min="0" step="any" placeholder="Qty" value={it.qty} onChange={(e) => setItem(it._id, 'qty', e.target.value)} />
                  <select style={{ flex: '1 1 80px' }} value={it.unit} onChange={(e) => setItem(it._id, 'unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                  <button type="button" className="link danger" onClick={() => removeItem(it._id)} disabled={editing.data.items.length <= 1} title="Remove">✕</button>
                </div>
              );
            })}
          </div>

          <div className="grid" style={{ marginTop: 10 }}>
            <Field label="Challan Document (PDF / image)" full>
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
        .dc-item{display:flex;gap:8px;align-items:flex-start;margin-bottom:8px}
        .dc-item select,.dc-item input{width:100%}
        .dc-doc{display:flex;align-items:center;gap:12px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--sunk,#f8fafc)}
        .dc-doc-name{font-size:13px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .link.danger{color:var(--bad)}
      `}</style>
    </section>
  );
}
