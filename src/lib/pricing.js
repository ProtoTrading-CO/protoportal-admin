/** Pass-through catalogue price — products.sell_price is already VAT-inclusive from ERP sync. */
export function catalogueDisplayPrice(storedPrice) {
  const n = Number(storedPrice);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** @deprecated Use catalogueDisplayPrice. */
export function websitePriceFromSellPrice(price) {
  return catalogueDisplayPrice(price);
}

/** True when ERP price ends in exactly 50c (e.g. 39.50, 129.50). */
export function isHalfRandPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return false;
  return Math.round((n % 1) * 100) === 50;
}

/** Format a website price for display — round to nearest rand except .50 endings stay as X.50. */
export function formatWebsitePrice(price) {
  const n = catalogueDisplayPrice(price);
  if (!n) return '0';
  if (isHalfRandPrice(n)) {
    const whole = Math.floor(n + 1e-9);
    return `${whole}.50`;
  }
  return String(Math.round(n));
}
