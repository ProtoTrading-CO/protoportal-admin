export function money(n) {
  return `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function startOfYesterday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function mergeMeta(envelopes) {
  const source = [...new Set(envelopes.flatMap((e) => e?.meta?.source || []))];
  const warnings = [...new Set(envelopes.flatMap((e) => e?.meta?.warnings || []))];
  const partial = envelopes.some((e) => e?.meta?.partial);
  return { source, warnings, partial, generatedAt: new Date().toISOString(), cache: 'miss' };
}

export function provenanceFootnote(meta) {
  const sources = (meta?.source || []).map((s) => s.replace(/_/g, ' ')).join(', ') || 'live data';
  const partial = meta?.partial ? ' · partial dataset' : '';
  const warnings = (meta?.warnings || []).filter(Boolean);
  const warnNote = warnings.length ? ` · ${warnings.join(', ')}` : '';
  return `_Sources: ${sources}${partial}${warnNote} · as of ${fmtDateTime(meta?.generatedAt)}_`;
}
