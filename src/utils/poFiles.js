// PO attachments — many files per PO, stored in our own backend (purchase_files).
// Browser reads each file, base64-encodes it, and POSTs to /api/files/:po. Viewing and
// downloading fetch the bytes back WITH the auth token as a blob.
import { filesApi } from '../api/client';

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — fits inside a single Mongo document
const ALLOWED_EXT = /\.(pdf|jpe?g|png|xls|xlsx)$/i;

export const newFileId = () => 'F' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('Could not read the file.'));
  fr.onload = () => resolve(String(fr.result || '').split(',').pop());
  fr.readAsDataURL(file);
});

// Returns '' when valid, else an error message. Allowed: PDF, JPG, JPEG, PNG, Excel.
export function validatePoFile(file) {
  if (!file) return 'No file selected.';
  if (!ALLOWED_EXT.test(file.name || '')) return `"${file.name}" is not a supported type. Use PDF, JPG, JPEG, PNG or Excel.`;
  if (file.size > MAX_BYTES) return `"${file.name}" is larger than 12 MB.`;
  return '';
}

// Upload one file for a PO. Returns its saved metadata.
export async function uploadPoFile(file, po, fileId) {
  const err = validatePoFile(file);
  if (err) throw new Error(err);
  const poKey = String(po || '').trim();
  if (!poKey) throw new Error('Enter the PO number first, then attach files.');
  const id = fileId || newFileId();
  const dataBase64 = await readAsBase64(file);
  await filesApi.put(poKey, { fileId: id, name: file.name, type: file.type || '', size: file.size, dataBase64 });
  return { fileId: id, name: file.name, type: file.type || '', size: file.size, po: poKey };
}

export async function openPoFile(f) {
  if (!f) return;
  try {
    const blob = await filesApi.blob(f.po, f.fileId, { download: false });
    const href = URL.createObjectURL(blob);
    window.open(href, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  } catch { /* ignore */ }
}

export async function downloadPoFile(f) {
  if (!f) return;
  try {
    const blob = await filesApi.blob(f.po, f.fileId, { download: true });
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

export async function removePoFile(po, fileId) {
  try { if (po && fileId) await filesApi.remove(po, fileId); } catch { /* ignore */ }
}
