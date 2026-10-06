// Invoice storage — kept in the Purchase Manager's OWN backend (MongoDB), NOT Cloudinary.
// The browser reads the PDF, base64-encodes it, and PUTs it to /api/invoices/:po. Viewing
// and downloading fetch the bytes back WITH the auth token as a blob, so it works no matter
// what third-party delivery restrictions exist. (File kept at this path so existing imports
// don't need to change.)
import { invoicesApi } from '../api/client';

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — fits inside a single Mongo document

// Kept for backward compatibility with any caller: storage is always available now.
export const cloudinaryReady = () => true;

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('Could not read the file.'));
  fr.onload = () => resolve(String(fr.result || '').split(',').pop());
  fr.readAsDataURL(file);
});

// Upload one PDF invoice for a PO. Returns the small metadata object saved on the PO lines.
export async function uploadInvoice(file, po) {
  if (!file) throw new Error('No file selected.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) throw new Error('Please choose a PDF file.');
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 12 MB. Please upload a smaller PDF.');
  const poKey = String(po || '').trim();
  if (!poKey) throw new Error('Enter the PO number first, then attach the invoice.');
  const dataBase64 = await readAsBase64(file);
  await invoicesApi.put(poKey, { name: file.name, type: file.type || 'application/pdf', size: file.size, dataBase64 });
  return {
    name: file.name,
    type: file.type || 'application/pdf',
    size: file.size,
    stored: 'db',
    po: poKey,
    uploadedAt: new Date().toISOString(),
  };
}

// Fetch the right blob for an invoice: new ones live in our DB (inv.po / inv.stored==='db');
// older ones may still carry a legacy Cloudinary inv.url.
async function invoiceBlob(inv, download) {
  if (inv && inv.po && !inv.url) return invoicesApi.blob(inv.po, { download });
  const res = await fetch(inv.url);
  if (!res.ok) throw new Error('blocked');
  return res.blob();
}

// Open the invoice inline in a new tab (PDF viewer).
export async function openInvoice(inv) {
  if (!inv) return;
  try {
    const blob = await invoiceBlob(inv, false);
    const href = URL.createObjectURL(blob);
    window.open(href, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  } catch {
    if (inv.url) window.open(inv.url, '_blank', 'noopener');
  }
}

// Save the invoice to the device, preserving its filename.
export async function downloadInvoice(inv) {
  if (!inv) return;
  try {
    const blob = await invoiceBlob(inv, true);
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = inv.name || 'invoice.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  } catch {
    if (inv.url) window.open(inv.url, '_blank', 'noopener');
  }
}

// Backward-compat shim for any remaining caller that passes a raw URL.
export async function downloadFile(url, filename = 'invoice.pdf') {
  return downloadInvoice({ url, name: filename });
}

// Remove the stored invoice for a PO (best-effort).
export async function removeInvoice(po) {
  try { if (po) await invoicesApi.remove(po); } catch { /* ignore */ }
}
