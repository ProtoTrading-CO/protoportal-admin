/** Client-side filename parser — mirrors api/_product-loader-lookup.js */
const IMAGE_COLUMNS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];
const SLOT_PATTERN = /^(?<sku>.+)-(?<imageNumber>\d+)$/;

export function parseIntakeFilename(filename) {
  const dot = String(filename || '').lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : String(filename || '');
  const normalizedStem = stem.trim();
  if (!normalizedStem) {
    return { sourceSku: '', displayCode: '', imageNumber: 1, imageColumn: IMAGE_COLUMNS[0] };
  }

  const match = normalizedStem.match(SLOT_PATTERN);
  if (!match?.groups?.sku) {
    const displayCode = normalizedStem;
    return {
      sourceSku: displayCode.toUpperCase(),
      displayCode,
      imageNumber: 1,
      imageColumn: IMAGE_COLUMNS[0],
    };
  }

  const displayCode = String(match.groups.sku || '').trim();
  const sourceSku = displayCode.toUpperCase();
  const imageNumber = Number.parseInt(match.groups.imageNumber || '1', 10);
  const slot = Number.isFinite(imageNumber) ? Math.min(4, Math.max(1, imageNumber)) : 1;
  return {
    sourceSku,
    displayCode,
    imageNumber: slot,
    imageColumn: IMAGE_COLUMNS[slot - 1] || IMAGE_COLUMNS[0],
  };
}

export function isImageFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name || '');
}
