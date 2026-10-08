import React, { useState, useEffect } from 'react';
import { invoicesApi } from '../../api/client';
import { usePurchaseData } from '../../context/PurchaseData';
import { inr, groupPOs } from '../../utils/procurement';
import { openInvoice } from '../../utils/cloudinary';

export default function AccountsVerification() {
  const [invoices, setInvoices] = useState([]);
  const { lines } = usePurchaseData();

  const load = () => {
    invoicesApi.list().then(setInvoices).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const groups = groupPOs(lines);
  const poMap = new Map(groups.map(g => [g.po, g]));

  const verifyInvoice = async (po) => {
    if (!window.confirm(`Verify invoice for ${po}?`)) return;
    try {
      await invoicesApi.updateDetails(po, { status: 'Verified' });
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
                  <td><span style={{ padding: '4px 8px', background: 'var(--warn-bg, #fef3c7)', color: 'var(--warn, #d97706)', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>{inv.status || 'Pending'}</span></td>
                  <td>
                    <button className="btn small" onClick={() => openInvoice(inv)}>View PDF</button>
                    <button className="btn small primary" style={{ marginLeft: 8 }} onClick={() => verifyInvoice(inv.po)}>Mark Verified</button>
                  </td>
                </tr>
              );
            })}
            {invoices.filter(i => i.status === 'Pending Verification' || !i.status).length === 0 && <tr><td colSpan="5">No invoices pending verification.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}