const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const SLOT_SUFFIX = /^(?<sku>.+)-(?<slot>[1-4])$/i;
const NOISE_PATTERNS = [
  /\s+copy$/i,
  /\s+\(\d+\)$/,
  /[_\s]+(front|back|side|detail|hero)$/i,
];

/** Parse supplier image filenames into SKU + slot (1–4). */
export function parseLoaderFilename(filename) {
  const raw = String(filename || '').trim();
  const dot = raw.lastIndexOf('.');
  const stem = dot > 0 ? raw.slice(0, dot) : raw;
  let working = stem.trim();

  if (!working) {
    return { code: '', displayCode: '', imageSlot: 1, parseError: 'empty_filename' };
  }

  if (dot > 0 && !IMAGE_EXT.test(raw.slice(dot))) {
    return { code: '', displayCode: '', imageSlot: 1, parseError: 'unsupported_extension' };
  }

  let imageSlot = 1;
  const slotMatch = working.match(SLOT_SUFFIX);
  if (slotMatch?.groups?.sku) {
    working = String(slotMatch.groups.sku || '').trim();
    imageSlot = Math.min(4, Math.max(1, Number.parseInt(slotMatch.groups.slot || '1', 10) || 1));
  }

  for (const pattern of NOISE_PATTERNS) {
    working = working.replace(pattern, '').trim();
  }

  if (!working) {
    return { code: '', displayCode: '', imageSlot: 1, parseError: 'no_sku_after_cleanup' };
  }

  const displayCode = working;
  const code = working.toUpperCase();

  if (code.length < 2) {
    return { code: '', displayCode: '', imageSlot: 1, parseError: 'sku_too_short' };
  }

  return { code, displayCode, imageSlot, parseError: null };
}

export function isSupportedImageFilename(filename) {
  const raw = String(filename || '').trim();
  if (!raw) return false;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return false;
  return IMAGE_EXT.test(raw.slice(dot));
}
