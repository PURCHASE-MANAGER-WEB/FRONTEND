import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePurchaseData } from '../context/PurchaseData';
import { kpis, inr } from '../utils/procurement';

export default function Dashboard() {
  const { lines, loading } = usePurchaseData();
  const k = useMemo(() => kpis(lines), [lines]);

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

      <section className="card" style={{ padding: '18px 20px' }}>
        <h2 style={{ font: '700 17px var(--f-display)', margin: '0 0 6px' }}>Procurement at a glance</h2>
        <p className="sub" style={{ margin: 0 }}>
          Open <Link to="/purchase-progress" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Purchase Progress</Link> for delivery &amp; payment tracking per PO,
          manage suppliers under <Link to="/vendors" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Vendors</Link>,
          and raise orders under <Link to="/purchase-orders" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Purchase Orders</Link>.
        </p>
      </section>
    </>
  );
}
