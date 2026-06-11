const KEY_STORAGE = 'proto_admin_key';

export function getStoredAdminKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

export function storeAdminKey(key) {
  try { localStorage.setItem(KEY_STORAGE, key); } catch {}
}

export function clearAdminKey() {
  try { localStorage.removeItem(KEY_STORAGE); } catch {}
}

export async function verifyAdminKey(key) {
  const res = await fetch('/api/auth-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
  });
  return res.ok;
}

/**
 * Patches window.fetch so every same-origin /api/ call carries:
 *  - x-admin-key (dashboard key, when stored)
 *  - x-order-id + x-order-token (fulfillment links: /fulfillment?id=...&k=...)
 * Call once at startup.
 */
export function installAuthFetch() {
  if (window.__protoAuthFetchInstalled) return;
  window.__protoAuthFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isApiCall = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    if (!isApiCall) return originalFetch(input, init);

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});

    const adminKey = getStoredAdminKey();
    if (adminKey && !headers.has('x-admin-key')) headers.set('x-admin-key', adminKey);

    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    const orderTokenValue = params.get('k');
    if (orderId && orderTokenValue) {
      if (!headers.has('x-order-id')) headers.set('x-order-id', orderId);
      if (!headers.has('x-order-token')) headers.set('x-order-token', orderTokenValue);
    }

    return originalFetch(input, { ...init, headers });
  };
}
