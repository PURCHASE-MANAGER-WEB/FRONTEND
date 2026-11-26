import React, { useState, useMemo } from 'react';
import { Plus, FileDown, Trash2, HandCoins, Wallet, Pencil } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { getUser } from '../api/client';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import ComboBox from '../components/ComboBox';
import {
  groupPOs, calcLine, vendorName, inr, num, dfmt, today, PAYMENT_METHODS,
  cpReceipts, cpOrderValue, cpReceived, cpOutstanding, cpPaidPct, cpPendingPct, cpStatus, cpOverdueDays, cpLastDate,
} from '../utils/procurement';
import { downloadPaymentSlip } from '../utils/paymentSlip';

const TABS = ['Client Payment', 'Vendor Payment'];
const UNASSIGNED = '(Unassigned)';
const blankPay = () => ({ amount: '', date: today(), method: '', refNo: '', remarks: '', dueDate: '', project: '' });
const blankOrder = () => ({ project: '', clientName: '', totalOrderValue: '', paymentTerms: '', dueDate: '', notes: '' });

// Auto paid-% with a small progress bar. Over 100% (over-paid) is shown in full and the bar
// caps at 100% but turns amber so it reads as "over".
function PctCell({ pct }) {
  const over = pct > 100;
  return (
    <div className="pct-cell">
      <span className={`pct-num ${over ? 'over' : ''}`}>{pct}%</span>
      <div className="pct-bar"><i className={over ? 'over' : ''} style={{ width: Math.min(pct, 100) + '%' }} /></div>
    </div>
  );
}

// Payment Progress — two completely separate ledgers:
//   • Client Payment  : money RECEIVED from clients, per project order (purchase_project_payments)
//   • Vendor Payment  : money PAID to vendors, per purchase order     (purchase_payments)
// Every figure (received / paid / outstanding / overdue) is derived live from the real records.
export default function PaymentProgress() {
  const {
    vendors, lines, payments, projects, projectPayments, loading, error,
    savePayment, deletePayment, saveProjectPayment, deleteProjectPayment, saveLine,
  } = usePurchaseData();
  const toast = useToast();
  const [tab, setTab] = useState('Client Payment');
  const [q, setQ] = useState('');

  // ───────────────────────── VENDOR PAYMENT ─────────────────────────
  const [manage, setManage] = useState(null);   // PO group being managed
  const [form, setForm] = useState(blankPay());
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [paidEdit, setPaidEdit] = useState(false);   // editing the PO's stored paid amount
  const [paidVal, setPaidVal] = useState('');
  const [editId, setEditId] = useState(null);   // id of the vendor payment being edited (null = adding new)

  const groups = useMemo(() => groupPOs(lines), [lines]);
  const poN = (v) => String(v || '').trim().toUpperCase();
  const prN = (v) => String(v || '').trim();
  const paysOf = (po) => (Array.isArray(payments) ? payments : []).filter(p => poN(p.po) === poN(po))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  // Payments for one PROJECT of a PO (ledger entries tagged with that project).
  const paysOfProject = (po, project) => paysOf(po).filter(p => prN(p.project) === prN(project));

  // Per-PO, per-project breakdown for the Vendor tab. A PO is split into one row per project
  // ONLY when its lines carry more than one distinct project (e.g. PO-294 → Balakrishnan +
  // Manikandan). Single-project POs are left exactly as before. The PO always stays ONE record
  // and the dashboard/KPI totals remain PO-level, so the overall figures are unchanged.
  const vBreak = useMemo(() => {
    const m = new Map();
    const allLines = Array.isArray(lines) ? lines : [];
    for (const g of groups) {
      const poLines = allLines.filter(l => poN(l.po) === g.po);
      const order = [];
      for (const l of poLines) { const p = prN(l.project); if (!order.includes(p)) order.push(p); }
      const named = order.filter(Boolean);
      if (named.length <= 1) { m.set(g.po, { multi: false }); continue; }
      const pays = paysOf(g.po);
      const ledgerTotal = pays.reduce((a, p) => a + num(p.amount), 0);
      const exTotal = poLines.reduce((a, l) => a + calcLine(l).total, 0) || 1;
      let alloc = 0;
      const rows = named.map((proj, i) => {
        const pl = poLines.filter(l => prN(l.project) === proj);
        const ex = pl.reduce((a, l) => a + calcLine(l).total, 0);
        // Allocate the GST-inclusive PO value across projects by each project's line subtotal;
        // the last project absorbs any rounding remainder so the parts sum exactly to the PO value.
        const value = (i === named.length - 1) ? Math.max(g.value - alloc, 0) : Math.round(g.value * ex / exTotal);
        alloc += value;
        const legacyPaid = pl.reduce((a, l) => a + num(l.paid), 0);
        const ledgerPaid = pays.filter(p => prN(p.project) === proj).reduce((a, p) => a + num(p.amount), 0);
        // Once this PO has ANY ledger payment, the ledger is the source of truth (matching how the
        // rest of the system reconciles paid amounts); otherwise use the per-line legacy paid.
        const paid = ledgerTotal > 0 ? ledgerPaid : legacyPaid;
        const out = Math.max(value - paid, 0);
        const status = (value > 0 && out <= 0.5) ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';
        return { project: proj, value, paid, out, status };
      });
      // Any ledger payment left without a project on a multi-project PO is surfaced as its own
      // row so no money is ever hidden — it can be assigned to a project by editing it.
      const unassignedPaid = ledgerTotal > 0 ? pays.filter(p => !prN(p.project)).reduce((a, p) => a + num(p.amount), 0) : 0;
      m.set(g.po, { multi: true, rows, unassignedPaid, projects: named });
    }
    return m;
  }, [groups, lines, payments]);

  const vRows = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    const list = [];
    for (const g of groups) {
      const vn = g.vendorName || vendorName(vendors, g.vid);
      const b = vBreak.get(g.po);
      if (!b || !b.multi) {
        const ps = paysOf(g.po);
        list.push({ key: g.po, g, vn, project: g.project, value: g.value, paid: g.paid, out: g.out, status: g.payment, dueDate: g.dueDate, payOverdueDays: g.payOverdueDays, payCount: ps.length, method: ps.length ? (ps[0].method || '—') : '—', split: false });
      } else {
        for (const r of b.rows) {
          const ps = paysOfProject(g.po, r.project);
          list.push({ key: g.po + '::' + r.project, g, vn, project: r.project, value: r.value, paid: r.paid, out: r.out, status: r.status, dueDate: g.dueDate, payOverdueDays: r.out > 0 ? g.payOverdueDays : 0, payCount: ps.length, method: ps.length ? (ps[0].method || '—') : '—', split: true, proj: r.project });
        }
        if (b.unassignedPaid > 0) {
          const ps = paysOf(g.po).filter(p => !prN(p.project));
          list.push({ key: g.po + '::__un', g, vn, project: UNASSIGNED, value: 0, paid: b.unassignedPaid, out: 0, status: 'Paid', dueDate: '', payOverdueDays: 0, payCount: ps.length, method: ps.length ? (ps[0].method || '—') : '—', split: true, unassigned: true });
        }
      }
    }
    return list
      .filter(r => !q2 || [r.g.po, r.g.vid, r.vn, r.project].filter(Boolean).join(' ').toLowerCase().includes(q2))
      .sort((a, b) => String(a.g.po).localeCompare(String(b.g.po), undefined, { numeric: true }) || String(a.project || '').localeCompare(String(b.project || '')));
  }, [groups, vBreak, vendors, payments, q]);

  const vCards = useMemo(() => {
    const totalValue = groups.reduce((a, g) => a + g.value, 0);
    const totalPaid = groups.reduce((a, g) => a + g.paid, 0);
    const outstanding = groups.reduce((a, g) => a + g.out, 0);
    const fully = groups.filter(g => g.payment === 'Paid').length;
    const partial = groups.filter(g => g.payment === 'Partial').length;
    const unpaid = groups.filter(g => g.payment === 'Unpaid').length;
    const overdue = groups.filter(g => g.payOverdueDays > 0).length;
    return { totalValue, totalPaid, outstanding, fully, partial, unpaid, overdue };
  }, [groups]);

  const openManage = (r) => {
    const project = r.split && !r.unassigned ? r.project : null;
    setForm({ ...blankPay(), project: project || '' });
    setFormErr(''); setEditId(null); setPaidEdit(false);
    setManage({ po: r.g.po, project, unassigned: !!r.unassigned });
  };
  const close = () => { setManage(null); setFormErr(''); setEditId(null); setPaidEdit(false); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Load an existing payment into the form to edit it (same form switches to "Save changes").
  const startEdit = (p) => {
    setEditId(p.id);
    setFormErr('');
    setForm({
      amount: p.amount != null ? String(p.amount) : '',
      date: p.date || today(),
      method: p.method || '',
      refNo: p.refNo || '',
      remarks: p.remarks || '',
      dueDate: p.dueDate || '',
      project: p.project || (mg && mg.split && !mg.unassigned ? mg.project : ''),
    });
  };
  const cancelEdit = () => { setEditId(null); setForm({ ...blankPay(), project: mg && mg.split && !mg.unassigned ? mg.project : '' }); setFormErr(''); };

  const addPayment = async () => {
    const amount = num(form.amount);
    if (amount <= 0) { setFormErr('Enter a payment amount greater than 0.'); return; }
    if (!form.date) { setFormErr('Choose the payment date.'); return; }
    if (mg.split && !String(form.project || '').trim()) { setFormErr('Choose which project this payment is for.'); return; }
    setBusy(true);
    try {
      const body = {
        po: mg.po, vid: mg.g.vid, amount,
        project: (mg.split && !mg.unassigned) ? String(form.project || mg.project || '').trim() : String(form.project || '').trim(),
        date: form.date, method: form.method || '', refNo: String(form.refNo || '').trim(),
        remarks: String(form.remarks || '').trim(), dueDate: form.dueDate || '',
      };
      if (editId) {
        await savePayment(false, editId, body);
        toast('Payment updated');
      } else {
        await savePayment(true, null, body);
        toast('Vendor payment recorded');
      }
      setForm(blankPay());
      setEditId(null);
    } catch (e) { setFormErr(e.message || (editId ? 'Could not update the payment.' : 'Could not record the payment.')); }
    finally { setBusy(false); }
  };
  const removePayment = async (id) => {
    setBusy(true);
    try { await deletePayment(id); toast('Payment deleted'); if (editId === id) cancelEdit(); }
    catch (e) { toast(e.message || 'Could not delete payment'); }
    finally { setBusy(false); }
  };
  // Some POs carry a paid amount stored directly on the PO (legacy / imported) with no entry
  // in the payment ledger. For those, allow editing that paid figure directly. The amount is
  // written onto the PO's first line and the rest zeroed — the same layout syncPoPaid uses.
  const startPaidEdit = (g) => { setPaidVal(String(num(g.paid))); setPaidEdit(true); };
  const cancelPaidEdit = () => { setPaidEdit(false); setPaidVal(''); };
  const savePaidEdit = async (g) => {
    const v = num(paidVal);
    if (v < 0) { toast('Paid amount cannot be negative.'); return; }
    const poLines = lines.filter(l => l.po === g.po).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    if (!poLines.length) { toast('No PO lines found to update.'); return; }
    setBusy(true);
    try {
      for (let i = 0; i < poLines.length; i++) {
        const target = i === 0 ? v : 0;
        if (num(poLines[i].paid) !== target) await saveLine(false, poLines[i].id, { paid: target });
      }
      toast('Paid amount updated');
      setPaidEdit(false);
    } catch (e) { toast(e.message || 'Could not update the paid amount.'); }
    finally { setBusy(false); }
  };
  const receipt = async (p, m) => {
    try {
      const projLabel = m.split && !m.unassigned ? ` · ${m.project}` : '';
      await downloadPaymentSlip({
        id: p.id, po: m.po + projLabel, vendorName: m.vn || vendorName(vendors, m.g.vid),
        amount: num(p.amount), dateFmt: dfmt(p.date), method: p.method, refNo: p.refNo,
        dueFmt: p.dueDate ? dfmt(p.dueDate) : '—', remarks: p.remarks,
        poAmount: m.value, paidToDate: m.paid, balance: m.out, status: m.status,
        authorizedBy: (getUser() && getUser().name) || 'Tesco Structures',
      });
    } catch (e) { toast(e.message || 'Could not generate the receipt'); }
  };
  // The live PO/project being managed. For a split (multi-project) PO this exposes that ONE
  // project's value / paid / outstanding and that project's payment history; for a single PO it
  // is the whole PO exactly as before. Recomputed live so the drawer updates after each payment.
  const mg = useMemo(() => {
    if (!manage) return null;
    const g = groups.find(x => x.po === manage.po);
    if (!g) return null;
    const vn = g.vendorName || vendorName(vendors, g.vid);
    if (manage.project == null && !manage.unassigned) {
      return { g, vn, po: g.po, project: g.project, value: g.value, paid: g.paid, out: g.out, status: g.payment, split: false, pays: paysOf(g.po), projects: [] };
    }
    const b = vBreak.get(g.po) || {};
    const projects = b.projects || [];
    if (manage.unassigned) {
      const pays = paysOf(g.po).filter(p => !prN(p.project));
      const paid = pays.reduce((a, p) => a + num(p.amount), 0);
      return { g, vn, po: g.po, project: UNASSIGNED, value: 0, paid, out: 0, status: 'Paid', split: true, unassigned: true, pays, projects };
    }
    const row = (b.rows || []).find(r => r.project === manage.project) || { project: manage.project, value: 0, paid: 0, out: 0, status: 'Unpaid' };
    return { g, vn, po: g.po, project: row.project, value: row.value, paid: row.paid, out: row.out, status: row.status, split: true, pays: paysOfProject(g.po, manage.project), projects };
  }, [manage, groups, vBreak, vendors, payments]);

  // ───────────────────────── CLIENT PAYMENT ─────────────────────────
  const [cDrawer, setCDrawer] = useState(null);   // { isNew, id }
  const [cDetail, setCDetail] = useState(blankOrder());
  const [cForm, setCForm] = useState(blankPay());
  const [cErr, setCErr] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [cConfirmDel, setCConfirmDel] = useState(false);

  const clientOf = (r) => r.clientName || (projects.find(p => p.name === (r.project || r.customerName)) || {}).client || r.customerName || '—';

  const cRows = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    return (Array.isArray(projectPayments) ? projectPayments : [])
      .map(r => ({ r, client: clientOf(r) }))
      .filter(({ r, client }) => !q2 || [r.project, r.customerName, client, r.paymentTerms].filter(Boolean).join(' ').toLowerCase().includes(q2))
      .sort((a, b) => String(cpLastDate(b.r) || '').localeCompare(String(cpLastDate(a.r) || '')));
  }, [projectPayments, projects, q]);

  const cCards = useMemo(() => {
    const list = Array.isArray(projectPayments) ? projectPayments : [];
    const orderValue = list.reduce((a, r) => a + cpOrderValue(r), 0);
    const received = list.reduce((a, r) => a + cpReceived(r), 0);
    const outstanding = list.reduce((a, r) => a + cpOutstanding(r), 0);
    const fully = list.filter(r => cpStatus(r) === 'Paid').length;
    const partial = list.filter(r => cpStatus(r) === 'Partial').length;
    const unpaid = list.filter(r => cpStatus(r) === 'Unpaid').length;
    const overdue = list.filter(r => cpOverdueDays(r) > 0).length;
    return { orderValue, received, outstanding, fully, partial, unpaid, overdue };
  }, [projectPayments]);

  const cmg = cDrawer && !cDrawer.isNew ? ((projectPayments || []).find(r => r.id === cDrawer.id) || null) : null;

  const openClientNew = () => { setCErr(''); setCConfirmDel(false); setCForm(blankPay()); setCDetail(blankOrder()); setCDrawer({ isNew: true, id: null }); };
  const openClientManage = (r) => {
    setCErr(''); setCConfirmDel(false); setCForm(blankPay());
    setCDetail({
      project: r.project || '', clientName: clientOf(r) === '—' ? '' : clientOf(r),
      totalOrderValue: r.totalOrderValue != null ? String(r.totalOrderValue) : '',
      paymentTerms: r.paymentTerms || '', dueDate: r.dueDate || '', notes: r.notes || '',
    });
    setCDrawer({ isNew: false, id: r.id });
  };
  const closeClient = () => { setCDrawer(null); setCErr(''); setCConfirmDel(false); };
  const setCD = (k, v) => setCDetail(d => ({ ...d, [k]: v }));
  const setCF = (k, v) => setCForm(f => ({ ...f, [k]: v }));
  const onPickProject = (name) => {
    const p = projects.find(x => x.name === name);
    setCDetail(d => ({ ...d, project: name, clientName: (!d.clientName && p && p.client) ? p.client : d.clientName }));
  };

  const saveClientDetails = async () => {
    const d = cDetail;
    const name = String(d.project || d.clientName || '').trim();
    if (!name) { setCErr('Choose a project or enter a client name.'); return; }
    if (num(d.totalOrderValue) <= 0) { setCErr('Enter the order value.'); return; }
    setCBusy(true);
    try {
      const body = {
        customerName: String(d.project || d.clientName).trim(),
        project: String(d.project || '').trim(),
        clientName: String(d.clientName || '').trim(),
        totalOrderValue: num(d.totalOrderValue),
        paymentTerms: String(d.paymentTerms || '').trim(),
        dueDate: d.dueDate || '',
        notes: String(d.notes || '').trim(),
      };
      if (cDrawer.isNew) {
        await saveProjectPayment(true, null, { ...body, payments: [], collectionSoFar: 0, condition: 'Payment Pending' });
        toast('Client order added');
        closeClient();
      } else {
        await saveProjectPayment(false, cDrawer.id, body);
        toast('Order details saved');
      }
    } catch (e) { setCErr(e.message || 'Could not save.'); }
    finally { setCBusy(false); }
  };

  const addClientReceipt = async () => {
    if (!cmg) return;
    const amount = num(cForm.amount);
    if (amount <= 0) { setCErr('Enter a receipt amount greater than 0.'); return; }
    if (!cForm.date) { setCErr('Choose the payment date.'); return; }
    const next = [
      ...cpReceipts(cmg),
      { amount, date: cForm.date, method: cForm.method || '', refNo: String(cForm.refNo || '').trim(), remarks: String(cForm.remarks || '').trim(), dueDate: cForm.dueDate || '' },
    ];
    const collected = next.reduce((s, p) => s + num(p.amount), 0);
    const order = cpOrderValue(cmg);
    setCBusy(true);
    try {
      await saveProjectPayment(false, cmg.id, {
        payments: next,
        collectionSoFar: collected,
        collectionAmount: amount,
        collectionDate: cForm.date,
        condition: order > 0 && collected >= order ? 'Completed' : 'Ongoing',
      });
      setCForm(blankPay()); setCErr('');
      toast('Receipt recorded');
    } catch (e) { setCErr(e.message || 'Could not record the receipt.'); }
    finally { setCBusy(false); }
  };
  const removeClientReceipt = async (idx) => {
    if (!cmg) return;
    const next = cpReceipts(cmg).filter((_, i) => i !== idx);
    const collected = next.reduce((s, p) => s + num(p.amount), 0);
    const order = cpOrderValue(cmg);
    setCBusy(true);
    try {
      await saveProjectPayment(false, cmg.id, { payments: next, collectionSoFar: collected, condition: next.length === 0 ? 'Payment Pending' : (order > 0 && collected >= order ? 'Completed' : 'Ongoing') });
      toast('Receipt deleted');
    } catch (e) { toast(e.message || 'Could not delete receipt'); }
    finally { setCBusy(false); }
  };
  const deleteClient = async () => {
    setCBusy(true);
    try { await deleteProjectPayment(cDrawer.id); toast('Client order deleted'); closeClient(); }
    catch (e) { setCErr(e.message || 'Could not delete.'); }
    finally { setCBusy(false); }
  };

  // Receipts of the live client record, newest first (keep original index for delete).
  const cReceiptList = cmg ? cpReceipts(cmg).map((p, i) => ({ ...p, _i: i })).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) : [];

  return (
    <section>
      <div className="toolbar">
        <h2>Payment Progress</h2>
        <div className="right">
          <input className="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder={tab === 'Client Payment' ? 'Search project, client…' : 'Search PO, vendor…'} aria-label="Search payments" />
        </div>
      </div>

      <div className="ptabs">
        {TABS.map((t) => (
          <button key={t} className={`ptab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setQ(''); }}>
            {t === 'Client Payment' ? <HandCoins size={15} /> : <Wallet size={15} />} {t}
          </button>
        ))}
      </div>

      {/* ───────────── CLIENT PAYMENT ───────────── */}
      {tab === 'Client Payment' && (
        <>
          <section className="kpis" aria-label="Client payment summary" style={{ margin: '14px 0 16px' }}>
            <div className="kpi"><div className="l">Total Order Value</div><div className="v">{inr(cCards.orderValue)}</div></div>
            <div className="kpi"><div className="l">Total Received</div><div className="v">{inr(cCards.received)}</div></div>
            <div className="kpi"><div className="l">Outstanding</div><div className={`v ${cCards.outstanding > 0 ? 'bad' : ''}`}>{inr(cCards.outstanding)}</div></div>
            <div className="kpi"><div className="l">Fully Received</div><div className="v">{cCards.fully}</div></div>
            <div className="kpi"><div className="l">Partially Received</div><div className="v">{cCards.partial}</div></div>
            <div className="kpi"><div className="l">Not Received</div><div className="v">{cCards.unpaid}</div></div>
            <div className="kpi"><div className="l">Overdue</div><div className="v">{cCards.overdue}</div></div>
          </section>

          <div className="toolbar" style={{ marginBottom: 8 }}>
            <p className="sub" style={{ margin: 0 }}>Track payments received from clients for each project order. Open a row to record receipts and see history.</p>
            <div className="right"><button className="btn primary" onClick={openClientNew}><Plus size={15} /> New client order</button></div>
          </div>

          <div className="tbl">
            <table>
              <thead><tr>
                <th>Project</th><th>Client</th><th className="num">Order Value</th><th className="num">Paid %</th>
                <th className="num">Received</th><th>Last Payment</th><th className="num">Outstanding</th><th>Status</th><th className="num">Receipts</th><th></th>
              </tr></thead>
              <tbody>
                {loading || error || cRows.length === 0 ? (
                  <StateRow cols={10} loading={loading} error={error}
                    empty={(projectPayments || []).length ? 'No client orders match your search.' : 'No client orders yet. Click "New client order" to start tracking a client payment.'} />
                ) : cRows.map(({ r, client }) => {
                  const od = cpOverdueDays(r);
                  const outv = cpOutstanding(r);
                  const pct = cpPaidPct(r);
                  return (
                    <tr key={r.id} className="row-click" onClick={() => openClientManage(r)}>
                      <td>{r.project || '—'}</td>
                      <td><b>{client}</b></td>
                      <td className="num">{inr(cpOrderValue(r))}</td>
                      <td className="num"><PctCell pct={pct} /></td>
                      <td className="num calc">{inr(cpReceived(r))}</td>
                      <td className={od > 0 ? 'overdue' : ''}>{cpLastDate(r) ? dfmt(cpLastDate(r)) : '—'}{od > 0 ? ` · ${od}d overdue` : ''}</td>
                      <td className={`num calc ${outv > 0 ? 'overdue' : outv < 0 ? 'over' : ''}`}>{outv < 0 ? `-${inr(Math.abs(outv))}` : inr(outv)}{outv < 0 ? <span className="over-tag" title="Received more than the order value">over</span> : ''}</td>
                      <td className="calc"><Pill s={cpStatus(r)} /></td>
                      <td className="num">{cpReceipts(r).length}</td>
                      <td onClick={(e) => e.stopPropagation()}><button className="link" onClick={() => openClientManage(r)}>View / Manage</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ───────────── VENDOR PAYMENT ───────────── */}
      {tab === 'Vendor Payment' && (
        <>
          <section className="kpis" aria-label="Vendor payment summary" style={{ margin: '14px 0 16px' }}>
            <div className="kpi"><div className="l">Total PO Value</div><div className="v">{inr(vCards.totalValue)}</div></div>
            <div className="kpi"><div className="l">Total Paid</div><div className="v">{inr(vCards.totalPaid)}</div></div>
            <div className="kpi"><div className="l">Outstanding</div><div className={`v ${vCards.outstanding > 0 ? 'bad' : ''}`}>{inr(vCards.outstanding)}</div></div>
            <div className="kpi"><div className="l">Fully Paid</div><div className="v">{vCards.fully}</div></div>
            <div className="kpi"><div className="l">Partially Paid</div><div className="v">{vCards.partial}</div></div>
            <div className="kpi"><div className="l">Unpaid</div><div className="v">{vCards.unpaid}</div></div>
            <div className="kpi"><div className="l">Overdue Payments</div><div className="v">{vCards.overdue}</div></div>
          </section>

          <p className="sub" style={{ margin: '6px 0 10px' }}>Record and track payments made to vendors against each purchase order. Open a PO to add payments and print receipts.</p>

          <div className="tbl">
            <table>
              <thead><tr>
                <th>PO Number</th><th>Vendor</th><th>Project</th><th className="num">PO Value</th>
                <th className="num">Paid</th><th className="num">Outstanding</th><th>Due Date</th><th>Status</th><th>Method</th><th className="num">Payments</th><th></th>
              </tr></thead>
              <tbody>
                {loading || error || vRows.length === 0 ? (
                  <StateRow cols={11} loading={loading} error={error}
                    empty={groups.length ? 'No POs match your search.' : 'No purchase orders yet. Raise a PO to record payments against it.'} />
                ) : vRows.map((r) => (
                  <tr key={r.key} className="row-click" onClick={() => openManage(r)}>
                    <td className="id">{r.g.po}{r.split && !r.unassigned ? <span className="split-tag">split</span> : ''}</td>
                    <td>{r.vn}</td>
                    <td>{r.unassigned ? <em className="muted-cell">{UNASSIGNED}</em> : (r.project || '—')}</td>
                    <td className="num">{r.unassigned ? '—' : inr(r.value)}</td>
                    <td className="num">{inr(r.paid)}</td>
                    <td className="num calc">{r.unassigned ? '—' : inr(r.out)}</td>
                    <td className={r.payOverdueDays > 0 ? 'overdue' : ''}>{r.dueDate ? dfmt(r.dueDate) : '—'}{r.payOverdueDays > 0 ? ` · ${r.payOverdueDays}d overdue` : ''}</td>
                    <td className="calc">{r.unassigned ? '—' : <Pill s={r.status} />}</td>
                    <td>{r.method}</td>
                    <td className="num">{r.payCount}</td>
                    <td onClick={(e) => e.stopPropagation()}><button className="link" onClick={() => openManage(r)}>View / Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ───────────── VENDOR manage drawer ───────────── */}
      {mg && (
        <Drawer onClose={close}>
          <h3>Vendor Payments · {mg.po}{mg.split && !mg.unassigned ? ` · ${mg.project}` : ''}</h3>
          <p className="hint">{mg.vn} · {mg.unassigned ? 'Payments not yet assigned to a project' : (mg.split ? `Project: ${mg.project}` : (mg.project || 'No project'))}</p>
          {mg.split && !mg.unassigned && (
            <p className="hint" style={{ marginTop: -4 }}>This purchase order is shared across {mg.projects.length} projects — you are viewing <b>{mg.project}</b> only. Each project keeps its own paid, outstanding and payment history.</p>
          )}

          <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)', margin: '4px 0 14px' }}>
            <div className="kpi"><div className="l">{mg.unassigned ? 'PO Value' : (mg.split ? 'Project Value' : 'PO Value')}</div><div className="v">{mg.unassigned ? '—' : inr(mg.value)}</div></div>
            <div className="kpi"><div className="l">Paid</div><div className="v">{inr(mg.paid)}</div></div>
            <div className="kpi"><div className="l">Outstanding</div><div className="v">{mg.unassigned ? '—' : inr(mg.out)}</div></div>
          </div>

          <div className="po-items-head" style={{ marginBottom: 8 }}><span>{editId ? `Edit payment · ${editId}` : 'Add a payment'}</span></div>
          <div className="grid">
            {mg.split && (
              <Field label="For project *">
                <select value={form.project} onChange={e => set('project', e.target.value)}>
                  <option value="">— Select project —</option>
                  {mg.projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            )}
            <Field label="Amount (₹) *"><input type="number" min="0" step="any" value={form.amount} onChange={e => set('amount', e.target.value)} /></Field>
            <Field label="Payment Date *"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
            <Field label="Payment Method"><select value={form.method} onChange={e => set('method', e.target.value)}><option value="">— Select —</option>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
            <Field label="Transaction / Ref No"><input value={form.refNo} onChange={e => set('refNo', e.target.value)} placeholder="UTR / cheque / txn id" /></Field>
            <Field label="Payment Due Date"><input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
            <Field label="Remarks" full><input value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any note for this payment" /></Field>
          </div>
          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{editId && <button className="btn" onClick={cancelEdit} disabled={busy}>Cancel edit</button>}</div>
            <button className="btn primary" onClick={addPayment} disabled={busy}><Plus size={15} /> {busy ? 'Saving…' : editId ? 'Save changes' : 'Record payment'}</button>
          </div>

          {!mg.split && mg.pays.length === 0 && mg.paid > 0 && (
            <div className="reconcile-banner">
              {!paidEdit ? (
                <>
                  <div className="rb-text">
                    This PO has <b>{inr(mg.paid)}</b> recorded as paid directly on the order (no payment entry below). You can edit that amount here.
                  </div>
                  <button className="btn" onClick={() => startPaidEdit(mg)} disabled={busy}>
                    <Pencil size={15} /> Edit paid amount
                  </button>
                </>
              ) : (
                <>
                  <div className="rb-edit">
                    <Field label="Paid amount (₹)"><input type="number" min="0" step="any" value={paidVal} onChange={e => setPaidVal(e.target.value)} autoFocus /></Field>
                  </div>
                  <div className="rb-acts">
                    <button className="btn" onClick={cancelPaidEdit} disabled={busy}>Cancel</button>
                    <button className="btn primary" onClick={() => savePaidEdit(mg)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="po-items-head" style={{ margin: '16px 0 10px' }}><span>Payment History ({mg.pays.length}){mg.split && !mg.unassigned ? ` · ${mg.project}` : ''}</span></div>
          {mg.pays.length === 0 ? (
            <div className="state" style={{ padding: '24px 8px' }}>No payments recorded yet{mg.split && !mg.unassigned ? ' for this project' : ''}.</div>
          ) : (
            <div className="ph-tl">
              {mg.pays.map(p => (
                <div className={`ph-node ${editId === p.id ? 'editing' : ''}`} key={p.id}>
                  <div className="ph-dot"><FileDown size={12} /></div>
                  <div className="ph-card">
                    <div className="ph-date">{dfmt(p.date)}{p.method ? ` · ${p.method}` : ''}</div>
                    <div className="ph-title">{inr(p.amount)} <span className="ph-id">{p.id}</span></div>
                    {(p.refNo || p.remarks) && <div className="ph-rem">{[p.refNo && `Ref: ${p.refNo}`, p.remarks].filter(Boolean).join('  —  ')}</div>}
                    <div className="ph-acts">
                      <button className="link" onClick={() => receipt(p, mg)}><FileDown size={12} style={{ verticalAlign: '-2px' }} /> Receipt</button>
                      <button className="link" onClick={() => startEdit(p)} title="Edit" disabled={busy}><Pencil size={12} style={{ verticalAlign: '-2px' }} /> Edit</button>
                      <button className="link" onClick={() => removePayment(p.id)} title="Delete" disabled={busy}><Trash2 size={12} style={{ verticalAlign: '-2px' }} /> Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="actions" style={{ marginTop: 14 }}>
            <div />
            <button className="btn" onClick={close}>Close</button>
          </div>
        </Drawer>
      )}

      {/* ───────────── CLIENT manage / new drawer ───────────── */}
      {cDrawer && (
        <Drawer onClose={closeClient}>
          <h3>{cDrawer.isNew ? 'New client order' : `Client Payments · ${cDetail.clientName || cmg?.project || ''}`}</h3>
          <p className="hint">{cDrawer.isNew ? 'Record the client order, then collect receipts against it.' : 'Money received from the client for this project order.'}</p>

          {!cDrawer.isNew && cmg && (() => {
            const outv = cpOutstanding(cmg); const pct = cpPaidPct(cmg); const pend = cpPendingPct(cmg);
            return (
              <>
                <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)', margin: '4px 0 10px' }}>
                  <div className="kpi"><div className="l">Order Value</div><div className="v">{inr(cpOrderValue(cmg))}</div></div>
                  <div className="kpi"><div className="l">Received</div><div className="v">{inr(cpReceived(cmg))}</div></div>
                  <div className="kpi"><div className="l">{outv < 0 ? 'Over-received' : 'Outstanding'}</div><div className={`v ${outv > 0 ? 'bad' : outv < 0 ? 'over' : ''}`}>{outv < 0 ? `-${inr(Math.abs(outv))}` : inr(outv)}</div></div>
                </div>
                <div className="pct-line">
                  <div className="pct-bar lg"><i className={pct > 100 ? 'over' : ''} style={{ width: Math.min(pct, 100) + '%' }} /></div>
                  <div className="pct-cap"><b className={pct > 100 ? 'over' : ''}>{pct}% paid</b>{pct <= 100 ? ` · ${pend}% pending` : ' · over by ' + inr(Math.abs(outv))}</div>
                </div>
              </>
            );
          })()}

          <div className="po-items-head" style={{ marginBottom: 8 }}><span>Order details</span></div>
          <div className="grid">
            <Field label="Project"><ComboBox value={cDetail.project} onChange={onPickProject} options={projects.map(p => p.name)} placeholder="Link to a project" /></Field>
            <Field label="Client Name"><input value={cDetail.clientName} onChange={e => setCD('clientName', e.target.value)} placeholder="Customer / client" /></Field>
            <Field label="Order Value (₹) *"><input type="number" min="0" step="any" value={cDetail.totalOrderValue} onChange={e => setCD('totalOrderValue', e.target.value)} /></Field>
            <Field label="Payment Due Date"><input type="date" value={cDetail.dueDate} onChange={e => setCD('dueDate', e.target.value)} /></Field>
            <Field label="Notes" full><input value={cDetail.notes} onChange={e => setCD('notes', e.target.value)} placeholder="Any note" /></Field>
          </div>
          {cErr && <div className="err">{cErr}</div>}
          <div className="actions">
            <div>{!cDrawer.isNew && <button className="btn danger" onClick={() => setCConfirmDel(true)} disabled={cBusy}>Delete order</button>}</div>
            <button className="btn primary" onClick={saveClientDetails} disabled={cBusy}>{cBusy ? 'Saving…' : cDrawer.isNew ? 'Create order' : 'Save details'}</button>
          </div>
          {cConfirmDel && (
            <div className="confirm">Delete this client order and all its receipts permanently?
              <button className="btn danger" onClick={deleteClient} disabled={cBusy}>Delete</button>
              <button className="link" onClick={() => setCConfirmDel(false)}>Cancel</button>
            </div>
          )}

          {!cDrawer.isNew && cmg && (
            <>
              <div className="po-items-head" style={{ margin: '18px 0 8px' }}><span>Record a receipt</span></div>
              <div className="grid">
                <Field label="Amount (₹) *"><input type="number" min="0" step="any" value={cForm.amount} onChange={e => setCF('amount', e.target.value)} /></Field>
                <Field label="Payment Date *"><input type="date" value={cForm.date} onChange={e => setCF('date', e.target.value)} /></Field>
                <Field label="Payment Method"><select value={cForm.method} onChange={e => setCF('method', e.target.value)}><option value="">— Select —</option>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
                <Field label="Transaction / Ref No"><input value={cForm.refNo} onChange={e => setCF('refNo', e.target.value)} placeholder="UTR / cheque / txn id" /></Field>
                <Field label="Remarks" full><input value={cForm.remarks} onChange={e => setCF('remarks', e.target.value)} placeholder="Any note for this receipt" /></Field>
              </div>
              <div className="actions">
                <div />
                <button className="btn primary" onClick={addClientReceipt} disabled={cBusy}><Plus size={15} /> {cBusy ? 'Saving…' : 'Record receipt'}</button>
              </div>

              <div className="po-items-head" style={{ margin: '16px 0 10px' }}><span>Payment History ({cReceiptList.length})</span></div>
              {cReceiptList.length === 0 ? (
                <div className="state" style={{ padding: '24px 8px' }}>No receipts recorded yet.</div>
              ) : (
                <div className="ph-tl">
                  {cReceiptList.map((p) => (
                    <div className="ph-node" key={p._i}>
                      <div className="ph-dot"><HandCoins size={12} /></div>
                      <div className="ph-card">
                        <div className="ph-date">{dfmt(p.date)}{p.method ? ` · ${p.method}` : ''}</div>
                        <div className="ph-title">{inr(p.amount)}</div>
                        {(p.refNo || p.remarks) && <div className="ph-rem">{[p.refNo && `Ref: ${p.refNo}`, p.remarks].filter(Boolean).join('  —  ')}</div>}
                        <div className="ph-acts">
                          <button className="link" onClick={() => removeClientReceipt(p._i)} title="Delete" disabled={cBusy}><Trash2 size={12} style={{ verticalAlign: '-2px' }} /> Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="actions" style={{ marginTop: 14 }}>
            <div />
            <button className="btn" onClick={closeClient}>Close</button>
          </div>
        </Drawer>
      )}

      <style>{`
        .ptabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin-bottom:4px}
        .ptab{display:inline-flex;align-items:center;gap:7px;border:0;background:none;padding:11px 16px;font:700 13.5px var(--f-body);color:var(--muted);cursor:pointer;border-bottom:2.5px solid transparent;margin-bottom:-1px}
        .ptab:hover{color:var(--fg)}
        .ptab.active{color:var(--accent-ink);border-bottom-color:var(--accent)}
        .split-tag{display:inline-block;margin-left:7px;padding:1px 7px;border-radius:999px;font:700 9.5px var(--f-body);letter-spacing:.04em;text-transform:uppercase;background:var(--accent-soft);color:var(--accent-ink);vertical-align:1px}
        .muted-cell{color:var(--muted);font-style:italic}
        .pct-cell{display:inline-flex;flex-direction:column;align-items:flex-end;gap:3px;min-width:58px}
        .pct-num{font:700 12.5px var(--f-body);color:var(--fg)}
        .pct-num.over{color:#b45309}
        .pct-bar{width:58px;height:5px;border-radius:999px;background:var(--line);overflow:hidden}
        .pct-bar i{display:block;height:100%;background:var(--accent);border-radius:999px}
        .pct-bar i.over{background:#f59e0b}
        .pct-bar.lg{width:100%;height:8px;margin-top:2px}
        .pct-line{margin:0 0 14px}
        .pct-cap{font-size:12.5px;color:var(--muted);margin-top:6px}
        .pct-cap b{color:var(--accent-ink)}
        .pct-cap b.over{color:#b45309}
        td.over,.kpi .v.over{color:#b45309!important}
        .over-tag{display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;font:700 9.5px var(--f-body);text-transform:uppercase;letter-spacing:.04em;background:#fef3c7;color:#b45309;vertical-align:1px}
        .ph-tl{position:relative;padding-left:26px}
        .ph-tl:before{content:"";position:absolute;left:9px;top:4px;bottom:4px;width:2px;background:var(--line)}
        .ph-node{position:relative;margin-bottom:12px}
        .ph-dot{position:absolute;left:-26px;top:2px;width:20px;height:20px;border-radius:50%;background:var(--accent-soft);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;border:2px solid var(--surface)}
        .ph-card{border:1px solid var(--line);border-radius:12px;padding:11px 13px;background:var(--surface);box-shadow:var(--shadow-sm)}
        .ph-date{font-size:11.5px;color:var(--muted);font-weight:600}
        .ph-title{font:700 15px var(--f-body);color:var(--fg);margin-top:3px}
        .ph-id{font:500 11px var(--f-mono);color:var(--muted);margin-left:6px}
        .ph-rem{font-size:12.5px;color:var(--muted);margin-top:4px;border-left:2px solid var(--line);padding-left:8px}
        .ph-acts{display:flex;gap:14px;margin-top:8px}
        .ph-node.editing .ph-card{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
        .reconcile-banner{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:16px 0 4px;padding:12px 14px;border:1px solid var(--accent);background:var(--accent-soft);border-radius:12px}
        .reconcile-banner .rb-text{flex:1;min-width:220px;font-size:13px;color:var(--fg);line-height:1.5}
        .reconcile-banner .rb-edit{flex:1;min-width:200px}
        .reconcile-banner .rb-acts{display:flex;gap:10px}
        .reconcile-banner .btn{white-space:nowrap}
      `}</style>
    </section>
  );
}
