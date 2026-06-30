/** Audit helpers for Product Loader publish history (uses product_publish_audit). */

export async function logProductLoaderAudit(sb, {
  sku,
  action = 'update',
  source = 'manual_product_loader',
  publishMode = 'direct',
  imageSlot = null,
  imageSource = null,
  categoryConfidence = null,
  oldValues = null,
  newValues = {},
  publishedBy = null,
}) {
  const cleanSku = String(sku || '').trim().toUpperCase();
  if (!cleanSku) return;

  const payload = {
    sku: cleanSku,
    action: action === 'create' ? 'create' : 'update',
    source: String(source || 'manual_product_loader'),
    publish_mode: String(publishMode || 'direct'),
    image_slot: imageSlot != null ? Number(imageSlot) : null,
    image_source: imageSource ? String(imageSource) : null,
    category_confidence: categoryConfidence != null ? Number(categoryConfidence) : null,
    old_values: oldValues,
    new_values: newValues,
    published_by: publishedBy ? String(publishedBy) : null,
    published_at: new Date().toISOString(),
  };

  await sb.from('product_publish_audit').insert(payload).catch((err) => {
    console.error('product_publish_audit insert failed:', err?.message);
  });
}

export function auditOutcomeFromRow(row) {
  const outcome = row?.new_values?.outcome;
  if (outcome === 'dormant') return 'dormant';
  if (outcome === 'failed') return 'failed';
  if (row?.action === 'create' || row?.action === 'update') return 'published';
  return 'published';
}
