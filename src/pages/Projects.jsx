import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FolderKanban, CheckCircle2, PiggyBank, IndianRupee, Wallet, Plus, X } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { num, inr, groupPOs, cpOrderValue } from '../utils/procurement';
import { isRestrictedPM, purchaseApi } from '../api/client';

export const PROJECT_STATUS = ['Active', 'On Hold', 'Completed', 'Cancelled'];
export const PROJECT_TYPES = ['PU Sheet Roofing', 'PUF Panel Roofing', 'Metal Sheet Roofing', 'Tensile Structure', 'Polycarbonate Structure', 'Structural Steel Fabrication', 'Wall Panel Cladding', 'Skylight / Roof Light', 'Other'];
const tid = () => Math.random().toString(36).slice(2, 9);
const DEFAULT_TERMS = () => [
  { _id: tid(), term: '10% Advance with PO', percentage: '10' },
  { _id: tid(), term: '30% after Drawing Approval', percentage: '30' },
  { _id: tid(), term: '40% after Structure Work Complete', percentage: '40' },
  { _id: tid(), term: '20% after Completion', percentage: '20' },
];
const dayDiff = (start, end) => {
  if (!start || !end) return '';
  const s = new Date(start), e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const d = Math.round((e - s) / 86400000);
  return d < 0 ? '' : d;
};
const msAmount = (quoted, pct) => { const p = parseFloat(pct); return Number.isNaN(p) ? 0 : Math.round(num(quoted) * p) / 100; };

const blank = () => ({
  name: '', code: '', status: 'Active', budget: '',
  leadRef: '', client: '', projectLocation: '', contactDetails: '', billingName: '', mobileNumber: '', altMobile: '',
  siteAddress: '', billingAddress: '', gstNumber: '', emailWhatsapp: '', salespersonName: '', dateOfOrder: '', proposalRefNo: '',
  typeOfProject: '', projectSize: '', sizeSections: [], design3D: false, design2D: false, transportationScope: 'Yes', scaffoldingScope: 'Yes',
  startDate: '', tentativeCompletionDate: '', leadTimePromised: '',
  quotedPrice: '', paymentTerms: DEFAULT_TERMS(),
  siteEngineerVisit: false, salespersonDeclaration: false,
  materialDescription: '', notes: '',
});

export default function Projects() {
  const { projects, lines, projectPayments, loading, error, saveProject, deleteProject, reloadLines } = usePurchaseData();
  const pm = isRestrictedPM();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const setQ = (v) => { const sp = new URLSearchParams(searchParams); if (v) sp.set('q', v); else sp.delete('q'); setSearchParams(sp, { replace: true }); };
  const [editing, setEditing] = useState(null); // { isNew, data }
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [relinkTo, setRelinkTo] = useState({});
  const [relinkBusy, setRelinkBusy] = useState('');

  const groups = useMemo(() => groupPOs(lines), [lines]);
  // Purchase orders whose project name doesn't match any existing project (orphaned —
  // usually a rename/typo). These don't appear under any project until relinked.
  const orphans = useMemo(() => {
    const names = new Set(projects.map((pp) => String(pp.name || '').trim()).filter(Boolean));
    const map = new Map();
    for (const l of lines) { const pr = String(l.project || '').trim(); if (pr && !names.has(pr)) { const set = map.get(pr) || new Set(); set.add(l.po); map.set(pr, set); } }
    return [...map.entries()].map(([name, pos]) => ({ name, pos: [...pos].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })) })).sort((a, b) => b.pos.length - a.pos.length);
  }, [lines, projects]);
  const rollup = (name) => {
    const g = groups.filter((x) => (x.project || '') === name);
    return { poCount: g.length, value: g.reduce((s, x) => s + x.value, 0), paid: g.reduce((s, x) => s + x.paid, 0), out: g.reduce((s, x) => s + x.out, 0) };
  };

  const totalBudget = useMemo(() => projects.reduce((s, p) => s + num(p.budget), 0), [projects]);
  const totalOrderValue = useMemo(() => (Array.isArray(projectPayments) ? projectPayments : []).reduce((a, r) => a + cpOrderValue(r), 0), [projectPayments]);
  const activeCount = projects.filter((p) => String(p.status || 'Active') === 'Active').length;
  const portfolio = useMemo(() => {
    let value = 0, out = 0;
    for (const p of projects) { const r = rollup(p.name); value += r.value; out += r.out; }
    return { value, out };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, groups]);

  const rows = useMemo(() => projects
    .filter((p) => !q || [p.name, p.code, p.client, p.status].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const ca = String(a.code || '').trim(), cb = String(b.code || '').trim();
      if (ca && cb) return ca.localeCompare(cb, undefined, { numeric: true }) || String(a.name).localeCompare(String(b.name));
      if (ca) return -1; if (cb) return 1;
      return String(a.name).localeCompare(String(b.name));
    }), [projects, q]);

  // Card totals follow the projects currently listed (respects the search); cleared → all.
  const summary = useMemo(() => {
    const budget = rows.reduce((s2, p2) => s2 + num(p2.budget), 0);
    const active = rows.filter((p2) => String(p2.status || 'Active') === 'Active').length;
    const pays = Array.isArray(projectPayments) ? projectPayments : [];
    const recFor = (name) => pays.find((r) => (r.project || r.customerName) === name) || null;
    const orderValue = rows.reduce((s2, p2) => { const r = recFor(p2.name); return s2 + (r ? cpOrderValue(r) : 0); }, 0);
    const out = rows.reduce((s2, p2) => s2 + rollup(p2.name).out, 0);
    return { count: rows.length, active, budget, orderValue, out };
  }, [rows, projectPayments, groups]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (p) => {
    setFormErr(''); setConfirmDel(false);
    if (p) {
      const pt = Array.isArray(p.paymentTerms) && p.paymentTerms.length
        ? p.paymentTerms.map((t) => ({ _id: tid(), term: t.term || '', percentage: t.percentage != null ? String(t.percentage) : '' }))
        : DEFAULT_TERMS();
      setEditing({ isNew: false, data: { ...blank(), ...p, budget: p.budget ?? '', quotedPrice: p.quotedPrice != null ? String(p.quotedPrice) : '', paymentTerms: pt, sizeSections: Array.isArray(p.sizeSections) ? p.sizeSections.map((x) => ({ _id: tid(), name: x.name || '', length: x.length != null ? String(x.length) : '', width: x.width != null ? String(x.width) : '' })) : [] } });
    } else {
      setEditing({ isNew: true, data: blank() });
    }
  };
  const close = () => { setEditing(null); setConfirmDel(false); };
  const set = (k, val) => setEditing((e) => ({ ...e, data: { ...e.data, [k]: val } }));
  const setTerm = (id, k, v) => setEditing((e) => ({ ...e, data: { ...e.data, paymentTerms: e.data.paymentTerms.map((t) => t._id === id ? { ...t, [k]: v } : t) } }));
  const addTerm = () => setEditing((e) => ({ ...e, data: { ...e.data, paymentTerms: [...e.data.paymentTerms, { _id: tid(), term: '', percentage: '' }] } }));
  const removeTerm = (id) => setEditing((e) => ({ ...e, data: { ...e.data, paymentTerms: e.data.paymentTerms.filter((t) => t._id !== id) } }));
  const setSec = (id, k, v) => setEditing((e) => ({ ...e, data: { ...e.data, sizeSections: e.data.sizeSections.map((x) => x._id === id ? { ...x, [k]: v } : x) } }));
  const addSec = () => setEditing((e) => ({ ...e, data: { ...e.data, sizeSections: [...e.data.sizeSections, { _id: tid(), name: '', length: '', width: '' }] } }));
  const removeSec = (id) => setEditing((e) => ({ ...e, data: { ...e.data, sizeSections: e.data.sizeSections.filter((x) => x._id !== id) } }));
  const setPct = (id, raw) => {
    let v = String(raw).replace(/[^0-9.]/g, '');
    const dot = v.indexOf('.'); if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    if (v !== '' && parseFloat(v) > 100) v = '100';
    setTerm(id, 'percentage', v);
  };

  const d = editing ? editing.data : null;
  const leadTime = d ? dayDiff(d.startDate, d.tentativeCompletionDate) : '';
  const secArea = (sx) => Math.round(num(sx.length) * num(sx.width) * 100) / 100;
  const totalArea = d ? d.sizeSections.reduce((t, sx) => t + secArea(sx), 0) : 0;
  const pctTotal = d ? d.paymentTerms.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0) : 0;
  const pricingTouched = d ? (num(d.quotedPrice) > 0 || d.paymentTerms.some((t) => String(t.percentage).trim())) : false;
  const pctValid = !pricingTouched || Math.abs(pctTotal - 100) <= 0.01;

  const submit = async () => {
    const name = String(d.name || '').trim();
    const err = !name ? 'Enter the project name.'
      : (editing.isNew && projects.some((x) => String(x.name).trim().toLowerCase() === name.toLowerCase())) ? `A project named "${name}" already exists.`
      : !pctValid ? 'Total payment percentage must be exactly 100%.'
      : '';
    if (err) { setFormErr(err); return; }
    const paymentTerms = d.paymentTerms
      .filter((t) => String(t.term).trim() || String(t.percentage).trim())
      .map((t) => ({ term: String(t.term).trim(), percentage: num(t.percentage), value: msAmount(d.quotedPrice, t.percentage) }));
    const payload = {
      name, code: String(d.code || '').trim(), status: d.status || 'Active', budget: num(d.budget),
      client: String(d.client || '').trim(), leadRef: String(d.leadRef || '').trim(),
      projectLocation: String(d.projectLocation || '').trim(), contactDetails: String(d.contactDetails || '').trim(),
      billingName: String(d.billingName || '').trim(), mobileNumber: String(d.mobileNumber || '').trim(), altMobile: String(d.altMobile || '').trim(),
      siteAddress: String(d.siteAddress || '').trim(), billingAddress: String(d.billingAddress || '').trim(),
      gstNumber: String(d.gstNumber || '').trim(), emailWhatsapp: String(d.emailWhatsapp || '').trim(),
      salespersonName: String(d.salespersonName || '').trim(), dateOfOrder: d.dateOfOrder || '', proposalRefNo: String(d.proposalRefNo || '').trim(),
      typeOfProject: String(d.typeOfProject || '').trim(),
      sizeSections: d.sizeSections.map((sx) => ({ name: String(sx.name || '').trim(), length: num(sx.length), width: num(sx.width), area: secArea(sx) })).filter((sx) => sx.name || sx.length || sx.width),
      totalArea,
      projectSize: String(d.projectSize || '').trim() || (totalArea > 0 ? `${totalArea.toLocaleString('en-IN')} sq.ft` : ''),
      design3D: !!d.design3D, design2D: !!d.design2D, transportationScope: d.transportationScope || 'Yes', scaffoldingScope: d.scaffoldingScope || 'Yes',
      startDate: d.startDate || '', tentativeCompletionDate: d.tentativeCompletionDate || '', leadTimePromised: leadTime === '' ? '' : `${leadTime} days`,
      quotedPrice: num(d.quotedPrice), paymentTerms,
      siteEngineerVisit: !!d.siteEngineerVisit, salespersonDeclaration: !!d.salespersonDeclaration,
      materialDescription: String(d.materialDescription || '').trim(), notes: String(d.notes || '').trim(),
    };
    setBusy(true);
    try { await saveProject(editing.isNew, editing.data.id, payload); close(); toast(editing.isNew ? 'Project added' : 'Project saved'); }
    catch (e) { setFormErr(e.message || 'Could not save project.'); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteProject(editing.data.id); close(); toast('Project deleted'); }
    catch (e) { setFormErr(e.message || 'Could not delete project.'); }
    finally { setBusy(false); }
  };

  // Move every PO on an orphaned (old/misspelled) project name onto a real project.
  const doRelink = async (from) => {
    const to = relinkTo[from];
    if (!to) { toast('Pick the project to move these POs into.'); return; }
    setRelinkBusy(from);
    try {
      const r = await purchaseApi.relinkPOs(from, to);
      await reloadLines();
      setRelinkTo((m) => { const n = { ...m }; delete n[from]; return n; });
      toast(`Moved ${r && r.updated != null ? r.updated : ''} PO line(s) into "${to}"`.replace('  ', ' '));
    } catch (e) { toast(e.message || 'Could not relink the purchase orders.'); }
    finally { setRelinkBusy(''); }
  };

  return (
    <section>
      <section className="kpis" aria-label="Project summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><FolderKanban size={16} /></span><div className="l">Total Projects</div><div className="v">{summary.count}</div></div>
        <div className="kpi"><span className="kpi-ic"><CheckCircle2 size={16} /></span><div className="l">Active Projects</div><div className="v">{summary.active}</div></div>
        <div className="kpi"><span className="kpi-ic"><PiggyBank size={16} /></span><div className="l">Total Budget</div><div className="v">{inr(summary.budget)}</div></div>
        {!pm && <div className="kpi"><span className="kpi-ic"><IndianRupee size={16} /></span><div className="l">Total Order Value</div><div className="v">{inr(summary.orderValue)}</div></div>}
        {!pm && <div className="kpi"><span className="kpi-ic"><Wallet size={16} /></span><div className="l">Outstanding</div><div className="v">{inr(summary.out)}</div></div>}
      </section>

      <div className="toolbar">
        <h2>Projects</h2>
        <div className="right">
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" aria-label="Search projects" />
          {!pm && <button className="btn primary" onClick={() => open(null)}>+ Add project</button>}
        </div>
      </div>

      {!pm && orphans.length > 0 && (
        <div style={{ margin: '12px 0 0', border: '1px solid var(--warn, #e0a800)', background: 'var(--warn-bg, #fff8e1)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>⚠ {orphans.reduce((s2, o) => s2 + o.pos.length, 0)} purchase order line(s) are linked to {orphans.length} project name(s) that don't exist — they won't show under any project.</span>
            <button className="link" onClick={() => setFixOpen((o) => !o)}>{fixOpen ? 'Hide' : 'Review & fix'}</button>
          </div>
          {fixOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {orphans.map((o) => (
                <div key={o.name} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={{ minWidth: 220 }}><b>{o.name}</b> <span className="id" style={{ fontSize: 11 }}>({o.pos.length} PO: {o.pos.join(', ')})</span></span>
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <select value={relinkTo[o.name] || ''} onChange={(e) => setRelinkTo((m) => ({ ...m, [o.name]: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }}>
                    <option value="">— Move to project —</option>
                    {projects.map((pp) => <option key={pp.id} value={pp.name}>{pp.name}</option>)}
                  </select>
                  <button className="btn primary" disabled={relinkBusy === o.name || !relinkTo[o.name]} onClick={() => doRelink(o.name)}>{relinkBusy === o.name ? 'Moving…' : 'Relink'}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="tbl" style={{ marginTop: 12 }}>
        <table>
          <thead><tr>
            <th>Project</th><th>Code</th><th>Client</th><th className="num">Budget</th>
            {!pm && (<><th className="num">PO Value</th><th className="num">Payments</th><th className="num">Outstanding</th></>)}
            <th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={pm ? 6 : 9} loading={loading} error={error}
                empty={projects.length ? 'No projects match your search.' : 'No projects yet. Add your first project to start tracking budget, orders and payments.'} />
            ) : rows.map((p) => {
              const r = rollup(p.name);
              return (
                <tr key={p.id} className="row-click" onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}>
                  <td><b>{p.name}</b><div className="id" style={{ fontSize: 11 }}>{p.id}</div></td>
                  <td>{p.code || '—'}</td>
                  <td>{p.client || '—'}</td>
                  <td className="num">{inr(p.budget)}</td>
                  {!pm && (<>
                  <td className="num calc">{inr(r.value)}{r.poCount ? <div className="id" style={{ fontSize: 11 }}>{r.poCount} PO{r.poCount > 1 ? 's' : ''}</div> : null}</td>
                  <td className="num calc">{inr(r.paid)}</td>
                  <td className={`num calc ${r.out > 0 ? 'overdue' : ''}`}>{inr(r.out)}</td>
                  </>)}
                  <td><Pill s={p.status || 'Active'} /></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="link" onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}>View</button>
                    <button className="link" onClick={() => open(p)} style={{ marginLeft: 10 }}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'New Project File' : `Edit ${d.name || 'project'}`}</h3>
          <p className="hint">Sales → Project Handover. Fields marked * are required. PO value, payments and outstanding are calculated from the purchase orders linked to this project.</p>

          <div className="pj-sec">1. Client &amp; Project Details</div>
          <div className="grid">
            <Field label="Project Name *" full><input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Link key for purchase orders" /></Field>
            <Field label="Project Code"><input value={d.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. PRJ-SITE-01" /></Field>
            <Field label="Status"><select value={d.status} onChange={(e) => set('status', e.target.value)}>{PROJECT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Lead ID / Reference"><input value={d.leadRef} onChange={(e) => set('leadRef', e.target.value)} placeholder="e.g. LD-0001" /></Field>
            <Field label="Client Name"><input value={d.client} onChange={(e) => set('client', e.target.value)} /></Field>
            <Field label="Project Location"><input value={d.projectLocation} onChange={(e) => set('projectLocation', e.target.value)} /></Field>
            <Field label="Contact Details (Phone/Email)"><input value={d.contactDetails} onChange={(e) => set('contactDetails', e.target.value)} /></Field>
            <Field label="Mobile Number"><input value={d.mobileNumber} onChange={(e) => set('mobileNumber', e.target.value)} /></Field>
            <Field label="Alternate Mobile"><input value={d.altMobile} onChange={(e) => set('altMobile', e.target.value)} /></Field>
            <Field label="Email ID / WhatsApp"><input value={d.emailWhatsapp} onChange={(e) => set('emailWhatsapp', e.target.value)} /></Field>
            <Field label="Billing Name"><input value={d.billingName} onChange={(e) => set('billingName', e.target.value)} /></Field>
            <Field label="GST Number"><input value={d.gstNumber} onChange={(e) => set('gstNumber', e.target.value)} /></Field>
            <Field label="Site Address" full><textarea rows={2} value={d.siteAddress} onChange={(e) => set('siteAddress', e.target.value)} /></Field>
            <Field label="Billing Address" full><textarea rows={2} value={d.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} placeholder="If different from site address" /></Field>
            <Field label="Salesperson Name"><input value={d.salespersonName} onChange={(e) => set('salespersonName', e.target.value)} /></Field>
            <Field label="Date of Order"><input type="date" value={d.dateOfOrder} onChange={(e) => set('dateOfOrder', e.target.value)} /></Field>
            <Field label="Proposal Ref No"><input value={d.proposalRefNo} onChange={(e) => set('proposalRefNo', e.target.value)} placeholder="e.g. TES/ENT/176-R1" /></Field>
            <Field label="Allocated Budget (₹)"><input type="number" min="0" step="1000" value={d.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
          </div>

          <div className="pj-sec">2. Scope of Work</div>
          <div className="grid">
            <Field label="Type of Project">
              {(() => {
                const KNOWN = PROJECT_TYPES.filter((t) => t !== 'Other');
                const tv = d.typeOfProject || '';
                const isOther = tv === 'Other' || (tv !== '' && !KNOWN.includes(tv));
                return (<>
                  <select value={isOther ? 'Other' : tv} onChange={(e) => set('typeOfProject', e.target.value)}>
                    <option value="">Select type</option>
                    {KNOWN.map((t) => <option key={t} value={t}>{t}</option>)}
                    <option value="Other">Other</option>
                  </select>
                  {isOther && <input placeholder="Enter project type" value={tv === 'Other' ? '' : tv} onChange={(e) => set('typeOfProject', e.target.value)} style={{ marginTop: 6 }} />}
                </>);
              })()}
            </Field>
            <Field label="Project Size / Area (overall, optional)"><input value={d.projectSize} onChange={(e) => set('projectSize', e.target.value)} placeholder="e.g. 760 Sqft. (auto-filled from sections if blank)" /></Field>
            <Field label="Material Description" full><textarea rows={2} value={d.materialDescription} onChange={(e) => set('materialDescription', e.target.value)} placeholder="Materials / scope for this project" /></Field>
          </div>
          <div className="po-items-head" style={{ marginTop: 14 }}><span>Sections / Areas</span><button type="button" className="link" onClick={addSec}><Plus size={14} style={{ verticalAlign: '-2px' }} /> Add section</button></div>
          <div className="sz-sched">
            <div className="sz-head"><span>Section / Area</span><span>Length (ft)</span><span>Width (ft)</span><span>Area (sq.ft)</span><span></span></div>
            {d.sizeSections.length === 0 ? (
              <div style={{ padding: '8px 4px', color: 'var(--muted)', fontSize: 13 }}>No sections yet. Add length × width for each area — total is auto-calculated.</div>
            ) : d.sizeSections.map((sx) => (
              <div key={sx._id} className="sz-row">
                <input value={sx.name} onChange={(e) => setSec(sx._id, 'name', e.target.value)} placeholder="e.g. Shed A / Roof" />
                <input type="number" min="0" step="any" value={sx.length} onChange={(e) => setSec(sx._id, 'length', e.target.value)} placeholder="L" />
                <input type="number" min="0" step="any" value={sx.width} onChange={(e) => setSec(sx._id, 'width', e.target.value)} placeholder="W" />
                <input className="sz-area" value={secArea(sx) ? secArea(sx).toLocaleString('en-IN') : ''} readOnly tabIndex={-1} placeholder="0" />
                <button type="button" className="link danger" onClick={() => removeSec(sx._id)} title="Remove section"><X size={15} /></button>
              </div>
            ))}
            {d.sizeSections.length > 0 && (
              <div className="sz-total"><span>Total Area</span><span></span><span></span><span>{totalArea.toLocaleString('en-IN')} sq.ft</span><span></span></div>
            )}
          </div>
          <div className="pj-chips">
            <label className="pj-chk"><input type="checkbox" checked={d.design3D} onChange={(e) => set('design3D', e.target.checked)} /> 3D Design</label>
            <label className="pj-chk"><input type="checkbox" checked={d.design2D} onChange={(e) => set('design2D', e.target.checked)} /> 2D Design</label>
            <span className="pj-seg"><span className="pj-seg-l">Transportation (Client Scope)</span>
              {['Yes', 'No'].map((o) => <label key={o} className="pj-rad"><input type="radio" name="transport" checked={d.transportationScope === o} onChange={() => set('transportationScope', o)} /> {o}</label>)}
            </span>
            <span className="pj-seg"><span className="pj-seg-l">Scaffolding (Client Scope)</span>
              {['Yes', 'No'].map((o) => <label key={o} className="pj-rad"><input type="radio" name="scaffold" checked={d.scaffoldingScope === o} onChange={() => set('scaffoldingScope', o)} /> {o}</label>)}
            </span>
          </div>

          <div className="pj-sec">3. Timeline &amp; Delivery Commitment</div>
          <div className="grid">
            <Field label="Tentative Start Date"><input type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
            <Field label="Tentative Completion Date"><input type="date" value={d.tentativeCompletionDate} onChange={(e) => set('tentativeCompletionDate', e.target.value)} /></Field>
            <Field label="Lead Time Promised"><input value={leadTime === '' ? '' : `${leadTime} days`} readOnly tabIndex={-1} className="ro" placeholder="Auto-calculated" /></Field>
          </div>

          <div className="pj-sec">4. Pricing &amp; Payment Terms</div>
          <div className="grid">
            <Field label="Quoted Price (₹)"><input type="number" min="0" step="any" value={d.quotedPrice} onChange={(e) => set('quotedPrice', e.target.value)} placeholder="Amount" /></Field>
          </div>
          <div className="pp-sched">
            <div className="po-items-head"><span>Payment Terms Schedule</span><button type="button" className="link" onClick={addTerm}><Plus size={14} style={{ verticalAlign: '-2px' }} /> Add milestone</button></div>
            <div className="pp-head"><span>Term / Milestone</span><span>%</span><span>Value (₹)</span><span /></div>
            {d.paymentTerms.map((t) => (
              <div key={t._id} className="pp-row">
                <input placeholder="Milestone" value={t.term} onChange={(e) => setTerm(t._id, 'term', e.target.value)} />
                <input inputMode="decimal" placeholder="%" value={t.percentage} onChange={(e) => setPct(t._id, e.target.value)} />
                <input className="pp-val" value={inr(msAmount(d.quotedPrice, t.percentage))} readOnly tabIndex={-1} />
                <button type="button" className="link danger" onClick={() => removeTerm(t._id)} title="Remove"><X size={15} /></button>
              </div>
            ))}
            <div className="pp-total">
              <span>Total</span>
              <span style={{ color: pctValid ? 'var(--ok,#16a34a)' : 'var(--bad)' }}>{Number(pctTotal.toFixed(2))}%</span>
              <span>{inr(d.paymentTerms.reduce((s, t) => s + msAmount(d.quotedPrice, t.percentage), 0))}</span><span />
            </div>
          </div>
          {!pctValid && <p style={{ margin: '8px 0 0', color: 'var(--bad)', fontSize: 12.5, fontWeight: 600 }}>Total payment percentage must be 100%.</p>}

          <div className="pj-sec">5. Notes</div>
          <div className="grid">
            <Field label="Notes" full><input value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>

          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{!editing.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete project</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing.isNew ? 'Add project' : 'Save changes'}</button>
            </div>
          </div>
          {confirmDel && (
            <div className="confirm">
              Delete {d.name} permanently? Linked purchase orders are not deleted.
              <button className="btn danger" onClick={doDelete} disabled={busy}>Delete</button>
              <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
            </div>
          )}
        </Drawer>
      )}

      <style>{`
        .row-click{cursor:pointer}.row-click:hover{background:var(--sunk,var(--accent-soft))}
        .pj-sec{font:700 12px var(--f-body);text-transform:uppercase;letter-spacing:.06em;color:var(--accent-ink);margin:28px 0 16px;padding-bottom:9px;border-bottom:1px solid var(--line)}
        .pj-sec:first-of-type{margin-top:18px}
        .po-items-head{display:flex;justify-content:space-between;align-items:center;font:700 12px var(--f-body);color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
        .pj-chips{display:flex;gap:16px 28px;flex-wrap:wrap;align-items:center;margin-top:2px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
        .pj-chk{display:inline-flex;align-items:center;gap:8px;font:600 13.5px var(--f-body);color:var(--fg);cursor:pointer}
        .pj-seg{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
        .pj-seg-l{font:700 11px var(--f-body);text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
        .pj-rad{display:inline-flex;align-items:center;gap:5px;font:600 13px var(--f-body);color:var(--fg);cursor:pointer}
        .pp-sched{margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface)}
        .pp-head,.pp-row,.pp-total{display:grid;grid-template-columns:1fr 70px 130px 30px;gap:8px;align-items:center}
        .pp-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:0 2px 8px}
        .pp-row{margin-bottom:8px}
        .pp-row input{width:100%;box-sizing:border-box;font:400 13.5px var(--f-body);padding:8px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);outline:none;min-width:0}
        .pp-row input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .pp-row .pp-val{background:var(--sunk,#f1f5f9);font-weight:600;cursor:not-allowed}
        .pp-total{border-top:2px solid var(--line);padding-top:10px;margin-top:4px;font-weight:800;color:var(--fg)}
        .sz-sched{margin-top:4px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface)}
        .sz-head,.sz-row,.sz-total{display:grid;grid-template-columns:1fr 90px 90px 120px 30px;gap:8px;align-items:center}
        .sz-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:0 2px 8px}
        .sz-row{margin-bottom:8px}
        .sz-row input{width:100%;box-sizing:border-box;font:400 13.5px var(--f-body);padding:8px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);outline:none;min-width:0}
        .sz-row input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .sz-row .sz-area{background:var(--sunk,#f1f5f9);font-weight:600;cursor:not-allowed}
        .sz-total{border-top:2px solid var(--line);padding-top:10px;margin-top:4px;font-weight:800;color:var(--fg)}
        @media (max-width:640px){.sz-head{display:none}.sz-row,.sz-total{grid-template-columns:1fr 64px 64px 90px 28px}}
        input.ro{background:var(--sunk,#f1f5f9);cursor:not-allowed}
        .link.danger{color:var(--bad)}
        @media (max-width:640px){.pp-head{display:none}.pp-row,.pp-total{grid-template-columns:1fr 56px 100px 28px}}
      `}</style>
    </section>
  );
}
