import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { purchaseApi, paymentsApi } from '../api/client';

// Shared procurement data (vendors + PO lines) fetched once from the backend and
// shared across all pages. Exposes loading / error so each page can render proper
// loading, empty and error states (no hard-coded numbers).
const Ctx = createContext(null);
export const usePurchaseData = () => useContext(Ctx);

export function PurchaseDataProvider({ children }) {
  const [vendors, setVendors] = useState([]);
  const [lines, setLines] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [v, l] = await Promise.all([purchaseApi.getVendors(), purchaseApi.getLines()]);
      setVendors(Array.isArray(v) ? v : []);
      setLines(Array.isArray(l) ? l : []);
    } catch (e) {
      setError(e.message || 'Could not load procurement data.');
    } finally {
      setLoading(false);   // show vendors + POs immediately
    }
    // Payments are not needed for the first paint — load them in the background so the
    // main tables appear as soon as vendors + POs arrive.
    try { const p = await paymentsApi.list(); setPayments(Array.isArray(p) ? p : []); } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Mutations refresh from the server so every page stays in sync.
  const value = {
    vendors, lines, payments, loading, error, reload: load,
    savePayment: async (isNew, id, data) => { if (isNew) await paymentsApi.create(data); else await paymentsApi.update(id, data); await load(); },
    deletePayment: async (id) => { await paymentsApi.remove(id); await load(); },
    saveVendor: async (isNew, vid, data) => {
      if (isNew) await purchaseApi.createVendor(data);
      else await purchaseApi.updateVendor(vid, data);
      await load();
    },
    deleteVendor: async (vid) => { await purchaseApi.deleteVendor(vid); await load(); },
    saveLine: async (isNew, id, data) => {
      if (isNew) await purchaseApi.createLine({ ...data, id });
      else await purchaseApi.updateLine(id, data);
      await load();
    },
    deleteLine: async (id) => { await purchaseApi.deleteLine(id); await load(); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
