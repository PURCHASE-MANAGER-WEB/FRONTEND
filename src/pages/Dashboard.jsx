import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePurchaseData } from '../context/PurchaseData';
import { kpis, inr } from '../utils/procurement';

export default function Dashboard() {
  const { lines, loading } = usePurchaseData();
  const navigate = useNavigate();
  const k = useMemo(() => kpis(lines), [lines]);

  // to: query filter for the Purchase Orders page (null = not clickable)
  const KPIS = [
    { l: 'Total PO value', v: inr(k.value), to: 'all' },
    { l: 'Total POs', v: k.poCount, to: 'all' },
    { l: 'Pending POs', v: k.pend, to: 'pending' },
    { l: 'Completed POs', v: k.completed, to: 'completed' },
    { l: 'Outstanding', v: inr(k.out) },
    { l: 'Overdue POs', v: k.overdueCount, bad: k.overdueCount > 0, to: 'overdue' },
    { l: 'Overdue Amount', v: inr(k.overdueAmount), bad: k.overdueAmount > 0, to: 'overdue' },
  ];

  return (
    <>
      <section className="kpis" aria-label="Summary">
        {KPIS.map((x) => {
          const clickable = !!x.to;
          return (
            <div
              className={`kpi ${clickable ? 'kpi-link' : ''}`}
              key={x.l}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => navigate(`/purchase-orders?filter=${x.to}`) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/purchase-orders?filter=${x.to}`); } } : undefined}
            >
              <div className="l">{x.l}</div>
              <div className={`v ${x.bad ? 'bad' : ''}`}>{loading ? '—' : x.v}</div>
              {clickable && <div className="kpi-go">View →</div>}
            </div>
          );
        })}
      </section>

      <section className="card" style={{ padding: '18px 20px' }}>
        <h2 style={{ font: '700 17px var(--f-display)', margin: '0 0 6px' }}>Procurement at a glance</h2>
        <p className="sub" style={{ margin: 0 }}>
          Open <Link to="/purchase-progress" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Purchase Progress</Link> for delivery &amp; payment tracking per PO,
          manage suppliers under <Link to="/vendors" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Vendors</Link>,
          and raise orders under <Link to="/purchase-orders" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Purchase Orders</Link>.
        </p>
      </section>

      <style>{`
        .kpi-link{cursor:pointer;transition:transform .12s,box-shadow .12s,border-color .12s}
        .kpi-link:hover{transform:translateY(-2px);box-shadow:var(--shadow-md,0 10px 24px -14px rgba(0,0,0,.35));border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
        .kpi-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        .kpi-go{position:absolute;right:14px;bottom:12px;font-size:11.5px;font-weight:700;color:var(--accent-ink);opacity:0;transition:opacity .12s}
        .kpi-link:hover .kpi-go,.kpi-link:focus-visible .kpi-go{opacity:1}
      `}</style>
    </>
  );
}
