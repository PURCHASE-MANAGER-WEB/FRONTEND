import React, { useState, useMemo } from 'react';
import { Plus, X, ReceiptIndianRupee, IndianRupee, Wallet, Clock } from 'lucide-react';
import { usePurchaseData } from '../context/PurchaseData';
import { useToast } from '../components/Toast';
import { Pill, Drawer, Field, StateRow } from '../components/ui';
import { num, inr, ppMilestones, ppQuoted, ppScheduled, ppPaidAmount, ppOutstanding, ppStatus, ppPercentTotal } from '../utils/procurement';

const STATUS = ['Pending', 'Partial', 'Completed'];
const mid = () => Math.random().toString(36).slice(2, 9);
// Default milestone split, mirroring the Order Confirmation form's schedule.
const DEFAULT_MS = () => [
  { _id: mid(), term: 'Advance with PO', percentage: '10', date: '', paid: false },
  { _id: mid(), term: 'After Drawing Approval', percentage: '30', date: '', paid: false },
  { _id: mid(), term: 'After Structure Work', percentage: '40', date: '', paid: false },
  { _id: mid(), term: 'After Completion', percentage: '20', date: '', paid: false },
];
const blank = () => ({ customerName: '', project: '', quotedValue: '', milestones: DEFAULT_MS(), notes: '' });
const msAmount = (quoted, pct) => { const p = parseFloat(pct); return Number.isNaN(p) ? 0 : Math.round(num(quoted) * p / 100); };

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
    .map((r) => ({ ...r, _quoted: ppQuoted(r), _paid: ppPaidAmount(r), _out: ppOutstanding(r), _status: ppStatus(r), _ms: ppMilestones(r) }))
    .filter((r) => statusF === 'all' || r._status === statusF)
    .filter((r) => !q || [r.customerName, r.project].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())),
    [projectPayments, q, statusF]);

  const totals = useMemo(() => ({
    quoted: projectPayments.reduce((s, r) => s + ppQuoted(r), 0),
    paid: projectPayments.reduce((s, r) => s + ppPaidAmount(r), 0),
    out: projectPayments.reduce((s, r) => s + ppOutstanding(r), 0),
  }), [projectPayments]);

  const open = (r) => {
    setFormErr(''); setConfirmDel(false);
    if (r) {
      const ms = ppMilestones(r).map((m) => ({ _id: mid(), term: m.term, percentage: m.percentage ? String(m.percentage) : '', date: m.date || '', paid: !!m.paid }));
      setEditing({ isNew: false, id: r.id, data: { customerName: r.customerName || '', project: r.project || '', quotedValue: r.quotedValue ?? ppScheduled(r) ?? '', milestones: ms.length ? ms : DEFAULT_MS(), notes: r.notes || '' } });
    } else {
      setEditing({ isNew: true, id: undefined, data: blank() });
    }
  };
  const close = () => { setEditing(null); setConfirmDel(false); };
  const set = (k, v) => setEditing((e) => ({ ...e, data: { ...e.data, [k]: v } }));
  const setMs = (id, k, v) => setEditing((e) => ({ ...e, data: { ...e.data, milestones: e.data.milestones.map((m) => m._id === id ? { ...m, [k]: v } : m) } }));
  const addMs = () => setEditing((e) => ({ ...e, data: { ...e.data, milestones: [...e.data.milestones, { _id: mid(), term: '', percentage: '', date: '', paid: false }] } }));
  const removeMs = (id) => setEditing((e) => ({ ...e, data: { ...e.data, milestones: e.data.milestones.filter((m) => m._id !== id) } }));
  const setPct = (id, raw) => {
    let v = String(raw).replace(/[^0-9.]/g, '');
    const dot = v.indexOf('.');
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    if (v !== '' && parseFloat(v) > 100) v = '100';
    setMs(id, 'percentage', v);
  };

  const pctTotal = editing ? ppPercentTotal(editing.data.milestones) : 0;
  const pctValid = Math.abs(pctTotal - 100) <= 0.1;
  const amtTotal = editing ? editing.data.milestones.reduce((s, m) => s + msAmount(editing.data.quotedValue, m.percentage), 0) : 0;

  const submit = async () => {
    const d = editing.data;
    const name = String(d.customerName || '').trim();
    if (!name) { setFormErr('Enter the customer / project name.'); return; }
    if (num(d.quotedValue) <= 0) { setFormErr('Enter the quoted / project value.'); return; }
    if (!pctValid) { setFormErr('Total payment percentage must be 100%.'); return; }
    const matched = projects.find((p) => String(p.name).trim().toLowerCase() === name.toLowerCase());
    const milestones = d.milestones
      .filter((m) => String(m.term).trim() || m.percentage)
      .map((m) => ({ term: String(m.term).trim(), percentage: num(m.percentage), value: msAmount(d.quotedValue, m.percentage), date: m.date || '', paid: !!m.paid }));
    const payload = { customerName: name, project: matched ? matched.name : (d.project || ''), quotedValue: num(d.quotedValue), milestones, notes: String(d.notes || '').trim() };
    setBusy(true);
    try { await saveProjectPayment(editing.isNew, editing.id, payload); close(); toast(editing.isNew ? 'Payment schedule added' : 'Payment schedule saved'); }
    catch (e) { setFormErr(e.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteProjectPayment(editing.id); close(); toast('Payment schedule deleted'); }
    catch (e) { setFormErr(e.message || 'Could not delete.'); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <section className="kpis" aria-label="Payment summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><ReceiptIndianRupee size={16} /></span><div className="l">Payment Schedules</div><div className="v">{projectPayments.length}</div></div>
        <div className="kpi"><span className="kpi-ic"><IndianRupee size={16} /></span><div className="l">Total Quoted</div><div className="v">{inr(totals.quoted)}</div></div>
        <div className="kpi"><span className="kpi-ic"><Wallet size={16} /></span><div className="l">Total Received</div><div className="v">{inr(totals.paid)}</div></div>
        <div className="kpi"><span className="kpi-ic"><Clock size={16} /></span><div className="l">Outstanding</div><div className={`v ${totals.out > 0 ? 'bad' : ''}`}>{inr(totals.out)}</div></div>
      </section>

      <div className="toolbar">
        <h2>Project Payments</h2>
        <div className="right">
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filter by status" style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)' }}>
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
            <th>#</th><th>Customer Name</th><th className="num">Quoted Value</th><th className="num">Scheduled</th>
            <th className="num">Received</th><th className="num">Outstanding</th><th>Milestones</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || rows.length === 0 ? (
              <StateRow cols={9} loading={loading} error={error}
                empty={projectPayments.length ? 'No schedules match your filter.' : 'No payment schedules yet. Add one to set up milestone payments.'} />
            ) : rows.map((r, i) => {
              const paidCount = r._ms.filter((m) => m.paid).length;
              return (
                <tr key={r.id} className="row-click" onClick={() => open(r)}>
                  <td className="id">{i + 1}</td>
                  <td><b>{r.customerName}</b>{r.project && r.project !== r.customerName ? <div className="id" style={{ fontSize: 11 }}>{r.project}</div> : null}</td>
                  <td className="num">{inr(r._quoted)}</td>
                  <td className="num calc">{inr(ppScheduled(r))}</td>
                  <td className="num calc">{inr(r._paid)}</td>
                  <td className={`num calc ${r._out > 0 ? 'overdue' : ''}`}>{inr(r._out)}</td>
                  <td>{paidCount}/{r._ms.length} paid</td>
                  <td><Pill s={r._status} /></td>
                  <td onClick={(e) => e.stopPropagation()}><button className="link" onClick={() => open(r)}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? 'Add payment schedule' : 'Edit payment schedule'}</h3>
          <p className="hint">Set the quoted value, then split it into payment-term milestones. Milestone amounts are auto-calculated from the percentage; the total must be 100%.</p>
          <div className="grid">
            <Field label="Customer / Project Name *" full>
              <input list="pp-projects" value={editing.data.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Type or pick a project" />
              <datalist id="pp-projects">{projects.map((p) => <option key={p.id} value={p.name} />)}</datalist>
            </Field>
            <Field label="Quoted / Project Value (₹) *" full><input type="number" min="0" step="1" value={editing.data.quotedValue} onChange={(e) => set('quotedValue', e.target.value)} placeholder="Total order value" /></Field>
          </div>

          <div className="pp-sched">
            <div className="po-items-head"><span>Payment Terms Schedule</span><button type="button" className="link" onClick={addMs}><Plus size={14} style={{ verticalAlign: '-2px' }} /> Add milestone</button></div>
            <div className="pp-head"><span>Term / Milestone</span><span>%</span><span>Value (₹)</span><span>Paid date</span><span>Paid</span><span /></div>
            {editing.data.milestones.map((m) => (
              <div key={m._id} className="pp-row">
                <input placeholder="Milestone" value={m.term} onChange={(e) => setMs(m._id, 'term', e.target.value)} />
                <input inputMode="decimal" placeholder="%" value={m.percentage} onChange={(e) => setPct(m._id, e.target.value)} />
                <input className="pp-val" value={inr(msAmount(editing.data.quotedValue, m.percentage))} readOnly tabIndex={-1} title="Auto = Quoted × %" />
                <input type="date" value={m.date || ''} onChange={(e) => setMs(m._id, 'date', e.target.value)} />
                <input type="checkbox" checked={!!m.paid} onChange={(e) => setMs(m._id, 'paid', e.target.checked)} title="Mark this milestone received" />
                <button type="button" className="link danger" onClick={() => removeMs(m._id)} title="Remove"><X size={15} /></button>
              </div>
            ))}
            <div className="pp-total">
              <span>Total</span>
              <span style={{ color: pctValid ? 'var(--ok,#16a34a)' : 'var(--bad)' }}>{Number(pctTotal.toFixed(2))}%</span>
              <span>{inr(amtTotal)}</span>
              <span /><span /><span />
            </div>
          </div>
          {!pctValid && <p style={{ margin: '8px 0 0', color: 'var(--bad)', fontSize: 12.5, fontWeight: 600 }}>Total payment percentage must be 100%.</p>}

          <div className="grid" style={{ marginTop: 10 }}>
            <Field label="Notes" full><input value={editing.data.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>

          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div>{!editing.isNew && <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete</button>}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={busy || !pctValid} title={!pctValid ? 'Total must be 100%' : undefined}>{busy ? 'Saving…' : editing.isNew ? 'Add schedule' : 'Save changes'}</button>
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

      <style>{`
        .row-click{cursor:pointer}.row-click:hover{background:var(--sunk,var(--accent-soft))}
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
