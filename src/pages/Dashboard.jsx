import React, { useState, useMemo } from 'react';
import { usePurchaseData } from '../context/PurchaseData';
import { Pill, StateRow } from '../components/ui';
import { kpis, groupPOs, vendorName, inr, qfmt } from '../utils/procurement';

export default function Dashboard() {
  const { vendors, lines, loading, error } = usePurchaseData();
  const [filter, setFilter] = useState('');

  const k = useMemo(() => kpis(lines), [lines]);
  const groups = useMemo(() => groupPOs(lines), [lines]);
  const rows = groups.filter(g => !filter || (filter === 'done'
    ? (g.delivery === 'Completed' && g.payment === 'Paid')
    : !(g.delivery === 'Completed' && g.payment === 'Paid')));

  const KPIS = [
    { l: 'Total PO value', v: inr(k.value) },
    { l: 'Paid', v: inr(k.paid) },
    { l: 'Outstanding', v: inr(k.out) },
    { l: 'Lines pending delivery', v: k.pend },
    { l: 'Overdue items', v: k.over, bad: k.over > 0 },
  ];

  return (
    <>
      <section className="kpis" aria-label="Summary">
        {KPIS.map((x) => (
          <div className="kpi" key={x.l}>
            <div className="l">{x.l}</div>
            <div className={`v ${x.bad ? 'bad' : ''}`}>{loading ? '—' : x.v}</div>
          </div>
        ))}
      </section>

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
                const dp = g.qty ? Math.round(g.rec / g.qty * 100) : 0;
                const pp = g.value ? Math.round(g.paid / g.value * 100) : 0;
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
                    <td><span className="bar"><i style={{ width: dp + '%' }} /></span><span className="sub">{dp}%</span></td>
                    <td><span className="bar pay"><i style={{ width: pp + '%' }} /></span><span className="sub">{pp}% · {inr(g.out)} due</span></td>
                    <td><Pill s={g.delivery} /></td>
                    <td><Pill s={g.payment} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
