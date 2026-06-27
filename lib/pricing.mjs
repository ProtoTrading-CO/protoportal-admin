/** Pass-through catalogue price — products.sell_price is already VAT-inclusive from ERP sync. */
export function catalogueDisplayPrice(storedPrice) {
  const n = Number(storedPrice);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** @deprecated Use catalogueDisplayPrice — kept for imports that still reference this name. */
export function websitePriceFromSellPrice(price) {
  return catalogueDisplayPrice(price);
}

/** Format a website price for display. */
export function formatWebsitePrice(price) {
  const n = catalogueDisplayPrice(price);
  if (!n) return '0';
  return String(Math.round(n));
}
