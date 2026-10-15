import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field } from '../components/ui';
import { num, inr, dfmt, qfmt, groupPOs, vendorName } from '../utils/procurement';
import { openChallanDoc } from '../utils/challanDoc';

const TABS = ['Overview', 'Purchase Orders', 'Payments', 'Budget', 'Delivery Challans'];
const CONDITIONS = ['Payment Pending', 'Ongoing', 'Completed'];
const PAY_SLOTS = [0, 1, 2, 3, 4]; // Payment 1..5

// Default rows for the Project Budget Planning Sheet (used when a project has none yet).
const DEFAULT_HEADS = ['Structural Steel Materials', 'Roofing Materials', 'Bending', 'Fabrication Work', 'Civil Work', 'Roofing Installation', 'Painting Work', 'Labour Charges', 'Machinery & Equipment', 'Transport & Logistics', 'Site Expenses', 'Subcontractor Work', 'Miscellaneous'];
const bhId = () => Math.random().toString(36).slice(2, 9);

// Balance to pay = Total Order Value − Collection so Far (derived, like the sheet formula).
const ppBalance = (r) => num(r.totalOrderValue) - num(r.collectionSoFar);
const ppPaymentsOf = (r) => {
  const arr = Array.isArray(r.payments) ? r.payments : [];
  return PAY_SLOTS.map((i) => ({ amount: arr[i] ? (arr[i].amount ?? '') : '', date: arr[i] ? (arr[i].date || '') : '' }));
};

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

  // ── Payment-tracker editor (Excel-style columns, lives inside the project) ──
  const [sched, setSched] = useState(null);
  const [schedErr, setSchedErr] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // ── Budget editor ──
  const [budgetInput, setBudgetInput] = useState('');
  const [bBusy, setBBusy] = useState(false);
  useEffect(() => { if (project) setBudgetInput(project.budget != null ? String(project.budget) : ''); }, [project && project.id, project && project.budget]);

  // ── Project Budget Planning Sheet (budget heads) ──
  const [heads, setHeads] = useState([]);
  const [bhBusy, setBhBusy] = useState(false);
  useEffect(() => {
    if (!project) return;
    const existing = Array.isArray(project.budgetHeads) ? project.budgetHeads : [];
    const seed = existing.length ? existing : DEFAULT_HEADS.map((h) => ({ head: h }));
    setHeads(seed.map((h) => ({ _id: bhId(), head: h.head || '', performa: h.performa ?? '', approved: h.approved ?? '', poValue: h.poValue ?? '', actual: h.actual ?? '', remarks: h.remarks || '' })));
  }, [project && project.id]);

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

  const blankRow = () => ({
    condition: 'Payment Pending', totalOrderValue: '', collectionSoFar: '',
    collectionAmount: '', collectionDate: '', update: '', paymentTerms: '',
    payments: PAY_SLOTS.map(() => ({ amount: '', date: '' })), notes: '',
  });
  const openSched = (r) => {
    setSchedErr(''); setConfirmDel(false);
    if (r) {
      setSched({ isNew: false, id: r.id, data: {
        condition: r.condition || 'Payment Pending',
        totalOrderValue: r.totalOrderValue != null ? String(r.totalOrderValue) : '',
        collectionSoFar: r.collectionSoFar != null ? String(r.collectionSoFar) : '',
        collectionAmount: r.collectionAmount != null ? String(r.collectionAmount) : '',
        collectionDate: r.collectionDate || '',
        update: r.update || '',
        paymentTerms: r.paymentTerms || '',
        payments: ppPaymentsOf(r).map((p) => ({ amount: p.amount === '' ? '' : String(p.amount), date: p.date || '' })),
        notes: r.notes || '',
      } });
    } else {
      setSched({ isNew: true, id: undefined, data: blankRow() });
    }
  };
  const closeSched = () => { setSched(null); setConfirmDel(false); };
  const setSD = (k, v) => setSched((e) => ({ ...e, data: { ...e.data, [k]: v } }));
  const setPay = (i, k, v) => setSched((e) => ({ ...e, data: { ...e.data, payments: e.data.payments.map((p, idx) => idx === i ? { ...p, [k]: v } : p) } }));

  const liveBalance = sched ? (num(sched.data.totalOrderValue) - num(sched.data.collectionSoFar)) : 0;

  const submitSched = async () => {
    const d = sched.data;
    if (num(d.totalOrderValue) <= 0) { setSchedErr('Enter the total order value.'); return; }
    const payLines = (d.payments || [])
      .map((p) => ({ amount: num(p.amount), date: p.date || '' }))
      .filter((p) => p.amount > 0 || p.date);
    setSchedBusy(true);
    try {
      await saveProjectPayment(sched.isNew, sched.id, {
        customerName: project.name,
        project: project.name,
        condition: d.condition || 'Payment Pending',
        totalOrderValue: num(d.totalOrderValue),
        collectionSoFar: num(d.collectionSoFar),
        collectionAmount: num(d.collectionAmount),
        collectionDate: d.collectionDate || '',
        update: String(d.update || '').trim(),
        paymentTerms: String(d.paymentTerms || '').trim(),
        payments: payLines,
        notes: String(d.notes || '').trim(),
      });
      closeSched();
      toast(sched.isNew ? 'Payment record added' : 'Payment record saved');
    } catch (e) { setSchedErr(e.message || 'Could not save.'); }
    finally { setSchedBusy(false); }
  };
  const doDeleteSched = async () => {
    setSchedBusy(true);
    try { await deleteProjectPayment(sched.id); closeSched(); toast('Payment record deleted'); }
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

  const setHead = (id, k, v) => setHeads((hs) => hs.map((h) => h._id === id ? { ...h, [k]: v } : h));
  const addHead = () => setHeads((hs) => [...hs, { _id: bhId(), head: '', performa: '', approved: '', poValue: '', actual: '', remarks: '' }]);
  const removeHead = (id) => setHeads((hs) => hs.filter((h) => h._id !== id));
  const bhTotals = heads.reduce((t, h) => ({ performa: t.performa + num(h.performa), approved: t.approved + num(h.approved), poValue: t.poValue + num(h.poValue), actual: t.actual + num(h.actual) }), { performa: 0, approved: 0, poValue: 0, actual: 0 });
  const bhUtil = bhTotals.approved > 0 ? Math.round((bhTotals.actual / bhTotals.approved) * 100) : 0;
  const saveHeads = async () => {
    setBhBusy(true);
    try {
      const payload = heads
        .filter((h) => String(h.head).trim() || num(h.performa) || num(h.approved) || num(h.poValue) || num(h.actual) || String(h.remarks).trim())
        .map((h) => ({ head: String(h.head).trim(), performa: num(h.performa), approved: num(h.approved), poValue: num(h.poValue), actual: num(h.actual), remarks: String(h.remarks || '').trim() }));
      await saveProject(false, project.id, { budgetHeads: payload });
      toast('Budget sheet saved');
    } catch (e) { toast(e.message || 'Could not save budget sheet'); }
    finally { setBhBusy(false); }
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

      {tab === 'Overview' && (() => {
        const V = (v) => (v == null || v === '' ? '—' : v);
        const terms = Array.isArray(project.paymentTerms) ? project.paymentTerms : [];
        const quoted = num(project.quotedPrice);
        return (
          <>
            <div className="card pd-card">
              <h3>Client &amp; Project Details</h3>
              <div className="ov-grid">
                <div><span className="ov-l">Client Name</span><span className="ov-v">{V(project.client)}</span></div>
                <div><span className="ov-l">Project Location</span><span className="ov-v">{V(project.projectLocation)}</span></div>
                <div><span className="ov-l">Project Code</span><span className="ov-v">{V(project.code)}</span></div>
                <div><span className="ov-l">Status</span><span className="ov-v"><Pill s={project.status || 'Active'} /></span></div>
                <div><span className="ov-l">Contact Details</span><span className="ov-v">{V(project.contactDetails)}</span></div>
                <div><span className="ov-l">Mobile Number</span><span className="ov-v">{V(project.mobileNumber)}</span></div>
                <div><span className="ov-l">Alternate Mobile</span><span className="ov-v">{V(project.altMobile)}</span></div>
                <div><span className="ov-l">Email / WhatsApp</span><span className="ov-v">{V(project.emailWhatsapp)}</span></div>
                <div><span className="ov-l">Billing Name</span><span className="ov-v">{V(project.billingName)}</span></div>
                <div><span className="ov-l">GST Number</span><span className="ov-v">{V(project.gstNumber)}</span></div>
                <div className="ov-full"><span className="ov-l">Site Address</span><span className="ov-v" style={{ whiteSpace: 'pre-wrap' }}>{V(project.siteAddress)}</span></div>
                <div className="ov-full"><span className="ov-l">Billing Address</span><span className="ov-v" style={{ whiteSpace: 'pre-wrap' }}>{V(project.billingAddress)}</span></div>
                <div><span className="ov-l">Salesperson</span><span className="ov-v">{V(project.salespersonName)}</span></div>
                <div><span className="ov-l">Date of Order</span><span className="ov-v">{project.dateOfOrder ? dfmt(project.dateOfOrder) : '—'}</span></div>
                <div><span className="ov-l">Proposal Ref No</span><span className="ov-v">{V(project.proposalRefNo)}</span></div>
                <div><span className="ov-l">Lead ID / Ref</span><span className="ov-v">{V(project.leadRef)}</span></div>
              </div>
            </div>

            <div className="card pd-card">
              <h3>Scope of Work</h3>
              <div className="ov-grid">
                <div><span className="ov-l">Type of Project</span><span className="ov-v">{V(project.typeOfProject)}</span></div>
                <div><span className="ov-l">Project Size / Area</span><span className="ov-v">{V(project.projectSize)}</span></div>
                <div><span className="ov-l">3D Design</span><span className="ov-v">{project.design3D ? 'Yes' : 'No'}</span></div>
                <div><span className="ov-l">2D Design</span><span className="ov-v">{project.design2D ? 'Yes' : 'No'}</span></div>
                <div><span className="ov-l">Transportation (Client Scope)</span><span className="ov-v">{V(project.transportationScope)}</span></div>
                <div><span className="ov-l">Scaffolding (Client Scope)</span><span className="ov-v">{V(project.scaffoldingScope)}</span></div>
                {project.materialDescription && <div className="ov-full"><span className="ov-l">Material Description</span><span className="ov-v" style={{ whiteSpace: 'pre-wrap' }}>{project.materialDescription}</span></div>}
              </div>
            </div>

            <div className="card pd-card">
              <h3>Timeline &amp; Delivery</h3>
              <div className="ov-grid">
                <div><span className="ov-l">Tentative Start Date</span><span className="ov-v">{dfmt(project.startDate)}</span></div>
                <div><span className="ov-l">Tentative Completion Date</span><span className="ov-v">{dfmt(project.tentativeCompletionDate)}</span></div>
                <div><span className="ov-l">Lead Time Promised</span><span className="ov-v">{V(project.leadTimePromised)}</span></div>
                <div><span className="ov-l">Purchase Orders</span><span className="ov-v">{projGroups.length}</span></div>
              </div>
            </div>

            <div className="card pd-card">
              <h3>Pricing &amp; Payment Terms</h3>
              <div className="ov-grid">
                <div><span className="ov-l">Quoted Price</span><span className="ov-v">{quoted > 0 ? inr(quoted) : '—'}</span></div>
                <div><span className="ov-l">Allocated Budget</span><span className="ov-v">{inr(budget)}</span></div>
                <div><span className="ov-l">PO Value</span><span className="ov-v">{inr(value)}</span></div>
                <div><span className="ov-l">Payments</span><span className="ov-v">{inr(paid)}</span></div>
                <div><span className="ov-l">Outstanding</span><span className="ov-v" style={out > 0 ? { color: 'var(--bad)' } : null}>{inr(out)}</span></div>
                <div><span className="ov-l">Budget Utilization</span><span className="ov-v">{budget > 0 ? `${util}%` : '—'}</span></div>
                <div><span className="ov-l">Remaining Budget</span><span className="ov-v" style={remaining < 0 ? { color: 'var(--bad)' } : null}>{budget > 0 ? inr(remaining) : '—'}</span></div>
              </div>
              {terms.length > 0 && (
                <div className="tbl" style={{ marginTop: 14 }}>
                  <table>
                    <thead><tr><th>Term / Milestone</th><th className="num">%</th><th className="num">Value (₹)</th></tr></thead>
                    <tbody>
                      {terms.map((t, i) => (
                        <tr key={i}><td>{t.term || '—'}</td><td className="num">{num(t.percentage)}%</td><td className="num">{inr(t.value)}</td></tr>
                      ))}
                      <tr className="bh-total"><td>Total</td><td className="num">{terms.reduce((s, t) => s + num(t.percentage), 0)}%</td><td className="num">{inr(terms.reduce((s, t) => s + num(t.value), 0))}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {project.notes && (
              <div className="card pd-card">
                <h3>Notes</h3>
                <p className="sub" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{project.notes}</p>
              </div>
            )}
          </>
        );
      })()}

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
            <h2 style={{ fontSize: 17 }}>Payment Pending Cases</h2>
            <div className="right"><button className="btn primary" onClick={() => openSched(null)}>+ Add payment record</button></div>
          </div>
          <div className="tbl pp-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Condition</th>
                  <th className="num">Total Order Value</th>
                  <th className="num">Collection so Far</th>
                  <th className="num">Balance to Pay</th>
                  <th className="num">Collection Amount</th>
                  <th>Collection Date</th>
                  <th>Update</th>
                  <th>Payment Terms</th>
                  {PAY_SLOTS.map((i) => (<React.Fragment key={i}><th className="num">Payment {i + 1}</th><th>Pay {i + 1} Date</th></React.Fragment>))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {schedule.length === 0 ? (<tr><td colSpan={10 + PAY_SLOTS.length * 2} className="state">No payment records for this project yet. Click "Add payment record" to create one.</td></tr>
                ) : schedule.map((r) => {
                  const pays = ppPaymentsOf(r);
                  return (
                    <tr key={r.id} className="row-click" onClick={() => openSched(r)}>
                      <td><b>{r.customerName}</b></td>
                      <td><Pill s={r.condition || 'Payment Pending'} /></td>
                      <td className="num">{inr(r.totalOrderValue)}</td>
                      <td className="num calc">{inr(r.collectionSoFar)}</td>
                      <td className={`num calc ${ppBalance(r) > 0 ? 'overdue' : ''}`}>{inr(ppBalance(r))}</td>
                      <td className="num">{r.collectionAmount ? inr(r.collectionAmount) : '—'}</td>
                      <td>{r.collectionDate ? dfmt(r.collectionDate) : '—'}</td>
                      <td>{r.update || '—'}</td>
                      <td>{r.paymentTerms || '—'}</td>
                      {pays.map((p, i) => (<React.Fragment key={i}><td className="num">{p.amount ? inr(p.amount) : '—'}</td><td>{p.date ? dfmt(p.date) : '—'}</td></React.Fragment>))}
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
        <>
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 17 }}>Project Budget Planning Sheet</h2>
            <div className="right" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label className="fld" style={{ maxWidth: 210 }}>Allocated Budget (₹)
                <input type="number" min="0" step="1000" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} />
              </label>
              <button className="btn" onClick={saveBudget} disabled={bBusy}>{bBusy ? 'Saving…' : 'Save allocated'}</button>
            </div>
          </div>

          <section className="kpis" aria-label="Budget summary" style={{ marginBottom: 14 }}>
            <div className="kpi"><div className="l">Allocated Budget</div><div className="v">{inr(num(budgetInput))}</div></div>
            <div className="kpi"><div className="l">Total Approved</div><div className="v">{inr(bhTotals.approved)}</div></div>
            <div className="kpi"><div className="l">Total Actual Cost</div><div className="v">{inr(bhTotals.actual)}</div></div>
            <div className="kpi"><div className="l">Balance</div><div className={`v ${bhTotals.approved - bhTotals.actual < 0 ? 'bad' : ''}`}>{inr(bhTotals.approved - bhTotals.actual)}</div></div>
            <div className="kpi"><div className="l">Budget Utilised</div><div className="v">{bhTotals.approved > 0 ? `${bhUtil}%` : '—'}</div></div>
          </section>

          <div className="tbl bh-scroll">
            <table>
              <thead><tr>
                <th>Sl. No</th><th>Description</th><th className="num">Budget Approved (₹)</th>
                <th className="num">PO / WO Value (₹)</th><th className="num">Actual Cost (₹)</th><th>Remarks</th><th></th>
              </tr></thead>
              <tbody>
                {heads.map((h, i) => (
                    <tr key={h._id}>
                      <td>{i + 1}</td>
                      <td><input className="bh-in bh-head" value={h.head} onChange={(e) => setHead(h._id, 'head', e.target.value)} placeholder="Description" /></td>
                      <td><input className="bh-in bh-num" type="number" min="0" step="any" value={h.approved} onChange={(e) => setHead(h._id, 'approved', e.target.value)} /></td>
                      <td><input className="bh-in bh-num bh-blue" type="number" min="0" step="any" value={h.poValue} onChange={(e) => setHead(h._id, 'poValue', e.target.value)} /></td>
                      <td><input className="bh-in bh-num" type="number" min="0" step="any" value={h.actual} onChange={(e) => setHead(h._id, 'actual', e.target.value)} /></td>
                      <td><input className="bh-in" value={h.remarks} onChange={(e) => setHead(h._id, 'remarks', e.target.value)} placeholder="—" /></td>
                      <td><button className="link danger" onClick={() => removeHead(h._id)} title="Remove">✕</button></td>
                    </tr>
                ))}
                <tr className="bh-total">
                  <td></td><td>TOTAL PROJECT BUDGET</td>
                  <td className="num">{inr(bhTotals.approved)}</td>
                  <td className="num">{inr(bhTotals.poValue)}</td>
                  <td className="num">{inr(bhTotals.actual)}</td>
                  <td colSpan={2}>Budget Utilised: {bhTotals.approved > 0 ? `${bhUtil}%` : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="actions" style={{ marginTop: 14 }}>
            <div><button className="btn" onClick={addHead}>+ Add budget head</button></div>
            <button className="btn primary" onClick={saveHeads} disabled={bhBusy}>{bhBusy ? 'Saving…' : 'Save budget sheet'}</button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>Balance auto-calculates as Budget Approved − Actual Cost; a negative balance (red) means the head is over budget. The TOTAL and Budget Utilised % update as you type.</p>
        </>
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
          <h3>{sched.isNew ? 'Add payment record' : 'Edit payment record'}</h3>
          <p className="hint">For <b>{project.name}</b>. Track collection against the order value, exactly like the Payment Pending Cases sheet.</p>
          <div className="grid">
            <Field label="Condition">
              <select value={sched.data.condition} onChange={(e) => setSD('condition', e.target.value)}>
                {CONDITIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </Field>
            <Field label="Total Order Value (₹) *"><input type="number" min="0" step="1" value={sched.data.totalOrderValue} onChange={(e) => setSD('totalOrderValue', e.target.value)} /></Field>
            <Field label="Collection so Far (₹)"><input type="number" min="0" step="1" value={sched.data.collectionSoFar} onChange={(e) => setSD('collectionSoFar', e.target.value)} /></Field>
            <Field label="Balance to Pay (₹)"><input value={inr(liveBalance)} readOnly tabIndex={-1} className="ro" /></Field>
            <Field label="Collection Amount (₹)"><input type="number" min="0" step="1" value={sched.data.collectionAmount} onChange={(e) => setSD('collectionAmount', e.target.value)} /></Field>
            <Field label="Collection Date"><input type="date" value={sched.data.collectionDate} onChange={(e) => setSD('collectionDate', e.target.value)} /></Field>
            <Field label="Payment Terms" full><input value={sched.data.paymentTerms} onChange={(e) => setSD('paymentTerms', e.target.value)} placeholder="e.g. 50% advance, balance on delivery" /></Field>
            <Field label="Update" full><textarea rows={2} value={sched.data.update} onChange={(e) => setSD('update', e.target.value)} placeholder="Latest status / remark" /></Field>
          </div>
          <div className="pp-sched">
            <div className="po-items-head"><span>Payment Installments</span></div>
            <div className="pp-head"><span>#</span><span>Amount (₹)</span><span>Date</span></div>
            {sched.data.payments.map((p, i) => (
              <div key={i} className="pp-row">
                <span className="pp-n">Payment {i + 1}</span>
                <input type="number" min="0" step="1" placeholder="Amount" value={p.amount} onChange={(e) => setPay(i, 'amount', e.target.value)} />
                <input type="date" value={p.date} onChange={(e) => setPay(i, 'date', e.target.value)} />
              </div>
            ))}
          </div>
          <div className="grid" style={{ marginTop: 10 }}>
            <Field label="Notes" full><input value={sched.data.notes} onChange={(e) => setSD('notes', e.target.value)} /></Field>
          </div>
          {schedErr && <div className="err">{schedErr}</div>}
          <div className="actions">
            <div>{!sched.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={closeSched}>Cancel</button>
              <button className="btn primary" onClick={submitSched} disabled={schedBusy}>{schedBusy ? 'Saving…' : sched.isNew ? 'Add record' : 'Save changes'}</button>
            </div>
          </div>
          {confirmDel && (
            <div className="confirm">Delete this payment record permanently?
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
        .pd-card{padding:20px;margin-bottom:16px}
        .pd-card h3{margin:0 0 14px;font:700 12px var(--f-body);text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
        .ov-full{grid-column:1/-1}
        .bar{height:10px;border-radius:6px;background:var(--sunk,#e5e7eb);overflow:hidden}
        .bar-fill{height:100%;border-radius:6px;transition:width .3s}
        .pp-scroll{overflow-x:auto}
        .pp-scroll table{min-width:1500px}
        .bh-scroll{overflow-x:auto}
        .bh-scroll table{min-width:760px}
        .bh-in{width:100%;box-sizing:border-box;font:400 13px var(--f-body);padding:7px 8px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--fg);outline:none;min-width:0}
        .bh-in:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .bh-num{text-align:right;font-variant-numeric:tabular-nums}
        .bh-head{font-weight:600}
        .bh-blue{color:#1d4ed8}
        tr.bh-total td{background:var(--accent-soft);font-weight:800;color:var(--fg);border-top:2px solid var(--accent)}
        .pp-sched{margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface)}
        .pp-head,.pp-row{display:grid;grid-template-columns:110px 1fr 160px;gap:8px;align-items:center}
        .pp-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:0 2px 8px}
        .pp-row{margin-bottom:8px}
        .pp-row .pp-n{font:600 13px var(--f-body);color:var(--muted)}
        .pp-row input{width:100%;box-sizing:border-box;font:400 13.5px var(--f-body);padding:8px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);outline:none;min-width:0}
        .pp-row input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        input.ro{background:var(--sunk,#f1f5f9);cursor:not-allowed}
        .link.danger{color:var(--bad)}
        @media (max-width:640px){.pp-head{display:none}.pp-row{grid-template-columns:1fr 1fr;grid-auto-rows:auto}.pp-row .pp-n{grid-column:1/-1}}
      `}</style>
    </section>
  );
}
