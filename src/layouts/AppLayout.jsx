import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, RefreshCw } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { ToastProvider } from '../components/Toast';
import { usePurchaseData } from '../context/PurchaseData';

const TITLES = {
  '/dashboard': ['Procurement Dashboard', 'Vendors, purchase orders and delivery & payment progress'],
  '/vendors': ['Vendor Registration', 'Register and manage your supplier master'],
  '/purchase-orders': ['Purchase Orders', 'Material-wise ordering, delivery and payment tracking'],
};

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { reload, loading } = usePurchaseData();
  const [title, subtitle] = TITLES[loc.pathname] || ['Purchase Manager', ''];

  return (
    <ToastProvider>
      <div className="app">
        {open && <div className="backdrop" onClick={() => setOpen(false)} />}
        <Sidebar open={open} onNavigate={() => setOpen(false)} />
        <div className="main">
          <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="hamburger" aria-label="Menu" onClick={() => setOpen(o => !o)}><Menu size={22} /></button>
              <div>
                <h1>{title}</h1>
                {subtitle && <div className="sub">{subtitle}</div>}
              </div>
            </div>
            <button className="btn" onClick={reload} disabled={loading} title="Refresh data">
              <RefreshCw size={15} style={{ verticalAlign: '-2px' }} /> {loading ? 'Loading…' : 'Refresh'}
            </button>
          </header>
          <main className="content"><Outlet /></main>
        </div>
      </div>
    </ToastProvider>
  );
}
