import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, CheckCircle2, AlertTriangle, IndianRupee, Wallet, Coins, History, Store, FolderKanban, PiggyBank, Truck } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { kpis, groupPOs, inr, num } from '../utils/procurement';

// Procurement dashboard — grouped sections of colored, clickable summary cards
// (Purchase Orders · Payments · Vendors & Projects · Delivery). Every figure is
// derived live from the real records; each card deep-links to its module.
export default function Dashboard() {
  const { vendors, lines, projects, challans, payments, loading } = usePurchaseData();
  const navigate = useNavigate();

  const k = useMemo(() => kpis(lines), [lines]);
  const g = useMemo(() => groupPOs(lines), [lines]);

  const poPend = g.filter((x) => x.status === 'Pending Approval').length;
  const poAppr = g.filter((x) => x.status === 'Approved').length;
  const pendingValue = g.filter((x) => x.status !== 'Cancelled').reduce((a, x) => a + x.out, 0);
  const activeVendors = vendors.filter((v) => String(v.status || 'Active') === 'Active').length;
  const activeProjects = projects.filter((p) => String(p.status || 'Active') === 'Active').length;
  const totalBudget = projects.reduce((a, p) => a + num(p.budget), 0);
  const dcRecv = challans.filter((c) => (c.status || 'Received') === 'Received').length;
  const dcPend = challans.filter((c) => (c.status || 'Received') === 'Pending').length;

  const SECTIONS = [
    { title: 'Purchase Orders', cards: [
      { l: 'Total POs', v: k.poCount, sub: 'All purchase orders', icon: ClipboardList, c: 'accent', to: '/purchase-orders' },
      { l: 'Total PO Value', v: inr(k.value), sub: 'Combined order value', icon: IndianRupee, c: 'accent', to: '/purchase-orders' },
    ] },
    { title: 'Payments', cards: [
      { l: 'Total Paid', v: inr(k.paid), sub: 'Paid to date', icon: Wallet, c: 'ok', to: '/payment-progress' },
      { l: 'Outstanding', v: inr(k.out), sub: 'Still to pay', icon: Coins, c: 'warn', to: '/payment-progress' },
      { l: 'Overdue Amount', v: inr(k.overdueAmount), sub: 'Payment overdue', icon: AlertTriangle, c: 'bad', to: '/purchase-orders?filter=overdue' },
      { l: 'Payments Recorded', v: payments.length, sub: 'Ledger entries', icon: History, c: 'accent', to: '/payment-progress' },
    ] },
    { title: 'Vendors & Projects', cards: [
      { l: 'Total Vendors', v: vendors.length, sub: 'Supplier master', icon: Store, c: 'accent', to: '/vendors' },
      { l: 'Active Vendors', v: activeVendors, sub: 'Currently active', icon: CheckCircle2, c: 'ok', to: '/vendors' },
      { l: 'Total Projects', v: projects.length, sub: 'All projects', icon: FolderKanban, c: 'accent', to: '/projects' },
      { l: 'Active Projects', v: activeProjects, sub: 'In progress', icon: CheckCircle2, c: 'ok', to: '/projects' },
      { l: 'Total Budget', v: inr(totalBudget), sub: 'Allocated across projects', icon: PiggyBank, c: 'mute', to: '/projects' },
    ] },
  ];

  return (
    <>
      {SECTIONS.map((sec) => (
        <div className="dsec" key={sec.title}>
          <div className="dsec-h"><span className="dsec-bar" />{sec.title}</div>
          <div className="dgrid">
            {sec.cards.map((c) => (
              <div
                key={c.l}
                className={`dcard c-${c.c}`}
                role="button" tabIndex={0}
                onClick={() => navigate(c.to)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(c.to); } }}
              >
                <div className="dc-top"><span className="dc-l">{c.l}</span><span className="dc-ic"><c.icon size={18} /></span></div>
                <div className="dc-v">{loading ? '—' : c.v}</div>
                <div className="dc-sub">{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <style>{`
        .dsec{margin-bottom:24px}
        .dsec:last-child{margin-bottom:0}
        .dsec-h{display:flex;align-items:center;gap:10px;font:800 16px var(--f-display);color:var(--fg);margin:0 0 13px}
        .dsec-bar{width:4px;height:18px;border-radius:3px;background:linear-gradient(var(--accent),var(--accent-2))}
        .dgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:16px}
        .dcard{border:1px solid var(--line);border-radius:16px;padding:17px 18px 15px;cursor:pointer;transition:transform .14s,box-shadow .14s,border-color .14s;display:flex;flex-direction:column;min-height:120px;background:var(--surface);overflow:hidden}
        .dcard:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
        .dcard:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
        .dc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
        .dc-l{font:700 11px var(--f-body);text-transform:uppercase;letter-spacing:.07em;color:var(--muted);padding-top:3px}
        .dc-ic{width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .dc-v{font:700 24px/1.12 var(--f-display);margin-top:12px;letter-spacing:-.02em;color:var(--fg);overflow:hidden;text-overflow:ellipsis}
        .dc-sub{font-size:12px;color:var(--muted);margin-top:auto;padding-top:10px}
        .c-accent{background:color-mix(in srgb,var(--accent-soft) 55%,var(--surface));border-color:color-mix(in srgb,var(--accent) 18%,var(--line))}
        .c-accent .dc-ic{background:var(--accent-soft);color:var(--accent-ink)}
        .c-ok{background:color-mix(in srgb,var(--ok-bg) 62%,var(--surface));border-color:color-mix(in srgb,var(--ok) 18%,var(--line))}
        .c-ok .dc-ic{background:var(--ok-bg);color:var(--ok)}
        .c-warn{background:color-mix(in srgb,var(--warn-bg) 62%,var(--surface));border-color:color-mix(in srgb,var(--warn) 18%,var(--line))}
        .c-warn .dc-ic{background:var(--warn-bg);color:var(--warn)}
        .c-bad{background:color-mix(in srgb,var(--bad-bg) 62%,var(--surface));border-color:color-mix(in srgb,var(--bad) 18%,var(--line))}
        .c-bad .dc-ic{background:var(--bad-bg);color:var(--bad)}
        .c-mute .dc-ic{background:var(--sunk);color:var(--muted)}
        @media (max-width:560px){.dgrid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
      `}</style>
    </>
  );
}
