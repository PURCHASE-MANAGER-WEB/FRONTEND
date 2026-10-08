import React, { useMemo } from 'react';
import { usePurchaseData } from '../../context/PurchaseData';
import { groupPOs, inr } from '../../utils/procurement';

export default function AccountsProjects() {
  const { lines } = usePurchaseData();

  const projectStats = useMemo(() => {
    const stats = {};
    const groups = groupPOs(lines);
    
    groups.forEach(g => {
      const proj = g.project || 'Unassigned Project';
      if (!stats[proj]) {
        stats[proj] = { project: proj, totalPoValue: 0, totalPaid: 0, outstanding: 0, overdue: 0 };
      }
      stats[proj].totalPoValue += g.value;
      stats[proj].totalPaid += g.paid;
      stats[proj].outstanding += g.out;
      if (g.payOverdueDays > 0) {
        stats[proj].overdue += g.out;
      }
    });

    return Object.values(stats).sort((a, b) => b.totalPoValue - a.totalPoValue);
  }, [lines]);

  return (
    <section>
      <div className="card tbl">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Project Accounts</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Total PO Value</th>
              <th>Total Paid</th>
              <th>Outstanding</th>
              <th>Overdue Payments</th>
            </tr>
          </thead>
          <tbody>
            {projectStats.map(s => (
              <tr key={s.project}>
                <td><b>{s.project}</b></td>
                <td>{inr(s.totalPoValue)}</td>
                <td>{inr(s.totalPaid)}</td>
                <td style={{ color: s.outstanding > 0 ? 'var(--bad)' : 'inherit' }}>{inr(s.outstanding)}</td>
                <td style={{ color: s.overdue > 0 ? 'var(--bad)' : 'inherit' }}>{inr(s.overdue)}</td>
              </tr>
            ))}
            {projectStats.length === 0 && <tr><td colSpan="5">No project data found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}