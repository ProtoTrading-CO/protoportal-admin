export const STAGING_BUCKET = 'intake-staging';
export const LIVE_BUCKET = 'product-images';
export const IMAGE_COLUMNS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];
const FILENAME_WITH_IMAGE_NUMBER_PATTERN = /^(?<sku>.+)-(?<imageNumber>\d+)$/;

export function parseIntakeFilename(filename) {
  const dot = String(filename || '').lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : String(filename || '');
  const normalizedStem = stem.trim();
  if (!normalizedStem) return { sourceSku: '', imageNumber: 1, imageColumn: IMAGE_COLUMNS[0] };

  const match = normalizedStem.match(FILENAME_WITH_IMAGE_NUMBER_PATTERN);
  if (!match) {
    const sourceSku = normalizedStem.toUpperCase();
    return { sourceSku, imageNumber: 1, imageColumn: IMAGE_COLUMNS[0] };
  }

  const sourceSku = String(match.groups?.sku || '').trim().toUpperCase();
  const imageNumber = Number.parseInt(match.groups?.imageNumber || '1', 10);
  const slot = Number.isFinite(imageNumber) ? Math.min(4, Math.max(1, imageNumber)) : 1;
  return {
    sourceSku,
    imageNumber: slot,
    imageColumn: IMAGE_COLUMNS[slot - 1] || IMAGE_COLUMNS[0],
  };
}

export function stagingObjectName(sourceSku, imageNumber, filename) {
  const ext = String(filename || '').split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg';
  const safeSku = String(sourceSku || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${Date.now()}-${safeSku}-${imageNumber}.${safeExt}`;
}
