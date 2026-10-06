import React, { useState, useMemo } from 'react';
import { Plus, FileDown, Trash2 } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { getUser } from '../api/client';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { groupPOs, vendorName, inr, num, dfmt, today, PAYMENT_METHODS } from '../utils/procurement';
import { downloadPaymentSlip } from '../utils/paymentSlip';

const blankPay = () => ({ amount: '', date: today(), method: '', refNo: '', remarks: '', dueDate: '' });

// Payment Progress — a dedicated ledger for purchase-order payments. Each PO shows its
// amount, paid, pending and status; payments are recorded against the PO and a receipt
// can be generated for each one. All figures come from the real PO + payment records.
export default function PaymentProgress() {
  const { vendors, lines, payments, loading, error, savePayment, deletePayment } = usePurchaseData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [manage, setManage] = useState(null);   // PO group being managed
  const [form, setForm] = useState(blankPay());
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupPOs(lines), [lines]);
  const paysOf = (po) => (Array.isArray(payments) ? payments : []).filter(p => p.po === po)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const rows = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    return groups
      .map(g => ({ g, vn: vendorName(vendors, g.vid) }))
      .filter(({ g, vn }) => !q2 || [g.po, g.vid, vn, g.project].filter(Boolean).join(' ').toLowerCase().includes(q2))
      .sort((a, b) => String(a.g.po).localeCompare(String(b.g.po), undefined, { numeric: true }));
  }, [groups, vendors, q]);

  // Cards — all derived from real records.
  const cards = useMemo(() => {
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
      toast('Payment recorded');
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

  // live snapshot of the PO being managed (reflects just-added payments after reload)
  const mg = manage ? (groups.find(g => g.po === manage.po) || manage) : null;

  return (
    <section>
      <section className="kpis" aria-label="Payment summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="l">Total PO Value</div><div className="v">{inr(cards.totalValue)}</div></div>
        <div className="kpi"><div className="l">Total Paid</div><div className="v">{inr(cards.totalPaid)}</div></div>
        <div className="kpi"><div className="l">Outstanding</div><div className="v">{inr(cards.outstanding)}</div></div>
        <div className="kpi"><div className="l">Fully Paid</div><div className="v">{cards.fully}</div></div>
        <div className="kpi"><div className="l">Partially Paid</div><div className="v">{cards.partial}</div></div>
        <div className="kpi"><div className="l">Unpaid</div><div className="v">{cards.unpaid}</div></div>
        <div className="kpi"><div className="l">Overdue Payments</div><div className="v">{cards.overdue}</div></div>
      </section>

      <div className="toolbar">
        <h2>Payment Progress</h2>
        <div className="right">
          <input className="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO, vendor…" aria-label="Search payments" />
        </div>
      </div>
      <p className="sub" style={{ margin: '6px 0 10px' }}>Record and track payments against each purchase order. Open a PO to add payments and print receipts.</p>

      <div className="tbl">
        <table>
          <thead><tr>
            <th>PO Number</th><th>Vendor</th><th>Project</th><th className="num">PO Amount</th>
            <th className="num">Paid</th><th className="num">Pending</th><th>Due Date</th><th>Status</th><th className="num">Payments</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={10} loading={loading} error={error}
                empty={groups.length ? 'No POs match your search.' : 'No purchase orders yet. Raise a PO to record payments against it.'} />
            ) : rows.map(({ g, vn }) => (
              <tr key={g.po}>
                <td className="id">{g.po}</td>
                <td>{vn}</td>
                <td>{g.project || '—'}</td>
                <td className="num">{inr(g.value)}</td>
                <td className="num">{inr(g.paid)}</td>
                <td className="num calc">{inr(g.out)}</td>
                <td className={g.payOverdueDays > 0 ? 'overdue' : ''}>{g.dueDate ? dfmt(g.dueDate) : '—'}{g.payOverdueDays > 0 ? ` · ${g.payOverdueDays}d overdue` : ''}</td>
                <td className="calc"><Pill s={g.payment} /></td>
                <td className="num">{paysOf(g.po).length}</td>
                <td><button className="link" onClick={() => openManage(g)}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mg && (
        <Drawer onClose={close}>
          <h3>Payments · {mg.po}</h3>
          <p className="hint">{vendorName(vendors, mg.vid)} · {mg.project || 'No project'}</p>

          <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)', margin: '4px 0 14px' }}>
            <div className="kpi"><div className="l">PO Amount</div><div className="v">{inr(mg.value)}</div></div>
            <div className="kpi"><div className="l">Paid</div><div className="v">{inr(mg.paid)}</div></div>
            <div className="kpi"><div className="l">Pending</div><div className="v">{inr(mg.out)}</div></div>
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

          <div className="po-items-head" style={{ margin: '14px 0 8px' }}><span>Recorded payments ({paysOf(mg.po).length})</span></div>
          <div className="tbl">
            <table>
              <thead><tr><th>Ref</th><th>Date</th><th className="num">Amount</th><th>Method</th><th></th><th></th></tr></thead>
              <tbody>
                {paysOf(mg.po).length === 0 ? (
                  <tr><td colSpan={6} className="state">No payments recorded yet.</td></tr>
                ) : paysOf(mg.po).map(p => (
                  <tr key={p.id}>
                    <td className="id">{p.id}{p.refNo ? ` · ${p.refNo}` : ''}</td>
                    <td>{dfmt(p.date)}</td>
                    <td className="num">{inr(p.amount)}</td>
                    <td>{p.method || '—'}</td>
                    <td><button className="link" onClick={() => receipt(p, mg)}><FileDown size={13} style={{ verticalAlign: '-2px' }} /> Receipt</button></td>
                    <td><button className="link" onClick={() => removePayment(p.id)} title="Delete payment" disabled={busy}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="actions" style={{ marginTop: 14 }}>
            <div />
            <button className="btn" onClick={close}>Close</button>
          </div>
        </Drawer>
      )}
    </section>
  );
}
