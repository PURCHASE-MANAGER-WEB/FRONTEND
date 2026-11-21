import React, { useState, useEffect, useMemo } from 'react';
import { FileStack, FileText, Download, Eye, Bell, X, MapPin } from 'lucide-react';
import { salesHandoversApi } from '../api/client';
import { useToast } from '../components/Toast';
import { Drawer, StateRow, Pill } from '../components/ui';
import { num, inr, dfmt } from '../utils/procurement';

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const val = (v) => (v === 0 ? '0' : v || '—');

export default function SalesHandovers() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [notif, setNotif] = useState({ items: [], unread: 0 });

  const [sel, setSel] = useState(null);     // selected summary row
  const [detail, setDetail] = useState(null); // full handover
  const [detBusy, setDetBusy] = useState(false);

  const load = () => {
    setLoading(true);
    salesHandoversApi.list()
      .then((d) => { setRows(d.handovers || []); setError(''); })
      .catch((e) => setError(e.message || 'Could not load handovers'))
      .finally(() => setLoading(false));
  };
  const loadNotif = () => salesHandoversApi.notifications().then(setNotif).catch(() => {});
  useEffect(() => { load(); loadNotif(); const t = setInterval(loadNotif, 20000); return () => clearInterval(t); }, []);

  const markRead = async () => { setNotif((n) => ({ ...n, unread: 0 })); await salesHandoversApi.markRead().catch(() => {}); };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((h) => [h.ref, h.clientName, h.projectName, h.projectType, h.proposalRefNo, h.createdBy && h.createdBy.name].filter(Boolean).join(' ').toLowerCase().includes(s));
  }, [rows, q]);

  const totals = useMemo(() => ({
    count: rows.length,
    value: rows.reduce((a, h) => a + num(h.projectValue), 0),
    withDocs: rows.filter((h) => h.attachmentCount > 0).length,
  }), [rows]);

  const openRow = async (h) => {
    setSel(h); setDetail(null); setDetBusy(true);
    try { const d = await salesHandoversApi.get(h.id); setDetail(d.handover); }
    catch (e) { toast(e.message || 'Could not load handover'); }
    finally { setDetBusy(false); }
  };
  const close = () => { setSel(null); setDetail(null); };

  const openDoc = async (a) => {
    try { const b = await salesHandoversApi.fileBlob(sel.id, a.fileId); const u = URL.createObjectURL(b); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); }
    catch (e) { toast(e.message || 'Could not open document'); }
  };
  const dlDoc = async (a) => {
    try { const b = await salesHandoversApi.fileBlob(sel.id, a.fileId, { download: true }); const u = URL.createObjectURL(b); const el = document.createElement('a'); el.href = u; el.download = a.filename || 'document'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
    catch (e) { toast(e.message || 'Could not download document'); }
  };

  const d = detail || {};
  const det = d.details || {}, sc = d.scope || {}, tl = d.timeline || {}, pr = d.pricing || {};

  return (
    <section>
      <section className="kpis" aria-label="Sales handovers summary" style={{ marginBottom: 16 }}>
        <div className="kpi"><span className="kpi-ic"><FileStack size={16} /></span><div className="l">Total Handovers</div><div className="v">{totals.count}</div></div>
        <div className="kpi"><span className="kpi-ic"><FileText size={16} /></span><div className="l">Total Project Value</div><div className="v">{inr(totals.value)}</div></div>
        <div className="kpi"><span className="kpi-ic"><Download size={16} /></span><div className="l">With Documents</div><div className="v">{totals.withDocs}</div></div>
      </section>

      {notif.unread > 0 && (
        <div className="ho-banner">
          <Bell size={16} />
          <span>{notif.unread} new handover{notif.unread > 1 ? 's' : ''} received from Sales.</span>
          <button className="link" onClick={markRead}>Mark read</button>
        </div>
      )}

      <div className="toolbar">
        <h2>Sales Handovers</h2>
        <div className="right">
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search handover, project, client…" aria-label="Search handovers" />
        </div>
      </div>
      <p className="sub" style={{ margin: '4px 0 10px' }}>Project handovers submitted by the Sales team — for reference and purchase planning. Read-only; the original records stay with Sales and Execution.</p>

      <div className="tbl">
        <table>
          <thead><tr>
            <th>Handover ID</th><th>Submitted</th><th>Project</th><th>Client</th><th>Type</th>
            <th className="num">Project Value</th><th className="num">Docs</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {loading || error || filtered.length === 0 ? (
              <StateRow cols={9} loading={loading} error={error}
                empty={rows.length ? 'No handovers match your search.' : 'No sales handovers yet. They appear here automatically when Sales submits a handover.'} />
            ) : filtered.map((h) => (
              <tr key={h.id} className="row-click" onClick={() => openRow(h)}>
                <td className="id"><b>{h.ref || '—'}</b></td>
                <td>{h.submittedAt ? dfmt(h.submittedAt) : dfmt(h.createdAt)}</td>
                <td>{h.projectName || '—'}</td>
                <td>{h.clientName || '—'}</td>
                <td>{h.projectType || '—'}</td>
                <td className="num">{h.projectValue ? inr(h.projectValue) : '—'}</td>
                <td className="num">{h.attachmentCount || 0}</td>
                <td><Pill s={h.status || 'Submitted'} /></td>
                <td onClick={(e) => e.stopPropagation()}><button className="link" onClick={() => openRow(h)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <Drawer onClose={close}>
          <h3>Handover · {sel.ref || sel.id}</h3>
          <p className="hint">{(det.clientName || sel.clientName || 'Client')} · {(sc.typeOfProject || sel.projectType || 'Project')}{sel.status ? ` · ${sel.status}` : ''}</p>

          {detBusy ? <div className="state" style={{ padding: '30px 8px' }}>Loading…</div> : (
            <>
              <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,1fr)', margin: '4px 0 14px' }}>
                <div className="kpi"><div className="l">Project Value</div><div className="v">{inr(num(pr.quotedPrice) || num(d.projectValue))}</div></div>
                <div className="kpi"><div className="l">Dimensions</div><div className="v" style={{ fontSize: 16 }}>{(num(sc.length) || num(sc.width)) ? `${val(sc.length)} × ${val(sc.width)} ${sc.unit || 'ft'}` : '—'}</div></div>
                <div className="kpi"><div className="l">Priority</div><div className="v" style={{ fontSize: 16 }}>{d.priority || '—'}</div></div>
              </div>

              <div className="ho-sec">Project</div>
              <div className="ho-grid">
                <Row k="Handover ID" v={sel.ref || '—'} />
                <Row k="Project / Code" v={det.proposalRefNo || det.leadId || '—'} />
                <Row k="Project Name / Type" v={sc.typeOfProject || d.projectName || '—'} />
                <Row k="Project Location" v={det.projectLocation || '—'} />
                <Row k="Salesperson" v={det.salespersonName || (d.createdBy && d.createdBy.name) || '—'} />
                <Row k="Date of Order" v={det.dateOfOrder || '—'} />
              </div>

              <div className="ho-sec">Client details</div>
              <div className="ho-grid">
                <Row k="Client Name" v={det.clientName || '—'} />
                <Row k="Billing Name" v={det.billingName || '—'} />
                <Row k="Mobile" v={det.mobileNumber || '—'} />
                <Row k="Alternate Mobile" v={det.alternateMobile || '—'} />
                <Row k="Email / WhatsApp" v={det.emailWhatsapp || '—'} />
                <Row k="GST Number" v={det.gstNumber || '—'} />
                <Row k="Site Address" v={det.siteAddress || '—'} full />
                <Row k="Billing Address" v={det.billingAddress || '—'} full />
                {det.mapLink && <div className="ho-row full"><span className="ho-k">Location</span><a className="link" href={det.mapLink} target="_blank" rel="noopener noreferrer"><MapPin size={13} style={{ verticalAlign: '-2px' }} /> Open map</a></div>}
              </div>

              <div className="ho-sec">Scope of work</div>
              <div className="ho-grid">
                <Row k="Type of Project" v={sc.typeOfProject || '—'} />
                <Row k="Project Size / Area" v={sc.projectSizeArea || '—'} />
                <Row k="Length" v={sc.length ? `${sc.length} ${sc.unit || 'ft'}` : '—'} />
                <Row k="Width" v={sc.width ? `${sc.width} ${sc.unit || 'ft'}` : '—'} />
                <Row k="Design" v={[sc.design2D && '2D', sc.design3D && '3D'].filter(Boolean).join(' & ') || '—'} />
                <Row k="Transportation (client scope)" v={sc.transportationClientScope || '—'} />
                <Row k="Scaffolding (client scope)" v={sc.scaffoldingClientScope || '—'} />
              </div>

              <div className="ho-sec">Timeline & pricing</div>
              <div className="ho-grid">
                <Row k="Tentative Start" v={tl.tentativeStartDate || '—'} />
                <Row k="Tentative Completion" v={tl.tentativeCompletionDate || '—'} />
                <Row k="Lead Time" v={tl.leadTimePromised || '—'} />
                <Row k="Quoted Price" v={pr.quotedPrice ? inr(pr.quotedPrice) : '—'} />
              </div>
              {Array.isArray(pr.milestones) && pr.milestones.length > 0 && (
                <div className="ho-ms">
                  {pr.milestones.map((m, i) => (
                    <div className="ho-ms-row" key={i}><span>{m.term || `Milestone ${i + 1}`}</span><span>{m.percentage ? `${m.percentage}%` : ''}</span><span>{m.value ? inr(m.value) : ''}</span></div>
                  ))}
                </div>
              )}

              <div className="ho-sec">Attached documents ({(d.attachments || []).length})</div>
              {(d.attachments || []).length === 0 ? (
                <div className="state" style={{ padding: '18px 8px' }}>No documents attached.</div>
              ) : (
                <div className="ho-atts">
                  {(d.attachments || []).map((a) => (
                    <div className="ho-att" key={a.fileId}>
                      <FileText size={16} />
                      <div className="ho-att-main"><div className="ho-att-name">{a.filename || 'Document'}</div><div className="ho-att-meta">{a.size ? `${Math.max(1, Math.round(a.size / 1024))} KB` : ''}{a.uploadedBy ? ` · ${a.uploadedBy}` : ''}</div></div>
                      <button className="link" onClick={() => openDoc(a)}><Eye size={13} style={{ verticalAlign: '-2px' }} /> View</button>
                      <button className="link" onClick={() => dlDoc(a)}><Download size={13} style={{ verticalAlign: '-2px' }} /> Download</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="actions" style={{ marginTop: 16 }}>
            <div />
            <button className="btn" onClick={close}>Close</button>
          </div>
        </Drawer>
      )}

      <style>{`
        .ho-banner{display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--accent,#6cbe2c);background:var(--accent-soft,#eef7e6);border-radius:10px;margin-bottom:14px;font-size:13.5px;color:var(--fg)}
        .ho-banner .link{margin-left:auto}
        .ho-sec{font:700 12px var(--f-body);text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:16px 0 8px;border-bottom:1px solid var(--line);padding-bottom:5px}
        .ho-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 24px}
        .ho-row{display:flex;flex-direction:column;gap:2px}
        .ho-row.full{grid-column:1/-1}
        .ho-k{font-size:11.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.02em}
        .ho-v{font-size:14px;color:var(--fg);white-space:pre-wrap;word-break:break-word}
        .ho-ms{margin-top:8px;border:1px solid var(--line);border-radius:8px;overflow:hidden}
        .ho-ms-row{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;padding:8px 12px;font-size:13px;border-bottom:1px solid var(--line)}
        .ho-ms-row:last-child{border-bottom:0}
        .ho-atts{display:flex;flex-direction:column;gap:8px}
        .ho-att{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface,#fff)}
        .ho-att-main{flex:1;min-width:0}
        .ho-att-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ho-att-meta{font-size:12px;color:var(--muted)}
        @media (max-width:640px){.ho-grid{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}

const Row = ({ k, v, full }) => (
  <div className={`ho-row ${full ? 'full' : ''}`}><span className="ho-k">{k}</span><span className="ho-v">{v}</span></div>
);
