import { ok } from '../../query-engine/envelope.js';
import { mergeMeta } from '../shared/format.js';

export function firstImage(url) {
  return String(url || '').split(',')[0].trim() || null;
}

export function readStock(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function daysSince(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

export function contextEnvelope(type, context, meta, intent) {
  return ok({ type, ...context }, meta, intent);
}

export function mergeContextMeta(envelopes) {
  return mergeMeta(envelopes.filter(Boolean));
}
