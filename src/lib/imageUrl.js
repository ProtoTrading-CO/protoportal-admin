// Mirrors the customer site's image handling so the admin renders the exact
// same URLs. Image paths often contain spaces or special characters; if they
// aren't percent-encoded the browser silently fails to load them — which is
// why "a bunch" of reorder-grid thumbnails appeared blank.
function encodeRemoteUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.pathname = parsed.pathname
      .split('/')
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join('/');
    return parsed.toString();
  } catch {
    return url;
  }
}

export function optimizedImageUrl(url) {
  return encodeRemoteUrl(url);
}

// Ordered list of URLs to try: encoded first, then the raw original as a
// fallback for hosts that don't tolerate re-encoding.
export function buildImageCandidates(url) {
  const raw = (url || '').trim();
  if (!raw) return [];
  const candidates = [optimizedImageUrl(raw), raw];
  return [...new Set(candidates.filter(Boolean))];
}
