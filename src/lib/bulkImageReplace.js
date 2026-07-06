import { parseIntakeFilename, isImageFile } from './parseIntakeFilename';
import { compressImage } from './products';
import { readApiJson } from './apiError';

export const BULK_IMAGE_REPLACE_MAX = 500;
export const CLIENT_REQUEST_BATCH = 8;

export function slotFilenameExample(sku, slot) {
  const s = String(sku || 'BASHEWS').trim().toUpperCase();
  if (slot === 1) return `${s}.jpg`;
  return `${s}-${slot}.jpg`;
}

export function catalogRowToSelection(row) {
  const images = row.images || [];
  return {
    sku: row.sku,
    title: row.title || row.name || row.sku,
    images: [
      images[0] || row.image || '',
      images[1] || '',
      images[2] || '',
      images[3] || '',
    ],
  };
}

/** Match folder files to selected SKUs for a single slot. */
export function buildPreflightMatch(selectedProducts, slot, fileList) {
  const selectedBySku = new Map(
    (selectedProducts || []).map((p) => [String(p.sku).trim().toUpperCase(), p]),
  );
  const selectedSkuSet = new Set(selectedBySku.keys());

  const ready = [];
  const wrongSlot = [];
  const extra = [];
  const invalid = [];
  const matchedSkus = new Set();

  for (const file of fileList || []) {
    if (!isImageFile(file)) continue;
    const parsed = parseIntakeFilename(file.name);
    const sku = parsed.sourceSku;
    if (!sku || parsed.parseError) {
      invalid.push({ file, reason: parsed.parseError || 'invalid' });
      continue;
    }
    if (parsed.imageNumber !== slot) {
      wrongSlot.push({ file, sku, fileSlot: parsed.imageNumber });
      continue;
    }
    if (!selectedSkuSet.has(sku)) {
      extra.push({ file, sku });
      continue;
    }
    matchedSkus.add(sku);
    ready.push({
      file,
      sku,
      product: selectedBySku.get(sku),
    });
  }

  const missing = [];
  for (const sku of selectedSkuSet) {
    if (!matchedSkus.has(sku)) {
      missing.push(selectedBySku.get(sku));
    }
  }

  return {
    ready,
    missing,
    wrongSlot,
    extra,
    invalid,
    readyCount: ready.length,
    missingCount: missing.length,
  };
}

export async function preflightSkus(skus, slot, scope = 'live') {
  const res = await fetch('/api/bulk-image-replace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'preflight',
      slot,
      scope,
      allowedSkus: skus,
    }),
  });
  return readApiJson(res, { fallback: 'Preflight failed' });
}

async function fileToBase64Blob(file) {
  const compressed = await compressImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}

export async function replaceBatch({
  slot,
  scope = 'live',
  allowedSkus,
  readyItems,
  onProgress,
  abortRef,
}) {
  const results = [];
  let done = 0;
  const total = readyItems.length;

  for (let i = 0; i < readyItems.length; i += CLIENT_REQUEST_BATCH) {
    if (abortRef?.current) break;
    const chunk = readyItems.slice(i, i + CLIENT_REQUEST_BATCH);
    onProgress?.({ done, total, phase: 'uploading' });

    const items = await Promise.all(chunk.map(async ({ file, sku }) => ({
      sku,
      filename: file.name,
      contentType: 'image/jpeg',
      base64: await fileToBase64Blob(file),
    })));

    if (abortRef?.current) break;

    const res = await fetch('/api/bulk-image-replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'replace',
        slot,
        scope,
        allowedSkus,
        items,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 207) {
      for (const row of chunk) {
        results.push({ sku: row.sku, ok: false, error: json.error || 'Batch failed' });
      }
    } else {
      for (const row of json.results || []) {
        results.push(row);
      }
    }

    done += chunk.length;
    onProgress?.({ done, total, phase: 'uploading' });
  }

  return results;
}

export function downloadFailedCsv(results) {
  const failed = (results || []).filter((r) => !r.ok);
  if (!failed.length) return;
  const lines = ['sku,error', ...failed.map((r) => `${r.sku},"${String(r.error || '').replace(/"/g, '""')}"`)];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `image-replace-failed-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
