/**
 * Shared promo code normalization + validation (API + smoke tests).
 */

export function normalizePromoCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

export function normalizePromoCodes(rawCodes) {
  const seen = new Set();
  const codes = [];
  for (const row of rawCodes || []) {
    const code = normalizePromoCode(row?.code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push({
      code,
      discountPct: Math.min(100, Math.max(0, Number(row?.discountPct) || 0)),
      active: row?.active !== false,
      expiresAt: row?.expiresAt ? String(row.expiresAt) : null,
      minOrder: Math.max(0, Number(row?.minOrder) || 0),
      label: String(row?.label || '').trim() || `${Number(row?.discountPct) || 0}% off`,
    });
  }
  return codes;
}

export function validatePromoEntry(entry, { code, orderTotal = 0 } = {}) {
  const normalized = normalizePromoCode(code);
  if (!normalized) {
    return { valid: false, error: 'Promo code required' };
  }
  const match = (entry?.codes || []).find((row) => normalizePromoCode(row.code) === normalized);
  if (!match) {
    return { valid: false, error: 'Invalid promo code' };
  }
  if (!match.active) {
    return { valid: false, error: 'This promo code is not active' };
  }
  if (match.expiresAt) {
    const expires = new Date(match.expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
      return { valid: false, error: 'This promo code has expired' };
    }
  }
  const total = Number(orderTotal) || 0;
  if (match.minOrder > 0 && total < match.minOrder) {
    return {
      valid: false,
      error: `Minimum order of R${match.minOrder.toLocaleString('en-ZA')} required`,
    };
  }
  return {
    valid: true,
    code: match.code,
    discountPct: match.discountPct,
    label: match.label,
    minOrder: match.minOrder,
  };
}
