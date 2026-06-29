import { inferArtSupplyPath, isArtSupplyProduct } from './art-supplies-paths.mjs';
import { inferWritingCorrectionPath, isWritingCorrectionProduct } from './writing-correction-paths.mjs';
import { inferWoodBeadPath, isWoodBeadName } from './wood-bead-paths.mjs';

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
  if (/SEMI[\s-]*PRECIOUS/.test(n)) return 'Beads > Semi-Precious';
  return null;
}

export function isSemiPreciousProduct(productName, sku = '') {
  const n = String(productName || '').toUpperCase();
  const s = String(sku || '').toUpperCase();
  return /SEMI[\s-]*PRECIOUS/.test(n) || /^SP-\d+-/.test(s);
}

/** Best-effort category path from product title (no size/colour variants). */
export function inferCategoryPathFromName(productName, sku = '') {
  const n = String(productName || '').toUpperCase();

  if (isWoodBeadName(n)) return inferWoodBeadPath(n);
  if (isSemiPreciousProduct(n, sku)) return inferSemiPreciousPath(n, sku);
  if (isArtSupplyProduct(n)) return inferArtSupplyPath(n);
  if (isWritingCorrectionProduct(n)) return inferWritingCorrectionPath(n);

  if (/RIBBON|GROSGRAIN|PETERSHAM|ORGANZA|SATIN RIBBON|JUTE RIBBON/i.test(n)) {
    return 'Textiles > Ribbon';
  }
  if (/\bYARN\b|\bWOOL\b/i.test(n)) return 'Textiles > Yarn > Wool';

  if (/EXERCISE BOOK|COUNTER BOOK|MANUSCRIPT BOOK|MEMO BOOK|EXAM PAD|SKETCH PAD|NOTEBOOK|DIARY|PLANNER/i.test(n)) {
    return 'Stationery > School & Office > Books & Notebooks';
  }
  if (/ENVELOPE/i.test(n)) return 'Stationery > School & Office > Accessories';
  if (/ERASER/i.test(n)) return 'Stationery > School & Office > Writing & Correction > Correction and Erasing';

  if (/FINDING|CLASP|CRIMP|JUMPRING|EARRING HOOK|EYEPIN|HEADPIN/i.test(n)) {
    return 'Jewellery > Findings';
  }
  if (/SEED BEAD/i.test(n)) return 'Beads > Glass & Crystal > Seed Beads';

  if (/\bBEAD\b/i.test(n)) return 'Beads > Glass & Crystal';

  return null;
}
