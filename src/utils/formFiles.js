// Uploaded files for Proposal/Handover form records — completed/signed forms and
// supporting documents, stored in our own backend (purchase_form_files). The browser
// reads each file, base64-encodes it, and POSTs to /api/forms/:id/files. Viewing and
// downloading fetch the bytes back WITH the auth token as a blob.
import { formsApi } from '../api/client';

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — fits inside a single Mongo document
const ALLOWED_EXT = /\.(pdf|jpe?g|png|xls|xlsx|doc|docx)$/i;

export const newFormFileId = () => 'FF' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('Could not read the file.'));
  fr.onload = () => resolve(String(fr.result || '').split(',').pop());
  fr.readAsDataURL(file);
});

// Returns '' when valid, else an error message. Allowed: PDF, JPG, JPEG, PNG, Word, Excel.
export function validateFormFile(file) {
  if (!file) return 'No file selected.';
  if (!ALLOWED_EXT.test(file.name || '')) return `"${file.name}" is not a supported type. Use PDF, JPG, JPEG, PNG, Word or Excel.`;
  if (file.size > MAX_BYTES) return `"${file.name}" is larger than 12 MB.`;
  return '';
}

// Upload one file for a form record. category: 'completed' | 'support'.
export async function uploadFormFile(file, formId, category = 'support', fileId) {
  const err = validateFormFile(file);
  if (err) throw new Error(err);
  const id = String(formId || '').trim();
  if (!id) throw new Error('Save the form first, then attach files.');
  const fid = fileId || newFormFileId();
  const dataBase64 = await readAsBase64(file);
  await formsApi.putFile(id, { fileId: fid, category, name: file.name, type: file.type || '', size: file.size, dataBase64 });
  return { fileId: fid, category, name: file.name, type: file.type || '', size: file.size, formId: id };
}

export async function openFormFile(f) {
  if (!f) return;
  try {
    const blob = await formsApi.fileBlob(f.formId, f.fileId, { download: false });
    const href = URL.createObjectURL(blob);
    window.open(href, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  } catch { /* ignore */ }
}

export async function downloadFormFile(f) {
  if (!f) return;
  try {
    const blob = await formsApi.fileBlob(f.formId, f.fileId, { download: true });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = f.name || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  } catch { /* ignore */ }
}

export async function removeFormFile(formId, fileId) {
  try { if (formId && fileId) await formsApi.removeFile(formId, fileId); } catch { /* ignore */ }
}
