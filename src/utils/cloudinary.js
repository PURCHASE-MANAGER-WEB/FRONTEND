// Direct-to-Cloudinary unsigned upload — the SAME pattern the rest of the CRM
// uses (see CLOUDINARY_SETUP.md). Files go straight from the browser to
// Cloudinary; nothing passes through the backend, and no secret is exposed.
//
// Requires two public env vars on the frontend (and on Vercel):
//   VITE_CLOUDINARY_CLOUD_NAME
//   VITE_CLOUDINARY_UPLOAD_PRESET   (an UNSIGNED preset)

const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const cloudinaryReady = () => !!(CLOUD && PRESET);

// Download a file (e.g. an invoice) to the device, preserving its filename. Fetches the
// bytes and saves them, so it works for Cloudinary RAW delivery URLs (new uploads). If the
// URL is blocked (an OLDER invoice stored as an image-type PDF returns 401 until it's
// re-uploaded, or PDF delivery is enabled in Cloudinary), it falls back to opening the URL.
export async function downloadFile(url, filename = 'invoice.pdf') {
  if (!url) return false;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('blocked');
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename || 'invoice.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
    return true;
  } catch {
    window.open(url, '_blank', 'noopener');
    return false;
  }
}

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// Upload a single PDF invoice. Returns the attachment object to save on the PO.
export async function uploadInvoice(file) {
  if (!cloudinaryReady()) {
    throw new Error('File upload is not set up yet. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET, then redeploy.');
  }
  if (!file) throw new Error('No file selected.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) throw new Error('Please choose a PDF file.');
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 15 MB. Please upload a smaller PDF.');

  // Upload to a given resource-type endpoint with a fresh FormData each time.
  const post = async (kind) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', PRESET);
    let res;
    try {
      res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${kind}/upload`, { method: 'POST', body: fd });
    } catch {
      throw new Error('Could not reach the file server. Check your connection and try again.');
    }
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, body };
  };

  // Prefer the RAW endpoint: a PDF uploaded as "raw" is delivered from /raw/upload/…
  // and is NOT subject to Cloudinary's "allow PDF/ZIP delivery" account restriction,
  // which otherwise returns 401 "deny or ACL failure" when the invoice link is opened.
  // Fall back to auto (image) if the preset rejects raw, so uploads never break.
  let out = await post('raw');
  if (!out.ok) out = await post('auto');
  if (!out.ok) throw new Error(out.body?.error?.message || 'Upload failed. Please try again.');
  const data = out.body;

  return {
    url: data.secure_url,
    publicId: data.public_id,
    name: file.name,
    type: file.type || 'application/pdf',
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}
