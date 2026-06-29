/** Name-based wood bead category inference (Move 3 subdivision). */

export function inferWoodBeadPath(productName) {
  const n = String(productName || '').toUpperCase();
  if (/PAINTED/.test(n)) return 'Beads > Wood > Painted';
  if (/COCO/.test(n)) return 'Beads > Wood > Coco Wood';
  if (/\bRAW\b/.test(n)) return 'Beads > Wood > Raw Wood';
  if (/WASHED/.test(n)) return 'Beads > Wood > Washed Wood';
  return 'Beads > Wood';
}

export function isWoodBeadName(productName) {
  const n = String(productName || '').toUpperCase();
  return /WOODEN?\s*BEAD|WOOD\s*BEAD|PAINTED\s*WOOD|WOODEN\s*BEADS/.test(n)
    || (/\bWOOD/.test(n) && /\bBEAD/.test(n));
}
