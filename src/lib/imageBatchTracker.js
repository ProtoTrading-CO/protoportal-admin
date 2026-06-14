/** Shared state for Apollo image batches — survives wizard close / tab switches. */

const STORAGE_KEY = 'proto_active_image_batch';

function loadStoredBatch() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function persistBatch(batch) {
  try {
    if (batch) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(batch));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* quota */ }
}

let activeBatch = loadStoredBatch();
const listeners = new Set();

export function getActiveImageBatch() {
  return activeBatch;
}

export function subscribeImageBatch(fn) {
  listeners.add(fn);
  fn(activeBatch);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(activeBatch); } catch { /* ignore */ }
  }
}

export function startImageBatch({ total = 0, style = '', productCount = 0 } = {}) {
  activeBatch = {
    id: Date.now(),
    status: 'running',
    total,
    done: 0,
    failed: 0,
    currentSku: '',
    currentLabel: '',
    style,
    productCount,
    startedAt: Date.now(),
  };
  persistBatch(activeBatch);
  emit();
  return activeBatch.id;
}

export function updateImageBatch(patch) {
  if (!activeBatch || activeBatch.status !== 'running') return;
  activeBatch = { ...activeBatch, ...patch };
  persistBatch(activeBatch);
  emit();
}

export function finishImageBatch({ aborted = false } = {}) {
  if (!activeBatch) return;
  activeBatch = {
    ...activeBatch,
    status: aborted ? 'cancelled' : 'complete',
    finishedAt: Date.now(),
  };
  persistBatch(activeBatch);
  emit();
}

export function dismissImageBatch() {
  activeBatch = null;
  persistBatch(null);
  emit();
}
