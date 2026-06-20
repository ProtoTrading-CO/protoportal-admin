/**
 * Patches window.fetch for admin JWT + fulfillment order links (/f/<orderId>/<token>).
 */
import { supabase } from './supabase';

export function getOrderAccessFromUrl() {
  try {
    const path = window.location.pathname || '';
    const match = path.match(/^\/f\/([^/]+)\/([^/]+)\/?$/);
    if (match) return { orderId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) };
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('o') || params.get('id') || '';
    const token = params.get('k') || '';
    if (orderId) return { orderId, token };
  } catch { /* ignore */ }
  return { orderId: '', token: '' };
}

export function installAuthFetch() {
  if (window.__protoAuthFetchInstalled) return;
  window.__protoAuthFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isApiCall = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    if (!isApiCall) return originalFetch(input, init);

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});

    const { orderId, token } = getOrderAccessFromUrl();
    if (orderId && !headers.has('x-order-id')) headers.set('x-order-id', orderId);
    if (token && !headers.has('x-order-token')) headers.set('x-order-token', token);

    if (!headers.has('Authorization')) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers.set('Authorization', `Bearer ${session.access_token}`);
        }
      } catch { /* ignore */ }
    }

    const response = await originalFetch(input, { ...init, headers });

    if (response.status === 401 && !getOrderAccessFromUrl().orderId) {
      window.dispatchEvent(new CustomEvent('proto-admin-unauthorized'));
    }

    return response;
  };
}
