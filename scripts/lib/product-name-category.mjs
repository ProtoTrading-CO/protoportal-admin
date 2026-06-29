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

function inferGlassPearlPath(productName) {
  const n = String(productName || '').toUpperCase();
  const m = n.match(/GLASS\s*PEARL\s*(\d+)\s*MM/);
  if (m) return `Beads > Glass & Crystal > Pearls > SIZE: ${m[1]}mm`;
  if (/GLASS\s*PEARL/.test(n)) return 'Beads > Glass & Crystal > Pearls';
  return null;
}

function inferFashionBagPath(productName) {
  const n = String(productName || '').toUpperCase();
  if (/BAG\s*STRAP/.test(n)) return 'Fashion & Accessories > Leather > Bag Straps';
  if (/LEATHER\s+SLING|LEATHER\s+BAG|LEATHER\s+HANDBAG/.test(n)) {
    return 'Fashion & Accessories > Leather > Ladies Sling & Crossbody';
  }
  if (/CLUTCH|WRISTLET/.test(n)) return 'Fashion & Accessories > Synthetic Bags > Wristlets & Clutches';
  if (/COIN\s*PURSE|SMALL\s*ACCESSOR/.test(n)) {
    return 'Fashion & Accessories > Synthetic Bags > Small Accessories';
  }
  if (/BACKPACK|SHOULDER\s*BAG/.test(n)) return 'Fashion & Accessories > Synthetic Bags > Backpack & Shoulder';
  if (/TOTE/.test(n)) return 'Fashion & Accessories > Synthetic Bags > Tote';
  if (/SHOPPER/.test(n)) return 'Fashion & Accessories > Synthetic Bags > Shopper';
  if (/SLING\s*BAG|CROSSBODY/.test(n)) return 'Fashion & Accessories > Synthetic Bags > Sling & Crossbody';
  if (/LADIES\s*BAG|HANDBAG|BOUTIQUE\s*BAG|\bBAG\b/.test(n)) {
    return 'Fashion & Accessories > Synthetic Bags > Handbags';
  }
  return null;
}

/** Best-effort category path from product title and optional ERP description. */
export function inferCategoryPathFromName(productName, sku = '', erpDescription = '') {
  const n = String(productName || '').toUpperCase();
  const erp = String(erpDescription || '').toUpperCase();
  const text = `${n} ${erp}`.trim();

  if (isWoodBeadName(text)) return inferWoodBeadPath(text);
  if (isSemiPreciousProduct(text, sku)) return inferSemiPreciousPath(text, sku);
  if (isArtSupplyProduct(text)) return inferArtSupplyPath(text);
  if (isWritingCorrectionProduct(text)) return inferWritingCorrectionPath(text);

  const pearl = inferGlassPearlPath(text);
  if (pearl) return pearl;

  if (/RIBBON|GROSGRAIN|PETERSHAM|ORGANZA|SATIN RIBBON|JUTE RIBBON/i.test(text)) {
    return 'Textiles > Ribbon';
  }
  if (/\bYARN\b|\bWOOL\b/i.test(text)) return 'Textiles > Yarn > Wool';
  if (/IRON\s*ON\s*PATCH/.test(text)) return 'Fashion & Accessories > Iron-On Patch';

  const bag = inferFashionBagPath(text);
  if (bag) return bag;

  if (/FEDORA|SUNHAT|PANAMA|\bHAT\b|\bCAP\b/.test(text)) {
    return 'Fashion & Accessories > Hats & Caps > Fedora';
  }
  if (/SCARF/i.test(text)) return 'Fashion & Accessories > Scarves';

  if (/EXERCISE BOOK|COUNTER BOOK|MANUSCRIPT BOOK|MEMO BOOK|EXAM PAD|SKETCH PAD|NOTEBOOK|DIARY|PLANNER/i.test(text)) {
    return 'Stationery > School & Office > Books & Notebooks';
  }
  if (/ENVELOPE/i.test(text)) return 'Stationery > School & Office > Accessories';
  if (/ERASER/i.test(text)) return 'Stationery > School & Office > Writing & Correction > Correction and Erasing';

  if (/CLAY|PLASTICINE|PLAYDOUGH|CRAZY\s*CRAFTY/i.test(text)) {
    return 'Arts and Crafts > Art Supplies > Sculpting & Moulding > Clay';
  }
  if (/STICKER/i.test(text)) return 'Arts and Crafts > Crafts > Stickers';
  if (/EMBROIDERY/i.test(text)) return 'Arts and Crafts > Crafts > Embroidery';

  if (/NECKLACE\s*CHAIN|\bCHAIN\b.*NECKLACE/.test(text)) {
    return 'Jewellery > Findings > Stringing Materials > Chain';
  }
  if (/SUEDE\s*CORD|IMITATION\s*SUEDE|\bCORD\b/.test(text)) {
    return 'Jewellery > Findings > Stringing Materials > Cord';
  }
  if (/NYLON\s*THREAD|BONDED\s*NYLON|\bTHREAD\b/.test(text)) {
    return 'Jewellery > Findings > Stringing Materials > Threads';
  }
  if (/WIRE\b|MEMORY\s*WIRE/.test(text)) return 'Jewellery > Findings > Stringing Materials > Wire';
  if (/ELASTIC\b/.test(text)) return 'Jewellery > Findings > Stringing Materials > Elastic';

  if (/FINDING|CLASP|CRIMP|JUMPRING|EARRING\s*HOOK|EYEPIN|HEADPIN|CALOTTE/i.test(text)) {
    return 'Jewellery > Findings';
  }
  if (/DISPLAY\s*STAND|JEWELLERY\s*TOOL|PLIER/i.test(text)) {
    return 'Jewellery > Jewellery Tools and Equipment';
  }

  if (/GLASS\s*CRYSTAL|ACRYLIC\s*DIAMOND|RONDELLE|MURANO|CZECH|GLASS\s*FOIL/i.test(text)) {
    return 'Beads > Glass & Crystal';
  }
  if (/GLASS\s*BEAD/i.test(text)) return 'Beads > Glass & Crystal';
  if (/EARTH\s*STONE/i.test(text)) return 'Beads > Semi-Precious';
  if (/SEED\s*BEAD/i.test(text)) return 'Beads > Glass & Crystal > Seed Beads';
  if (/METAL|ALUMINIUM|CONE|BRASS|NICKEL/i.test(text)) return 'Beads > Beads By Material > Beads';

  if (/ZIPLOCK/i.test(text)) return 'Packaging & Storage > Packaging Packets and Bags > Ziplock';
  if (/PVC\s*PLASTIC|RESEALABLE\s*PACKET/i.test(text)) {
    return 'Packaging & Storage > Packaging Packets and Bags > Resealable PVC';
  }
  if (/DISPLAY\s*TAG/i.test(text)) return 'Packaging & Storage > Tags > Jewellery';

  if (/\bD-RING\b|\bD\s*RING\b/i.test(text)) return 'Bag & Belt Components > Square and D-Rings';
  if (/\bSLIDER\b/i.test(text)) return 'Bag & Belt Components > Sliders';
  if (/\bBUCKLE\b/i.test(text)) return 'Bag & Belt Components > Buckles';

  if (/SOFT\s*TOY/i.test(text)) return 'Kids Toys & Games > Soft Toys';
  if (/FIDGET|KIDS\s*TOY|\bTOY\b/i.test(text)) return 'Kids Toys & Games > Kids Toys';

  if (/\bCHAIN\b/i.test(text)) return 'Jewellery > Findings > Stringing Materials > Chain';
  if (/\bPURSE\b/i.test(text)) return 'Fashion & Accessories > Synthetic Bags > Wristlets & Clutches';

  if (/\bBEAD\b/i.test(text)) return 'Beads > Glass & Crystal';

  return null;
}
