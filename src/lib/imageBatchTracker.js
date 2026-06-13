/** Shared state for Apollo image batches — survives wizard close / tab switches. */

let activeBatch = null;
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
  emit();
  return activeBatch.id;
}

export function updateImageBatch(patch) {
  if (!activeBatch || activeBatch.status !== 'running') return;
  activeBatch = { ...activeBatch, ...patch };
  emit();
}

export function finishImageBatch({ aborted = false } = {}) {
  if (!activeBatch) return;
  activeBatch = {
    ...activeBatch,
    status: aborted ? 'cancelled' : 'complete',
    finishedAt: Date.now(),
  };
  emit();
}

export function dismissImageBatch() {
  activeBatch = null;
  emit();
}
