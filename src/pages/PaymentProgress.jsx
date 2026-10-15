import React, { useState, useMemo } from 'react';
import { Plus, FileDown, Trash2, HandCoins, Wallet, ReceiptIndianRupee } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { getUser } from '../api/client';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import ComboBox from '../components/ComboBox';
import {
  groupPOs, vendorName, inr, num, dfmt, today, PAYMENT_METHODS,
  cpReceipts, cpOrderValue, cpReceived, cpOutstanding, cpStatus, cpOverdueDays, cpLastDate,
} from '../utils/procurement';
import { downloadPaymentSlip } from '../utils/paymentSlip';

const TABS = ['Client Payment', 'Vendor Payment'];
const blankPay = () => ({ amount: '', date: today(), method: '', refNo: '', remarks: '', dueDate: '' });
const blankOrder = () => ({ project: '', clientName: '', totalOrderValue: '', paymentTerms: '', method: '', dueDate: '', notes: '' });

// Payment Progress — two completely separate ledgers:
//   • Client Payment  : money RECEIVED from clients, per project order (purchase_project_payments)
//   • Vendor Payment  : money PAID to vendors, per purchase order     (purchase_payments)
// Every figure (received / paid / outstanding / overdue) is derived live from the real records.
export default function PaymentProgress() {
  const {
    vendors, lines, payments, projects, projectPayments, loading, error,
    savePayment, deletePayment, saveProjectPayment, deleteProjectPayment,
  } = usePurchaseData();
  const toast = useToast();
  const [tab, setTab] = useState('Client Payment');
  const [q, setQ] = useState('');

  // ───────────────────────── VENDOR PAYMENT ─────────────────────────
  const [manage, setManage] = useState(null);   // PO group being managed
  const [form, setForm] = useState(blankPay());
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupPOs(lines), [lines]);
  const paysOf = (po) => (Array.isArray(payments) ? payments : []).filter(p => p.po === po)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const vRows = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    return groups
      .map(g => ({ g, vn: g.vendorName || vendorName(vendors, g.vid) }))
      .filter(({ g, vn }) => !q2 || [g.po, g.vid, vn, g.project].filter(Boolean).join(' ').toLowerCase().includes(q2))
      .sort((a, b) => String(a.g.po).localeCompare(String(b.g.po), undefined, { numeric: true }));
  }, [groups, vendors, q]);

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

  const openManage = (g) => { setForm(blankPay()); setFormErr(''); setManage(g); };
  const close = () => { setManage(null); setFormErr(''); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addPayment = async () => {
    const amount = num(form.amount);
    if (amount <= 0) { setFormErr('Enter a payment amount greater than 0.'); return; }
    if (!form.date) { setFormErr('Choose the payment date.'); return; }
    setBusy(true);
    try {
      await savePayment(true, null, {
        po: manage.po, vid: manage.vid, amount,
        date: form.date, method: form.method || '', refNo: String(form.refNo || '').trim(),
        remarks: String(form.remarks || '').trim(), dueDate: form.dueDate || '',
      });
      setForm(blankPay());
      toast('Vendor payment recorded');
    } catch (e) { setFormErr(e.message || 'Could not record the payment.'); }
    finally { setBusy(false); }
  };
  const removePayment = async (id) => {
    setBusy(true);
    try { await deletePayment(id); toast('Payment deleted'); }
    catch (e) { toast(e.message || 'Could not delete payment'); }
    finally { setBusy(false); }
  };
  const receipt = async (p, g) => {
    try {
      await downloadPaymentSlip({
        id: p.id, po: g.po, vendorName: vendorName(vendors, g.vid),
        amount: num(p.amount), dateFmt: dfmt(p.date), method: p.method, refNo: p.refNo,
        dueFmt: p.dueDate ? dfmt(p.dueDate) : '—', remarks: p.remarks,
        poAmount: g.value, paidToDate: g.paid, balance: g.out, status: g.payment,
        authorizedBy: (getUser() && getUser().name) || 'Tesco Structures',
      });
    } catch (e) { toast(e.message || 'Could not generate the receipt'); }
  };
  const mg = manage ? (groups.find(g => g.po === manage.po) || manage) : null;

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
      paymentTerms: r.paymentTerms || '', method: r.paymentMethod || '', dueDate: r.dueDate || '', notes: r.notes || '',
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
        paymentMethod: d.method || '',
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
            {t === 'Client Payment' ? <ReceiptIndianRupee size={15} /> : <Wallet size={15} />} {t}
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
                <th>Project</th><th>Client</th><th className="num">Order Value</th><th>Payment Terms</th>
                <th className="num">Received</th><th>Last Payment</th><th className="num">Outstanding</th><th>Status</th><th className="num">Receipts</th><th></th>
              </tr></thead>
              <tbody>
                {loading || error || cRows.length === 0 ? (
                  <StateRow cols={10} loading={loading} error={error}
                    empty={(projectPayments || []).length ? 'No client orders match your search.' : 'No client orders yet. Click "New client order" to start tracking a client payment.'} />
                ) : cRows.map(({ r, client }) => {
                  const od = cpOverdueDays(r);
                  return (
                    <tr key={r.id} className="row-click" onClick={() => openClientManage(r)}>
                      <td>{r.project || '—'}</td>
                      <td><b>{client}</b></td>
                      <td className="num">{inr(cpOrderValue(r))}</td>
                      <td>{r.paymentTerms || '—'}</td>
                      <td className="num calc">{inr(cpReceived(r))}</td>
                      <td className={od > 0 ? 'overdue' : ''}>{cpLastDate(r) ? dfmt(cpLastDate(r)) : '—'}{od > 0 ? ` · ${od}d overdue` : ''}</td>
                      <td className={`num calc ${cpOutstanding(r) > 0 ? 'overdue' : ''}`}>{inr(cpOutstanding(r))}</td>
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
                <th className="num">Paid</th><th className="num">Outstanding</th><th>Due Date</th><th>Status</th><th>Terms</th><th className="num">Payments</th><th></th>
              </tr></thead>
              <tbody>
                {loading || error || vRows.length === 0 ? (
                  <StateRow cols={11} loading={loading} error={error}
                    empty={groups.length ? 'No POs match your search.' : 'No purchase orders yet. Raise a PO to record payments against it.'} />
                ) : vRows.map(({ g, vn }) => (
                  <tr key={g.po} className="row-click" onClick={() => openManage(g)}>
                    <td className="id">{g.po}</td>
                    <td>{vn}</td>
                    <td>{g.project || '—'}</td>
                    <td className="num">{inr(g.value)}</td>
                    <td className="num">{inr(g.paid)}</td>
                    <td className="num calc">{inr(g.out)}</td>
                    <td className={g.payOverdueDays > 0 ? 'overdue' : ''}>{g.dueDate ? dfmt(g.dueDate) : '—'}{g.payOverdueDays > 0 ? ` · ${g.payOverdueDays}d overdue` : ''}</td>
                    <td className="calc"><Pill s={g.payment} /></td>
                    <td>{(() => { const ps = paysOf(g.po); return ps.length ? (ps[0].method || '—') : '—'; })()}</td>
                    <td className="num">{paysOf(g.po).length}</td>
                    <td onClick={(e) => e.stopPropagation()}><button className="link" onClick={() => openManage(g)}>View / Manage</button></td>
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
          <h3>Vendor Payments · {mg.po}</h3>
          <p className="hint">{mg.vendorName || vendorName(vendors, mg.vid)} · {mg.project || 'No project'}</p>

          <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)', margin: '4px 0 14px' }}>
            <div className="kpi"><div className="l">PO Value</div><div className="v">{inr(mg.value)}</div></div>
            <div className="kpi"><div className="l">Paid</div><div className="v">{inr(mg.paid)}</div></div>
            <div className="kpi"><div className="l">Outstanding</div><div className="v">{inr(mg.out)}</div></div>
          </div>

          <div className="po-items-head" style={{ marginBottom: 8 }}><span>Add a payment</span></div>
          <div className="grid">
            <Field label="Amount (₹) *"><input type="number" min="0" step="any" value={form.amount} onChange={e => set('amount', e.target.value)} /></Field>
            <Field label="Payment Date *"><input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></Field>
            <Field label="Payment Method"><select value={form.method} onChange={e => set('method', e.target.value)}><option value="">— Select —</option>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
            <Field label="Transaction / Ref No"><input value={form.refNo} onChange={e => set('refNo', e.target.value)} placeholder="UTR / cheque / txn id" /></Field>
            <Field label="Payment Due Date"><input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
            <Field label="Remarks" full><input value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any note for this payment" /></Field>
          </div>
          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div />
            <button className="btn primary" onClick={addPayment} disabled={busy}><Plus size={15} /> {busy ? 'Saving…' : 'Record payment'}</button>
          </div>

          <div className="po-items-head" style={{ margin: '16px 0 10px' }}><span>Payment History ({paysOf(mg.po).length})</span></div>
          {paysOf(mg.po).length === 0 ? (
            <div className="state" style={{ padding: '24px 8px' }}>No payments recorded yet.</div>
          ) : (
            <div className="ph-tl">
              {paysOf(mg.po).map(p => (
                <div className="ph-node" key={p.id}>
                  <div className="ph-dot"><FileDown size={12} /></div>
                  <div className="ph-card">
                    <div className="ph-date">{dfmt(p.date)}{p.method ? ` · ${p.method}` : ''}</div>
                    <div className="ph-title">{inr(p.amount)} <span className="ph-id">{p.id}</span></div>
                    {(p.refNo || p.remarks) && <div className="ph-rem">{[p.refNo && `Ref: ${p.refNo}`, p.remarks].filter(Boolean).join('  —  ')}</div>}
                    <div className="ph-acts">
                      <button className="link" onClick={() => receipt(p, mg)}><FileDown size={12} style={{ verticalAlign: '-2px' }} /> Receipt</button>
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

          {!cDrawer.isNew && cmg && (
            <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)', margin: '4px 0 14px' }}>
              <div className="kpi"><div className="l">Order Value</div><div className="v">{inr(cpOrderValue(cmg))}</div></div>
              <div className="kpi"><div className="l">Received</div><div className="v">{inr(cpReceived(cmg))}</div></div>
              <div className="kpi"><div className="l">Outstanding</div><div className={`v ${cpOutstanding(cmg) > 0 ? 'bad' : ''}`}>{inr(cpOutstanding(cmg))}</div></div>
            </div>
          )}

          <div className="po-items-head" style={{ marginBottom: 8 }}><span>Order details</span></div>
          <div className="grid">
            <Field label="Project"><ComboBox value={cDetail.project} onChange={onPickProject} options={projects.map(p => p.name)} placeholder="Link to a project" /></Field>
            <Field label="Client Name"><input value={cDetail.clientName} onChange={e => setCD('clientName', e.target.value)} placeholder="Customer / client" /></Field>
            <Field label="Order Value (₹) *"><input type="number" min="0" step="any" value={cDetail.totalOrderValue} onChange={e => setCD('totalOrderValue', e.target.value)} /></Field>
            <Field label="Payment Terms"><input value={cDetail.paymentTerms} onChange={e => setCD('paymentTerms', e.target.value)} placeholder="e.g. 50% advance, balance on delivery" /></Field>
            <Field label="Payment Due Date"><input type="date" value={cDetail.dueDate} onChange={e => setCD('dueDate', e.target.value)} /></Field>
            <Field label="Payment Method"><select value={cDetail.method} onChange={e => setCD('method', e.target.value)}><option value="">— Select —</option>{PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></Field>
            <Field label="Notes"><input value={cDetail.notes} onChange={e => setCD('notes', e.target.value)} placeholder="Any note" /></Field>
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
      `}</style>
    </section>
  );
}
