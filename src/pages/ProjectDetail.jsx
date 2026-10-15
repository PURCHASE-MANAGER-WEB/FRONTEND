import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePurchaseData } from '../context/PurchaseData';
import { Pill } from '../components/ui';
import { num, inr, dfmt, qfmt, groupPOs, vendorName, ppMilestones, ppQuoted, ppScheduled, ppPaidAmount, ppOutstanding, ppStatus } from '../utils/procurement';
import { openChallanDoc } from '../utils/challanDoc';

const TABS = ['Overview', 'Purchase Orders', 'Payments', 'Budget', 'Delivery Challans'];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, vendors, lines, payments, projectPayments, challans, loading } = usePurchaseData();
  const [tab, setTab] = useState('Overview');

  const project = useMemo(() => projects.find((p) => p.id === id), [projects, id]);

  const { projGroups, poSet } = useMemo(() => {
    const name = project?.name;
    const g = name ? groupPOs(lines).filter((x) => (x.project || '') === name) : [];
    return { projGroups: g, poSet: new Set(g.map((x) => x.po)) };
  }, [project, lines]);

  const projPayments = useMemo(
    () => payments.filter((pm) => poSet.has(pm.po)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    [payments, poSet]
  );

  const schedule = useMemo(
    () => (project ? projectPayments.filter((r) => (r.project || r.customerName) === project.name) : []),
    [projectPayments, project]
  );

  const projChallans = useMemo(
    () => (project ? challans.filter((c) => (c.project || '') === project.name) : []),
    [challans, project]
  );

  if (!project) {
    return (
      <section className="card" style={{ padding: 24 }}>
        <p className="sub" style={{ margin: 0 }}>{loading ? 'Loading project…' : 'Project not found.'}</p>
        <button className="btn" style={{ marginTop: 14 }} onClick={() => navigate('/projects')}>← Back to Projects</button>
      </section>
    );
  }

  const value = projGroups.reduce((s, g) => s + g.value, 0);
  const paid = projGroups.reduce((s, g) => s + g.paid, 0);
  const out = projGroups.reduce((s, g) => s + g.out, 0);
  const budget = num(project.budget);
  const util = budget > 0 ? Math.round((value / budget) * 100) : 0;
  const remaining = budget - value;

  return (
    <section>
      <div className="toolbar">
        <div>
          <button className="link" onClick={() => navigate('/projects')}>← Projects</button>
          <h2 style={{ margin: '4px 0 0' }}>{project.name} <Pill s={project.status || 'Active'} /></h2>
          <div className="sub">{[project.code, project.client].filter(Boolean).join(' · ') || project.id}</div>
        </div>
      </div>

      <section className="kpis" aria-label="Project financials" style={{ margin: '14px 0' }}>
        <div className="kpi"><div className="l">Allocated Budget</div><div className="v">{inr(budget)}</div></div>
        <div className="kpi"><div className="l">Total PO Value</div><div className="v">{inr(value)}</div></div>
        <div className="kpi"><div className="l">Payments</div><div className="v">{inr(paid)}</div></div>
        <div className="kpi"><div className="l">Outstanding</div><div className={`v ${out > 0 ? 'bad' : ''}`}>{inr(out)}</div></div>
      </section>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="ov-grid">
            <div><span className="ov-l">Project Code</span><span className="ov-v">{project.code || '—'}</span></div>
            <div><span className="ov-l">Client</span><span className="ov-v">{project.client || '—'}</span></div>
            <div><span className="ov-l">Status</span><span className="ov-v"><Pill s={project.status || 'Active'} /></span></div>
            <div><span className="ov-l">Start Date</span><span className="ov-v">{dfmt(project.startDate)}</span></div>
            <div><span className="ov-l">Purchase Orders</span><span className="ov-v">{projGroups.length}</span></div>
            <div><span className="ov-l">Budget Utilization</span><span className="ov-v">{budget > 0 ? `${util}%` : '—'}</span></div>
            <div><span className="ov-l">Remaining Budget</span><span className="ov-v" style={remaining < 0 ? { color: 'var(--bad)' } : null}>{budget > 0 ? inr(remaining) : '—'}</span></div>
          </div>
          {project.notes && <p className="sub" style={{ marginTop: 14 }}>{project.notes}</p>}
        </div>
      )}

      {tab === 'Purchase Orders' && (
        <div className="tbl">
          <table>
            <thead><tr><th>PO</th><th>Vendor</th><th className="num">Value</th><th className="num">Paid</th><th className="num">Outstanding</th><th>Delivery</th><th>Payment</th></tr></thead>
            <tbody>
              {projGroups.length === 0 ? (
                <tr><td colSpan={7} className="state">No purchase orders linked to this project yet.</td></tr>
              ) : projGroups.map((g) => (
                <tr key={g.po}>
                  <td><Link to={`/purchase-orders/${encodeURIComponent(g.po)}`} className="id" style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{g.po}</Link></td>
                  <td>{vendorName(vendors, g.vid)}</td>
                  <td className="num">{inr(g.value)}</td>
                  <td className="num calc">{inr(g.paid)}</td>
                  <td className={`num calc ${g.out > 0 ? 'overdue' : ''}`}>{inr(g.out)}</td>
                  <td><Pill s={g.delivery} /></td>
                  <td><Pill s={g.payment} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Payments' && (
        <>
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', font: '700 14px var(--f-body)' }}>Milestone Payment Schedule</div>
          <div className="tbl" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Customer</th><th className="num">Quoted</th><th className="num">Scheduled</th><th className="num">Received</th><th className="num">Outstanding</th><th>Milestones</th><th>Status</th></tr></thead>
              <tbody>
                {schedule.length === 0 ? (
                  <tr><td colSpan={7} className="state">No milestone payment schedule for this project yet. Add one under Project Payments.</td></tr>
                ) : schedule.map((r) => {
                  const ms = ppMilestones(r);
                  const paidCount = ms.filter((m) => m.paid).length;
                  return (
                    <tr key={r.id}>
                      <td><b>{r.customerName}</b></td>
                      <td className="num">{inr(ppQuoted(r))}</td>
                      <td className="num calc">{inr(ppScheduled(r))}</td>
                      <td className="num calc">{inr(ppPaidAmount(r))}</td>
                      <td className="num calc">{inr(ppOutstanding(r))}</td>
                      <td>{paidCount}/{ms.length} paid</td>
                      <td><Pill s={ppStatus(r)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="tbl">
          <table>
            <thead><tr><th>Date</th><th>PO</th><th className="num">Amount</th><th>Method</th><th>Reference</th><th>Remarks</th></tr></thead>
            <tbody>
              {projPayments.length === 0 ? (
                <tr><td colSpan={6} className="state">No payments recorded for this project's purchase orders yet.</td></tr>
              ) : projPayments.map((pm) => (
                <tr key={pm.id}>
                  <td>{dfmt(pm.date)}</td>
                  <td><Link to={`/purchase-orders/${encodeURIComponent(pm.po)}`} className="id" style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{pm.po}</Link></td>
                  <td className="num">{inr(pm.amount)}</td>
                  <td>{pm.method || '—'}</td>
                  <td className="id">{pm.refNo || '—'}</td>
                  <td>{pm.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === 'Budget' && (
        <div className="card" style={{ padding: 20 }}>
          <div className="ov-grid">
            <div><span className="ov-l">Allocated Budget</span><span className="ov-v">{inr(budget)}</span></div>
            <div><span className="ov-l">Utilized (PO Value)</span><span className="ov-v">{inr(value)}</span></div>
            <div><span className="ov-l">Remaining Budget</span><span className="ov-v" style={remaining < 0 ? { color: 'var(--bad)' } : null}>{budget > 0 ? inr(remaining) : '—'}</span></div>
            <div><span className="ov-l">Utilization</span><span className="ov-v">{budget > 0 ? `${util}%` : '—'}</span></div>
          </div>
          {budget > 0 && (
            <div className="bar" style={{ marginTop: 16 }}>
              <div className="bar-fill" style={{ width: `${Math.min(util, 100)}%`, background: util > 100 ? 'var(--bad)' : util >= 85 ? 'var(--warn,#d97706)' : 'var(--accent)' }} />
            </div>
          )}
          <p className="sub" style={{ marginTop: 14 }}>Detailed budget management (allocations, alerts) is available in the Budget module.</p>
        </div>
      )}

      {tab === 'Delivery Challans' && (
        <div className="tbl">
          <table>
            <thead><tr><th>DC Number</th><th>Date</th><th>Vendor</th><th>PO</th><th>Material</th><th className="num">Qty</th><th>Status</th><th>Document</th></tr></thead>
            <tbody>
              {projChallans.length === 0 ? (
                <tr><td colSpan={8} className="state">No delivery challans for this project yet. Create one under Delivery Challan.</td></tr>
              ) : projChallans.map((c) => {
                const its = Array.isArray(c.items) ? c.items.filter((x) => x.material) : [];
                const mat = its.length ? (its.length === 1 ? its[0].material : `${its[0].material} (+${its.length - 1})`) : '—';
                const qty = its.reduce((s2, x) => s2 + num(x.qty), 0);
                return (
                  <tr key={c.id}>
                    <td className="id"><b>{c.id}</b></td>
                    <td>{dfmt(c.date)}</td>
                    <td>{c.vid ? vendorName(vendors, c.vid) : '—'}</td>
                    <td className="id">{c.po || '—'}</td>
                    <td>{mat}</td>
                    <td className="num">{qty ? qfmt(qty) : '—'}</td>
                    <td><Pill s={c.status || 'Received'} /></td>
                    <td>{c.docName ? <button className="link" onClick={() => openChallanDoc(c.id).catch(() => {})}>View</button> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--line)}
        .tab{border:0;background:none;padding:10px 14px;font:600 13.5px var(--f-body);color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
        .tab:hover{color:var(--fg)}
        .tab.active{color:var(--accent-ink);border-bottom-color:var(--accent)}
        .ov-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}
        .ov-l{display:block;font-size:12px;color:var(--muted);margin-bottom:3px}
        .ov-v{display:block;font:700 15px var(--f-body);color:var(--fg)}
        .bar{height:10px;border-radius:6px;background:var(--sunk,#e5e7eb);overflow:hidden}
        .bar-fill{height:100%;border-radius:6px;transition:width .3s}
      `}</style>
    </section>
  );
}
