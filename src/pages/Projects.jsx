import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, CheckCircle2, PiggyBank, IndianRupee, Wallet } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { num, inr, groupPOs } from '../utils/procurement';

export const PROJECT_STATUS = ['Active', 'On Hold', 'Completed', 'Cancelled'];
const blank = () => ({ name: '', code: '', client: '', budget: '', status: 'Active', startDate: '', materialDescription: '', notes: '' });

export default function Projects() {
  const { projects, lines, loading, error, saveProject, deleteProject } = usePurchaseData();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // { isNew, data }
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  // One grouped row per PO; projects link to POs by NAME (PurchaseOrder.project).
  const groups = useMemo(() => groupPOs(lines), [lines]);
  const rollup = (name) => {
    const g = groups.filter((x) => (x.project || '') === name);
    return {
      poCount: g.length,
      value: g.reduce((s, x) => s + x.value, 0),
      paid: g.reduce((s, x) => s + x.paid, 0),
      out: g.reduce((s, x) => s + x.out, 0),
    };
  };

  const totalBudget = useMemo(() => projects.reduce((s, p) => s + num(p.budget), 0), [projects]);
  const activeCount = projects.filter((p) => String(p.status || 'Active') === 'Active').length;
  const portfolio = useMemo(() => {
    let value = 0, out = 0;
    for (const p of projects) { const r = rollup(p.name); value += r.value; out += r.out; }
    return { value, out };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, groups]);

  const rows = useMemo(() => projects
    .filter((p) => !q || [p.name, p.code, p.client, p.status].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [projects, q]);

  const open = (p) => { setFormErr(''); setConfirmDel(false); setEditing(p ? { isNew: false, data: { ...p, budget: p.budget ?? '', materialDescription: p.materialDescription || '' } } : { isNew: true, data: blank() }); };
  const close = () => { setEditing(null); setConfirmDel(false); };
  const set = (k, val) => setEditing((e) => ({ ...e, data: { ...e.data, [k]: val } }));

  const submit = async () => {
    const d = editing.data;
    const name = String(d.name || '').trim();
    const err = !name ? 'Enter the project name.'
      : (editing.isNew && projects.some((x) => String(x.name).trim().toLowerCase() === name.toLowerCase())) ? `A project named "${name}" already exists.`
      : '';
    if (err) { setFormErr(err); return; }
    const payload = {
      name, code: String(d.code || '').trim(), client: String(d.client || '').trim(),
      budget: num(d.budget), status: d.status || 'Active',
      startDate: d.startDate || '', materialDescription: String(d.materialDescription || '').trim(), notes: String(d.notes || '').trim(),
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

  return (
    <section>
      <section className="kpis" aria-label="Project summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><FolderKanban size={16} /></span><div className="l">Total Projects</div><div className="v">{projects.length}</div></div>
        <div className="kpi"><span className="kpi-ic"><CheckCircle2 size={16} /></span><div className="l">Active Projects</div><div className="v">{activeCount}</div></div>
        <div className="kpi"><span className="kpi-ic"><PiggyBank size={16} /></span><div className="l">Total Budget</div><div className="v">{inr(totalBudget)}</div></div>
        <div className="kpi"><span className="kpi-ic"><IndianRupee size={16} /></span><div className="l">Total PO Value</div><div className="v">{inr(portfolio.value)}</div></div>
        <div className="kpi"><span className="kpi-ic"><Wallet size={16} /></span><div className="l">Outstanding</div><div className="v">{inr(portfolio.out)}</div></div>
      </section>

      <div className="toolbar">
        <h2>Projects</h2>
        <div className="right">
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" aria-label="Search projects" />
          <button className="btn primary" onClick={() => open(null)}>+ Add project</button>
        </div>
      </div>

      <div className="tbl" style={{ marginTop: 12 }}>
        <table>
          <thead><tr>
            <th>Project</th><th>Code</th><th>Client</th><th className="num">Budget</th>
            <th className="num">PO Value</th><th className="num">Payments</th><th className="num">Outstanding</th>
            <th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={9} loading={loading} error={error}
                empty={projects.length ? 'No projects match your search.' : 'No projects yet. Add your first project to start tracking budget, orders and payments.'} />
            ) : rows.map((p) => {
              const r = rollup(p.name);
              return (
                <tr key={p.id} className="row-click" onClick={() => navigate(`/projects/${encodeURIComponent(p.id)}`)}>
                  <td><b>{p.name}</b><div className="id" style={{ fontSize: 11 }}>{p.id}</div></td>
                  <td>{p.code || '—'}</td>
                  <td>{p.client || '—'}</td>
                  <td className="num">{inr(p.budget)}</td>
                  <td className="num calc">{inr(r.value)}{r.poCount ? <div className="id" style={{ fontSize: 11 }}>{r.poCount} PO{r.poCount > 1 ? 's' : ''}</div> : null}</td>
                  <td className="num calc">{inr(r.paid)}</td>
                  <td className={`num calc ${r.out > 0 ? 'overdue' : ''}`}>{inr(r.out)}</td>
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
          <h3>{editing.isNew ? 'Add project' : 'Edit project'}</h3>
          <p className="hint">Fields marked * are required. PO value, payments and outstanding are calculated from purchase orders linked to this project.</p>
          <div className="grid">
            <Field label="Project Name *" full><input value={editing.data.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Project Code"><input value={editing.data.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. PRJ-SITE-01" /></Field>
            <Field label="Status"><select value={editing.data.status} onChange={(e) => set('status', e.target.value)}>{PROJECT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Client"><input value={editing.data.client} onChange={(e) => set('client', e.target.value)} /></Field>
            <Field label="Allocated Budget (₹)"><input type="number" min="0" step="1000" value={editing.data.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
            <Field label="Start Date"><input type="date" value={editing.data.startDate || ''} onChange={(e) => set('startDate', e.target.value)} /></Field>
            <Field label="Material Description" full><textarea rows={2} value={editing.data.materialDescription} onChange={(e) => set('materialDescription', e.target.value)} placeholder="Materials / scope for this project" /></Field>
            <Field label="Notes" full><input value={editing.data.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
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
              Delete {editing.data.name} permanently? Linked purchase orders are not deleted.
              <button className="btn danger" onClick={doDelete} disabled={busy}>Delete</button>
              <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
            </div>
          )}
        </Drawer>
      )}

      <style>{`.row-click{cursor:pointer}.row-click:hover{background:var(--sunk,var(--accent-soft))}`}</style>
    </section>
  );
}
