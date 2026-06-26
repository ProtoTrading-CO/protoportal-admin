/** Normalize API `{ error }` payloads for toast display. */
export function errorFromJson(json, fallback = 'Request failed') {
  if (!json) return fallback;
  if (typeof json === 'string') return json;
  if (typeof json.error === 'string') return json.error;
  if (json.error && typeof json.error.message === 'string') return json.error.message;
  if (typeof json.message === 'string') return json.message;
  return fallback;
}

export async function readApiJson(res, { fallback } = {}) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(errorFromJson(json, fallback || `Server error (${res.status})`));
  }
  return json;
}
