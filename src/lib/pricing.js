/** South Africa VAT — website prices are stored and displayed incl. VAT, rounded up. */
export const VAT_RATE = 0.15;
export const VAT_MULTIPLIER = 1 + VAT_RATE;

/** ERP sell_price (ex VAT) → website/catalogue price (incl. VAT, rounded up to whole rand). */
export function websitePriceFromSellPrice(exclPrice) {
  const n = Number(exclPrice);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n * VAT_MULTIPLIER);
}

/** Format a website price for display (whole rands). */
export function formatWebsitePrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return String(Math.round(n));
}
