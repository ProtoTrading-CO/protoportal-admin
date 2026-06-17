/**
 * Patches window.fetch for fulfillment order links (/f/<orderId>/<token>).
 * Dashboard login was removed — no admin key is stored or sent.
 */
export function getOrderAccessFromUrl() {
  try {
    const path = window.location.pathname || '';
    const match = path.match(/^\/f\/([^/]+)\/([^/]+)\/?$/);
    if (match) return { orderId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) };
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('o') || params.get('id') || '';
    const token = params.get('k') || '';
    if (orderId) return { orderId, token };
  } catch {}
  return { orderId: '', token: '' };
}

export function installAuthFetch() {
  if (window.__protoAuthFetchInstalled) return;
  window.__protoAuthFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isApiCall = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    if (!isApiCall) return originalFetch(input, init);

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
    const { orderId, token } = getOrderAccessFromUrl();
    if (orderId && !headers.has('x-order-id')) headers.set('x-order-id', orderId);
    if (token && !headers.has('x-order-token')) headers.set('x-order-token', token);

    return originalFetch(input, { ...init, headers });
  };
}
