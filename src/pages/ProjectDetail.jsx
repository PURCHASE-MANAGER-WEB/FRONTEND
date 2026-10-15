import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field } from '../components/ui';
import { num, inr, dfmt, qfmt, groupPOs, vendorName, ppMilestones, ppQuoted, ppScheduled, ppPaidAmount, ppOutstanding, ppStatus, ppPercentTotal } from '../utils/procurement';
import { openChallanDoc } from '../utils/challanDoc';

const TABS = ['Overview', 'Purchase Orders', 'Payments', 'Budget', 'Delivery Challans'];
const mid = () => Math.random().toString(36).slice(2, 9);
const DEFAULT_MS = () => [
  { _id: mid(), term: 'Advance with PO', percentage: '10', date: '', paid: false },
  { _id: mid(), term: 'After Drawing Approval', percentage: '30', date: '', paid: false },
  { _id: mid(), term: 'After Structure Work', percentage: '40', date: '', paid: false },
  { _id: mid(), term: 'After Completion', percentage: '20', date: '', paid: false },
];
const msAmount = (quoted, pct) => { const p = parseFloat(pct); return Number.isNaN(p) ? 0 : Math.round(num(quoted) * p / 100); };

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { projects, vendors, lines, payments, projectPayments, challans, loading,
    saveProjectPayment, deleteProjectPayment, saveProject } = usePurchaseData();
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

  // ── Milestone payment-schedule editor (lives inside the project) ──
  const [sched, setSched] = useState(null);
  const [schedErr, setSchedErr] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // ── Budget editor ──
  const [budgetInput, setBudgetInput] = useState('');
  const [bBusy, setBBusy] = useState(false);
  useEffect(() => { if (project) setBudgetInput(project.budget != null ? String(project.budget) : ''); }, [project && project.id, project && project.budget]);

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

  const openSched = (r) => {
    setSchedErr(''); setConfirmDel(false);
    if (r) {
      const ms = ppMilestones(r).map((m) => ({ _id: mid(), term: m.term, percentage: m.percentage ? String(m.percentage) : '', date: m.date || '', paid: !!m.paid }));
      setSched({ isNew: false, id: r.id, data: { quotedValue: r.quotedValue ?? ppScheduled(r) ?? '', milestones: ms.length ? ms : DEFAULT_MS(), notes: r.notes || '' } });
    } else {
      setSched({ isNew: true, id: undefined, data: { quotedValue: '', milestones: DEFAULT_MS(), notes: '' } });
    }
  };
  const closeSched = () => { setSched(null); setConfirmDel(false); };
  const setSD = (k, v) => setSched((e) => ({ ...e, data: { ...e.data, [k]: v } }));
  const setMs = (mId, k, v) => setSched((e) => ({ ...e, data: { ...e.data, milestones: e.data.milestones.map((m) => m._id === mId ? { ...m, [k]: v } : m) } }));
  const addMs = () => setSched((e) => ({ ...e, data: { ...e.data, milestones: [...e.data.milestones, { _id: mid(), term: '', percentage: '', date: '', paid: false }] } }));
  const removeMs = (mId) => setSched((e) => ({ ...e, data: { ...e.data, milestones: e.data.milestones.filter((m) => m._id !== mId) } }));
  const setPct = (mId, raw) => {
    let v = String(raw).replace(/[^0-9.]/g, '');
    const dot = v.indexOf('.'); if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    if (v !== '' && parseFloat(v) > 100) v = '100';
    setMs(mId, 'percentage', v);
  };
  const pctTotal = sched ? ppPercentTotal(sched.data.milestones) : 0;
  const pctValid = Math.abs(pctTotal - 100) <= 0.1;
  const amtTotal = sched ? sched.data.milestones.reduce((s, m) => s + msAmount(sched.data.quotedValue, m.percentage), 0) : 0;

  const submitSched = async () => {
    const d = sched.data;
    if (num(d.quotedValue) <= 0) { setSchedErr('Enter the quoted / project value.'); return; }
    if (!pctValid) { setSchedErr('Total payment percentage must be 100%.'); return; }
    const milestones = d.milestones.filter((m) => String(m.term).trim() || m.percentage)
      .map((m) => ({ term: String(m.term).trim(), percentage: num(m.percentage), value: msAmount(d.quotedValue, m.percentage), date: m.date || '', paid: !!m.paid }));
    setSchedBusy(true);
    try { await saveProjectPayment(sched.isNew, sched.id, { customerName: project.name, project: project.name, quotedValue: num(d.quotedValue), milestones, notes: String(d.notes || '').trim() }); closeSched(); toast(sched.isNew ? 'Payment schedule added' : 'Schedule saved'); }
    catch (e) { setSchedErr(e.message || 'Could not save.'); }
    finally { setSchedBusy(false); }
  };
  const doDeleteSched = async () => {
    setSchedBusy(true);
    try { await deleteProjectPayment(sched.id); closeSched(); toast('Schedule deleted'); }
    catch (e) { setSchedErr(e.message || 'Could not delete.'); }
    finally { setSchedBusy(false); }
  };

  const saveBudget = async () => {
    const v = num(budgetInput);
    if (v < 0) { toast('Budget cannot be negative'); return; }
    setBBusy(true);
    try { await saveProject(false, project.id, { budget: v }); toast('Budget updated'); }
    catch (e) { toast(e.message || 'Could not update budget'); }
    finally { setBBusy(false); }
  };

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
        {TABS.map((t) => (<button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>))}
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
              {projGroups.length === 0 ? (<tr><td colSpan={7} className="state">No purchase orders linked to this project yet.</td></tr>
              ) : projGroups.map((g) => (
                <tr key={g.po}>
                  <td><Link to={`/purchase-orders/${encodeURIComponent(g.po)}`} className="id" style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{g.po}</Link></td>
                  <td>{g.vendorName || vendorName(vendors, g.vid)}</td>
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
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>Milestone Payment Schedule</h2>
            <div className="right"><button className="btn primary" onClick={() => openSched(null)}>+ Add schedule</button></div>
          </div>
          <div className="tbl">
            <table>
              <thead><tr><th>Customer</th><th className="num">Quoted</th><th className="num">Scheduled</th><th className="num">Received</th><th className="num">Outstanding</th><th>Milestones</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {schedule.length === 0 ? (<tr><td colSpan={8} className="state">No milestone payment schedule for this project yet. Click "Add schedule" to create one.</td></tr>
                ) : schedule.map((r) => {
                  const ms = ppMilestones(r); const paidCount = ms.filter((m) => m.paid).length;
                  return (
                    <tr key={r.id} className="row-click" onClick={() => openSched(r)}>
                      <td><b>{r.customerName}</b></td>
                      <td className="num">{inr(ppQuoted(r))}</td>
                      <td className="num calc">{inr(ppScheduled(r))}</td>
                      <td className="num calc">{inr(ppPaidAmount(r))}</td>
                      <td className="num calc">{inr(ppOutstanding(r))}</td>
                      <td>{paidCount}/{ms.length} paid</td>
                      <td><Pill s={ppStatus(r)} /></td>
                      <td onClick={(e) => e.stopPropagation()}><button className="link" onClick={() => openSched(r)}>Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="po-items-head" style={{ margin: '20px 0 8px' }}><span>PO payment ledger</span></div>
          <div className="tbl">
            <table>
              <thead><tr><th>Date</th><th>PO</th><th className="num">Amount</th><th>Method</th><th>Reference</th><th>Remarks</th></tr></thead>
              <tbody>
                {projPayments.length === 0 ? (<tr><td colSpan={6} className="state">No payments recorded for this project's purchase orders yet.</td></tr>
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <label className="fld" style={{ maxWidth: 240, flex: '1 1 180px' }}>Allocated Budget (₹)
              <input type="number" min="0" step="1000" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} />
            </label>
            <button className="btn primary" onClick={saveBudget} disabled={bBusy}>{bBusy ? 'Saving…' : 'Save budget'}</button>
          </div>
        </div>
      )}

      {tab === 'Delivery Challans' && (
        <div className="tbl">
          <table>
            <thead><tr><th>DC Number</th><th>Date</th><th>Vendor</th><th>PO</th><th>Material</th><th className="num">Qty</th><th>Status</th><th>Document</th></tr></thead>
            <tbody>
              {projChallans.length === 0 ? (<tr><td colSpan={8} className="state">No delivery challans for this project yet. Create one under Delivery Challan.</td></tr>
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

      {sched && (
        <Drawer onClose={closeSched}>
          <h3>{sched.isNew ? 'Add payment schedule' : 'Edit payment schedule'}</h3>
          <p className="hint">For <b>{project.name}</b>. Set the quoted value, then split it into milestones; the percentages must total 100%.</p>
          <div className="grid">
            <Field label="Quoted / Project Value (₹) *" full><input type="number" min="0" step="1" value={sched.data.quotedValue} onChange={(e) => setSD('quotedValue', e.target.value)} placeholder="Total order value" /></Field>
          </div>
          <div className="pp-sched">
            <div className="po-items-head"><span>Payment Terms Schedule</span><button type="button" className="link" onClick={addMs}><Plus size={14} style={{ verticalAlign: '-2px' }} /> Add milestone</button></div>
            <div className="pp-head"><span>Term / Milestone</span><span>%</span><span>Value (₹)</span><span>Paid date</span><span>Paid</span><span /></div>
            {sched.data.milestones.map((m) => (
              <div key={m._id} className="pp-row">
                <input placeholder="Milestone" value={m.term} onChange={(e) => setMs(m._id, 'term', e.target.value)} />
                <input inputMode="decimal" placeholder="%" value={m.percentage} onChange={(e) => setPct(m._id, e.target.value)} />
                <input className="pp-val" value={inr(msAmount(sched.data.quotedValue, m.percentage))} readOnly tabIndex={-1} />
                <input type="date" value={m.date || ''} onChange={(e) => setMs(m._id, 'date', e.target.value)} />
                <input type="checkbox" checked={!!m.paid} onChange={(e) => setMs(m._id, 'paid', e.target.checked)} />
                <button type="button" className="link danger" onClick={() => removeMs(m._id)} title="Remove"><X size={15} /></button>
              </div>
            ))}
            <div className="pp-total">
              <span>Total</span>
              <span style={{ color: pctValid ? 'var(--ok,#16a34a)' : 'var(--bad)' }}>{Number(pctTotal.toFixed(2))}%</span>
              <span>{inr(amtTotal)}</span><span /><span /><span />
            </div>
          </div>
          {!pctValid && <p style={{ margin: '8px 0 0', color: 'var(--bad)', fontSize: 12.5, fontWeight: 600 }}>Total payment percentage must be 100%.</p>}
          <div className="grid" style={{ marginTop: 10 }}>
            <Field label="Notes" full><input value={sched.data.notes} onChange={(e) => setSD('notes', e.target.value)} /></Field>
          </div>
          {schedErr && <div className="err">{schedErr}</div>}
          <div className="actions">
            <div>{!sched.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={closeSched}>Cancel</button>
              <button className="btn primary" onClick={submitSched} disabled={schedBusy || !pctValid}>{schedBusy ? 'Saving…' : sched.isNew ? 'Add schedule' : 'Save changes'}</button>
            </div>
          </div>
          {confirmDel && (
            <div className="confirm">Delete this payment schedule permanently?
              <button className="btn danger" onClick={doDeleteSched} disabled={schedBusy}>Delete</button>
              <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
            </div>
          )}
        </Drawer>
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
        .pp-sched{margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface)}
        .pp-head,.pp-row,.pp-total{display:grid;grid-template-columns:1fr 64px 110px 140px 40px 30px;gap:8px;align-items:center}
        .pp-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:0 2px 8px}
        .pp-row{margin-bottom:8px}
        .pp-row input[type=text],.pp-row input:not([type]),.pp-row input[type=date],.pp-row input[inputmode=decimal]{width:100%;box-sizing:border-box;font:400 13.5px var(--f-body);padding:8px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);outline:none;min-width:0}
        .pp-row input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .pp-row .pp-val{width:100%;box-sizing:border-box;font:600 13.5px var(--f-body);padding:8px 9px;border:1px solid var(--line);border-radius:8px;background:var(--sunk,#f1f5f9);color:var(--fg);cursor:not-allowed}
        .pp-row input[type=checkbox]{width:18px;height:18px;justify-self:center}
        .pp-total{border-top:2px solid var(--line);padding-top:10px;margin-top:4px;font-weight:800;color:var(--fg)}
        .link.danger{color:var(--bad)}
        @media (max-width:640px){.pp-head{display:none}.pp-row,.pp-total{grid-template-columns:1fr 50px 90px;grid-auto-rows:auto}.pp-row input[type=date]{grid-column:1/-1}}
      `}</style>
    </section>
  );
}
