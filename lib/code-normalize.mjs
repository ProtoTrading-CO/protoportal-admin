const SEPARATOR_SPLIT = /[-/&\s,|;]+/;
const HAS_SEPARATOR = /[-/&\s,|;]/;

function collapseSeparatorRuns(value) {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/&+/g, '&')
    .replace(/,+/g, ',')
    .replace(/\|+/g, '|')
    .replace(/;+/g, ';');
}

/**
 * Normalize a raw product code into an array of lookup candidates,
 * ordered from most specific to fallback. Callers try each in order
 * and take the first match. Empty string returns [].
 */
export function codeLookupCandidates(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return [];

  const normalized = collapseSeparatorRuns(trimmed).toUpperCase();
  const candidates = [];
  const seen = new Set();

  const add = (value) => {
    const token = collapseSeparatorRuns(String(value ?? '').trim()).toUpperCase();
    if (!token || seen.has(token)) return;
    seen.add(token);
    candidates.push(token);
  };

  add(normalized);

  // A trailing "(2)" copy marker means a variant of the base code — always try
  // the base so "LSL36(2)" still resolves the parent product LSL36.
  const withoutParenCopy = normalized.replace(/\s*\(\d+\)$/, '').trim();
  if (withoutParenCopy && withoutParenCopy !== normalized) add(withoutParenCopy);

  if (HAS_SEPARATOR.test(trimmed)) {
    for (const token of trimmed.split(SEPARATOR_SPLIT)) {
      add(token);
    }
  }

  return candidates;
}

/** First meaningful token for display/lookup shortcuts (e.g. Nutstore filenames). */
export function firstCodeToken(raw) {
  const candidates = codeLookupCandidates(raw);
  if (candidates.length > 1) return candidates[1];
  return candidates[0] || '';
}
