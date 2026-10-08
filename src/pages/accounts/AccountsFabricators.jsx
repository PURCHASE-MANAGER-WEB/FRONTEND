import React, { useMemo } from 'react';
import { usePurchaseData } from '../../context/PurchaseData';
import { groupPOs, inr, vendorName } from '../../utils/procurement';

export default function AccountsFabricators() {
  const { lines, vendors } = usePurchaseData();

  const fabricatorStats = useMemo(() => {
    // Treat all POs as potential fabricator work for this view, or filter by vendor type if applicable
    const groups = groupPOs(lines);
    return groups.map(g => ({
      po: g.po,
      fabricator: vendorName(vendors, g.vid),
      vid: g.vid,
      project: g.project || 'N/A',
      poValue: g.value,
      workProgress: g.delPct,
      paidAmount: g.paid,
      outstanding: g.out,
      status: g.payment
    }));
  }, [lines, vendors]);

  return (
    <section>
      <div className="card tbl">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Fabricator &amp; Sub-contractor Accounts</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fabricator</th>
              <th>Project</th>
              <th>PO Number</th>
              <th>PO Value</th>
              <th>Work Progress</th>
              <th>Paid Amount</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {fabricatorStats.map(s => (
              <tr key={s.po}>
                <td><b>{s.fabricator}</b> <span style={{ fontSize: '11px', color: 'var(--muted)' }}>({s.vid})</span></td>
                <td>{s.project}</td>
                <td>{s.po}</td>
                <td>{inr(s.poValue)}</td>
                <td>{s.workProgress}%</td>
                <td>{inr(s.paidAmount)}</td>
                <td style={{ color: s.outstanding > 0 ? 'var(--bad)' : 'inherit' }}>{inr(s.outstanding)}</td>
              </tr>
            ))}
            {fabricatorStats.length === 0 && <tr><td colSpan="7">No records found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}