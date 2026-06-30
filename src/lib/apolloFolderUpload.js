import { compressImage } from './products';
import { isImageFile } from './parseIntakeFilename';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Scan folder filenames against catalogue (title, price, SOH). */
export async function scanFolderFilenames(files) {
  const imageFiles = [...(files || [])].filter(isImageFile);
  if (!imageFiles.length) {
    throw new Error('No image files found in that folder.');
  }

  const res = await fetch('/api/product-loader-batch-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filenames: imageFiles.map((f) => f.name) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Folder scan failed');

  const fileByName = new Map(imageFiles.map((f) => [f.name, f]));
  return (json.items || []).map((item) => {
    const file = fileByName.get(item.filename) || null;
    const previewUrl = file ? URL.createObjectURL(file) : '';
    const websiteRow = item.websiteRow || null;
    const sqlRow = item.sqlRow || null;
    const sku = websiteRow?.sku || item.code || '';
    const title = String(item.title || websiteRow?.title || sqlRow?.title || item.displayCode || '').trim();
    const price = Number(item.price ?? websiteRow?.price ?? sqlRow?.price ?? 0);
    const stockQty = sqlRow?.onhand ?? websiteRow?.stock_qty;
    const available = sqlRow?.available ?? websiteRow?.available_stock ?? websiteRow?.stock_qty;
    const isLive = Boolean(websiteRow?.sku);
    const warnings = [...(item.warnings || [])];
    if (!isLive) warnings.push('not_live');

    return {
      filename: item.filename,
      code: item.code || '',
      displayCode: item.displayCode || item.code || '',
      sku,
      title,
      price,
      stockQty,
      available,
      imageSlot: item.imageSlot || 1,
      matchedBy: item.matchedBy,
      warnings,
      isLive,
      canSelect: isLive,
      file,
      previewUrl,
      websiteRow,
      sqlRow,
    };
  });
}

export function formatFolderStock(item) {
  const available = item?.available;
  if (available == null || Number.isNaN(Number(available))) return '—';
  return String(available);
}

export function formatFolderPrice(price) {
  const n = Number(price);
  if (!n) return 'R0.00';
  return `R${n.toFixed(2)}`;
}

/** Upload one folder source image to storage for image-gen pipeline. */
export async function uploadFolderSourceImage(file) {
  if (!file) throw new Error('No image file');
  const blob = await compressImage(file);
  const base64 = await fileToBase64(blob);
  const res = await fetch('/api/upload-reference-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, contentType: 'image/jpeg' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Upload failed');
  return json.url;
}

/** Upload all folder sources for selected SKUs; returns { [sku]: url }. */
export async function uploadFolderSources(items, { onProgress } = {}) {
  const bySku = new Map();
  for (const item of items) {
    if (!item?.sku || !item.file) continue;
    if (!bySku.has(item.sku)) bySku.set(item.sku, item);
  }

  const entries = [...bySku.entries()];
  const urls = {};
  for (let i = 0; i < entries.length; i += 1) {
    const [sku, item] = entries[i];
    onProgress?.({ done: i, total: entries.length, sku, filename: item.filename });
    urls[sku] = await uploadFolderSourceImage(item.file);
  }
  onProgress?.({ done: entries.length, total: entries.length });
  return urls;
}

export function revokeFolderPreviewUrls(items) {
  for (const item of items || []) {
    if (item?.previewUrl?.startsWith('blob:')) {
      try { URL.revokeObjectURL(item.previewUrl); } catch { /* ignore */ }
    }
  }
}
