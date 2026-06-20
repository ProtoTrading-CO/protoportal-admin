import { supabase } from './supabase';

export const ADMIN_EMAILS = new Set([
  'danieljoffeinfo@gmail.com',
  'george@proto.co.za',
  'online@proto.co.za',
].map((e) => e.toLowerCase()));

export function isAllowedAdminEmail(email) {
  return ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
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

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
