/** Semi-precious stone bead category inference (Move 3 subdivision). */

export function isSemiPreciousProduct(productName, sku = '') {
  const n = String(productName || '').toUpperCase();
  const s = String(sku || '').toUpperCase();
  if (/SEMI[\s-]*PRECIOUS/.test(n)) return true;
  if (/^SP-\d+-/.test(s) || /^SP-\d+$/.test(s)) return true;
  return false;
}

export function inferSemiPreciousPath(productName, sku = '') {
  const n = String(productName || '').toUpperCase();
  const s = String(sku || '').toUpperCase();

  let mm = null;
  const skuMatch = s.match(/^SP-(\d{1,2})-/);
  if (skuMatch) mm = skuMatch[1];

  if (!mm) {
    const nameMatch = n.match(/\b(\d{1,2})\s*MM\b/);
    if (nameMatch) mm = nameMatch[1];
  }

  if (mm) return `Beads > Semi-Precious > SIZE: ${mm}mm`;
  if (/\bSMALL\b/.test(n)) return 'Beads > Semi-Precious > Small';
  if (/\bROUND\b/.test(n)) return 'Beads > Semi-Precious > Round';
  return 'Beads > Semi-Precious';
}
