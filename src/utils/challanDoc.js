// Delivery-challan document helpers. Documents are stored in our own backend
// (base64 in the challan record) and fetched back with the auth token, mirroring
// how invoices are handled — so view/download work regardless of third-party limits.
import { challansApi } from '../api/client';

export const DOC_MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export const readFileBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('Could not read the file.'));
  fr.onload = () => resolve(String(fr.result || '').split(',').pop());
  fr.readAsDataURL(file);
});

function b64toBlob(b64, type) {
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: type || 'application/octet-stream' });
}

export async function openChallanDoc(id) {
  const d = await challansApi.doc(id);
  const href = URL.createObjectURL(b64toBlob(d.dataBase64, d.type));
  window.open(href, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

export async function downloadChallanDoc(id, fallbackName) {
  const d = await challansApi.doc(id);
  const href = URL.createObjectURL(b64toBlob(d.dataBase64, d.type));
  const a = document.createElement('a');
  a.href = href; a.download = d.name || fallbackName || 'challan';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}
