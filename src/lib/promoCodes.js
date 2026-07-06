export async function fetchPromoCodes({ force = false } = {}) {
  const res = await fetch('/api/promo-codes', { cache: force ? 'no-store' : 'default' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load promo codes');
  return {
    codes: Array.isArray(json.codes) ? json.codes : [],
    updatedAt: json.updatedAt || null,
  };
}

export async function savePromoCodes(codes) {
  const res = await fetch('/api/promo-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to save promo codes');
  return {
    codes: json.codes || codes,
    updatedAt: json.updatedAt || new Date().toISOString(),
  };
}

export function emptyPromoCode() {
  return {
    code: '',
    discountPct: 0,
    active: true,
    expiresAt: '',
    minOrder: 0,
    label: '',
  };
}
