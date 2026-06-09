let _cache = null;

export async function fetchBroadcastSchedule() {
  if (_cache) return _cache;
  const res = await fetch('/api/broadcast-schedule');
  const data = await res.json();
  _cache = data;
  return data;
}

export async function saveBroadcastSchedule(items) {
  _cache = null;
  const res = await fetch('/api/broadcast-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to save broadcast schedule');
  _cache = json;
  return json;
}

export async function deleteScheduledBroadcast(id) {
  _cache = null;
  const res = await fetch('/api/broadcast-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleteId: id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete scheduled broadcast');
  _cache = json;
  return json;
}
