const CONFIRM_RE = /^(confirm|confirmed|yes|yep|yeah|go ahead|create it|do it|proceed)([.!?\s]|$)/i;
const CANCEL_RE = /^(cancel|no|stop|nevermind|never mind)([.!?\s]|$)/i;
const SELECT_RE = /^(\d{1,2})$/;

export function isConfirmationMessage(query, { confirmAction = false } = {}) {
  if (confirmAction) return true;
  const q = String(query || '').trim();
  return CONFIRM_RE.test(q);
}

export function isCancellationMessage(query) {
  const q = String(query || '').trim();
  return CANCEL_RE.test(q);
}

export function parseCustomerSelection(query, matches = []) {
  const q = String(query || '').trim();
  const numbered = q.match(SELECT_RE);
  if (numbered) {
    const index = Number(numbered[1]) - 1;
    if (index >= 0 && index < matches.length) return matches[index];
    return null;
  }

  const lower = q.toLowerCase();
  const exact = matches.filter((c) => [c.business_name, c.name, c.contact_name, c.email]
    .filter(Boolean)
    .some((v) => String(v).trim().toLowerCase() === lower));
  if (exact.length === 1) return exact[0];
  return null;
}
