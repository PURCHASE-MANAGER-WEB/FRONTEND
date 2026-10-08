import React, { useState, useEffect } from 'react';
import { invoicesApi } from '../../api/client';
import { usePurchaseData } from '../../context/PurchaseData';
import { inr, groupPOs } from '../../utils/procurement';
import { openInvoice } from '../../utils/cloudinary';

export default function AccountsVerification() {
  const [invoices, setInvoices] = useState([]);
  const [confirmPo, setConfirmPo] = useState(null);
  const { lines } = usePurchaseData();

  const load = () => {
    invoicesApi.list().then(setInvoices).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const groups = groupPOs(lines);
  const poMap = new Map(groups.map(g => [g.po, g]));

  const verifyInvoice = async () => {
    if (!confirmPo) return;
    try {
      await invoicesApi.updateDetails(confirmPo, { status: 'Verified' });
      setConfirmPo(null);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section>
      <div className="card tbl">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Invoice Verification Queue</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>PO Number</th>
              <th>Received %</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.filter(i => i.status === 'Pending Verification' || !i.status).map(inv => {
              const poData = poMap.get(inv.po);
              const recPct = poData ? poData.delPct : 0;
              return (
                <tr key={inv._id}>
                  <td>{inv.invoiceNo || 'N/A'}</td>
                  <td>{inv.po}</td>
                  <td style={{ color: recPct === 100 ? 'var(--good, #10b981)' : 'var(--muted)' }}>
                    {recPct}% {recPct === 100 ? '(Full)' : ''}
                  </td>
                  <td><span style={{ padding: '4px 8px', background: 'var(--warn-bg, #fef3c7)', color: 'var(--warn, #d97706)', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>{inv.status || 'Pending Verification'}</span></td>
                  <td>
                    <button className="btn small" onClick={() => openInvoice(inv)}>View PDF</button>
                    <button className="btn small primary" style={{ marginLeft: 8 }} onClick={() => setConfirmPo(inv.po)}>Mark Verified</button>
                  </td>
                </tr>
              );
            })}
            {invoices.filter(i => i.status === 'Pending Verification' || !i.status).length === 0 && <tr><td colSpan="5">No invoices pending verification.</td></tr>}
          </tbody>
        </table>
      </div>

      {confirmPo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 400, padding: 24, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, background: 'var(--good-bg, #ecfdf5)', color: 'var(--good, #10b981)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>✓</div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700 }}>Verify Invoice</h3>
            <p style={{ margin: '0 0 24px', color: 'var(--muted)', fontSize: '14px' }}>Are you sure you want to mark the invoice for <b>{confirmPo}</b> as verified?</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn" style={{ padding: '8px 24px' }} onClick={() => setConfirmPo(null)}>Cancel</button>
              <button className="btn primary" style={{ padding: '8px 24px' }} onClick={verifyInvoice}>Yes, Verify</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}