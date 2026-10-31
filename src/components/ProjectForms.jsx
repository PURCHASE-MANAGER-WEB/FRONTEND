import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from './Toast';
import { Drawer, Field } from './ui';
import { formsApi } from '../api/client';
import { uploadFormFile, openFormFile, downloadFormFile, removeFormFile, validateFormFile } from '../utils/formFiles';
import { downloadProposalPdf, downloadHandoverPdf } from '../utils/formPdf';

// Proposal & Handover forms for a project — lives inside the Project Details page.
// Structured data + generated Tesco-branded PDF, plus uploads of completed/signed
// forms and supporting documents. All saved to our own backend (purchase_forms /
// purchase_form_files), so everything persists across refreshes.

const BANK = { name: 'Kotak Mahindra Bank', holder: 'Tesco Structures LLP', account: '7750837566', ifsc: 'KKBK0008485', branch: 'Mount Road, Chennai', gstin: '33AAXFT8541N1Z8' };
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]}-${d.getFullYear()}`; };
const n = (v) => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KIND_LABEL = { proposal: 'Proposal (Commercial Quotation)', handover: 'Sales → Project Handover Form', design: 'Design (2D / 3D)' };
const NEW_LABEL = { proposal: 'Proposal', handover: 'Handover Form', design: 'Design' };
const EMPTY_LABEL = { proposal: 'proposals', handover: 'handover forms', design: 'designs' };
const DESIGN_TYPES = ['2D', '3D', '2D + 3D', 'Other'];

function proposalDefaults(p) {
  return {
    clientName: p.client || '', location: p.projectLocation || p.siteAddress || '', structure: p.typeOfProject || '',
    referenceCode: p.proposalRefNo || '', date: today(),
    subject: p.typeOfProject ? `Commercial Quotation for Supply & Installation of ${p.typeOfProject}` : '',
    salutation: 'Dear Sir/Madam,',
    intro: 'We thank you for the opportunity and are pleased to submit our quotation for the supply, fabrication, and erection of the structure detailed below. Our scope covers structural design, fabrication, supply, installation and commissioning as specified.',
    items: [{ description: p.typeOfProject || '', specification: '', unit: 'Sqft', qty: '', rate: '', amount: p.quotedPrice ? String(p.quotedPrice) : '' }],
    gstPct: 18, amountInWords: '', areaBasis: '',
    scope: [{ label: 'Structure', text: '' }, { label: 'Membrane', text: '' }, { label: 'Flashing', text: '' }, { label: 'Configuration', text: '' }, { label: 'Accessories', text: '' }, { label: 'Painting', text: '' }, { label: 'Installation', text: '' }],
    paymentTerms: [
      { label: 'Payment Schedule', text: '50% against Purchase Order | 40% after erection of material at site | 10% after completion of work.' },
      { label: 'Site Preparation', text: 'Foundation, leveling and access arrangements are in the client’s scope.' },
      { label: 'Scaffolding', text: 'To be arranged by the client.' },
      { label: 'Final Billing', text: 'Based on actual site measurements. Additional work, if any, charged separately.' },
      { label: 'Payment in Favor', text: 'Tesco Structures LLP.' },
    ],
    validity: 'This proposal is valid for 10 days from the date of issuance.\nAny extension may require a revised quotation due to material cost or market changes.',
    bank: { ...BANK },
    signName: p.salespersonName || 'Praveen Raja', signTitle: 'Business Development Manager', signMobile: '91500 50532 / 9003328229',
  };
}

function handoverDefaults(p) {
  return {
    projectName: p.name || '', structureSummary: p.typeOfProject || '', proposalRef: p.proposalRefNo || '', purchaseOrder: '',
    clientName: p.client || '', projectLocation: p.projectLocation || '', contactDetails: p.contactDetails || '',
    billingName: p.billingName || '', mobileNumber: p.mobileNumber || '', altMobile: p.altMobile || '',
    siteAddress: p.siteAddress || '', billingAddress: p.billingAddress || '', gstNumber: p.gstNumber || '',
    emailWhatsapp: p.emailWhatsapp || '', salespersonName: p.salespersonName || '', dateOfOrder: p.dateOfOrder || '',
    proposalRefNo: p.proposalRefNo || '', typeOfProject: p.typeOfProject || '', projectSize: p.projectSize || '',
    design3D: p.design3D ? 'Submitted to client' : 'Not submitted to client',
    design2D: p.design2D ? 'Submitted to client' : 'Not submitted to client',
    transportationScope: p.transportationScope || '', scaffoldingScope: p.scaffoldingScope || '',
    tentativeStartDate: p.startDate || '', tentativeCompletionDate: p.tentativeCompletionDate || '', leadTimePromised: p.leadTimePromised || '',
    potedPrice: 'Yes',
    items: [{ description: p.typeOfProject || '', qty: p.projectSize || '', rate: '', amount: p.quotedPrice ? String(p.quotedPrice) : '' }],
    gstPct: 18, amountInWords: '',
    paymentSchedule: '50% against Purchase Order\n40% after erection / completion of structure at site\n10% after completion of project',
    alternateTerms: 'N/A', siteEngineerSign: '',
    confirmationStatement: 'I confirm that all details communicated to the client and project team are accurate and agreed upon. I also acknowledge that the project will commence once the design is confirmed.',
    salespersonSign: '', salespersonTitle: 'Business Development Manager',
  };
}

function designDefaults(p) {
  return {
    title: p.typeOfProject ? `${p.typeOfProject} — Design` : 'Design',
    designType: '2D', date: today(),
    designer: '', revision: '', status: 'In Progress', notes: '',
  };
}

export default function ProjectForms({ project, section = 'all' }) {
  const toast = useToast();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { kind, isNew, formId, data }
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  const [openId, setOpenId] = useState(null);        // which record's files panel is open
  const [filesMap, setFilesMap] = useState({});       // formId -> [files]
  const [fileBusy, setFileBusy] = useState(false);
  const [fileErr, setFileErr] = useState('');
  // In-editor attachments: files picked while creating/editing a form.
  const [pendingFiles, setPendingFiles] = useState([]); // [{ file, key }] not yet uploaded
  const [editFiles, setEditFiles] = useState([]);       // already-saved files for the form being edited
  const [attachErr, setAttachErr] = useState('');
  const [attachBusy, setAttachBusy] = useState(false);

  const loadForms = async () => {
    if (!project) return;
    setLoading(true);
    try { setForms(await formsApi.list(project.name)); }
    catch { setForms([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadForms(); /* eslint-disable-next-line */ }, [project && project.id, project && project.name]);

  const proposals = useMemo(() => forms.filter((f) => f.kind === 'proposal'), [forms]);
  const handovers = useMemo(() => forms.filter((f) => f.kind === 'handover'), [forms]);
  const designs = useMemo(() => forms.filter((f) => f.kind === 'design'), [forms]);

  const defaultsFor = (kind) => kind === 'proposal' ? proposalDefaults(project) : kind === 'design' ? designDefaults(project) : handoverDefaults(project);

  // ── editor ──
  const openNew = (kind) => {
    setFormErr(''); setAttachErr(''); setPendingFiles([]); setEditFiles([]);
    setEditing({ kind, isNew: true, formId: undefined, data: defaultsFor(kind) });
  };
  const openEdit = (f) => {
    setFormErr(''); setAttachErr(''); setPendingFiles([]); setEditFiles([]);
    setEditing({ kind: f.kind, isNew: false, formId: f.formId, data: { ...defaultsFor(f.kind), ...(f.data || {}) } });
    formsApi.listFiles(f.formId).then((list) => setEditFiles(list || [])).catch(() => setEditFiles([]));
  };
  const close = () => { setEditing(null); setFormErr(''); setAttachErr(''); setPendingFiles([]); setEditFiles([]); };

  // ── in-editor attachments ──
  const onPickAttach = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; setAttachErr('');
    const good = [];
    for (const file of picked) { const err = validateFormFile(file); if (err) { setAttachErr(err); continue; } good.push({ file, key: Math.random().toString(36).slice(2) }); }
    if (good.length) setPendingFiles((prev) => [...prev, ...good]);
  };
  const removePending = (key) => setPendingFiles((prev) => prev.filter((x) => x.key !== key));
  const previewPending = (pf) => { const href = URL.createObjectURL(pf.file); window.open(href, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(href), 60000); };
  const removeSaved = async (fileId) => {
    if (!editing) return;
    setAttachBusy(true);
    try { await removeFormFile(editing.formId, fileId); const list = await formsApi.listFiles(editing.formId); setEditFiles(list || []); }
    catch (err) { setAttachErr(err.message || 'Could not remove the file.'); }
    finally { setAttachBusy(false); }
  };
  const setD = (k, v) => setEditing((e) => ({ ...e, data: { ...e.data, [k]: v } }));
  const setItem = (i, k, v) => setEditing((e) => ({ ...e, data: { ...e.data, items: e.data.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) } }));
  const addItem = () => setEditing((e) => ({ ...e, data: { ...e.data, items: [...e.data.items, e.kind === 'proposal' ? { description: '', specification: '', unit: '', qty: '', rate: '', amount: '' } : { description: '', qty: '', rate: '', amount: '' }] } }));
  const removeItem = (i) => setEditing((e) => ({ ...e, data: { ...e.data, items: e.data.items.length > 1 ? e.data.items.filter((_, idx) => idx !== i) : e.data.items } }));
  const setRow = (field, i, k, v) => setEditing((e) => ({ ...e, data: { ...e.data, [field]: e.data[field].map((it, idx) => idx === i ? { ...it, [k]: v } : it) } }));
  const addRow = (field) => setEditing((e) => ({ ...e, data: { ...e.data, [field]: [...(e.data[field] || []), { label: '', text: '' }] } }));
  const removeRow = (field, i) => setEditing((e) => ({ ...e, data: { ...e.data, [field]: e.data[field].filter((_, idx) => idx !== i) } }));

  const liveTotals = useMemo(() => {
    const d = editing ? editing.data : null;
    if (!d) return { total: 0, gst: 0, grand: 0, pct: 18 };
    const total = (d.items || []).reduce((s, it) => s + n(it.amount), 0);
    const pct = d.gstPct === '' || d.gstPct == null ? 18 : n(d.gstPct);
    const gst = total * pct / 100;
    return { total, gst, grand: total + gst, pct };
  }, [editing]);

  const submit = async () => {
    const { kind, data } = editing;
    const ref = kind === 'proposal' ? data.referenceCode : kind === 'design' ? (data.revision || '') : (data.proposalRef || data.proposalRefNo);
    const title = kind === 'proposal' ? (data.structure || data.subject) : kind === 'design' ? data.title : data.structureSummary;
    const date = kind === 'proposal' ? data.date : kind === 'design' ? data.date : data.dateOfOrder;
    if (kind === 'proposal' && !String(data.clientName || '').trim()) { setFormErr('Enter the client name.'); return; }
    if (kind === 'design' && !String(data.title || '').trim()) { setFormErr('Enter a design title.'); return; }
    const payload = {
      kind, project: project.name, projectId: project.id, projectCode: project.code || '',
      ref: ref || '', title: title || '', date: date || '', data,
    };
    setSaving(true);
    try {
      let formId = editing.formId;
      if (editing.isNew) { const created = await formsApi.create(payload); formId = created && created.formId; }
      else { await formsApi.update(editing.formId, payload); }
      // Upload any files attached in the editor, now that we have a form id.
      if (formId && pendingFiles.length) {
        for (const pf of pendingFiles) { try { await uploadFormFile(pf.file, formId, 'support'); } catch (e2) { setFormErr(`Saved, but "${pf.file.name}" could not be attached: ${e2.message}`); } }
      }
      await loadForms();
      if (formId) { try { await reloadFiles(formId); } catch { /* ignore */ } }
      close();
      toast(editing.isNew ? `${KIND_LABEL[kind]} created` : 'Form saved');
    } catch (e) { setFormErr(e.message || 'Could not save the form.'); }
    finally { setSaving(false); }
  };

  const doDelete = async (id) => {
    try { await formsApi.remove(id); await loadForms(); setConfirmDel(null); toast('Form deleted'); }
    catch (e) { toast(e.message || 'Could not delete.'); }
  };

  const downloadPdf = async (f) => {
    try {
      if (f.kind === 'proposal') await downloadProposalPdf(f.data || {});
      else await downloadHandoverPdf(f.data || {});
    } catch (e) { toast(e.message || 'Could not build the PDF.'); }
  };

  // ── files ──
  const toggleFiles = async (id) => {
    setFileErr('');
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!filesMap[id]) {
      try { const list = await formsApi.listFiles(id); setFilesMap((m) => ({ ...m, [id]: list })); }
      catch { setFilesMap((m) => ({ ...m, [id]: [] })); }
    }
  };
  const reloadFiles = async (id) => { try { const list = await formsApi.listFiles(id); setFilesMap((m) => ({ ...m, [id]: list })); } catch { /* ignore */ } };
  const onPick = async (id, category, e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setFileBusy(true); setFileErr('');
    try { for (const file of files) await uploadFormFile(file, id, category); await reloadFiles(id); toast('File uploaded'); }
    catch (err) { setFileErr(err.message || 'Upload failed.'); }
    finally { setFileBusy(false); }
  };
  const delFile = async (id, fileId) => {
    setFileBusy(true);
    try { await removeFormFile(id, fileId); await reloadFiles(id); }
    catch (err) { setFileErr(err.message || 'Could not remove.'); }
    finally { setFileBusy(false); }
  };

  const fileRow = (id, f) => (
    <div className="pf-file" key={f.fileId}>
      <span className={`pf-tag ${f.category !== 'support' ? 'done' : ''}`}>{f.category === 'completed' ? 'Completed form' : f.category === 'design' ? 'Design file' : 'Supporting'}</span>
      <span className="pf-fname" title={f.name}>{f.name}</span>
      <span className="pf-facts">
        <button type="button" className="link" onClick={() => openFormFile({ ...f, formId: id })}>View</button>
        <span className="dot">·</span>
        <button type="button" className="link" onClick={() => downloadFormFile({ ...f, formId: id })}>Download</button>
        <span className="dot">·</span>
        <button type="button" className="link danger" onClick={() => delFile(id, f.fileId)} disabled={fileBusy}>Remove</button>
      </span>
    </div>
  );

  const recordCard = (f) => {
    const files = filesMap[f.formId] || [];
    const open = openId === f.formId;
    const isDesign = f.kind === 'design';
    const subBits = isDesign ? [f.formId, f.data && f.data.designType ? (f.data.designType + ' design') : '', f.data && f.data.status, f.date] : [f.formId, f.ref, f.date];
    const primaryCat = isDesign ? 'design' : 'completed';
    const primaryLabel = isDesign ? 'Upload design file' : 'Upload completed form';
    return (
      <div className="pf-card" key={f.formId}>
        <div className="pf-top">
          <div className="pf-meta">
            <div className="pf-title">{f.title || f.ref || f.formId}</div>
            <div className="pf-sub">{subBits.filter(Boolean).join('  ·  ')}</div>
          </div>
          <div className="pf-acts">
            {!isDesign && <button className="btn" onClick={() => downloadPdf(f)}>Download PDF</button>}
            <button className="btn" onClick={() => openEdit(f)}>Edit</button>
            <button className="btn" onClick={() => toggleFiles(f.formId)}>{open ? 'Hide files' : `Files${files.length ? ` (${files.length})` : ''}`}</button>
            <button className="link danger" onClick={() => setConfirmDel(f.formId)} title="Delete">Delete</button>
          </div>
        </div>
        {confirmDel === f.formId && (
          <div className="confirm">Delete this form and its uploaded files permanently?
            <button className="btn danger" onClick={() => doDelete(f.formId)}>Delete</button>
            <button className="link" onClick={() => setConfirmDel(null)}>Cancel</button>
          </div>
        )}
        {open && (
          <div className="pf-files">
            <div className="pf-uprow">
              <label className="btn sm">{primaryLabel}
                <input type="file" multiple={isDesign} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip" hidden onChange={(e) => onPick(f.formId, primaryCat, e)} />
              </label>
              <label className="btn sm">+ Supporting document
                <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.zip" hidden onChange={(e) => onPick(f.formId, 'support', e)} />
              </label>
              {fileBusy && <span className="hint">Working…</span>}
            </div>
            {fileErr && <div className="err">{fileErr}</div>}
            {files.length === 0 ? <p className="hint" style={{ margin: '6px 0 0' }}>{isDesign ? 'No files uploaded yet. Upload the 2D / 3D design files and any supporting documents.' : 'No files uploaded yet. Upload the signed/completed form and any supporting documents.'}</p>
              : <div className="pf-filelist">{files.map((x) => fileRow(f.formId, x))}</div>}
          </div>
        )}
      </div>
    );
  };

  const block = (kind, list) => (
    <div className="card pd-card">
      <div className="pf-head">
        <h3>{KIND_LABEL[kind]}</h3>
        <button className="btn primary" onClick={() => openNew(kind)}>+ New {NEW_LABEL[kind]}</button>
      </div>
      {loading ? <p className="hint" style={{ margin: 0 }}>Loading…</p>
        : list.length === 0 ? <p className="hint" style={{ margin: 0 }}>No {EMPTY_LABEL[kind]} yet. Click "New" to create one — it will be prefilled from this project.</p>
          : <div className="pf-list">{list.map(recordCard)}</div>}
    </div>
  );

  return (
    <>
      {(section === 'all' || section === 'forms') && block('proposal', proposals)}
      {(section === 'all' || section === 'forms') && block('handover', handovers)}
      {(section === 'all' || section === 'design') && block('design', designs)}

      {editing && (
        <Drawer onClose={close}>
          <h3>{editing.isNew ? `New ${KIND_LABEL[editing.kind]}` : `Edit ${KIND_LABEL[editing.kind]}`}</h3>
          <p className="hint">For <b>{project.name}</b>{project.code ? ` · ${project.code}` : ''}. Fields are prefilled from the project — edit anything, then save and download the branded PDF.</p>

          {editing.kind === 'proposal' && (() => {
            const V = (x) => (x === 0 || x) ? x : '—';
            const YN = (b) => b ? 'Yes' : 'No';
            const groups = [
              ['Client Details', [['Client', V(project.client || project.billingName)], ['Contact', V(project.mobileNumber || project.contactDetails)], ['Email / WhatsApp', V(project.emailWhatsapp)], ['GSTIN', V(project.gstNumber)]]],
              ['Project Details', [['Project Name', V(project.name)], ['Project Code', V(project.code)], ['Location', V(project.projectLocation || project.siteAddress)], ['Project Type', V(project.typeOfProject)], ['Project Size', V(project.projectSize)]]],
              ['Scope of Work', [['2D Design', YN(project.design2D)], ['3D Design', YN(project.design3D)], ['Transportation', V(project.transportationScope)], ['Scaffolding', V(project.scaffoldingScope)], ['Material / Scope', V(project.materialDescription)], ['Lead Time', V(project.leadTimePromised)]]],
            ];
            return (
              <div className="pf-overview">
                <div className="pf-ov-title">Project Overview</div>
                {groups.map(([g, rows]) => (
                  <div key={g} className="pf-ov-group">
                    <div className="pf-ov-gh">{g}</div>
                    <div className="pf-ov-grid">
                      {rows.map(([k, v]) => (<div key={k} className="pf-ov-cell"><span className="pf-ov-k">{k}</span><span className="pf-ov-v">{v}</span></div>))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {editing.kind === 'proposal' ? <ProposalFields d={editing.data} setD={setD} setItem={setItem} addItem={addItem} removeItem={removeItem} setRow={setRow} addRow={addRow} removeRow={removeRow} totals={liveTotals} />
            : editing.kind === 'design' ? <DesignFields d={editing.data} setD={setD} />
              : <HandoverFields d={editing.data} setD={setD} setItem={setItem} addItem={addItem} removeItem={removeItem} totals={liveTotals} />}
          {editing.kind === 'design' && <p className="hint" style={{ marginTop: 8 }}>After saving, open <b>Files</b> on the record to upload the 2D / 3D design files and supporting documents.</p>}

          {editing.kind === 'proposal' && (
            <div className="pf-attach">
              <div className="pf-attach-head">
                <div className="pf-ov-title" style={{ margin: 0 }}>Attach Files</div>
                <label className="btn sm">Choose Files
                  <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx,.dwg,.dxf,.zip" hidden onChange={onPickAttach} />
                </label>
              </div>
              <p className="hint" style={{ margin: '4px 0 0' }}>PDF, Word, Excel, JPG, PNG and more — up to 12 MB each. Files are saved with the proposal and available when viewing or editing it.</p>
              {attachErr && <div className="err">{attachErr}</div>}
              {(pendingFiles.length > 0 || editFiles.length > 0) ? (
                <div className="pf-filelist" style={{ marginTop: 8 }}>
                  {editFiles.map((f) => (
                    <div className="pf-file" key={f.fileId}>
                      <span className="pf-tag done">Saved</span>
                      <span className="pf-fname" title={f.name}>{f.name}</span>
                      <span className="pf-facts">
                        <button type="button" className="link" onClick={() => openFormFile({ ...f, formId: editing.formId })}>Preview</button>
                        <span className="dot">·</span>
                        <button type="button" className="link" onClick={() => downloadFormFile({ ...f, formId: editing.formId })}>Download</button>
                        <span className="dot">·</span>
                        <button type="button" className="link danger" onClick={() => removeSaved(f.fileId)} disabled={attachBusy}>Remove</button>
                      </span>
                    </div>
                  ))}
                  {pendingFiles.map((pf) => (
                    <div className="pf-file" key={pf.key}>
                      <span className="pf-tag">New</span>
                      <span className="pf-fname" title={pf.file.name}>{pf.file.name} <span className="hint">({(pf.file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                      <span className="pf-facts">
                        <button type="button" className="link" onClick={() => previewPending(pf)}>Preview</button>
                        <span className="dot">·</span>
                        <button type="button" className="link danger" onClick={() => removePending(pf.key)}>Remove</button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="hint" style={{ margin: '6px 0 0' }}>No files attached yet.</p>}
            </div>
          )}

          {formErr && <div className="err">{formErr}</div>}
          <div className="actions">
            <div />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : editing.isNew ? 'Create form' : 'Save changes'}</button>
            </div>
          </div>
        </Drawer>
      )}

      <style>{`
        .pf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
        .pf-head h3{margin:0}
        .pf-list{display:flex;flex-direction:column;gap:10px}
        .pf-card{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface)}
        .pf-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .pf-title{font:700 14.5px var(--f-body);color:var(--fg)}
        .pf-sub{font-size:12px;color:var(--muted);margin-top:2px}
        .pf-acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .pf-files{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}
        .pf-uprow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .btn.sm{padding:6px 10px;font-size:12.5px;cursor:pointer}
        .pf-filelist{margin-top:8px;display:flex;flex-direction:column;gap:6px}
        .pf-file{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}
        .pf-tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 7px;border-radius:20px;background:var(--sunk,#eef2f7);color:var(--muted)}
        .pf-tag.done{background:var(--accent-soft);color:var(--accent-ink)}
        .pf-fname{flex:1;min-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pf-facts{display:flex;gap:6px;align-items:center}
        .pf-facts .dot{color:var(--muted)}
        .pfi-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-top:6px}
        .pf-items{border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:6px;background:var(--bg)}
        .pf-items .po-items-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .pf-irow{display:grid;gap:6px;align-items:start;margin-bottom:8px}
        .pf-irow.prop{grid-template-columns:1.4fr 1.4fr 70px 60px 80px 90px 26px}
        .pf-irow.hand{grid-template-columns:2fr 80px 90px 100px 26px}
        .pf-irow input,.pf-irow textarea{width:100%;box-sizing:border-box;font:400 12.5px var(--f-body);padding:6px 7px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--fg);outline:none;min-width:0}
        .pf-irow input:focus,.pf-irow textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
        .pf-del{width:24px;height:30px;border:1px solid var(--line);border-radius:7px;background:none;color:var(--bad);cursor:pointer;font-size:15px}
        .pf-tot{display:flex;gap:16px;flex-wrap:wrap;justify-content:flex-end;margin-top:6px;font-size:13px}
        .pf-tot b{font-variant-numeric:tabular-nums}
        .pf-srow{display:grid;grid-template-columns:150px 1fr 26px;gap:6px;align-items:start;margin-bottom:6px}
        .pf-srow input{width:100%;box-sizing:border-box;font:400 12.5px var(--f-body);padding:6px 7px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--fg);outline:none;min-width:0}
.pf-overview,.pf-attach{border:1px solid var(--line);border-radius:10px;padding:12px;margin:8px 0 14px;background:var(--bg)}
        .pf-ov-title{font:700 13px var(--f-body);text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:8px}
        .pf-ov-group{margin-bottom:8px}
        .pf-ov-gh{font:700 12px var(--f-body);color:var(--fg);margin:6px 0 4px}
        .pf-ov-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px}
        .pf-ov-cell{display:flex;flex-direction:column;min-width:0}
        .pf-ov-k{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
        .pf-ov-v{font-size:13px;color:var(--fg);word-break:break-word}
        .pf-attach-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
        @media (max-width:720px){.pf-irow.prop,.pf-irow.hand{grid-template-columns:1fr 1fr;}.pf-srow{grid-template-columns:1fr}.pf-ov-grid{grid-template-columns:1fr}}
      `}</style>
    </>
  );
}

// ── Proposal editor fields ──
function ProposalFields({ d, setD, setItem, addItem, removeItem, setRow, addRow, removeRow, totals }) {
  return (
    <>
      <div className="grid">
        <Field label="Client Name *"><input value={d.clientName} onChange={(e) => setD('clientName', e.target.value)} /></Field>
        <Field label="Reference Code"><input value={d.referenceCode} onChange={(e) => setD('referenceCode', e.target.value)} placeholder="e.g. TES/BBCL/03" /></Field>
        <Field label="Date"><input value={d.date} onChange={(e) => setD('date', e.target.value)} placeholder="07-JUL-2026" /></Field>
        <Field label="Location" full><input value={d.location} onChange={(e) => setD('location', e.target.value)} /></Field>
        <Field label="Structure" full><input value={d.structure} onChange={(e) => setD('structure', e.target.value)} /></Field>
        <Field label="Subject" full><input value={d.subject} onChange={(e) => setD('subject', e.target.value)} /></Field>
        <Field label="Intro paragraph" full><textarea rows={3} value={d.intro} onChange={(e) => setD('intro', e.target.value)} /></Field>
      </div>

      <div className="pf-items">
        <div className="po-items-head"><span>Cost Estimation</span><button type="button" className="link" onClick={addItem}>+ Add line</button></div>
        {d.items.map((it, i) => (
          <div key={i} className="pf-irow prop">
            <input placeholder="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
            <input placeholder="Specification" value={it.specification} onChange={(e) => setItem(i, 'specification', e.target.value)} />
            <input placeholder="Unit" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} />
            <input placeholder="Qty" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
            <input placeholder="Rate" value={it.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} />
            <input placeholder="Amount" value={it.amount} onChange={(e) => setItem(i, 'amount', e.target.value)} />
            {d.items.length > 1 ? <button type="button" className="pf-del" onClick={() => removeItem(i)}>×</button> : <span />}
          </div>
        ))}
        <div className="pf-tot">
          <span>GST %: <input style={{ width: 54, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', color: 'var(--fg)' }} value={d.gstPct} onChange={(e) => setD('gstPct', e.target.value)} /></span>
          <span>Total: <b>₹ {money(totals.total)}</b></span>
          <span>GST: <b>₹ {money(totals.gst)}</b></span>
          <span>Grand Total: <b>₹ {money(totals.grand)}</b></span>
        </div>
      </div>

      <div className="grid" style={{ marginTop: 10 }}>
        <Field label="Area basis (note)" full><input value={d.areaBasis} onChange={(e) => setD('areaBasis', e.target.value)} placeholder="e.g. 88.5 ft × 8 ft = 708 Sqft" /></Field>
      </div>

      <RowEditor title="Scope & Specifications" field="scope" rows={d.scope} setRow={setRow} addRow={addRow} removeRow={removeRow} />
      <RowEditor title="Payment Terms" field="paymentTerms" rows={d.paymentTerms} setRow={setRow} addRow={addRow} removeRow={removeRow} />

      <div className="grid" style={{ marginTop: 10 }}>
        <Field label="Proposal Validity (one point per line)" full><textarea rows={2} value={d.validity} onChange={(e) => setD('validity', e.target.value)} /></Field>
      </div>

      <div className="grid">
        <Field label="Bank Name"><input value={d.bank.name} onChange={(e) => setD('bank', { ...d.bank, name: e.target.value })} /></Field>
        <Field label="Account Holder"><input value={d.bank.holder} onChange={(e) => setD('bank', { ...d.bank, holder: e.target.value })} /></Field>
        <Field label="Account Number"><input value={d.bank.account} onChange={(e) => setD('bank', { ...d.bank, account: e.target.value })} /></Field>
        <Field label="IFSC Code"><input value={d.bank.ifsc} onChange={(e) => setD('bank', { ...d.bank, ifsc: e.target.value })} /></Field>
        <Field label="Branch"><input value={d.bank.branch} onChange={(e) => setD('bank', { ...d.bank, branch: e.target.value })} /></Field>
        <Field label="GSTIN"><input value={d.bank.gstin} onChange={(e) => setD('bank', { ...d.bank, gstin: e.target.value })} /></Field>
        <Field label="Signatory Name"><input value={d.signName} onChange={(e) => setD('signName', e.target.value)} /></Field>
        <Field label="Signatory Title"><input value={d.signTitle} onChange={(e) => setD('signTitle', e.target.value)} /></Field>
        <Field label="Signatory Mobile"><input value={d.signMobile} onChange={(e) => setD('signMobile', e.target.value)} /></Field>
      </div>
    </>
  );
}

function RowEditor({ title, field, rows, setRow, addRow, removeRow }) {
  return (
    <div className="pf-items" style={{ marginTop: 10 }}>
      <div className="po-items-head"><span>{title}</span><button type="button" className="link" onClick={() => addRow(field)}>+ Add</button></div>
      {(rows || []).map((r, i) => (
        <div key={i} className="pf-srow">
          <input placeholder="Label" value={r.label} onChange={(e) => setRow(field, i, 'label', e.target.value)} />
          <input placeholder="Text" value={r.text} onChange={(e) => setRow(field, i, 'text', e.target.value)} />
          <button type="button" className="pf-del" onClick={() => removeRow(field, i)}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Design editor fields ──
function DesignFields({ d, setD }) {
  return (
    <div className="grid">
      <Field label="Design Title *" full><input value={d.title || ''} onChange={(e) => setD('title', e.target.value)} placeholder="e.g. Terrace Polycarbonate — Design" /></Field>
      <Field label="Design Type">
        <select value={d.designType || '2D'} onChange={(e) => setD('designType', e.target.value)}>
          {DESIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <select value={d.status || 'In Progress'} onChange={(e) => setD('status', e.target.value)}>
          {['In Progress', 'Submitted to Client', 'Approved', 'Revision Required'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Date"><input value={d.date || ''} onChange={(e) => setD('date', e.target.value)} placeholder="07-JUL-2026" /></Field>
      <Field label="Designer / Prepared by"><input value={d.designer || ''} onChange={(e) => setD('designer', e.target.value)} /></Field>
      <Field label="Revision"><input value={d.revision || ''} onChange={(e) => setD('revision', e.target.value)} placeholder="e.g. R0, R1" /></Field>
      <Field label="Notes" full><textarea rows={3} value={d.notes || ''} onChange={(e) => setD('notes', e.target.value)} placeholder="Scope of the design, what's included, any remarks…" /></Field>
    </div>
  );
}

// ── Handover editor fields ──
function HandoverFields({ d, setD, setItem, addItem, removeItem, totals }) {
  const F = (k, label, props = {}) => <Field label={label} full={props.full}><input value={d[k] || ''} onChange={(e) => setD(k, e.target.value)} placeholder={props.ph} /></Field>;
  return (
    <>
      <div className="grid">
        {F('projectName', 'Project Name', { full: true })}
        {F('structureSummary', 'Structure Summary', { full: true })}
        {F('proposalRef', 'Proposal Ref')}
        {F('purchaseOrder', 'Purchase Order', { ph: 'e.g. PO 7069' })}
      </div>

      <div className="po-items-head" style={{ margin: '12px 0 2px' }}><span>1. Client &amp; Project Details</span></div>
      <div className="grid">
        {F('clientName', 'Client Name')}
        {F('contactDetails', 'Contact Details (Phone / Email)')}
        {F('projectLocation', 'Project Location', { full: true })}
        {F('billingName', 'Billing Name')}
        {F('mobileNumber', 'Mobile Number')}
        {F('altMobile', 'Alternate Mobile Number')}
        {F('gstNumber', 'GST Number')}
        <Field label="Site Address" full><textarea rows={2} value={d.siteAddress || ''} onChange={(e) => setD('siteAddress', e.target.value)} /></Field>
        <Field label="Billing Address" full><textarea rows={2} value={d.billingAddress || ''} onChange={(e) => setD('billingAddress', e.target.value)} /></Field>
        <Field label="Email ID / WhatsApp Number" full><textarea rows={2} value={d.emailWhatsapp || ''} onChange={(e) => setD('emailWhatsapp', e.target.value)} /></Field>
        {F('salespersonName', 'Salesperson Name')}
        {F('dateOfOrder', 'Date of Order')}
        {F('proposalRefNo', 'Proposal Ref No.')}
      </div>

      <div className="po-items-head" style={{ margin: '12px 0 2px' }}><span>2. Scope of Work</span></div>
      <div className="grid">
        {F('typeOfProject', 'Type of Project', { full: true })}
        {F('projectSize', 'Project Size / Area')}
        {F('design3D', '3D Design')}
        {F('design2D', '2D Design')}
        {F('transportationScope', 'Transportation – Client Scope')}
        {F('scaffoldingScope', 'Scaffolding – Client Scope')}
      </div>

      <div className="po-items-head" style={{ margin: '12px 0 2px' }}><span>3. Timeline &amp; Delivery Commitment</span></div>
      <div className="grid">
        {F('tentativeStartDate', 'Tentative Start Date')}
        {F('tentativeCompletionDate', 'Tentative Completion Date')}
        {F('leadTimePromised', 'Lead Time Promised', { full: true })}
      </div>

      <div className="po-items-head" style={{ margin: '12px 0 2px' }}><span>4. Pricing &amp; Payment Terms</span></div>
      <div className="grid"><Field label="PO-ted Price"><input value={d.potedPrice || ''} onChange={(e) => setD('potedPrice', e.target.value)} placeholder="Yes / No" /></Field></div>
      <div className="pf-items">
        <div className="po-items-head"><span>Pricing lines</span><button type="button" className="link" onClick={addItem}>+ Add line</button></div>
        {d.items.map((it, i) => (
          <div key={i} className="pf-irow hand">
            <input placeholder="Description" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
            <input placeholder="Qty" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
            <input placeholder="Rate" value={it.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} />
            <input placeholder="Amount" value={it.amount} onChange={(e) => setItem(i, 'amount', e.target.value)} />
            {d.items.length > 1 ? <button type="button" className="pf-del" onClick={() => removeItem(i)}>×</button> : <span />}
          </div>
        ))}
        <div className="pf-tot">
          <span>GST %: <input style={{ width: 54, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', color: 'var(--fg)' }} value={d.gstPct} onChange={(e) => setD('gstPct', e.target.value)} /></span>
          <span>Total: <b>₹ {money(totals.total)}</b></span>
          <span>GST: <b>₹ {money(totals.gst)}</b></span>
          <span>Grand Total: <b>₹ {money(totals.grand)}</b></span>
        </div>
      </div>
      <div className="grid" style={{ marginTop: 10 }}>
        <Field label="Payment Schedule (one point per line)" full><textarea rows={3} value={d.paymentSchedule || ''} onChange={(e) => setD('paymentSchedule', e.target.value)} /></Field>
        <Field label="Alternate payment terms (if not applicable)" full><input value={d.alternateTerms || ''} onChange={(e) => setD('alternateTerms', e.target.value)} /></Field>
      </div>

      <div className="po-items-head" style={{ margin: '12px 0 2px' }}><span>5. Site Engineer Visit Completed</span></div>
      <div className="grid">
        {F('siteEngineerSign', 'Site Engineer Sign (name)')}
        {F('salespersonSign', 'Salesperson Sign (name)')}
        {F('salespersonTitle', 'Salesperson Title')}
        <Field label="Confirmation statement" full><textarea rows={3} value={d.confirmationStatement || ''} onChange={(e) => setD('confirmationStatement', e.target.value)} /></Field>
      </div>
    </>
  );
}
