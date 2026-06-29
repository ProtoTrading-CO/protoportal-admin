import { getProductByCode } from './_sql-provider.js';
import { toSqlPreview } from './_sql-stmast.js';

export const SLOT_FIELDS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];
export const WEBSITE_STOCK_COLS =
  'sku, title, price, original_description, category, subcategory_one, subcategory_two, '
  + 'subcategory_three, subcategory_four, '
  + 'image_url_one, image_url_two, image_url_three, image_url_four, barcode, updated_at, stock_qty, available_stock';

export function parseLoaderFilename(filename) {
  const dot = String(filename || '').lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : String(filename || '');
  const normalizedStem = stem.trim();
  if (!normalizedStem) return { code: '', displayCode: '', imageSlot: 1 };

  const match = normalizedStem.match(/^(?<sku>.+)-(?<imageNumber>\d+)$/);
  if (!match?.groups?.sku) {
    return { code: normalizedStem.toUpperCase(), displayCode: normalizedStem, imageSlot: 1 };
  }

  const displayCode = String(match.groups.sku || '').trim();
  const code = displayCode.toUpperCase();
  const imageNumber = Number.parseInt(match.groups.imageNumber || '1', 10);
  const imageSlot = Number.isFinite(imageNumber) ? Math.min(4, Math.max(1, imageNumber)) : 1;
  return { code, displayCode, imageSlot };
}

function slugPattern(term) {
  return String(term || '').trim().replace(/[-_]+/g, '%');
}

async function lookupWebsiteStock(sb, code, displayCode) {
  const upper = String(code || '').trim().toUpperCase();
  if (!upper) return { row: null, matchedBy: null };

  const bySku = await sb.from('website_stock').select(WEBSITE_STOCK_COLS).eq('sku', upper).maybeSingle();
  if (bySku.data) return { row: bySku.data, matchedBy: 'code' };

  const byBarcode = await sb.from('website_stock').select(WEBSITE_STOCK_COLS).eq('barcode', upper).maybeSingle();
  if (byBarcode.data) return { row: byBarcode.data, matchedBy: 'barcode' };

  const slug = slugPattern(displayCode || code);
  if (slug.length >= 2) {
    const byTitle = await sb
      .from('website_stock')
      .select(WEBSITE_STOCK_COLS)
      .ilike('title', `%${slug}%`)
      .limit(1)
      .maybeSingle();
    if (byTitle.data) return { row: byTitle.data, matchedBy: 'title' };
  }

  return { row: null, matchedBy: null };
}

async function lookupPositill(sb, code, displayCode) {
  const upper = String(code || '').trim().toUpperCase();
  let sqlRow = upper ? await getProductByCode(upper).catch(() => null) : null;
  if (sqlRow) return { sqlRow: toSqlPreview(sqlRow), matchedBy: 'positill_code' };

  const slug = slugPattern(displayCode || code);
  if (slug.length >= 2) {
    const { data } = await sb
      .from('stmast_cache')
      .select('code, descr, price_a, onhand, booked, dept')
      .ilike('descr', `%${slug}%`)
      .limit(1)
      .maybeSingle();

    if (data) {
      const onhand = Number(data.onhand) || 0;
      const booked = Number(data.booked) || 0;
      return {
        sqlRow: toSqlPreview({
          code: String(data.code || '').trim(),
          title: String(data.descr ?? '').trim(),
          price: Number(data.price_a) || 0,
          onhand,
          booked,
          available: onhand - booked,
          dept: data.dept || '',
        }),
        matchedBy: 'positill_title',
      };
    }
  }

  return { sqlRow: null, matchedBy: null };
}

export async function resolveProductLoaderMatch(sb, { code, displayCode, imageSlot = 1 }) {
  const [{ row: websiteRow, matchedBy: webMatch }, positill] = await Promise.all([
    lookupWebsiteStock(sb, code, displayCode),
    lookupPositill(sb, code, displayCode),
  ]);

  const sqlRow = positill.sqlRow;
  const effectiveCode = websiteRow?.sku || sqlRow?.code || code;
  const title = String(sqlRow?.title || websiteRow?.title || displayCode || code || '').trim();
  const price = Number(sqlRow?.price ?? websiteRow?.price ?? 0);
  const slot = Math.min(4, Math.max(1, Number(imageSlot) || 1));
  const warnings = [];

  if (!websiteRow && !sqlRow) warnings.push('not_in_catalog');
  if (websiteRow?.[SLOT_FIELDS[slot - 1]]) warnings.push('image_exists');
  if (!price) warnings.push('price_zero');
  const available = sqlRow?.available ?? websiteRow?.available_stock ?? websiteRow?.stock_qty;
  if (available != null && Number(available) <= 0) warnings.push('low_stock');

  return {
    code: effectiveCode,
    displayCode: displayCode || code,
    title: title || effectiveCode,
    price,
    imageSlot: slot,
    sqlRow,
    websiteRow,
    warnings,
    matchedBy: webMatch || positill.matchedBy || null,
    canPublish: Boolean(websiteRow || sqlRow),
  };
}
