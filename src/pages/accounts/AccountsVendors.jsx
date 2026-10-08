import React, { useMemo } from 'react';
import { usePurchaseData } from '../../context/PurchaseData';
import { groupPOs, inr } from '../../utils/procurement';

export default function AccountsVendors() {
  const { lines, vendors } = usePurchaseData();

  const vendorStats = useMemo(() => {
    const stats = {};
    // Initialize stats with all vendors
    vendors.forEach(v => {
      stats[v.vid] = {
        vid: v.vid,
        name: v.name,
        totalPoValue: 0,
        totalPaid: 0,
        outstanding: 0,
        pendingInvoices: 0 // Placeholder
      };
    });

    const groups = groupPOs(lines);
    groups.forEach(g => {
      if (!stats[g.vid]) {
        stats[g.vid] = { vid: g.vid, name: 'Unknown Vendor', totalPoValue: 0, totalPaid: 0, outstanding: 0, pendingInvoices: 0 };
      }
      stats[g.vid].totalPoValue += g.value;
      stats[g.vid].totalPaid += g.paid;
      stats[g.vid].outstanding += g.out;
    });

    return Object.values(stats).filter(s => s.totalPoValue > 0 || s.outstanding > 0);
  }, [lines, vendors]);

  return (
    <section>
      <div className="card tbl">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Vendor Accounts</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Vendor Name</th>
              <th>Total PO Value</th>
              <th>Total Paid</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {vendorStats.map(s => (
              <tr key={s.vid}>
                <td><b>{s.name}</b> <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{s.vid}</div></td>
                <td>{inr(s.totalPoValue)}</td>
                <td>{inr(s.totalPaid)}</td>
                <td style={{ color: s.outstanding > 0 ? 'var(--bad)' : 'inherit', fontWeight: s.outstanding > 0 ? 600 : 400 }}>
                  {inr(s.outstanding)}
                </td>
              </tr>
            ))}
            {vendorStats.length === 0 && <tr><td colSpan="4">No vendor data found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}