const OPERATOR_KEY = 'proto_image_gen_operator';

/** Stable label for this browser — shown in cost tracking when multiple admins use Apollo. */
export function getImageGenOperator() {
  try {
    let id = localStorage.getItem(OPERATOR_KEY);
    if (!id) {
      id = `User-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      localStorage.setItem(OPERATOR_KEY, id);
    }
    return id;
  } catch {
    return 'User-LOCAL';
  }
}

export function setImageGenOperator(name) {
  const trimmed = String(name || '').trim().slice(0, 64);
  if (!trimmed) return getImageGenOperator();
  try { localStorage.setItem(OPERATOR_KEY, trimmed); } catch { /* ignore */ }
  return trimmed;
}

export function createImageGenBatchId() {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function imageGenHeaders(batchId) {
  const headers = {
    'Content-Type': 'application/json',
    'x-image-gen-operator': getImageGenOperator(),
  };
  if (batchId) headers['x-image-gen-batch-id'] = batchId;
  return headers;
}

export async function registerImageGenBatch({ batchId, total, style, productCount }) {
  try {
    await fetch('/api/image-gen-costs', {
      method: 'POST',
      headers: imageGenHeaders(),
      body: JSON.stringify({
        action: 'registerBatch',
        batchId,
        operator: getImageGenOperator(),
        total,
        style,
        productCount,
      }),
    });
  } catch { /* non-fatal */ }
}

export async function syncImageGenBatchProgress(batchId, { done, failed, status } = {}) {
  if (!batchId) return;
  try {
    await fetch('/api/image-gen-costs', {
      method: 'POST',
      headers: imageGenHeaders(),
      body: JSON.stringify({
        action: 'updateBatch',
        batchId,
        done,
        failed,
        status,
      }),
    });
  } catch { /* non-fatal */ }
}
