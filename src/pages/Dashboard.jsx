import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, IndianRupee, Wallet, AlertTriangle } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { kpis, inr } from '../utils/procurement';

// Procurement Dashboard — simplified to the four headline summary cards only:
// Total PO, Total PO Value, Outstanding, Overdue. Every value is derived live from
// the real PO/payment records via kpis() (nothing hard-coded). Cards that map to an
// existing Purchase-Orders filter are clickable and deep-link to those records.
export default function Dashboard() {
  const { lines, loading } = usePurchaseData();
  const navigate = useNavigate();
  const k = useMemo(() => kpis(lines), [lines]);

  const CARDS = [
    { l: 'Total PO',       v: k.poCount,            to: 'all',     icon: ClipboardList },
    { l: 'Total PO Value', v: inr(k.value),         to: 'all',     icon: IndianRupee },
    { l: 'Outstanding',    v: inr(k.out),           bad: k.out > 0, icon: Wallet },
    { l: 'Overdue',        v: inr(k.overdueAmount), bad: k.overdueAmount > 0, to: 'overdue', icon: AlertTriangle },
  ];

  return (
    <>
      <section className="kpis kpis-4" aria-label="Procurement summary">
        {CARDS.map((x) => {
          const clickable = !!x.to;
          const go = () => navigate(`/purchase-orders?filter=${x.to}`);
          return (
            <div
              className={`kpi ${clickable ? 'kpi-link' : ''}`}
              key={x.l}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? go : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } : undefined}
            >
              {x.icon && <span className="kpi-ic"><x.icon size={17} /></span>}
              <div className="l">{x.l}</div>
              <div className={`v ${x.bad ? 'bad' : ''}`}>{loading ? '—' : x.v}</div>
              {clickable && <div className="kpi-go">View →</div>}
            </div>
          );
        })}
      </section>

      <style>{`
        .kpis-4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
        @media (max-width:980px){.kpis-4{grid-template-columns:repeat(2,1fr)}}
        @media (max-width:560px){.kpis-4{grid-template-columns:1fr}}
        .kpi{position:relative}
        .kpi-link{cursor:pointer;transition:transform .12s,box-shadow .12s,border-color .12s}
        .kpi-link:hover{transform:translateY(-2px);box-shadow:var(--shadow-md,0 10px 24px -14px rgba(0,0,0,.35));border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
        .kpi-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        .kpi-go{position:absolute;right:14px;bottom:12px;font-size:11.5px;font-weight:700;color:var(--accent-ink);opacity:0;transition:opacity .12s}
        .kpi-link:hover .kpi-go,.kpi-link:focus-visible .kpi-go{opacity:1}
      `}</style>
    </>
  );
}
