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

  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', PRESET);

  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`, { method: 'POST', body: fd });
  } catch {
    throw new Error('Could not reach the file server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'Upload failed. Please try again.');

  return {
    url: data.secure_url,
    publicId: data.public_id,
    name: file.name,
    type: file.type || 'application/pdf',
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}
