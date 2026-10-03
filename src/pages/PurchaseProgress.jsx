import React, { useState, useMemo } from 'react';
import { usePurchaseData } from '../context/PurchaseData';
import { Pill, StateRow } from '../components/ui';
import { groupPOs, vendorName, inr, qfmt } from '../utils/procurement';

// Purchase Progress — one row per PO, rolled up from its material lines.
export default function PurchaseProgress() {
  const { vendors, lines, loading, error } = usePurchaseData();
  const [filter, setFilter] = useState('');

  const groups = useMemo(() => groupPOs(lines), [lines]);
  const rows = groups.filter(g => !filter || (filter === 'done'
    ? (g.delivery === 'Completed' && g.payment === 'Paid')
    : !(g.delivery === 'Completed' && g.payment === 'Paid')));

  return (
    <section>
      <div className="toolbar">
        <h2>Purchase Progress</h2>
        <div className="right">
          <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter by status">
            <option value="">All POs</option>
            <option value="open">Open (not fully delivered or paid)</option>
            <option value="done">Completed &amp; paid</option>
          </select>
        </div>
      </div>
      <p className="sub" style={{ margin: '6px 0 10px' }}>One row per PO, rolled up from its material lines.</p>
      <div className="tbl">
        <table>
          <thead><tr>
            <th>PO Number</th><th>Vendor</th><th>Project</th><th className="num">PO Value</th>
            <th className="num">Ordered</th><th className="num">Received</th><th className="num">Pending</th>
            <th>Delivery progress</th><th>Payment progress</th><th>Delivery</th><th>Payment</th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={11} loading={loading} error={error}
                empty={groups.length ? 'No POs match this filter.' : 'No purchase orders yet. Add PO lines to see progress here.'} />
            ) : rows.map(g => {
              const dp = g.delPct, pp = g.payPct;
              const delNote = g.overdueDays > 0 ? ` · ${g.overdueDays}d overdue` : (g.dueToday && g.delivery !== 'Completed' ? ' · due today' : '');
              const payNote = g.payOverdueDays > 0 ? ` · ${g.payOverdueDays}d overdue` : '';
              const u = g.unit === 'mixed units' ? '' : ' ' + g.unit;
              return (
                <tr key={g.po}>
                  <td className="id">{g.po}</td>
                  <td>{vendorName(vendors, g.vid)}</td>
                  <td>{g.project || '—'}</td>
                  <td className="num">{inr(g.value)}</td>
                  <td className="num">{qfmt(g.qty)}{u}</td>
                  <td className="num">{qfmt(g.rec)}{u}</td>
                  <td className="num">{qfmt(g.pend)}{u}</td>
                  <td><span className="bar"><i style={{ width: dp + '%' }} /></span><span className={`sub ${g.overdueDays > 0 ? 'overdue' : ''}`}>{dp}%{delNote}</span></td>
                  <td><span className="bar pay"><i style={{ width: pp + '%' }} /></span><span className={`sub ${g.payOverdueDays > 0 ? 'overdue' : ''}`}>{pp}% · {inr(g.out)} due{payNote}</span></td>
                  <td><Pill s={g.delivery} /></td>
                  <td><Pill s={g.payment} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
