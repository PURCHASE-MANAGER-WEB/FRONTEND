import React, { useState, useEffect } from 'react';
import { invoicesApi } from '../../api/client';
import { usePurchaseData } from '../../context/PurchaseData';
import { inr, groupPOs } from '../../utils/procurement';
import { useNavigate } from 'react-router-dom';

export default function AccountsPayments() {
  const [invoices, setInvoices] = useState([]);
  const { lines } = usePurchaseData();
  const navigate = useNavigate();

  const load = () => {
    invoicesApi.list().then(setInvoices).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const groups = groupPOs(lines);
  const poMap = new Map(groups.map(g => [g.po, g]));

  const approvePayment = async (po) => {
    if (!window.confirm(`Approve payment for ${po}?`)) return;
    try {
      await invoicesApi.updateDetails(po, { status: 'Accounts Approved' });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section>
      <div className="card tbl">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Payment Approval &amp; Tracking</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Status</th>
              <th>PO Value</th>
              <th>Outstanding</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.filter(i => i.status === 'Verified' || i.status === 'Management Approved').map(inv => {
              const poData = poMap.get(inv.po);
              const out = poData ? poData.out : 0;
              const val = poData ? poData.value : 0;
              return (
                <tr key={inv._id}>
                  <td>{inv.po}</td>
                  <td><span style={{ padding: '4px 8px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>{inv.status}</span></td>
                  <td>{inr(val)}</td>
                  <td style={{ color: out > 0 ? 'var(--bad)' : 'inherit' }}>{inr(out)}</td>
                  <td>
                    <button className="btn small primary" onClick={() => approvePayment(inv.po)}>Approve Payment</button>
                    <button className="btn small" style={{ marginLeft: 8 }} onClick={() => navigate(`/purchase-orders/${encodeURIComponent(inv.po)}`)}>View PO</button>
                  </td>
                </tr>
              );
            })}
            {invoices.filter(i => i.status === 'Verified' || i.status === 'Management Approved').length === 0 && <tr><td colSpan="5">No verified invoices pending approval.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}