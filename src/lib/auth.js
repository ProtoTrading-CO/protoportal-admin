import { supabase } from './supabase';

export const ADMIN_ROLES = Object.freeze({
  OWNER: 'owner',
  CUSTOMER_SERVICE: 'customer_service',
});

// Presentation mirror of the server-side role map. The server always makes
// the authorization decision; this only keeps the workspace focused.
const ADMIN_USERS = new Map([
  ['danieljoffeinfo@gmail.com', ADMIN_ROLES.OWNER],
  ['george@proto.co.za', ADMIN_ROLES.OWNER],
  ['online@proto.co.za', ADMIN_ROLES.CUSTOMER_SERVICE],
]);

export const ADMIN_EMAILS = new Set(ADMIN_USERS.keys());

export function getAdminRole(email) {
  return ADMIN_USERS.get(String(email || '').trim().toLowerCase()) || null;
}

export function isAllowedAdminEmail(email) {
  return Boolean(getAdminRole(email));
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

/** Validates JWT with Supabase — use on boot instead of getSession() alone. */
export async function getVerifiedSession() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return null;
  if (!isAllowedAdminEmail(user.email)) {
    await supabase.auth.signOut();
    return null;
  }
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function verifyAdminSession() {
  try {
    const res = await fetch('/api/auth-check', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || '';
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  if (!isAllowedAdminEmail(data.user?.email)) {
    await supabase.auth.signOut();
    throw new Error('This account is not authorized for the admin dashboard.');
  }
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error('Email is required');
  if (!isAllowedAdminEmail(normalized)) {
    throw new Error('This email is not authorized for the admin dashboard.');
  }
  const res = await fetch('/api/admin-forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to send reset email');
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
