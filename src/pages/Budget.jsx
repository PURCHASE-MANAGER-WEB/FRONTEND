import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiggyBank, IndianRupee, Wallet, AlertTriangle } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Drawer, Field, StateRow } from '../components/ui';
import { num, inr, groupPOs, budgetFor, BUDGET_STATUS_CLS } from '../utils/procurement';

const BStatus = ({ s }) => <span className={`pill ${BUDGET_STATUS_CLS[s] || 'p-mute'}`}>{s}</span>;
const FILTERS = ['On Track', 'Near Limit', 'Over Budget', 'No Budget'];

export default function Budget() {
  const { projects, lines, loading, error, saveProject } = usePurchaseData();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editing, setEditing] = useState(null); // { project, budget }
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => groupPOs(lines), [lines]);

  const rows = useMemo(() => projects
    .map((p) => ({ p, b: budgetFor(p, groups) }))
    .filter((r) => statusF === 'all' || r.b.status === statusF)
    .filter((r) => !q || [r.p.name, r.p.code, r.p.client].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.b.utilPct - a.b.utilPct), [projects, groups, q, statusF]);

  const totals = useMemo(() => {
    let allocated = 0, utilized = 0, remaining = 0, over = 0;
    for (const p of projects) { const b = budgetFor(p, groups); allocated += b.allocated; utilized += b.utilized; remaining += b.remaining; if (b.status === 'Over Budget') over++; }
    return { allocated, utilized, remaining, over };
  }, [projects, groups]);

  const open = (p) => { setFormErr(''); setEditing({ project: p, budget: p.budget ?? '' }); };
  const close = () => setEditing(null);

  const submit = async () => {
    const val = num(editing.budget);
    if (val < 0) { setFormErr('Budget cannot be negative.'); return; }
    setBusy(true);
    try { await saveProject(false, editing.project.id, { budget: val }); close(); toast('Budget updated'); }
    catch (e) { setFormErr(e.message || 'Could not update budget.'); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <section className="kpis" aria-label="Budget summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><PiggyBank size={16} /></span><div className="l">Total Allocated</div><div className="v">{inr(totals.allocated)}</div></div>
        <div className="kpi"><span className="kpi-ic"><IndianRupee size={16} /></span><div className="l">Total Utilized (PO Value)</div><div className="v">{inr(totals.utilized)}</div></div>
        <div className="kpi"><span className="kpi-ic"><Wallet size={16} /></span><div className="l">Total Remaining</div><div className={`v ${totals.remaining < 0 ? 'bad' : ''}`}>{inr(totals.remaining)}</div></div>
        <div className="kpi"><span className="kpi-ic"><AlertTriangle size={16} /></span><div className="l">Over Budget</div><div className={`v ${totals.over > 0 ? 'bad' : ''}`}>{totals.over}</div></div>
      </section>

      <div className="toolbar">
        <h2>Budget</h2>
        <div className="right">
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by status" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }}>
            <option value="all">All status</option>
            {FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" aria-label="Search budgets" />
        </div>
      </div>

      <div className="tbl" style={{ marginTop: 12 }}>
        <table>
          <thead><tr>
            <th>Project</th><th className="num">Allocated</th><th className="num">PO Value</th><th className="num">Paid</th>
            <th className="num">Outstanding</th><th className="num">Remaining</th><th>Utilization</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={9} loading={loading} error={error}
                empty={projects.length ? 'No projects match your filter.' : 'No projects yet. Add projects first, then set their budgets here.'} />
            ) : rows.map(({ p, b }) => (
              <tr key={p.id} className="row-click" onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}>
                <td><b>{p.name}</b>{p.code ? <div className="id" style={{ fontSize: 11 }}>{p.code}</div> : null}</td>
                <td className="num">{inr(b.allocated)}</td>
                <td className="num calc">{inr(b.utilized)}</td>
                <td className="num calc">{inr(b.paid)}</td>
                <td className={`num calc ${b.out > 0 ? 'overdue' : ''}`}>{inr(b.out)}</td>
                <td className={`num calc ${b.remaining < 0 ? 'overdue' : ''}`}>{b.allocated > 0 ? inr(b.remaining) : '—'}</td>
                <td style={{ minWidth: 130 }}>
                  {b.allocated > 0 ? (
                    <div className="ubar-wrap">
                      <div className="ubar"><div className="ubar-fill" style={{ width: `${Math.min(b.utilPct, 100)}%`, background: b.utilPct > 100 ? 'var(--bad)' : b.utilPct >= 85 ? 'var(--warn,#d97706)' : 'var(--accent)' }} /></div>
                      <span className="ubar-pct">{b.utilPct}%</span>
                    </div>
                  ) : '—'}
                </td>
                <td><BStatus s={b.status} /></td>
                <td onClick={(e) => e.stopPropagation()}><button className="link" onClick={() => open(p)}>Set budget</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>Set budget</h3>
          <p className="hint">Allocated budget for <b>{editing.project.name}</b>. PO value, paid and remaining are calculated from this project's purchase orders.</p>
          <div className="grid">
            <Field label="Allocated Budget (₹)" full><input type="number" min="0" step="1000" autoFocus value={editing.budget} onChange={(e) => setEditing((s) => ({ ...s, budget: e.target.value }))} /></Field>
          </div>
          {(() => { const b = budgetFor({ ...editing.project, budget: num(editing.budget) }, groups); return (
            <div className="card" style={{ padding: 14, marginTop: 4, background: 'var(--sunk,#f8fafc)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="sub">Utilized (PO value)</span><b>{inr(b.utilized)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}><span className="sub">Remaining</span><b style={b.remaining < 0 ? { color: 'var(--bad)' } : null}>{b.allocated > 0 ? inr(b.remaining) : '—'}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}><span className="sub">Utilization</span><b>{b.allocated > 0 ? `${b.utilPct}%` : '—'}</b></div>
            </div>
          ); })()}
          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button>
            </div>
          </div>
        </Drawer>
      )}

      <style>{`
        .row-click{cursor:pointer}.row-click:hover{background:var(--sunk,var(--accent-soft))}
        .ubar-wrap{display:flex;align-items:center;gap:8px}
        .ubar{flex:1;height:8px;border-radius:5px;background:var(--sunk,#e5e7eb);overflow:hidden;min-width:60px}
        .ubar-fill{height:100%;border-radius:5px;transition:width .3s}
        .ubar-pct{font-size:12px;font-weight:700;color:var(--muted);min-width:34px;text-align:right}
      `}</style>
    </section>
  );
}
