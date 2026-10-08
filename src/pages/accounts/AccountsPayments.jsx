import React, { useState, useEffect } from 'react';
import { invoicesApi } from '../../api/client';
import { usePurchaseData } from '../../context/PurchaseData';
import { inr, groupPOs } from '../../utils/procurement';
import { useNavigate } from 'react-router-dom';

export default function AccountsPayments() {
  const [invoices, setInvoices] = useState([]);
  const { lines, savePayment } = usePurchaseData();
  const navigate = useNavigate();

  const [payForm, setPayForm] = useState(null);
  const [form, setForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], method: '', refNo: '', remarks: '' });
  const PAYMENT_METHODS = ['Bank Transfer', 'NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash'];

  const load = () => invoicesApi.list().then(setInvoices).catch(console.error);
  useEffect(() => { load(); }, []);

  const groups = groupPOs(lines);
  const poMap = new Map(groups.map(g => [g.po, g]));

  const approvePayment = async (po) => {
    if (!window.confirm(`Approve payment for ${po}?`)) return;
    try {
      await invoicesApi.updateDetails(po, { status: 'Accounts Approved' });
      load();
    } catch (e) { alert(e.message); }
  };

  const handleRecordPayment = async () => {
    if (!form.amount || !form.date) return alert('Amount and Date are required');
    try {
      const p = {
        id: 'PMT-' + Date.now().toString(36).toUpperCase(),
        po: payForm.po,
        amount: Number(form.amount),
        date: form.date,
        method: form.method,
        refNo: form.refNo,
        remarks: form.remarks,
      };
      await savePayment(true, p.id, p);
      await invoicesApi.updateDetails(payForm.po, { status: 'Paid' });
      setPayForm(null);
      load();
    } catch (e) { alert(e.message); }
  };

  const visible = invoices.filter(i => ['Verified', 'Management Approved', 'Accounts Approved'].includes(i.status));

  return (
    <section>
      <div className="card tbl">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Payments Tracker</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Status</th>
              <th>Outstanding</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(inv => {
              const out = poMap.get(inv.po)?.out || 0;
              return (
                <tr key={inv._id}>
                  <td>{inv.po}</td>
                  <td><span style={{ padding: '4px 8px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>{inv.status}</span></td>
                  <td style={{ color: out > 0 ? 'var(--bad)' : 'inherit' }}>{inr(out)}</td>
                  <td>
                    {inv.status !== 'Accounts Approved' ? (
                      <button className="btn small primary" onClick={() => approvePayment(inv.po)}>Approve Payment</button>
                    ) : (
                      <button className="btn small" style={{ background: 'var(--good, #10b981)', color: '#fff', borderColor: 'var(--good, #10b981)' }} onClick={() => setPayForm(inv)}>Record Payment</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan="4">No pending approvals.</td></tr>}
          </tbody>
        </table>
      </div>

      {payForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 400, padding: 20 }}>
            <h3 style={{ margin: '0 0 16px' }}>Record Payment - {payForm.po}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Amount *</label><input type="number" className="input" style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 4 }} value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Date *</label><input type="date" className="input" style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 4 }} value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Method</label>
                <select className="input" style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 4 }} value={form.method} onChange={e => setForm({...form, method: e.target.value})}>
                  <option value="">- Select -</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>UTR / Ref No</label><input className="input" style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 4 }} value={form.refNo} onChange={e => setForm({...form, refNo: e.target.value})} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setPayForm(null)}>Cancel</button>
              <button className="btn primary" onClick={handleRecordPayment}>Save Payment</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}