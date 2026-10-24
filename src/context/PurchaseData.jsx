import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { purchaseApi, paymentsApi, projectsApi, projectPaymentsApi, challansApi } from '../api/client';

// Shared procurement data (vendors + PO lines) fetched once from the backend and
// shared across all pages. Exposes loading / error so each page can render proper
// loading, empty and error states (no hard-coded numbers).
const Ctx = createContext(null);
export const usePurchaseData = () => useContext(Ctx);

export function PurchaseDataProvider({ children }) {
  const [vendors, setVendors] = useState([]);
  const [lines, setLines] = useState([]);
  const [payments, setPayments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectPayments, setProjectPayments] = useState([]);
  const [challans, setChallans] = useState([]);
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
    try { const pr = await projectsApi.list(); setProjects(Array.isArray(pr) ? pr : []); } catch { /* ignore */ }
    try { const pp = await projectPaymentsApi.list(); setProjectPayments(Array.isArray(pp) ? pp : []); } catch { /* ignore */ }
    try { const dc = await challansApi.list(); setChallans(Array.isArray(dc) ? dc : []); } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Targeted refreshes — refetch only the collection that changed instead of all six,
  // so every save is one quick request, not a full reload.
  const reloadLines = async () => { try { const l = await purchaseApi.getLines(); setLines(Array.isArray(l) ? l : []); } catch { /* ignore */ } };
  const reloadVendors = async () => { try { const v = await purchaseApi.getVendors(); setVendors(Array.isArray(v) ? v : []); } catch { /* ignore */ } };
  const reloadPayments = async () => { try { const pay = await paymentsApi.list(); setPayments(Array.isArray(pay) ? pay : []); } catch { /* ignore */ } };
  const reloadProjects = async () => { try { const pr = await projectsApi.list(); setProjects(Array.isArray(pr) ? pr : []); } catch { /* ignore */ } };
  const reloadProjectPayments = async () => { try { const pp = await projectPaymentsApi.list(); setProjectPayments(Array.isArray(pp) ? pp : []); } catch { /* ignore */ } };
  const reloadChallans = async () => { try { const dc = await challansApi.list(); setChallans(Array.isArray(dc) ? dc : []); } catch { /* ignore */ } };
  // Optimistically swap in one PO's saved lines after a bulk save — no network round-trip.
  const applyPoLines = (po, savedLines) => setLines(prev => [...prev.filter(l => l.po !== po), ...(Array.isArray(savedLines) ? savedLines : [])]);

  // Mutations refresh from the server so every page stays in sync.
  const value = {
    vendors, lines, payments, projects, projectPayments, challans, loading, error, reload: load,
    reloadLines, applyPoLines,
    bulkSaveLines: async (po, lines, deleteIds) => { const saved = await purchaseApi.bulkSaveLines(po, lines, deleteIds); applyPoLines(po, saved); return saved; },
    saveChallan: async (isNew, id, data) => { if (isNew) await challansApi.create(data); else await challansApi.update(id, data); await reloadChallans(); },
    deleteChallan: async (id) => { await challansApi.remove(id); await reloadChallans(); },
    saveProjectPayment: async (isNew, id, data) => { if (isNew) await projectPaymentsApi.create(data); else await projectPaymentsApi.update(id, data); await reloadProjectPayments(); },
    deleteProjectPayment: async (id) => { await projectPaymentsApi.remove(id); await reloadProjectPayments(); },
    saveProject: async (isNew, id, data) => { if (isNew) await projectsApi.create(data); else await projectsApi.update(id, data); await reloadProjects(); },
    deleteProject: async (id) => { await projectsApi.remove(id); await reloadProjects(); },
    savePayment: async (isNew, id, data) => { if (isNew) await paymentsApi.create(data); else await paymentsApi.update(id, data); await Promise.all([reloadPayments(), reloadLines()]); },
    deletePayment: async (id) => { await paymentsApi.remove(id); await Promise.all([reloadPayments(), reloadLines()]); },
    saveVendor: async (isNew, vid, data) => {
      if (isNew) await purchaseApi.createVendor(data);
      else await purchaseApi.updateVendor(vid, data);
      await reloadVendors();
    },
    deleteVendor: async (vid) => { await purchaseApi.deleteVendor(vid); await reloadVendors(); },
    saveLine: async (isNew, id, data) => {
      if (isNew) await purchaseApi.createLine({ ...data, id });
      else await purchaseApi.updateLine(id, data);
      await reloadLines();
    },
    deleteLine: async (id) => { await purchaseApi.deleteLine(id); await reloadLines(); },
    deletePO: async (po) => { await purchaseApi.deletePO(po); await reloadLines(); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
