import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Store, ClipboardList, TrendingUp, Wallet, LogOut, FileText, CheckSquare, Users } from 'lucide-react';
import { getUser, clearSession, authApi } from '../api/client';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/vendors', label: 'Vendors', icon: Store },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: ClipboardList },
  { to: '/purchase-progress', label: 'Purchase Progress', icon: TrendingUp },
  { to: '/payment-progress', label: 'Payment Progress', icon: Wallet },
  { separator: true, label: 'Accounts Department' },
  { to: '/accounts/dashboard', label: 'Accounts Dashboard', icon: LayoutDashboard },
  { to: '/accounts/invoices', label: 'Invoice Mgmt', icon: FileText },
  { to: '/accounts/verification', label: 'Verification', icon: CheckSquare },
  { to: '/accounts/payments', label: 'Payments Tracker', icon: Wallet },
  { to: '/accounts/vendors', label: 'Vendor Accounts', icon: Users },
  { to: '/accounts/fabricators', label: 'Fabricator Accounts', icon: Users },
  { to: '/accounts/projects', label: 'Project Accounts', icon: ClipboardList },
];

export default function Sidebar({ open, onNavigate }) {
  const navigate = useNavigate();
  const user = getUser() || {};
  const initials = (user.name || 'PM').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const [ask, setAsk] = useState(false);

  const doLogout = async () => {
    await authApi.logout();
    clearSession();
    navigate('/login?loggedout=1', { replace: true });
  };

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="logo">
          <div className="mark">
            <span className="tile"><img src="/logo2-_21iriWQ.png" alt="Tesco Structures" /></span>
            <div>
              <b>Tesco Structures</b>
              <span>Procurement Portal</span>
            </div>
          </div>
        </div>
        <nav>
          {NAV.map((item, idx) => item.separator ? (
            <div key={idx} className="nav-separator" style={{ marginTop: '16px', marginBottom: '8px', paddingLeft: '14px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em' }}>{item.label}</div>
          ) : (
            <NavLink key={item.to} to={item.to} onClick={onNavigate} className={({ isActive }) => isActive ? 'active' : ''}>
              <item.icon size={18} /> {item.label}
            </NavLink>
          ))}
          <button className="link" onClick={() => setAsk(true)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', color: 'var(--brand-fg)', opacity: .72, fontWeight: 500, fontSize: '14.5px', marginTop: 'auto' }}>
            <LogOut size={18} /> Log out
          </button>
        </nav>
        <div className="who">
          <div className="av">{initials}</div>
          <div>
            <div className="nm">{user.name || 'Purchase Manager'}</div>
            <div className="rl">{user.designation || 'Purchase Manager'}</div>
          </div>
        </div>
      </aside>

      {ask && (
        <div className="confirm-scrim" onMouseDown={(e) => { if (e.target.classList.contains('confirm-scrim')) setAsk(false); }}>
          <div className="confirm-box" role="dialog" aria-modal="true" aria-labelledby="lg-out-title">
            <div className="confirm-ic"><LogOut size={22} /></div>
            <h3 id="lg-out-title">Log out?</h3>
            <p>Are you sure you want to log out of the Purchase portal?</p>
            <div className="confirm-actions">
              <button className="btn" onClick={() => setAsk(false)}>Cancel</button>
              <button className="btn primary" onClick={doLogout}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
