import React, { useState, useMemo } from 'react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { num, inr, dfmt, ppInstallments, ppTotal, ppStatus } from '../utils/procurement';

const STATUS = ['Pending', 'Partial', 'Completed'];
const blank = () => ({ customerName: '', project: '', terms: '', p1: '', p1Date: '', p2: '', p2Date: '', p3: '', p3Date: '', p4: '', p4Date: '', p5: '', p5Date: '', notes: '' });

export default function ProjectPayments() {
  const { projectPayments, projects, loading, error, saveProjectPayment, deleteProjectPayment } = usePurchaseData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editing, setEditing] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => projectPayments
    .map((r) => ({ ...r, _total: ppTotal(r), _status: ppStatus(r) }))
    .filter((r) => statusF === 'all' || r._status === statusF)
    .filter((r) => !q || [r.customerName, r.project, r.terms].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())),
    [projectPayments, q, statusF]);

  const totals = useMemo(() => {
    const received = projectPayments.reduce((s, r) => s + ppTotal(r), 0);
    const pending = projectPayments.filter((r) => ppStatus(r) === 'Pending').length;
    const completed = projectPayments.filter((r) => ppStatus(r) === 'Completed').length;
    return { received, pending, completed };
  }, [projectPayments]);

  const open = (r) => { setFormErr(''); setConfirmDel(false); setEditing(r ? { isNew: false, data: { ...blank(), ...r } } : { isNew: true, data: blank() }); };
  const close = () => { setEditing(null); setConfirmDel(false); };
  const set = (k, val) => setEditing((e) => ({ ...e, data: { ...e.data, [k]: val } }));

  const submit = async () => {
    const d = editing.data;
    const name = String(d.customerName || '').trim();
    if (!name) { setFormErr('Enter the customer / project name.'); return; }
    const matched = projects.find((p) => String(p.name).trim().toLowerCase() === name.toLowerCase());
    const payload = {
      customerName: name,
      project: matched ? matched.name : (d.project || ''),
      terms: String(d.terms || '').trim(),
      notes: String(d.notes || '').trim(),
    };
    for (const i of [1, 2, 3, 4, 5]) { payload['p' + i] = num(d['p' + i]); payload['p' + i + 'Date'] = d['p' + i + 'Date'] || ''; }
    setBusy(true);
    try { await saveProjectPayment(editing.isNew, editing.data.id, payload); close(); toast(editing.isNew ? 'Payment schedule added' : 'Payment schedule saved'); }
    catch (e) { setFormErr(e.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteProjectPayment(editing.data.id); close(); toast('Payment schedule deleted'); }
    catch (e) { setFormErr(e.message || 'Could not delete.'); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <section className="kpis" aria-label="Payment summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="l">Payment Schedules</div><div className="v">{projectPayments.length}</div></div>
        <div className="kpi"><div className="l">Total Received</div><div className="v">{inr(totals.received)}</div></div>
        <div className="kpi"><div className="l">Pending</div><div className="v">{totals.pending}</div></div>
        <div className="kpi"><div className="l">Completed</div><div className="v">{totals.completed}</div></div>
      </section>

      <div className="toolbar">
        <h2>Project Payments</h2>
        <div className="right">
          <select className="po-filter" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by status" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }}>
            <option value="all">All status</option>
            {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer / project…" aria-label="Search payments" />
          <button className="btn primary" onClick={() => open(null)}>+ Add schedule</button>
        </div>
      </div>

      <div className="tbl" style={{ marginTop: 12 }}>
        <table>
          <thead><tr>
            <th>#</th><th>Customer Name</th><th>Payment Terms</th>
            <th className="num">Payment 1</th><th>P1 Date</th>
            <th className="num">Payment 2</th><th>P2 Date</th>
            <th className="num">Payment 3</th><th>P3 Date</th>
            <th className="num">Payment 4</th><th>P4 Date</th>
            <th className="num">Payment 5</th><th>P5 Date</th>
            <th className="num">Total</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={16} loading={loading} error={error}
                empty={projectPayments.length ? 'No schedules match your filter.' : 'No payment schedules yet. Add one to start tracking milestone payments.'} />
            ) : rows.map((r, i) => {
              const inst = ppInstallments(r);
              return (
                <tr key={r.id}>
                  <td className="id">{i + 1}</td>
                  <td><b>{r.customerName}</b>{r.project && r.project !== r.customerName ? <div className="id" style={{ fontSize: 11 }}>{r.project}</div> : null}</td>
                  <td>{r.terms || '—'}</td>
                  {inst.map((x, idx) => (
                    <React.Fragment key={idx}>
                      <td className="num">{x.amount ? inr(x.amount) : '—'}</td>
                      <td>{x.date ? dfmt(x.date) : '—'}</td>
                    </React.Fragment>
                  ))}
                  <td className="num calc"><b>{inr(r._total)}</b></td>
                  <td><Pill s={r._status} /></td>
                  <td><button className="link" onClick={() => open(r)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'Add payment schedule' : 'Edit payment schedule'}</h3>
          <p className="hint">Milestone payments for a project/customer. Total and status are calculated from the installments below.</p>
          <div className="grid">
            <Field label="Customer / Project Name *" full>
              <input list="pp-projects" value={editing.data.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Type or pick a project" />
              <datalist id="pp-projects">{projects.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            </Field>
            <Field label="Payment Terms" full><input value={editing.data.terms} onChange={(e) => set('terms', e.target.value)} placeholder="e.g. 50%,40%,10%" /></Field>
            {[1, 2, 3, 4, 5].map((i) => (
              <React.Fragment key={i}>
                <Field label={`Payment ${i} (₹)`}><input type="number" min="0" step="1" value={editing.data['p' + i]} onChange={(e) => set('p' + i, e.target.value)} /></Field>
                <Field label={`Payment ${i} Date`}><input type="date" value={editing.data['p' + i + 'Date'] || ''} onChange={(e) => set('p' + i + 'Date', e.target.value)} /></Field>
              </React.Fragment>
            ))}
            <Field label="Notes" full><input value={editing.data.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>
          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{!editing.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing.isNew ? 'Add schedule' : 'Save changes'}</button>
            </div>
          </div>
          {confirmDel && (
            <div className="confirm">
              Delete this payment schedule permanently?
              <button className="btn danger" onClick={doDelete} disabled={busy}>Delete</button>
              <button className="link" onClick={() => setConfirmDel(false)}>Cancel</button>
            </div>
          )}
        </Drawer>
      )}
    </section>
  );
}
