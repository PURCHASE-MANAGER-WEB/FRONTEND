import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { purchaseApi } from '../api/client';
import { useToast } from '../components/Toast';
import { Drawer, Field } from '../components/ui';
import ComboBox from '../components/ComboBox';
import { num, inr, today, nextPo, UNITS, FAB_WORKS, FAB_TERMS } from '../utils/procurement';

const newId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const defaultTermsText = () => FAB_TERMS.map((t, i) => `${i + 1}. ${t}`).join('\n');
const WORK_NAMES = FAB_WORKS.map((w) => w.desc);

const blankWork = () => ({ _id: newId(), desc: '', unit: 'Kg', qty: '', rate: '' });

// Fabricator (labour) Purchase Order form. A fabricator PO is stored as PO lines in
// the shared purchase_orders collection, flagged poType:'fabricator' (no GST — labour
// work). The scope-of-work goes into `material`, measured by `unit`, with qty & rate.
export default function FabricatorPO({ poKey = null, onClose }) {
  const { vendors, lines, projects, payments, reload } = usePurchaseData();
  const toast = useToast();
  const fabricators = vendors.filter((v) => (v.type || 'Supplier') === 'Fabricator');

  const build = () => {
    if (poKey) {
      const group = lines.filter((l) => l.po === poKey);
      const h = group[0] || {};
      const fv = vendors.find((v) => v.vid === h.vid) || null;
      return {
        isNew: false,
        po: h.po || poKey, poDate: h.poDate || today(),
        vid: h.vid || '', manual: !h.vid,
        fabName: h.vendorName || (fv && fv.name) || '',
        fabAddress: h.fabAddress || (fv && fv.address) || '',
        fabMobile: h.fabMobile || (fv && fv.mobile) || '',
        project: h.project || '', client: h.client || '',
        siteEngineer: h.siteEngineer || '', siteMobile: h.siteMobile || '', siteAddress: h.siteAddress || '',
        terms: h.terms || defaultTermsText(),
        items: group.map((l) => ({ _id: l.id, desc: l.material || '', unit: l.unit || 'Kg', qty: l.qty ?? '', rate: l.rate ?? '' })),
        origIds: group.map((l) => l.id),
      };
    }
    const f0 = fabricators[0] || null;
    return {
      isNew: true,
      po: nextPo(lines), poDate: today(),
      vid: f0 ? f0.vid : '', manual: !f0,
      fabName: f0 ? f0.name : '', fabAddress: f0 ? (f0.address || '') : '', fabMobile: f0 ? (f0.mobile || '') : '',
      project: '', client: '',
      siteEngineer: '', siteMobile: '', siteAddress: '',
      terms: defaultTermsText(),
      items: FAB_WORKS.map((w) => ({ _id: newId(), desc: w.desc, unit: w.unit, qty: '', rate: '' })),
      origIds: [],
    };
  };

  const [d, setD] = useState(build);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const set = (k, v) => setD((s) => ({ ...s, [k]: v }));
  const setItem = (id, k, v) => setD((s) => ({ ...s, items: s.items.map((it) => it._id === id ? { ...it, [k]: v } : it) }));
  const addItem = () => setD((s) => ({ ...s, items: [...s.items, blankWork()] }));
  const removeItem = (id) => setD((s) => ({ ...s, items: s.items.length > 1 ? s.items.filter((it) => it._id !== id) : s.items }));

  // Pick a registered fabricator → prefill its name / address / mobile (still editable).
  const onPickFab = (val) => {
    if (val === '__other__') { setD((s) => ({ ...s, vid: '', manual: true })); return; }
    const fv = fabricators.find((v) => v.vid === val);
    setD((s) => ({ ...s, vid: val, manual: false, fabName: fv ? fv.name : s.fabName, fabAddress: fv ? (fv.address || '') : s.fabAddress, fabMobile: fv ? (fv.mobile || '') : s.fabMobile }));
  };

  // Choosing a work from the dropdown sets its description (and the usual unit for it).
  const pickWork = (id, v) => {
    const w = FAB_WORKS.find((x) => x.desc === v);
    setItem(id, 'desc', v);
    if (w) setItem(id, 'unit', w.unit);
  };

  const amt = (it) => num(it.qty) * num(it.rate);
  const total = d.items.reduce((s, it) => s + amt(it), 0);
  const realDesc = (it) => { const s = String(it.desc).trim(); return s === 'Other' ? '' : s; };

  const doDeletePO = async () => {
    if (d.isNew) return;
    const po = String(d.po).trim().toUpperCase();
    if ((payments || []).some(p => p.po === po)) { setConfirmDel(false); setErr('This work order has recorded payments and cannot be deleted. Delete its payments first.'); return; }
    setBusy(true);
    try { await purchaseApi.deletePO(po); await reload(); onClose && onClose(); toast('Fabricator work order deleted'); }
    catch (e) { setErr(e.message || 'Could not delete the work order.'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setErr('');
    const po = String(d.po).trim().toUpperCase();
    if (!po) return setErr('Enter a PO number.');
    if (!d.poDate) return setErr('Choose the PO date.');
    if (!String(d.fabName).trim()) return setErr('Select a fabricator or enter the fabricator name.');
    if (!String(d.project).trim()) return setErr('Enter the project / site.');

    const items = d.items.filter((it) => realDesc(it) && num(it.qty) > 0 && num(it.rate) > 0);
    if (!items.length) return setErr('Add at least one work item with a description, quantity and rate.');
    for (let i = 0; i < d.items.length; i++) {
      const it = d.items[i];
      const filled = realDesc(it) || num(it.qty) || num(it.rate) || String(it.desc).trim() === 'Other';
      if (filled && (!realDesc(it) || num(it.qty) <= 0 || num(it.rate) <= 0)) {
        return setErr(`Work row ${i + 1}: enter a description, quantity and rate (or remove the row).`);
      }
    }

    const shared = {
      po, poDate: d.poDate, poType: 'fabricator',
      vid: d.manual ? '' : d.vid,
      vendorName: String(d.fabName).trim(),
      fabAddress: String(d.fabAddress || '').trim(), fabMobile: String(d.fabMobile || '').trim(),
      project: String(d.project).trim(), client: String(d.client || '').trim(),
      siteEngineer: String(d.siteEngineer || '').trim(), siteMobile: String(d.siteMobile || '').trim(), siteAddress: String(d.siteAddress || '').trim(),
      terms: String(d.terms || '').trim(), status: 'Approved',
      gstPct: 0, loading: 0, transport: 0,
    };

    setBusy(true);
    try {
      for (const it of items) {
        const payload = { ...shared, material: realDesc(it), unit: it.unit, qty: num(it.qty), rate: num(it.rate), received: 0, paid: 0 };
        const existing = d.origIds.includes(it._id);
        if (existing) await purchaseApi.updateLine(it._id, payload);
        else await purchaseApi.createLine({ ...payload, id: it._id });
      }
      const keep = new Set(items.map((it) => it._id));
      for (const id of d.origIds) if (!keep.has(id)) await purchaseApi.deleteLine(id);
      await reload();
      onClose && onClose();
      toast(d.isNew ? 'Fabricator work order created' : 'Fabricator work order saved');
    } catch (e) {
      setErr(e.message || 'Could not save the fabricator work order.');
    } finally {
      setBusy(false);
    }
  };

  const money = (n) => num(n) ? inr(n) : '₹0';

  return (
    <Drawer onClose={onClose}>
      <h3>{d.isNew ? 'New fabricator work order' : `Edit ${d.po}`}</h3>
      <p className="hint">A labour work order (fabrication, erection, painting &amp; sheet laying). No GST applies — the grand total is the sum of the work amounts.</p>

      {/* ── Header ── */}
      <div className="grid">
        <Field label="PO Number *"><input value={d.po} onChange={(e) => set('po', e.target.value)} /></Field>
        <Field label="PO Date *"><input type="date" value={d.poDate} onChange={(e) => set('poDate', e.target.value)} /></Field>
        <Field label="Fabricator *" full>
          <select value={d.manual ? '__other__' : d.vid} onChange={(e) => onPickFab(e.target.value)}>
            {fabricators.map((v) => <option key={v.vid} value={v.vid}>{v.vid} · {v.name}{v.status && v.status !== 'Active' ? ` (${v.status})` : ''}</option>)}
            <option value="__other__">Other (type manually)</option>
          </select>
        </Field>
        {d.manual && <Field label="Fabricator Name *" full><input value={d.fabName} onChange={(e) => set('fabName', e.target.value)} placeholder="Fabricator / subcontractor name" /></Field>}
        <Field label="Fabricator Mobile"><input inputMode="tel" value={d.fabMobile} onChange={(e) => set('fabMobile', e.target.value)} placeholder="Mobile number" /></Field>
        <Field label="Fabricator Address" full><textarea rows={2} value={d.fabAddress} onChange={(e) => set('fabAddress', e.target.value)} placeholder="Fabricator address" /></Field>
        <Field label="Project / Site *" full>
          <ComboBox value={d.project} onChange={(v) => set('project', v)} options={projects.map((p) => p.name)} placeholder="Select or type a project / site" />
        </Field>
        <Field label="Client" full><input value={d.client} onChange={(e) => set('client', e.target.value)} placeholder="Client / end customer" /></Field>
      </div>

      {/* ── Site contact ── */}
      <div className="po-charges">
        <div className="po-items-head"><span>Site contact</span></div>
        <div className="po-fields">
          <label className="pf">Site Engineer<input value={d.siteEngineer} onChange={(e) => set('siteEngineer', e.target.value)} /></label>
          <label className="pf">Mobile<input inputMode="tel" value={d.siteMobile} onChange={(e) => set('siteMobile', e.target.value)} /></label>
          <label className="pf wide">Site Address<input value={d.siteAddress} onChange={(e) => set('siteAddress', e.target.value)} /></label>
        </div>
      </div>

      {/* ── Work rows ── */}
      <div className="po-items">
        <div className="po-items-head"><span>Scope of work</span></div>
        {d.items.map((it, i) => {
          const dv = it.desc || '';
          const isOther = dv === 'Other' || (dv !== '' && !WORK_NAMES.includes(dv));
          return (
            <div className="po-item" key={it._id}>
              <div className="po-item-top">
                <span className="po-sno">#{i + 1}</span>
                <div className="po-amt">{money(amt(it))}</div>
                {d.items.length > 1 && <button type="button" className="icon-btn" title="Remove work" onClick={() => removeItem(it._id)}><Trash2 size={15} /></button>}
              </div>
              <div className="po-fields">
                <label className="pf wide">Description of Work *
                  <select value={isOther ? 'Other' : dv} onChange={(e) => pickWork(it._id, e.target.value)}>
                    <option value="">Select work</option>
                    {WORK_NAMES.map((wd) => <option key={wd} value={wd}>{wd}</option>)}
                    <option value="Other">Other</option>
                  </select>
                  {isOther && <input placeholder="Enter scope of work" value={dv === 'Other' ? '' : dv} onChange={(e) => setItem(it._id, 'desc', e.target.value)} style={{ marginTop: 6 }} />}
                </label>
                <label className="pf">Unit *<select value={it.unit} onChange={(e) => setItem(it._id, 'unit', e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
                <label className="pf">Qty *<input type="number" min="0" step="any" value={it.qty} onChange={(e) => setItem(it._id, 'qty', e.target.value)} /></label>
                <label className="pf">Rate (₹) *<input type="number" min="0" step="any" value={it.rate} onChange={(e) => setItem(it._id, 'rate', e.target.value)} /></label>
              </div>
            </div>
          );
        })}
        <button type="button" className="btn ghost add-item-btn" onClick={addItem}><Plus size={16} /> Add work</button>
      </div>

      {/* ── Terms ── */}
      <div className="po-charges">
        <div className="po-items-head"><span>Terms &amp; conditions</span></div>
        <div className="po-fields">
          <label className="pf full"><textarea rows={8} value={d.terms} onChange={(e) => set('terms', e.target.value)} placeholder="Terms & conditions (shown on the PDF)." /></label>
        </div>
      </div>

      {/* ── Total ── */}
      <div className="po-totals">
        <div className="po-row strong"><span className="l">Grand Total (no GST)</span><span className="v">{inr(total)}</span></div>
      </div>

      {err && <div className="err">{err}</div>}
      <div className="actions">
        <div>{!d.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)} disabled={busy}>Delete work order</button>}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : d.isNew ? 'Create work order' : 'Save changes'}</button>
        </div>
      </div>
      {confirmDel && (
        <div className="confirm">
          Delete fabricator work order {d.po} permanently?
          <button className="btn danger" onClick={doDeletePO} disabled={busy}>Delete</button>
          <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
        </div>
      )}
    </Drawer>
  );
}
