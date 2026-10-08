import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getUser, clearSession, isAuthenticated, APP_ROLE } from './api/client';
import { PurchaseDataProvider } from './context/PurchaseData';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vendors from './pages/Vendors';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import PurchaseProgress from './pages/PurchaseProgress';
import PaymentProgress from './pages/PaymentProgress';

import AccountsDashboard from './pages/accounts/AccountsDashboard';
import AccountsInvoices from './pages/accounts/AccountsInvoices';
import AccountsVerification from './pages/accounts/AccountsVerification';
import AccountsPayments from './pages/accounts/AccountsPayments';
import AccountsVendors from './pages/accounts/AccountsVendors';
import AccountsFabricators from './pages/accounts/AccountsFabricators';
import AccountsProjects from './pages/accounts/AccountsProjects';

// This application is LOCKED to the Purchase Manager role. A token carried over
// from another portal, or a hand-edited URL, cannot reach these pages.
const ProtectedRoute = ({ children }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const role = getUser()?.role;
  if (role && role !== APP_ROLE && role !== 'accounts_manager') {
    clearSession();
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <PurchaseDataProvider>
                <AppLayout />
              </PurchaseDataProvider>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/:poId" element={<PurchaseOrderDetail />} />
          <Route path="/purchase-progress" element={<PurchaseProgress />} />
          <Route path="/payment-progress" element={<PaymentProgress />} />
          
          {/* Accounts Module */}
          <Route path="/accounts/dashboard" element={<AccountsDashboard />} />
          <Route path="/accounts/invoices" element={<AccountsInvoices />} />
          <Route path="/accounts/verification" element={<AccountsVerification />} />
          <Route path="/accounts/payments" element={<AccountsPayments />} />
          <Route path="/accounts/vendors" element={<AccountsVendors />} />
          <Route path="/accounts/fabricators" element={<AccountsFabricators />} />
          <Route path="/accounts/projects" element={<AccountsProjects />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
