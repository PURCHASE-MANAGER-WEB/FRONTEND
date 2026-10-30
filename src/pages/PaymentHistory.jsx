import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { History, IndianRupee, Wallet, ClipboardList } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { num, inr, dfmt, groupPOs, vendorName, PAYMENT_METHODS } from '../utils/procurement';

const fmtDateTime = (iso) => { if (!iso) return '—'; try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return String(iso).slice(0, 10); } };

export default function PaymentHistory() {
  const { payments, vendors, lines, loading, error } = usePurchaseData();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const setQ = (v) => { const sp = new URLSearchParams(searchParams); if (v) sp.set('q', v); else sp.delete('q'); setSearchParams(sp, { replace: true }); };
  const [methodF, setMethodF] = useState('all');
  const [view, setView] = useState(null);

  const groups = useMemo(() => groupPOs(lines), [lines]);
  const poMap = useMemo(() => { const m = new Map(); for (const g of groups) m.set(g.po, g); return m; }, [groups]);
  const projectOf = (po) => (poMap.get(po) || {}).project || '';

  const rows = useMemo(() => (Array.isArray(payments) ? payments : [])
    .map((p) => ({ ...p, _project: projectOf(p.po), _vendor: vendorName(vendors, p.vid) }))
    .filter((p) => methodF === 'all' || (p.method || '') === methodF)
    .filter((p) => !q || [p.id, p.po, p._project, p._vendor, p.refNo, p.method].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, vendors, poMap, q, methodF]);

  const stats = useMemo(() => {
    const list = Array.isArray(payments) ? payments : [];
    const total = list.reduce((s, p) => s + num(p.amount), 0);
    const ym = new Date().toISOString().slice(0, 7);
    const thisMonth = list.filter((p) => String(p.date || '').slice(0, 7) === ym).reduce((s, p) => s + num(p.amount), 0);
    const pos = new Set(list.map((p) => p.po)).size;
    return { count: list.length, total, thisMonth, pos };
  }, [payments]);

  const g = view ? poMap.get(view.po) : null;

  return (
    <section>
      <section className="kpis" aria-label="Payment history summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><History size={16} /></span><div className="l">Total Payments</div><div className="v">{stats.count}</div></div>
        <div className="kpi"><span className="kpi-ic"><IndianRupee size={16} /></span><div className="l">Total Paid</div><div className="v">{inr(stats.total)}</div></div>
        <div className="kpi"><span className="kpi-ic"><Wallet size={16} /></span><div className="l">This Month</div><div className="v">{inr(stats.thisMonth)}</div></div>
        <div className="kpi"><span className="kpi-ic"><ClipboardList size={16} /></span><div className="l">POs Paid</div><div className="v">{stats.pos}</div></div>
      </section>

      <div className="toolbar">
        <h2>Payment History</h2>
        <div className="right">
          <select value={methodF} onChange={(e) => setMethodF(e.target.value)} aria-label="Filter by method" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }}>
            <option value="all">All methods</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO, vendor, project, reference…" aria-label="Search payments" />
        </div>
      </div>

      <p className="legend" style={{ margin: '8px 0 0' }}>Every recorded payment, newest first. Each row is a separate transaction — partial payments appear individually and totals roll up per PO. Record payments under Payment Progress.</p>

      <div className="tbl" style={{ marginTop: 10 }}>
        <table>
          <thead><tr>
            <th>Date</th><th>Ref</th><th>Project</th><th>Vendor</th><th>PO</th>
            <th className="num">Amount</th><th>Method</th><th>Reference No</th><th>PO Payment</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={10} loading={loading} error={error}
                empty={(payments && payments.length) ? 'No payments match your filter.' : 'No payments recorded yet. Record payments under Payment Progress and they will appear here.'} />
            ) : rows.map((p) => (
              <tr key={p.id} className="row-click" onClick={() => setView(p)}>
                <td>{dfmt(p.date)}</td>
                <td className="id">{p.id}</td>
                <td>{p._project || '—'}</td>
                <td>{p._vendor}</td>
                <td className="id"><Link to={`/purchase-orders/${encodeURIComponent(p.po)}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{p.po}</Link></td>
                <td className="num"><b>{inr(p.amount)}</b></td>
                <td>{p.method || '—'}</td>
                <td className="id">{p.refNo || '—'}</td>
                <td>{(poMap.get(p.po) || {}).payment ? <Pill s={poMap.get(p.po).payment} /> : '—'}</td>
                <td><button className="link" onClick={(e) => { e.stopPropagation(); setView(p); }}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view && (
        <Drawer onClose={() => setView(null)}>
          <h3>Payment {view.id}</h3>
          <p className="hint">Read-only record. Edit or delete payments under Payment Progress.</p>
          <div className="ph-grid">
            <div><span className="ph-l">Amount</span><span className="ph-v" style={{ fontSize: 18 }}>{inr(view.amount)}</span></div>
            <div><span className="ph-l">Payment Date</span><span className="ph-v">{dfmt(view.date)}</span></div>
            <div><span className="ph-l">Method</span><span className="ph-v">{view.method || '—'}</span></div>
            <div><span className="ph-l">Reference No</span><span className="ph-v">{view.refNo || '—'}</span></div>
            <div><span className="ph-l">PO</span><span className="ph-v"><Link to={`/purchase-orders/${encodeURIComponent(view.po)}`} style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{view.po}</Link></span></div>
            <div><span className="ph-l">Project</span><span className="ph-v">{view._project || '—'}</span></div>
            <div><span className="ph-l">Vendor</span><span className="ph-v">{view._vendor}</span></div>
            <div><span className="ph-l">Due Date</span><span className="ph-v">{view.dueDate ? dfmt(view.dueDate) : '—'}</span></div>
          </div>
          {view.remarks && <div style={{ marginTop: 12 }}><span className="ph-l">Remarks</span><p className="sub" style={{ margin: '3px 0 0' }}>{view.remarks}</p></div>}

          {g && (
            <div className="card" style={{ padding: 14, marginTop: 14, background: 'var(--sunk,#f8fafc)' }}>
              <div className="ph-l" style={{ marginBottom: 8 }}>This PO ({g.po})</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="sub">PO Value</span><b>{inr(g.value)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}><span className="sub">Total Paid</span><b>{inr(g.paid)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}><span className="sub">Outstanding</span><b style={g.out > 0 ? { color: 'var(--bad)' } : null}>{inr(g.out)}</b></div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div className="ph-l" style={{ marginBottom: 6 }}>Audit trail</div>
            <div className="ph-audit">
              {(Array.isArray(view.events) && view.events.length ? view.events : [{ action: 'created', at: view.createdAt, by: view.createdBy }]).map((ev, i) => (
                <div key={i} className="ph-ev"><span className="ph-ev-act">{ev.action || 'created'}</span><span>{ev.by || view.createdBy || '—'}</span><span className="sub">{fmtDateTime(ev.at || view.createdAt)}</span></div>
              ))}
            </div>
          </div>

          <div className="actions" style={{ marginTop: 16 }}>
            <div />
            <button className="btn primary" onClick={() => setView(null)}>Close</button>
          </div>
        </Drawer>
      )}

      <style>{`
        .row-click{cursor:pointer}.row-click:hover{background:var(--sunk,var(--accent-soft))}
        .ph-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
        .ph-l{display:block;font-size:11.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
        .ph-v{display:block;font:700 14px var(--f-body);color:var(--fg);margin-top:3px}
        .ph-audit{border:1px solid var(--line);border-radius:10px;overflow:hidden}
        .ph-ev{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--line);font-size:12.5px}
        .ph-ev:last-child{border-bottom:0}
        .ph-ev-act{font-weight:700;color:var(--accent-ink);text-transform:capitalize;min-width:70px}
      `}</style>
    </section>
  );
}
