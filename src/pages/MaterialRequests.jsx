import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageSearch, FilePlus2, CheckCircle2, XCircle, History } from 'lucide-react';
import { materialRequestsApi } from '../api/client';
import { Pill, Field, Drawer, StateRow } from '../components/ui';

const fmtDate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : '—');
const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const STATUS_FILTERS = ['all', 'Pending Approval', 'Approved', 'PO Created', 'Rejected'];

export default function MaterialRequests() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [reject, setReject] = useState(null);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const first = useRef(true);

  const load = () => {
    if (first.current) setLoading(true);
    materialRequestsApi.list()
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
      .finally(() => { setLoading(false); first.current = false; });
  };
  // Load + clear the badge, then poll so updates appear without a manual refresh.
  useEffect(() => {
    load(); materialRequestsApi.markSeen().catch(() => {});
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };
  const run = async (fn, okMsg) => { setBusy(true); setError(''); try { await fn(); if (okMsg) flash(okMsg); load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };

  const approve = (m) => run(() => materialRequestsApi.approve(m._id), 'Request approved');
  const doReject = () => {
    if (!reject.reason || !reject.reason.trim()) { setError('Enter a reason to reject'); return; }
    run(() => materialRequestsApi.reject(reject._id, reject.reason.trim()), 'Requirement rejected').then(() => setReject(null));
  };
  // Create PO → redirect to the Purchase Orders section's New PO builder, prefilled with this
  // requirement. On save there, the PO is linked back to this request (→ PO Created).
  const createPO = (m) => {
    const desc = `${m.material}${m.spec ? ` (${m.spec})` : ''} — Qty ${m.qty || ''} ${m.unit || ''}`.trim();
    try { sessionStorage.setItem('mr_new_po', JSON.stringify({ mrId: m._id, projectName: m.projectName || '', materialDesc: desc })); } catch { /* ignore */ }
    nav(`/purchase-orders?mr=${encodeURIComponent(m._id)}`);
  };

  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const pending = rows.filter((r) => r.status === 'Pending Approval').length;

  return (
    <div>
      <div className="toolbar">
        <h2>Material Requests {pending > 0 && <span className="pill p-warn" style={{ marginLeft: 8 }}>{pending} pending</span>}</h2>
        <div className="right">
          <select className="po-filter" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter material requests by status">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All requests' : s}</option>)}
          </select>
        </div>
      </div>
      <p className="hint" style={{ marginTop: -4 }}><PackageSearch size={14} /> Requirements raised by the Execution Head. Approve or reject each one; once approved, create a Purchase Order from it. The Execution Head is notified of every decision.</p>
      {msg && <div className="hint" style={{ color: 'var(--ok, #16a34a)' }}>{msg}</div>}
      {error && <div className="hint" style={{ color: 'var(--bad)' }}>{error}</div>}

      <div className="tbl" style={{ marginTop: 10 }}>
        <table>
          <thead><tr>
            <th>Ref</th><th>Project</th><th>Material</th><th className="num">Qty</th><th>Needed by</th><th>Requested</th><th>Status</th><th>PO</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || shown.length === 0 ? (
              <StateRow cols={9} loading={loading} error={error} empty="No material requests." />
            ) : shown.map((m) => (
              <tr key={m._id}>
                <td className="mono">{m.ref || '—'}</td>
                <td>{m.projectName || '—'}{m.handoverRef && <div className="sub">{m.handoverRef}</div>}</td>
                <td>
                  <strong>{m.material}</strong>
                  {m.spec && <div className="sub">{m.spec}</div>}
                  {m.notes && <div className="sub">{m.notes}</div>}
                  {m.status === 'Rejected' && m.rejectReason && <div className="sub" style={{ color: 'var(--bad)' }}>Rejected: {m.rejectReason}</div>}
                </td>
                <td className="num">{m.qty || '—'} {m.unit}</td>
                <td>{fmtDate(m.neededBy)}</td>
                <td className="sub">{fmtDT(m.createdAt)}<div>{m.createdBy?.name || ''}</div></td>
                <td><Pill s={m.status} /></td>
                <td>{m.poRef || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {m.status === 'Pending Approval' && <>
                      <button className="btn" disabled={busy} onClick={() => approve(m)}><CheckCircle2 size={14} /> Approve</button>
                      <button className="btn danger" disabled={busy} onClick={() => setReject({ _id: m._id, material: m.material, reason: '' })}><XCircle size={14} /> Reject</button>
                    </>}
                    {m.status === 'Approved' && <>
                      <button className="btn primary" disabled={busy} onClick={() => createPO(m)}><FilePlus2 size={14} /> Create PO</button>
                      <button className="btn danger" disabled={busy} onClick={() => setReject({ _id: m._id, material: m.material, reason: '' })}><XCircle size={14} /> Reject</button>
                    </>}
                    {(m.statusLog || []).length > 0 && <button className="btn" onClick={() => setHistory(m)} title="History"><History size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reject && (
        <Drawer onClose={() => setReject(null)}>
          <h3>Reject requirement</h3>
          <p className="hint">Tell the Execution Head why <strong>{reject.material}</strong> can't be procured. This reason is required and will be sent to them.</p>
          <div className="grid">
            <Field label="Reason *" full><textarea rows={3} value={reject.reason} onChange={(e) => setReject((s) => ({ ...s, reason: e.target.value }))} placeholder="e.g. Not available — suggest an alternative spec" autoFocus /></Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setReject(null)}>Cancel</button>
            <button type="button" className="btn danger" disabled={busy} onClick={doReject}>Reject requirement</button>
          </div>
        </Drawer>
      )}

      {history && (
        <Drawer onClose={() => setHistory(null)}>
          <h3>Request history — {history.ref}</h3>
          <p className="hint">{history.projectName} · {history.material}</p>
          <ul className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(history.statusLog || []).map((l, i) => (
              <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div><Pill s={l.to} /> <span className="sub">by {l.by} ({l.portal})</span></div>
                {l.note && <div className="sub">{l.note}</div>}
                <div className="sub">{fmtDT(l.at)}</div>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
    </div>
  );
}
