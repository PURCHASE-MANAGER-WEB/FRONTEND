import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Store, ClipboardList, LogOut } from 'lucide-react';
import { getUser, clearSession, authApi } from '../api/client';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/vendors', label: 'Vendors', icon: Store },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: ClipboardList },
];

export default function Sidebar({ open, onNavigate }) {
  const navigate = useNavigate();
  const user = getUser() || {};
  const initials = (user.name || 'PM').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const logout = async () => {
    await authApi.logout();
    clearSession();
    navigate('/login?loggedout=1', { replace: true });
  };

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="logo">
        <div className="mark">
          <span className="tile"><img src="/logo.png" alt="Tesco Structures" /></span>
          <div>
            <b>Tesco Structures</b>
            <span>Procurement Portal</span>
          </div>
        </div>
      </div>
      <nav>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icon size={18} /> {label}
          </NavLink>
        ))}
        <button className="link" onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', color: 'var(--brand-fg)', opacity: .72, fontWeight: 500, fontSize: '14.5px', marginTop: 'auto' }}>
          <LogOut size={18} /> Log out
        </button>
      </nav>
      <div className="who">
        <div className="av">{initials}</div>
        <div>
          <div className="nm">{user.name || 'Purchase Manager'}</div>
          <div className="rl">Purchase Manager</div>
        </div>
      </div>
    </aside>
  );
}
