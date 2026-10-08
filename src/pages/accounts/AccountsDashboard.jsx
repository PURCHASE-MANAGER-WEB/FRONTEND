import React from 'react';
import { usePurchaseData } from '../../context/PurchaseData';
import { inr, groupPOs } from '../../utils/procurement';

export default function AccountsDashboard() {
  const { lines } = usePurchaseData();
  
  let totalPayable = 0, totalPaid = 0, outstanding = 0, dueToday = 0, overdue = 0;
  
  const groups = groupPOs(lines);
  for (const g of groups) {
    totalPayable += g.value;
    totalPaid += g.paid;
    outstanding += g.out;
    if (g.payOverdueDays > 0) overdue += g.out;
    if (g.payDueToday) dueToday += g.out;
  }

  return (
    <section>
      <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px', textTransform: 'uppercase' }}>Total Payable</h3>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)' }}>{inr(totalPayable)}</div>
        </div>
        <div className="card" style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px', textTransform: 'uppercase' }}>Total Paid</h3>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)' }}>{inr(totalPaid)}</div>
        </div>
        <div className="card" style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px', textTransform: 'uppercase' }}>Total Outstanding</h3>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--bad)' }}>{inr(outstanding)}</div>
        </div>
        <div className="card" style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px', textTransform: 'uppercase' }}>Due Today</h3>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--fg)' }}>{inr(dueToday)}</div>
        </div>
        <div className="card" style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 10px', textTransform: 'uppercase' }}>Overdue Amount</h3>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--bad)' }}>{inr(overdue)}</div>
        </div>
      </div>
    </section>
  );
}
