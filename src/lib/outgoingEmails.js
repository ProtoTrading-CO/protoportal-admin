import { getAccessToken } from './auth';

async function authFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export async function fetchOutgoingTemplates() {
  const json = await authFetch('/api/outgoing-emails');
  return json.templates || [];
}

export async function saveOutgoingTemplate(slug, { subject, introText, htmlBlock }) {
  return authFetch('/api/outgoing-emails', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, subject, introText, htmlBlock }),
  });
}

export async function sendOutgoingTest(slug, { testEmail, subject, introText, htmlBlock }) {
  return authFetch('/api/outgoing-emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, testEmail, subject, introText, htmlBlock }),
  });
}
