import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { historyApi } from '../api/client';
import { cdfmt, cdtfmt } from '../utils/procurement';
import { History } from 'lucide-react';

// Creation history (audit log) for Projects and Purchase Orders. Entries come from the
// backend — logged creations plus derived entries from existing records' real createdAt,
// so nothing is invented and deleted records keep their history. Filter by type, date
// range and created-by user; open the underlying project or PO.
export default function CreationHistory() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [user, setUser] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (type) params.type = type;
      if (from) params.from = from;
      if (to) params.to = to;
      if (user.trim()) params.user = user.trim();
      setRows(await historyApi.list(params));
    } catch (e) { setError((e && e.message) || 'Could not load creation history.'); setRows([]); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [type, from, to, user]);

  const openRecord = (r) => {
    if (!r.refId) return;
    if (r.recordType === 'Project') navigate(`/projects/${encodeURIComponent(r.refId)}`);
    else navigate(`/purchase-orders/${encodeURIComponent(r.refId)}`);
  };

  const totals = useMemo(() => {
    const proj = rows.filter((r) => r.recordType === 'Project').length;
    return { total: rows.length, proj, po: rows.length - proj };
  }, [rows]);

  const typeBadge = (t) => (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, color: '#fff', background: t === 'Project' ? '#6366f1' : '#0ea5e9' }}>{t}</span>
  );

  return (
    <section>
      <section className="kpis" aria-label="Creation history summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><History size={16} /></span><div className="l">Records</div><div className="v">{totals.total}</div></div>
        <div className="kpi"><div className="l">Projects</div><div className="v">{totals.proj}</div></div>
        <div className="kpi"><div className="l">Purchase Orders</div><div className="v">{totals.po}</div></div>
      </section>

      <div className="toolbar">
        <h2>Creation History</h2>
        <div className="right" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="po-filter" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by record type">
            <option value="">All types</option>
            <option value="Project">Projects</option>
            <option value="Purchase Order">Purchase Orders</option>
          </select>
          <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <input className="search" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Created by…" aria-label="Filter by user" />
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <th>Type</th><th>Name / Number</th><th>Created By</th><th>Role</th><th>Creation Date</th><th>Time</th><th></th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="hint" style={{ padding: 18 }}>Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} style={{ padding: 18, color: 'var(--bad)' }}>{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="hint" style={{ padding: 18 }}>No records match these filters.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={(r.recordType || '') + (r.refId || '') + i}>
                <td>{typeBadge(r.recordType)}</td>
                <td><b>{r.name || r.refId}</b></td>
                <td>{r.createdByName || '—'}</td>
                <td>{r.createdByRole || '—'}</td>
                <td>{cdfmt(r.at)}</td>
                <td>{(cdtfmt(r.at).split(', ')[1]) || '—'}</td>
                <td><button className="link" onClick={() => openRecord(r)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
