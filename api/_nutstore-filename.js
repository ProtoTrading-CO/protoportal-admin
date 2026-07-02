const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** Nutstore PTR Photos: lookup code = stem before first hyphen; full stem kept for display. */
export function parseNutstoreFilename(filename) {
  const raw = String(filename || '').trim();
  const slash = raw.lastIndexOf('/');
  const name = slash >= 0 ? raw.slice(slash + 1) : raw;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot).trim() : name.trim();

  if (!stem) {
    return { code: '', displayCode: '', imageSlot: 1, parseError: 'empty_filename' };
  }

  if (dot > 0 && !IMAGE_EXT.test(name.slice(dot))) {
    return { code: '', displayCode: '', imageSlot: 1, parseError: 'unsupported_extension' };
  }

  const displayCode = stem;
  const lookupStem = stem.includes('-') ? stem.split('-')[0].trim() : stem;
  const code = lookupStem.toUpperCase();

  if (code.length < 2) {
    return { code: '', displayCode: '', imageSlot: 1, parseError: 'sku_too_short' };
  }

  return { code, displayCode, imageSlot: 1, parseError: null };
}

export function isNutstoreImageName(filename) {
  const raw = String(filename || '').trim();
  const slash = raw.lastIndexOf('/');
  const name = slash >= 0 ? raw.slice(slash + 1) : raw;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return IMAGE_EXT.test(name.slice(dot));
}

export function nutstoreBasename(path) {
  const raw = String(path || '').trim();
  const slash = raw.lastIndexOf('/');
  return slash >= 0 ? raw.slice(slash + 1) : raw;
}
