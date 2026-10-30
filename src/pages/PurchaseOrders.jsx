import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, FileText, Upload, ClipboardList, Clock, CheckCircle2, IndianRupee, Wallet } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { purchaseApi, filesApi, invoicesApi } from '../api/client';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import ComboBox from '../components/ComboBox';
import FabricatorPO from '../components/FabricatorPO';
import ProjectMultiSelect from '../components/ProjectMultiSelect';
import { calcLine, computePoBreakdown, poCharges, amountInWords, groupPOs, num, inr, qfmt, dfmt, today, vendorName, nextPo, UNITS, PAYMENT_METHODS, PO_STATUSES, MATERIALS } from '../utils/procurement';
import { uploadInvoice, openInvoice, downloadInvoice } from '../utils/cloudinary';
import { uploadPoFile, openPoFile, downloadPoFile, removePoFile, validatePoFile } from '../utils/poFiles';

const kb = (n) => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

const newId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// One blank item row for the PO form.
const blankItem = () => ({
  _id: newId(), isNew: true,
  material: '', description: '', spec: '', hsn: '', make: '', weight: '', itemProject: '', gstPct: 0,
  qty: '', unit: 'MT', rate: '', received: 0, expDate: '', dueDate: '', paid: 0,
});

// A fresh PO (header + charges + one empty item).
const blankPO = (lines, vendors) => ({
  isNew: true,
  po: nextPo(lines), poDate: today(), vid: vendors[0]?.vid || '', project: '', projects: [],
  loading: '', transport: '', chargesGstPct: 0, taxType: 'cgst_sgst', transportGst: true, notes: '', paymentMethod: '', terms: '', invoice: null,
  deliveryDate: '', deliveryAddress: '', status: 'Approved',
  items: [blankItem()], origIds: [],
});

export default function PurchaseOrders() {
  const { vendors, lines, projects, payments, loading, error, reload, bulkSaveLines } = usePurchaseData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const [invErr, setInvErr] = useState('');
  const [invKind, setInvKind] = useState('pdf');
  const [invPreview, setInvPreview] = useState('');
  const [files, setFiles] = useState([]);        // existing saved attachments
  const [newFiles, setNewFiles] = useState([]);  // staged File objects to upload on save
  const [removed, setRemoved] = useState([]);    // fileIds of existing attachments to delete on save
  const [fileErr, setFileErr] = useState('');
  const [filesBusy, setFilesBusy] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const newMenuRef = useRef(null);
  const [simple, setSimple] = useState(null);
  const [simpleErr, setSimpleErr] = useState('');
  const [simpleBusy, setSimpleBusy] = useState(false);
  const [fab, setFab] = useState(null); // { poKey } for the fabricator work-order form
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
      .filter(({ g, vn }) => statusOkG(g) && (!q2 || [g.po, g.vid, g.vendorName || vn, g.project].filter(Boolean).join(' ').toLowerCase().includes(q2) || matchLine(g.po)))
      .sort((a, b) => String(a.g.po).localeCompare(String(b.g.po), undefined, { numeric: true }));
  }, [lines, vendors, q, filter]);

  const totals = rows.reduce((s, { g }) => ({ total: s.total + g.valueGst, paid: s.paid + g.paid, out: s.out + g.out }), { total: 0, paid: 0, out: 0 });
  const poNums = [...new Set(lines.map(l => l.po))];

  // Summary cards — counts by approval status, from the real PO records.
  const poStats = useMemo(() => {
    const gs = groupPOs(lines);
    const by = (s) => gs.filter(g => g.status === s).length;
    return { total: gs.length, draft: by('Draft'), pendingApproval: by('Pending Approval'), approved: by('Approved'), completed: by('Completed'), cancelled: by('Cancelled'), totalValue: gs.reduce((a, g) => a + g.valueGst, 0), pendingValue: gs.filter(g => g.status !== 'Cancelled').reduce((a, g) => a + g.out, 0) };
  }, [lines]);

  // Open the whole PO (all its material lines) in one editor. poKey === null → new PO.
  const open = (poKey) => {
    if (!vendors.length) { toast('Add a vendor first'); return; }
    setFormErr('');
    if (!poKey) { setFiles([]); setNewFiles([]); setRemoved([]); setFileErr(''); setEditing(blankPO(lines, vendors)); return; }
    const group = lines.filter(l => l.po === poKey);
    const h = group[0] || {};
    const ch = poCharges(h);
    setEditing({
      isNew: false,
      po: h.po || poKey, poDate: h.poDate || today(), vid: h.vid || vendors[0]?.vid || '', project: h.project || '', projects: (Array.isArray(h.projects) && h.projects.length) ? h.projects : (h.project ? [h.project] : []),
      loading: ch.loading || '', transport: ch.transport || '', chargesGstPct: (h.chargesGstPct !== undefined && h.chargesGstPct !== null && h.chargesGstPct !== '') ? h.chargesGstPct : ch.gstPct, taxType: h.taxType || 'cgst_sgst', transportGst: ch.transportGst, notes: h.notes || '',
      paymentMethod: h.paymentMethod || '', terms: h.terms || '', invoice: h.invoice || null,
      deliveryDate: h.deliveryDate || '', deliveryAddress: h.deliveryAddress || '', status: h.status || 'Approved',
      items: group.map(l => ({
        _id: l.id, isNew: false,
        material: l.material || '', description: l.description || '', spec: l.spec || '', hsn: l.hsn || '', make: l.make || '', weight: l.weight ?? '', itemProject: l.project || '', gstPct: (l.gstPct === undefined || l.gstPct === null || l.gstPct === '') ? 0 : l.gstPct,
        qty: l.qty ?? '', unit: l.unit || 'MT', rate: l.rate ?? '', received: l.received ?? 0,
        expDate: l.expDate || '', dueDate: l.dueDate || '', paid: l.paid ?? 0,
      })),
      origIds: group.map(l => l.id),
    });
    setNewFiles([]); setRemoved([]); setFileErr(''); loadFiles(h.po || poKey);
  };
  const loadFiles = async (po) => { try { const list = await filesApi.list(po); setFiles(Array.isArray(list) ? list : []); } catch { setFiles([]); } };
  const onPickFiles = async (e) => {
    setFileErr('');
    const picked = Array.from(e.target.files || []); e.target.value = '';
    if (!picked.length) return;
    const po = String(editing?.po || '').trim().toUpperCase();
    if (!po) { setFileErr('Enter the PO number first, then attach files.'); return; }
    setFilesBusy(true);
    for (const f of picked) {
      const v = validatePoFile(f);
      if (v) { setFileErr(v); continue; }
      try { const meta = await uploadPoFile(f, po); setFiles((fs) => [...fs.filter((x) => x.fileId !== meta.fileId), meta]); }
      catch (err) { setFileErr(err.message || `Could not upload ${f.name}.`); }
    }
    setFilesBusy(false);
  };
  const removeExisting = async (fileId) => {
    const po = String(editing?.po || '').trim().toUpperCase();
    setFiles((fs) => fs.filter((f) => f.fileId !== fileId));
    try { await removePoFile(po, fileId); } catch { /* ignore */ }
  };
  const close = () => { setEditing(null); setFormErr(''); setConfirmDel(false); setFiles([]); setNewFiles([]); setRemoved([]); setFileErr(''); };

  // Copy an existing PO into a brand-new, fully editable PO. Carries over vendor, project,
  // materials, quantities, rates, GST, charges, delivery details and terms; gets a NEW unique
  // PO number; resets delivery progress (received) and payments (paid) and drops attachments.
  // The original PO is never touched — saving writes new line records with new ids.
  const copyPO = (poKey) => {
    if (!vendors.length) { toast('Add a vendor first'); return; }
    const group = lines.filter((l) => l.po === poKey);
    if (!group.length) return;
    const h = group[0] || {};
    const ch = poCharges(h);
    setFormErr(''); setFiles([]); setNewFiles([]); setRemoved([]); setFileErr('');
    setEditing({
      isNew: true,
      po: nextPo(lines), poDate: today(), vid: h.vid || vendors[0]?.vid || '', project: h.project || '',
      projects: (Array.isArray(h.projects) && h.projects.length) ? h.projects : (h.project ? [h.project] : []),
      loading: ch.loading || '', transport: ch.transport || '',
      chargesGstPct: (h.chargesGstPct !== undefined && h.chargesGstPct !== null && h.chargesGstPct !== '') ? h.chargesGstPct : ch.gstPct,
      taxType: h.taxType || 'cgst_sgst', transportGst: ch.transportGst, notes: h.notes || '',
      paymentMethod: h.paymentMethod || '', terms: h.terms || '', invoice: null,
      deliveryDate: h.deliveryDate || '', deliveryAddress: h.deliveryAddress || '', status: 'Approved',
      items: group.map((l) => ({
        _id: newId(), isNew: true,
        material: l.material || '', description: l.description || '', spec: l.spec || '', hsn: l.hsn || '', make: l.make || '', weight: l.weight ?? '', itemProject: l.project || '',
        gstPct: (l.gstPct === undefined || l.gstPct === null || l.gstPct === '') ? 0 : l.gstPct,
        qty: l.qty ?? '', unit: l.unit || 'MT', rate: l.rate ?? '',
        received: 0, expDate: l.expDate || '', dueDate: l.dueDate || '', paid: 0,
      })),
      origIds: [],
    });
    toast(`Copied ${poKey} \u2014 review and save as a new PO`);
  };

  // ── Simple (quick) PO: project + vendor + material + optional invoice ──
  const openSimple = () => {
    setSimpleErr('');
    setSimple({ projects: [], vid: '', vendorOther: '', material: '', value: '', file: null });
  };
  const onSimpleFile = (file) => {
    setSimpleErr('');
    if (!file) { setSimple((s) => ({ ...s, file: null })); return; }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (!isPdf) { setSimpleErr('Invoice must be a PDF.'); return; }
    if (file.size > 12 * 1024 * 1024) { setSimpleErr('Invoice is larger than 12 MB.'); return; }
    setSimple((s) => ({ ...s, file }));
  };
  const submitSimple = async () => {
    const d = simple;
    if (!d.projects || !d.projects.length) { setSimpleErr('Select at least one project.'); return; }
    const isOther = d.vid === '__other__';
    if (!d.vid) { setSimpleErr('Select a vendor.'); return; }
    if (isOther && !String(d.vendorOther).trim()) { setSimpleErr('Enter the vendor name.'); return; }
    if (!String(d.material).trim()) { setSimpleErr('Enter the material description.'); return; }
    const po = nextPo(lines);
    const vendorFields = isOther ? { vid: '', vendorName: d.vendorOther.trim() } : { vid: d.vid };
    setSimpleBusy(true);
    try {
      await purchaseApi.createLine({ id: newId(), po, poDate: today(), ...vendorFields, project: (d.projects[0] || '').trim(), projects: d.projects, material: d.material.trim(), description: d.material.trim(), qty: num(d.value) > 0 ? 1 : 0, unit: 'Nos', rate: num(d.value), received: 0, paid: 0, status: 'Approved' });
      let invMsg = '';
      if (d.file) { try { await uploadInvoice(d.file, po); } catch { invMsg = ' (invoice upload failed \u2014 add it later)'; } }
      await reload();
      setSimple(null);
      toast(`Purchase order ${po} created${invMsg}`);
    } catch (e) { setSimpleErr(e.message || 'Could not create the purchase order.'); }
    finally { setSimpleBusy(false); }
  };

  const setHdr = (k, val) => setEditing(e => ({ ...e, [k]: val }));
  const setItem = (id, k, val) => setEditing(e => ({ ...e, items: e.items.map(it => it._id === id ? { ...it, [k]: val } : it) }));
  const addItem = () => setEditing(e => ({ ...e, items: [...e.items, { ...blankItem(), itemProject: (e.projects && e.projects[0]) || '' }] }));
  const removeItem = (id) => setEditing(e => ({ ...e, items: e.items.length > 1 ? e.items.filter(it => it._id !== id) : e.items }));

  // Picking an existing PO number pre-fills the shared header fields (new PO only).
  const onPoBlur = () => {
    if (!editing?.isNew) return;
    const key = String(editing.po).trim().toUpperCase();
    const ex = lines.find(x => x.po === key);
    if (ex) { const ch = poCharges(ex); setEditing(e => ({ ...e, poDate: ex.poDate || e.poDate, vid: ex.vid, project: ex.project || '', projects: (Array.isArray(ex.projects) && ex.projects.length) ? ex.projects : (ex.project ? [ex.project] : []), loading: ch.loading || '', transport: ch.transport || '', chargesGstPct: (ex.chargesGstPct !== undefined && ex.chargesGstPct !== null && ex.chargesGstPct !== '') ? ex.chargesGstPct : ch.gstPct, taxType: ex.taxType || 'cgst_sgst', transportGst: ch.transportGst })); }
  };

  // Live invoice totals for the open PO.
  const itemAmts = editing ? editing.items.map(it => num(it.qty) * num(it.rate)) : [];
  const sub = itemAmts.reduce((s, a) => s + a, 0);
  const poTot = editing ? computePoBreakdown({ items: editing.items.map(it => ({ amount: num(it.qty) * num(it.rate), gstPct: it.gstPct })), loading: editing.loading, transport: editing.transport, transportGst: editing.transportGst, chargesGstPct: editing.chargesGstPct, taxType: editing.taxType }) : null;

  const doDeletePO = async () => {
    if (!editing || editing.isNew) return;
    const po = String(editing.po).trim().toUpperCase();
    const hasPay = (payments || []).some(p => p.po === po) || editing.items.some(it => num(it.paid) > 0);
    if (hasPay) { setConfirmDel(false); setFormErr('This PO has recorded payments and cannot be deleted. Delete its payments first.'); return; }
    setBusy(true);
    try { await purchaseApi.deletePO(po); await reload(); close(); toast('Purchase order deleted'); }
    catch (e) { setFormErr(e.message || 'Could not delete the purchase order.'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    const d = editing;
    const po = String(d.po).trim().toUpperCase();
    if (!po) return setFormErr('Enter a PO number.');
    if (!d.poDate) return setFormErr('Choose the PO date.');
    if (!d.vid) return setFormErr('Select a vendor.');
    if (!d.projects || !d.projects.length) return setFormErr('Select at least one project.');

    const items = d.items.filter(it => String(it.material).trim() || num(it.qty) || num(it.rate));
    if (!items.length) return setFormErr('Add at least one material item.');
    for (let i = 0; i < items.length; i++) {
      const it = items[i], n = i + 1, qty = num(it.qty), rate = num(it.rate);
      if (!String(it.material).trim()) return setFormErr(`Item ${n}: enter the material.`);
      if (d.projects.length > 1 && !String(it.itemProject).trim()) return setFormErr(`Item ${n}: choose the project for this material.`);
      if (qty <= 0) return setFormErr(`Item ${n}: ordered quantity must be more than 0.`);
      if (rate <= 0) return setFormErr(`Item ${n}: rate must be more than 0.`);
      if (num(it.received) > qty) return setFormErr(`Item ${n}: received can't be more than ordered.`);
      if (num(it.paid) > qty * rate) return setFormErr(`Item ${n}: paid can't be more than the item value.`);
    }

    const loading = num(d.loading), transport = num(d.transport);
    const chargesGstPct = (d.chargesGstPct === '' || d.chargesGstPct === null || d.chargesGstPct === undefined) ? 0 : num(d.chargesGstPct);
    const shared = { po, poDate: d.poDate, vid: d.vid, project: (d.projects[0] || '').trim(), projects: d.projects, loading, transport, chargesGstPct, taxType: d.taxType === 'igst' ? 'igst' : 'cgst_sgst', transportGst: d.transportGst !== false, notes: String(d.notes || '').trim(), paymentMethod: d.paymentMethod || '', terms: String(d.terms || '').trim(), invoice: d.invoice || null, deliveryDate: d.deliveryDate || '', deliveryAddress: String(d.deliveryAddress || '').trim(), status: d.status || 'Approved' };

    setBusy(true);
    try {
      // Build every line once and save the whole PO in ONE request (one DB write).
      const payloadLines = items.map((it) => ({
        ...shared, id: it._id,
        project: (String(it.itemProject || '').trim() || (d.projects[0] || '').trim()),
        material: String(it.material).trim(), description: String(it.description || '').trim(),
        spec: String(it.spec || '').trim(), hsn: String(it.hsn || '').trim(),
        make: String(it.make || '').trim(), weight: num(it.weight),
        qty: num(it.qty), unit: it.unit, rate: num(it.rate), gstPct: num(it.gstPct), received: num(it.received),
        expDate: it.expDate || '', dueDate: it.dueDate || '', paid: num(it.paid),
      }));
      const keep = new Set(items.map((it) => it._id));
      const deleteIds = d.origIds.filter((id) => !keep.has(id));
      try {
        await bulkSaveLines(po, payloadLines, deleteIds);
      } catch (bulkErr) {
        // Fallback when the bulk endpoint isn't live yet: parallel per-line saves.
        await Promise.all([
          ...payloadLines.map((pl) => ((items.find((it) => it._id === pl.id) || {}).isNew
            ? purchaseApi.createLine(pl) : purchaseApi.updateLine(pl.id, pl))),
          ...deleteIds.map((id) => purchaseApi.deleteLine(id)),
        ]);
        await reload();
      }
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
    if (ep && !editing && !fab && vendors.length && lines.some(l => l.po === ep)) {
      const first = lines.find(l => l.po === ep);
      if (first && first.poType === 'fabricator') setFab({ poKey: ep }); else open(ep);
      const next = new URLSearchParams(searchParams); next.delete('edit'); setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, vendors, lines]);

  // Close the New-PO menu on an outside click.
  useEffect(() => {
    if (!newMenu) return;
    const onDoc = (e) => { if (newMenuRef.current && !newMenuRef.current.contains(e.target)) setNewMenu(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [newMenu]);

  const onInvoice = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setInvErr(''); setInvBusy(true);
    try { const inv = await uploadInvoice(file, String(editing?.po || '').trim().toUpperCase()); setHdr('invoice', inv); toast('Invoice uploaded'); }
    catch (err) { setInvErr(err.message || 'Could not upload the invoice.'); }
    finally { setInvBusy(false); }
  };

  // Inline thumbnail for an image invoice (PDFs preview via the View action / new tab).
  useEffect(() => {
    const inv = editing && editing.invoice;
    if (!inv || !inv.po || !/^image\//i.test(inv.type || '')) { setInvPreview(''); return; }
    let url = '';
    let alive = true;
    invoicesApi.blob(inv.po, { download: false })
      .then((blob) => { if (alive) { url = URL.createObjectURL(blob); setInvPreview(url); } })
      .catch(() => { if (alive) setInvPreview(''); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing && editing.invoice ? `${editing.invoice.po}|${editing.invoice.type}|${editing.invoice.uploadedAt || ''}` : '']);

  const money = (n) => num(n) ? inr(n) : '₹0';

  // Memoize the PO table so typing in the editor (GST %, qty, rate) never re-renders the
  // whole list — the live totals then update instantly.
  const bodyRows = useMemo(() => {
    if (loading || error || rows.length === 0) {
      return (<StateRow cols={11} loading={loading} error={error}
        empty={lines.length ? 'No purchase orders match your search.' : (vendors.length ? 'No purchase orders yet. Add a PO to start tracking.' : 'Add a vendor first, then raise purchase orders against them.')} />);
    }
    return rows.map(({ g, vn }) => {
      const u = g.unit === 'mixed units' ? '' : ' ' + g.unit;
      return (
        <tr key={g.po}>
          <td className="id"><Link className="po-link" to={`/purchase-orders/${encodeURIComponent(g.po)}`}>{g.po}</Link>{g.poType === 'fabricator' ? <span className="fab-tag">Fabricator</span> : null}</td>
          <td>{dfmt(g.date)}</td><td>{g.vendorName || vn}</td><td>{(g.projects && g.projects.length ? g.projects.join(', ') : g.project) || '—'}</td>
          <td className="num">{g.count}</td>
          <td className="num">{qfmt(g.qty)}{u}</td>
          <td className="num calc">{inr(g.valueGst)}</td>
          <td className="num">{qfmt(g.rec)}{u}</td>
          <td className="num calc">{qfmt(g.pend)}{u}</td>
          <td className={g.overdueDays > 0 ? 'overdue' : ''}>{dfmt(g.expDate)}{g.overdueDays > 0 ? ` · ${g.overdueDays}d overdue` : (g.dueToday && g.delivery !== 'Completed' ? ' · due today' : '')}</td>
          <td><button className="link" onClick={() => g.poType === 'fabricator' ? setFab({ poKey: g.po }) : open(g.po)}>Edit</button>{g.poType !== 'fabricator' ? <button className="link" onClick={() => copyPO(g.po)} style={{ marginLeft: 10 }}>Copy</button> : null}</td>
        </tr>
      );
    });
  }, [rows, loading, error]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <section className="kpis" aria-label="Purchase order summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><ClipboardList size={16} /></span><div className="l">Total POs</div><div className="v">{rows.length}</div></div>
        <div className="kpi"><span className="kpi-ic"><IndianRupee size={16} /></span><div className="l">Total PO Value</div><div className="v">{inr(totals.total)}</div></div>
      </section>
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
          <div className="newpo-wrap" ref={newMenuRef}>
            <button className="btn primary" onClick={() => setNewMenu((o) => !o)} aria-haspopup="true" aria-expanded={newMenu}>+ New PO ▾</button>
            {newMenu && (
              <div className="newpo-menu" role="menu">
                <button role="menuitem" onClick={() => { setNewMenu(false); openSimple(); }}><b>Simple Form</b><span>Quick PO — project, material, invoice</span></button>
                <button role="menuitem" onClick={() => { setNewMenu(false); open(null); }}><b>Detailed Form</b><span>Full PO — items, quantities, tax &amp; terms</span></button>
                <button role="menuitem" onClick={() => { setNewMenu(false); setFab({ poKey: null }); }}><b>Fabricator Work Order</b><span>Labour work — fabrication, erection, painting</span></button>
              </div>
            )}
          </div>
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
            <th>Exp. Delivery</th><th></th>
          </tr></thead>
          <tbody>
            {bodyRows}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr>
              <td colSpan={6}>Total ({rows.length} PO{rows.length > 1 ? 's' : ''})</td>
              <td className="num">{inr(totals.total)}</td><td colSpan={4}></td>
            </tr></tfoot>
          )}
        </table>
      </div>

      {simple && (
        <Drawer onClose={() => setSimple(null)}>
          <h3>New purchase order — Simple</h3>
          <p className="hint">A quick PO with just the essentials. Quantities, rates, tax and terms can be added later via the detailed Edit.</p>
          <div className="grid">
            <Field label="Project Name(s) *" full>
              <ProjectMultiSelect value={simple.projects} onChange={(v) => setSimple((s) => ({ ...s, projects: v }))} options={projects.map((p) => p.name)} placeholder="Add a project…" />
            </Field>
            <Field label="Vendor *" full>
              <select value={simple.vid} onChange={(e) => setSimple((s) => ({ ...s, vid: e.target.value }))}>
                <option value="">— Select vendor —</option>
                {vendors.map((v) => <option key={v.vid} value={v.vid}>{v.vid} · {v.name}</option>)}
                <option value="__other__">Other (type manually)</option>
              </select>
              {simple.vid === '__other__' && <input value={simple.vendorOther} onChange={(e) => setSimple((s) => ({ ...s, vendorOther: e.target.value }))} placeholder="Enter vendor name" style={{ marginTop: 6 }} />}
            </Field>
            <Field label="Material Description *" full><textarea rows={3} value={simple.material} onChange={(e) => setSimple((s) => ({ ...s, material: e.target.value }))} placeholder="What is being ordered" /></Field>
            <Field label="PO Value (₹)" full><input type="number" min="0" step="any" value={simple.value} onChange={(e) => setSimple((s) => ({ ...s, value: e.target.value }))} placeholder="Total order value (optional)" /></Field>
            <Field label="Invoice (PDF, optional)" full>
              {simple.file ? (
                <div className="inv-row"><FileText size={18} /><span className="inv-name">{simple.file.name}</span><span className="inv-size">{kb(simple.file.size)}</span><button type="button" className="link" onClick={() => setSimple((s) => ({ ...s, file: null }))}>Remove</button></div>
              ) : (
                <label className="inv-drop"><input type="file" accept="application/pdf" hidden onChange={(e) => { onSimpleFile(e.target.files && e.target.files[0]); e.target.value = ''; }} /><Upload size={17} /> Upload invoice PDF<span className="inv-hint">PDF · up to 12 MB</span></label>
              )}
            </Field>
          </div>
          {simpleErr && <div className="err">{simpleErr}</div>}
          <div className="actions">
            <div />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => setSimple(null)}>Cancel</button>
              <button className="btn primary" onClick={submitSimple} disabled={simpleBusy}>{simpleBusy ? 'Creating\u2026' : 'Save PO'}</button>
            </div>
          </div>
        </Drawer>
      )}

      {fab && <FabricatorPO poKey={fab.poKey} onClose={() => setFab(null)} />}

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'New purchase order' : `Edit ${editing.po}`}</h3>
          <p className="hint">Add every material as an item row with its own GST rate. Loading &amp; transport are charged once to the whole PO.</p>

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
            <Field label="Project Name(s) *" full><ProjectMultiSelect value={editing.projects} onChange={(v) => setHdr('projects', v)} options={projects.map((p) => p.name)} placeholder="Add a project…" /></Field>
            <Field label="Delivery Date"><input type="date" value={editing.deliveryDate || ''} onChange={e => setHdr('deliveryDate', e.target.value)} /></Field>
            <Field label="Delivery Address" full><textarea rows={2} value={editing.deliveryAddress || ''} onChange={e => setHdr('deliveryAddress', e.target.value)} placeholder="Complete delivery / site address for this order" /></Field>
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
                    <label className="pf wide">Material *
                      {(() => {
                        const KNOWN = MATERIALS.filter(m => m !== 'Other');
                        const mat = it.material || '';
                        const isOther = mat === 'Other' || (mat !== '' && !KNOWN.includes(mat));
                        return (<>
                          <select value={isOther ? 'Other' : mat} onChange={e => setItem(it._id, 'material', e.target.value)}>
                            <option value="">Select material</option>
                            {KNOWN.map(m => <option key={m} value={m}>{m}</option>)}
                            <option value="Other">Other</option>
                          </select>
                          {isOther && <input placeholder="Enter material" value={mat === 'Other' ? '' : mat} onChange={e => setItem(it._id, 'material', e.target.value)} style={{ marginTop: 6 }} />}
                        </>);
                      })()}
                    </label>
                    {editing.projects && editing.projects.length > 0 && (
                      <label className="pf">Project{editing.projects.length > 1 ? ' *' : ''}
                        <select value={it.itemProject || ''} onChange={e => setItem(it._id, 'itemProject', e.target.value)}>
                          <option value="">— Select project —</option>
                          {editing.projects.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="pf">Specification<input value={it.spec} onChange={e => setItem(it._id, 'spec', e.target.value)} placeholder="e.g. Fe 500D, 16mm" /></label>
                    <label className="pf">Make<input value={it.make} onChange={e => setItem(it._id, 'make', e.target.value)} placeholder="e.g. MKK / MPL" /></label>
                    <label className="pf full">Description of goods<input value={it.description} onChange={e => setItem(it._id, 'description', e.target.value)} placeholder="Longer description as it should read on the order / invoice" /></label>
                    <label className="pf">Qty *<input type="number" min="0" step="any" value={it.qty} onChange={e => setItem(it._id, 'qty', e.target.value)} /></label>
                    <label className="pf">Unit (Per)<select value={it.unit} onChange={e => setItem(it._id, 'unit', e.target.value)}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></label>
                    <label className="pf">Rate (₹) *<input type="number" min="0" step="any" value={it.rate} onChange={e => setItem(it._id, 'rate', e.target.value)} /></label>
                    <label className="pf">GST %
                      {(() => {
                        const raw = it.gstPct;
                        const rate = num(raw);
                        const known = (raw === '' || raw === null || raw === undefined) ? false : [0, 5, 18].includes(rate);
                        const isCustom = (raw === '' || raw === null || raw === undefined) ? true : !known;
                        const selValue = isCustom ? 'custom' : (rate === 18 ? (editing.taxType === 'igst' ? 'igst18' : '18') : String(rate));
                        const onGst = (e) => {
                          const v = e.target.value;
                          if (v === 'custom') setItem(it._id, 'gstPct', '');
                          else if (v === 'igst18') { setItem(it._id, 'gstPct', '18'); setHdr('taxType', 'igst'); }
                          else if (v === '18') { setItem(it._id, 'gstPct', '18'); setHdr('taxType', 'cgst_sgst'); }
                          else setItem(it._id, 'gstPct', v);
                        };
                        return (<>
                          <select value={selValue} onChange={onGst}>
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="18">18%</option>
                            <option value="custom">Custom</option>
                            <option value="igst18">IGST - 18%</option>
                          </select>
                          {isCustom && <input type="number" min="0" step="any" value={(raw === '' || raw === null || raw === undefined) ? '' : raw} onChange={e => setItem(it._id, 'gstPct', e.target.value)} placeholder="Custom %" style={{ marginTop: 6 }} />}
                        </>);
                      })()}
                    </label>
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
              <label className="pf">Transport GST
                <select value={editing.transportGst === false ? 'no' : 'yes'} onChange={e => setHdr('transportGst', e.target.value === 'yes')}>
                  <option value="yes">With GST</option>
                  <option value="no">Without GST</option>
                </select>
              </label>
              <label className="pf">Charges GST %<input type="number" min="0" step="any" value={editing.chargesGstPct} onChange={e => setHdr('chargesGstPct', e.target.value)} placeholder="0" /></label>
              <label className="pf">Tax Type
                <select value={editing.taxType === 'igst' ? 'igst' : 'cgst_sgst'} onChange={e => setHdr('taxType', e.target.value)}>
                  <option value="cgst_sgst">CGST + SGST</option>
                  <option value="igst">IGST</option>
                </select>
              </label>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invPreview ? (
                  <img src={invPreview} alt="Invoice preview" onClick={() => openInvoice(editing.invoice)} title="Click to view full size" style={{ maxWidth: 170, maxHeight: 170, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', background: 'var(--surface)', padding: 4 }} />
                ) : null}
                <div className="inv-row">
                  <FileText size={18} />
                  <button type="button" className="link inv-name" onClick={() => openInvoice(editing.invoice)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>{editing.invoice.name || 'Invoice.pdf'}</button>
                  {editing.invoice.size ? <span className="inv-size">{kb(editing.invoice.size)}</span> : null}
                  <button type="button" className="link" onClick={() => openInvoice(editing.invoice)}>View</button>
                  <button type="button" className="link" onClick={() => downloadInvoice(editing.invoice)}>Download</button>
                  <label className="link inv-replace">{invBusy ? 'Uploading…' : 'Replace'}<input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" hidden onChange={onInvoice} disabled={invBusy} /></label>
                  <button type="button" className="link inv-remove" onClick={() => setHdr('invoice', null)}>Remove</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
                <select value={invKind} onChange={(e) => setInvKind(e.target.value)} aria-label="Invoice format" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <option value="pdf">Upload PDF</option>
                  <option value="photo">Upload Photo</option>
                </select>
                <label className={`inv-drop ${invBusy ? 'busy' : ''}`} style={{ flex: '1 1 220px' }}>
                  <input type="file" accept={invKind === 'photo' ? 'image/jpeg,image/png,.jpg,.jpeg,.png' : 'application/pdf,.pdf'} hidden onChange={onInvoice} disabled={invBusy} />
                  <Upload size={17} /> {invBusy ? 'Uploading…' : (invKind === 'photo' ? 'Upload invoice photo' : 'Upload invoice PDF')}
                  <span className="inv-hint">{invKind === 'photo' ? 'JPG, JPEG, PNG · up to 12 MB' : 'PDF only · up to 12 MB'}</span>
                </label>
              </div>
            )}
            {invErr && <div className="err" style={{ marginTop: 8 }}>{invErr}</div>}
          </div>

          {/* ── Attachments / Documents (multiple files) ── */}
          <div className="po-charges">
            <div className="po-items-head"><span>Attachments / Documents</span></div>
            <label className={`inv-drop ${filesBusy ? 'busy' : ''}`}>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,application/pdf,image/jpeg,image/png,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple hidden onChange={onPickFiles} disabled={filesBusy} />
              <Upload size={17} /> {filesBusy ? 'Uploading…' : 'Upload files'}
              <span className="inv-hint">PDF, JPG, JPEG, PNG, Excel · up to 12 MB each · select multiple</span>
            </label>
            {fileErr && <div className="err" style={{ marginTop: 8 }}>{fileErr}</div>}
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {files.map((f) => (
                  <div className="inv-row" key={f.fileId}>
                    <FileText size={16} />
                    <button type="button" className="link inv-name" onClick={() => openPoFile(f)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>{f.name}</button>
                    <span className="inv-size">{kb(f.size)}</span>
                    <button type="button" className="link" onClick={() => openPoFile(f)}>View</button>
                    <button type="button" className="link" onClick={() => downloadPoFile(f)}>Download</button>
                    <button type="button" className="link inv-remove" onClick={() => removeExisting(f.fileId)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Invoice-style totals ── */}
          <div className="po-totals">
            <Row label="Sub Total (materials)" val={money(poTot.itemTaxable)} />
            {poTot.loading ? <Row label="Loading Charges" val={money(poTot.loading)} /> : null}
            {poTot.transport && poTot.transportGst ? <Row label="Transport Charge" val={money(poTot.transport)} /> : null}
            <Row label="Taxable Value" val={money(poTot.taxable)} />
            {poTot.taxType === 'igst'
              ? poTot.byRate.map((r) => <Row key={`i${r.rate}`} label={`IGST @ ${r.rate}%`} val={money(r.igst)} />)
              : poTot.byRate.flatMap((r) => [
                  <Row key={`c${r.rate}`} label={`CGST @ ${r.rate / 2}%`} val={money(r.cgst)} />,
                  <Row key={`s${r.rate}`} label={`SGST @ ${r.rate / 2}%`} val={money(r.sgst)} />,
                ])}
            {poTot.transport && !poTot.transportGst ? <Row label="Transport Charge (no GST)" val={money(poTot.transport)} /> : null}
            {Math.abs(poTot.roundOff) >= 0.005 ? <Row label="Round Off" val={(poTot.roundOff >= 0 ? '+' : '−') + '₹' + Math.abs(poTot.roundOff).toFixed(2)} /> : null}
            <Row label="Total GST" val={money(poTot.gst)} />
            <Row label="Grand Total" val={inr(poTot.grand)} strong />
            <div className="po-words">{amountInWords(poTot.grand)}</div>
          </div>

          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{!editing.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)} disabled={busy}>Delete PO</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing.isNew ? 'Create PO' : 'Save changes'}</button>
            </div>
          </div>
          {confirmDel && (
            <div className="confirm">
              Delete purchase order {editing.po} and all its items permanently?
              <button className="btn danger" onClick={doDeletePO} disabled={busy}>Delete</button>
              <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
            </div>
          )}
        </Drawer>
      )}

      <style>{`
        .po-filter{font:600 13.5px var(--f-body)}
        .filter-note{margin:10px 0 0;font-size:13px;color:var(--muted);display:flex;align-items:center;gap:8px}
        .filter-note b{color:var(--accent-ink);text-transform:capitalize}
        .po-link{color:var(--accent-ink);font-weight:700;text-decoration:none;border-bottom:1px dotted var(--accent);cursor:pointer}
        .po-link:hover{text-decoration:none;border-bottom-style:solid}
        .fab-tag{display:inline-block;margin-left:8px;font:700 9.5px var(--f-body);text-transform:uppercase;letter-spacing:.05em;color:var(--accent-ink);background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:6px;padding:2px 6px;vertical-align:middle}
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
        .newpo-wrap{position:relative}
        .newpo-menu{position:absolute;right:0;top:46px;z-index:30;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 40px -16px rgba(0,0,0,.4);overflow:hidden;min-width:250px}
        .newpo-menu button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;border:0;background:none;padding:11px 14px;cursor:pointer;border-bottom:1px solid var(--line)}
        .newpo-menu button:last-child{border-bottom:0}
        .newpo-menu button:hover{background:var(--accent-soft)}
        .newpo-menu button b{font:700 13.5px var(--f-body);color:var(--fg)}
        .newpo-menu button span{font-size:11.5px;color:var(--muted)}
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
