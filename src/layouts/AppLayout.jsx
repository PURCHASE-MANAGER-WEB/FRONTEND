import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, RefreshCw, Bell, AlertTriangle } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { ToastProvider } from '../components/Toast';
import { usePurchaseData } from '../context/PurchaseData';
import { overdueStats, inr } from '../utils/procurement';

const TITLES = {
  '/dashboard': ['Procurement Dashboard', 'Vendors, purchase orders and delivery & payment progress'],
  '/vendors': ['Vendor Registration', 'Register and manage your supplier master'],
  '/purchase-orders': ['Purchase Orders', 'Material-wise ordering, delivery and payment tracking'],
  '/purchase-progress': ['Purchase Progress', 'Delivery & payment progress across every PO'],
  '/payment-progress': ['Payment Progress', 'Payment progress across every PO'],
  '/accounts/dashboard': ['Accounts Dashboard', 'Financial overview across all purchase orders'],
  '/accounts/invoices': ['Invoice Management', 'Verify and manage PO invoices'],
  '/accounts/verification': ['Invoice Verification', 'Verify invoices and prepare for payment'],
  '/accounts/payments': ['Payment Tracking', 'Track and approve payments'],
  '/accounts/vendors': ['Vendor Accounts', 'Vendor-wise financial tracking'],
  '/accounts/fabricators': ['Fabricator Accounts', 'Fabricator-wise and project-wise tracking'],
  '/accounts/projects': ['Project Accounts', 'Project-wise financial view'],
};

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const { reload, loading, lines } = usePurchaseData();
  const bellRef = useRef(null);

  const od = useMemo(() => overdueStats(lines || []), [lines]);

  const [title, subtitle] = loc.pathname.startsWith('/purchase-orders/')
    ? ['Purchase Order Details', 'Full details, PDF and print for this purchase order']
    : (TITLES[loc.pathname] || ['Purchase Portal', '']);

  // Close the bell dropdown on outside click / route change.
  useEffect(() => { setBellOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const onDoc = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const goOverdue = () => { setBellOpen(false); navigate('/purchase-orders?filter=overdue'); };

  return (
    <ToastProvider>
      <div className="app">
        {open && <div className="backdrop" onClick={() => setOpen(false)} />}
        <Sidebar open={open} onNavigate={() => setOpen(false)} />
        <div className="main">
          <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
              <button className="hamburger" aria-label="Menu" onClick={() => setOpen(o => !o)}><Menu size={22} /></button>
              <div style={{ minWidth: 0 }}>
                <h1>{title}</h1>
                {subtitle && <div className="sub">{subtitle}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {/* ── Notification bell ── */}
              <div className="bell-wrap" ref={bellRef}>
                <button className="bell-btn" aria-label={`${od.count} overdue purchase orders`} onClick={() => setBellOpen(o => !o)}>
                  <Bell size={19} />
                  {od.count > 0 && <span className="bell-badge">{od.count > 99 ? '99+' : od.count}</span>}
                </button>
                {bellOpen && (
                  <div className="bell-pop" role="dialog" aria-label="Notifications">
                    <div className="bell-head">
                      <span>Notifications</span>
                      {od.count > 0 && <span className="bell-amt">{inr(od.amount)} overdue</span>}
                    </div>
                    {od.count === 0 ? (
                      <div className="bell-empty">You're all caught up — no overdue purchase orders.</div>
                    ) : (
                      <>
                        <button className="bell-row bell-summary" onClick={goOverdue}>
                          <AlertTriangle size={16} /> <b>{od.count} Overdue Purchase Order{od.count > 1 ? 's' : ''}</b>
                        </button>
                        <div className="bell-list">
                          {od.list.slice(0, 6).map(g => (
                            <button className="bell-row" key={g.po} onClick={() => { setBellOpen(false); navigate(`/purchase-orders/${encodeURIComponent(g.po)}`); }}>
                              <span className="bell-po">{g.po}</span>
                              <span className="bell-days">{g.days}d overdue{g.out > 0 ? ` · ${inr(g.out)} due` : ''}</span>
                            </button>
                          ))}
                        </div>
                        <button className="bell-all" onClick={goOverdue}>View all overdue POs →</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <button className="btn refresh-btn" onClick={reload} disabled={loading} title="Refresh data" aria-label="Refresh data">
                <RefreshCw size={15} style={{ verticalAlign: '-2px' }} /> <span className="btn-label">{loading ? 'Loading…' : 'Refresh'}</span>
              </button>
            </div>
          </header>
          <main className="content"><Outlet /></main>
        </div>
      </div>

      <style>{`
        .bell-wrap{position:relative}
        .bell-btn{position:relative;width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s}
        .bell-btn:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
        .bell-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--bad);color:#fff;font:700 11px var(--f-body);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--surface)}
        .bell-pop{position:absolute;right:0;top:48px;width:300px;max-width:88vw;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 20px 44px -18px rgba(0,0,0,.4);z-index:40;overflow:hidden}
        .bell-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--line);font:700 13px var(--f-body)}
        .bell-amt{font-size:11.5px;font-weight:700;color:var(--bad)}
        .bell-empty{padding:18px 14px;font-size:13px;color:var(--muted)}
        .bell-summary{width:100%;display:flex;align-items:center;gap:8px;padding:11px 14px;border:0;border-bottom:1px solid var(--line);background:var(--bad-bg);color:var(--bad);font-size:13.5px;cursor:pointer;text-align:left}
        .bell-list{max-height:230px;overflow:auto}
        .bell-row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:0;border-bottom:1px solid var(--line-soft,var(--line));background:none;cursor:pointer;text-align:left}
        .bell-row:hover{background:var(--sunk,var(--accent-soft))}
        .bell-po{font:700 13px var(--f-body);color:var(--accent-ink)}
        .bell-days{font-size:12px;color:var(--muted)}
        .bell-all{width:100%;padding:11px 14px;border:0;background:none;color:var(--accent-ink);font:700 13px var(--f-body);cursor:pointer}
        .bell-all:hover{background:var(--accent-soft)}
        /* mobile: pin notification dropdown to the screen's RIGHT edge so it can't spill
           off the left. The bell is not the right-most control (Refresh sits to its right),
           so anchoring right:0 to the bell pushed the 300px panel off-screen on phones. */
        @media (max-width:560px){
          .bell-pop{right:-55px;width:300px;max-width:calc(100vw - 24px)}
        }
      `}</style>
    </ToastProvider>
  );
}
