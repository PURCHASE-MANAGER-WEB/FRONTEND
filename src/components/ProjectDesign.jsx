import React, { useEffect, useState } from 'react';
import { useToast } from './Toast';
import { Drawer, Field } from './ui';
import { dfmt } from '../utils/procurement';
import { designRequestsApi } from '../api/client';

// Procurement-side Design Request panel (Project Details → Design tab). Raises a
// design request into the shared Design CRM database and tracks its status +
// approved files, which the Design CRM writes back.

const readAsBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onerror = () => rej(new Error('Could not read the file.'));
  fr.onload = () => res(String(fr.result || '').split(',').pop());
  fr.readAsDataURL(file);
});

const STATUS = {
  New: '#64748b', Assigned: '#6366f1', 'In Progress': '#2563eb',
  'Pending Review': '#8b5cf6', 'Rework Required': '#ef4444', Rejected: '#dc2626',
  Approved: '#16a34a', Completed: '#16a34a',
};
const badge = (s) => (
  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, color: '#fff', background: STATUS[s] || '#64748b' }}>{s || 'New'}</span>
);
const REQUIREMENTS = ['2D + 3D', '2D Drawing', '3D Render', 'BOQ', '2D Layout + 3D Model', '2D Layouts + BOQ'];
const TYPES = ['PEB', 'Mangalore Tile Roofing', 'Glass Roofing', 'Other'];
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Normal', 'Low'];

export default function ProjectDesign({ project }) {
  const toast = useToast();
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [files, setFiles] = useState([]);
  const blank = () => ({ requirement: '2D + 3D', projectType: 'PEB', description: '', priority: 'Medium', dueDate: '' });
  const [form, setForm] = useState(blank());
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    try { setReqs(await designRequestsApi.list({ projectId: project.id })); }
    catch { setReqs([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [project && project.id]);

  const submit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const created = await designRequestsApi.create({
        projectName: project.name, customerName: project.client || '',
        procurementProjectId: project.id, procurementProjectCode: project.code || '',
        projectType: form.projectType, requirement: form.requirement, service: form.requirement,
        description: form.description, priority: form.priority, dueDate: form.dueDate,
      });
      for (const f of files) {
        const dataBase64 = await readAsBase64(f);
        await designRequestsApi.addAttachment(created.id, { name: f.name, type: f.type || '', size: f.size, dataBase64 });
      }
      setOpen(false); setForm(blank()); setFiles([]);
      await load();
      toast('Design request sent to the Design team');
    } catch (e2) { setErr(e2.message || 'Could not raise the request.'); }
    finally { setBusy(false); }
  };

  const grabFile = async (fileId, name, download) => {
    try {
      const blob = await designRequestsApi.fileBlob(fileId, { download });
      const href = URL.createObjectURL(blob);
      if (download) { const a = document.createElement('a'); a.href = href; a.download = name || 'file'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 2000); }
      else { window.open(href, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(href), 60000); }
    } catch (e) { toast(e.message || 'Could not open file.'); }
  };

  const fileLinks = (list, label) => (Array.isArray(list) && list.length > 0) ? (
    <div style={{ marginTop: 8 }}>
      <div className="ov-l" style={{ marginBottom: 4 }}>{label}</div>
      {list.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0' }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
          {f.fileId && <>
            <button className="link" onClick={() => grabFile(f.fileId, f.name, false)}>View</button>
            <span style={{ color: 'var(--muted)' }}>·</span>
            <button className="link" onClick={() => grabFile(f.fileId, f.name, true)}>Download</button>
          </>}
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div className="card pd-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Design Requests</h3>
        <button className="btn primary" onClick={() => { setForm(blank()); setFiles([]); setErr(''); setOpen(true); }}>+ Raise Design Request</button>
      </div>

      {loading ? <p className="hint" style={{ margin: 0 }}>Loading…</p>
        : reqs.length === 0 ? <p className="hint" style={{ margin: 0 }}>No design requests for this project yet. Raise one — it goes straight to the Design team and you can track it here.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reqs.map((r) => (
                <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.id} · {r.requirement || r.service || 'Design'}</div>
                      <div className="sub" style={{ marginTop: 2 }}>
                        {[`Designer: ${r.assignedDesigner || 'Unassigned'}`, r.dueDate ? `Due ${dfmt(r.dueDate)}` : '', r.priority].filter(Boolean).join('  ·  ')}
                      </div>
                    </div>
                    {badge(r.status)}
                  </div>
                  {r.description && <p className="sub" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{r.description}</p>}
                  {fileLinks(r.attachments, 'Attachments')}
                  {r.status === 'Approved' && (
                    <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--accent-soft)', borderRadius: 8 }}>
                      <div style={{ fontWeight: 700, color: 'var(--accent-ink)', fontSize: 13 }}>✓ Approved{r.approvedDate ? ` on ${dfmt(r.approvedDate)}` : ''}{r.approvedBy ? ` by ${r.approvedBy}` : ''}</div>
                      {fileLinks(r.approvedFiles, 'Approved design files')}
                    </div>
                  )}
                  {r.status === 'Rejected' && r.rejectionReason && <div style={{ marginTop: 8, color: 'var(--bad)', fontSize: 13 }}>Rejected: {r.rejectionReason}</div>}
                  {r.status === 'Rework Required' && r.changeRemarks && <div style={{ marginTop: 8, color: '#b45309', fontSize: 13 }}>Changes requested: {r.changeRemarks}</div>}
                </div>
              ))}
            </div>
          )}

      {open && (
        <Drawer onClose={() => setOpen(false)}>
          <h3>Raise Design Request</h3>
          <p className="hint">For <b>{project.name}</b>{project.code ? ` · ${project.code}` : ''}. This is sent to the Design team and tracked here.</p>
          <div>
            <div className="grid">
              <Field label="Project Type"><select value={form.projectType} onChange={(e) => setF('projectType', e.target.value)}>{TYPES.map((o) => <option key={o}>{o}</option>)}</select></Field>
              <Field label="Design Requirement"><select value={form.requirement} onChange={(e) => setF('requirement', e.target.value)}>{REQUIREMENTS.map((o) => <option key={o}>{o}</option>)}</select></Field>
              <Field label="Priority"><select value={form.priority} onChange={(e) => setF('priority', e.target.value)}>{PRIORITIES.map((o) => <option key={o}>{o}</option>)}</select></Field>
              <Field label="Required Completion Date"><input type="date" value={form.dueDate} onChange={(e) => setF('dueDate', e.target.value)} /></Field>
              <Field label="Description / Requirements" full><textarea rows={4} value={form.description} onChange={(e) => setF('description', e.target.value)} placeholder="Describe the design scope, deliverables and any specifications…" /></Field>
              <Field label="Supporting attachments" full>
                <input type="file" multiple onChange={(e) => { const picked = Array.from(e.target.files || []); e.target.value = ''; if (picked.length) setFiles((prev) => [...prev, ...picked]); }} />
                {files.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {files.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px' }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span className="sub" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button type="button" className="link danger" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            </div>
            {err && <div className="err">{err}</div>}
            <div className="actions">
              <div />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={() => { setOpen(false); setFiles([]); }}>Cancel</button>
                <button type="button" className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send Request'}</button>
              </div>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
