import { readApiJson } from './apiError.js';
import { catalogueDisplayTitle, catalogueDescription } from './productLoaderDisplay.js';
import { parseIntakeFilename, siblingSkuForCopy } from './parseIntakeFilename';

export async function lookupFilenames(filenames, files) {
  const res = await fetch('/api/product-loader-batch-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filenames }),
  });
  const json = await readApiJson(res, { fallback: 'Lookup failed' });
  const fileByName = new Map(files.map((f) => [f.name, f]));
  return (json.items || []).map((item) => {
    const file = fileByName.get(item.filename) || null;
    const group = item.group || (item.canPublish ? 'ready' : 'not_found');
    // Same-code duplicates ("CODE (2).jpg") each become a sibling product
    // record so no image overwrites another.
    const copyIndex = parseIntakeFilename(item.filename || '').copyIndex || 1;
    return {
      ...item,
      file,
      group,
      copyIndex,
      publishSku: siblingSkuForCopy(item.code, copyIndex),
      status: group === 'not_found' ? 'unmatched' : 'ready',
      processError: item.parseError || '',
      previewUrl: '',
    };
  });
}

export async function logPublishFailure({ sku, filename, reason }) {
  await fetch('/api/product-loader-publish-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sku, filename, outcome: 'failed', reason }),
  }).catch(() => {});
}

export async function fetchPublishHistory({ sku = '', q = '', action = '', limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (sku) params.set('sku', sku);
  if (q) params.set('q', q);
  if (action) params.set('action', action);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const res = await fetch(`/api/product-loader-publish-history?${params}`);
  const json = await readApiJson(res, { fallback: 'Failed to load history' });
  return json;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadLoaderImage(item) {
  const b64 = await fileToBase64(item.file);
  const uploadRes = await fetch('/api/upload-product-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: item.filename,
      contentType: item.file.type || 'image/jpeg',
      base64: b64,
      // Duplicates upload under their sibling SKU so each keeps its own object.
      sku: item.publishSku || item.code,
      imageSlot: item.imageSlot,
    }),
  });
  return readApiJson(uploadRes, { fallback: 'Upload failed' });
}

/**
 * Send a locally uploaded loader image to the archive — works even when the
 * code has no Positill/website match yet (placeholder row, tagged nutstore).
 */
export async function archiveLoaderImageItem(item) {
  if (!item?.file || !item.code) throw new Error('Missing image or product code');
  const uploadJson = await uploadLoaderImage(item);
  const res = await fetch('/api/product-loader-archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: item.code,
      displayCode: item.displayCode,
      title: item.descriptionOverride || catalogueDisplayTitle(item),
      description: item.descriptionOverride || catalogueDescription(item),
      price: item.price ?? item.sqlRow?.price ?? 0,
      barcode: item.barcode || item.websiteRow?.barcode || item.code,
      imageUrl: uploadJson.url,
      imageSlot: item.imageSlot,
      category: item.websiteRow?.category || '',
      subcategoryOne: item.websiteRow?.subcategory_one || '',
      sqlRow: item.sqlRow || null,
      websiteRow: item.websiteRow || null,
      filename: item.filename,
    }),
  });
  await readApiJson(res, { fallback: 'Archive failed' });
  return { sku: item.code, action: 'archived' };
}

export async function publishLoaderImageItem(item, {
  taxonomyTree,
  findNode,
  defaultCategoryId,
  defaultSub1Id,
  defaultSub2Id,
  defaultSub3Id,
  defaultSub4Id,
  overwrite,
  filename,
}) {
  if (!item?.file || !item.code) throw new Error('Missing image or product code');

  const needsCategory = !item.websiteRow?.category;
  if (needsCategory && !defaultCategoryId) {
    throw new Error('Pick a default category for products not already on the website.');
  }

  const uploadJson = await uploadLoaderImage(item);

  // A product already on the website keeps its own full category path so a
  // re-publish (e.g. adding an image slot) never flattens its deep subcategory.
  // A new product takes the admin-picked default chain (parent → sub 1..4).
  const onWebsite = Boolean(item.websiteRow?.category);
  const categoryLabel = onWebsite
    ? item.websiteRow.category
    : (findNode(taxonomyTree, defaultCategoryId)?.label || '');
  const sub1Label = onWebsite
    ? (item.websiteRow.subcategory_one || categoryLabel)
    : (findNode(taxonomyTree, defaultSub1Id)?.label || categoryLabel);
  const sub2Label = onWebsite
    ? (item.websiteRow.subcategory_two || null)
    : (findNode(taxonomyTree, defaultSub2Id)?.label || null);
  const sub3Label = onWebsite
    ? (item.websiteRow.subcategory_three || null)
    : (findNode(taxonomyTree, defaultSub3Id)?.label || null);
  const sub4Label = onWebsite
    ? (item.websiteRow.subcategory_four || null)
    : (findNode(taxonomyTree, defaultSub4Id)?.label || null);

  if (!categoryLabel) throw new Error('No category available');

  const publishRes = await fetch('/api/product-loader-publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Copy #2+ publishes to a sibling SKU (CODE-2…) sharing the base
      // barcode, so each same-code image is its own product record.
      code: item.publishSku || item.code,
      barcode: item.barcode || item.websiteRow?.barcode || item.code,
      displayCode: item.displayCode,
      title: item.descriptionOverride || catalogueDisplayTitle(item),
      price: item.price ?? item.sqlRow?.price ?? 0,
      imageUrl: uploadJson.url,
      imageSlot: item.imageSlot,
      imageSource: 'upload',
      overwriteImage: overwrite || item.warnings?.includes('image_exists'),
      category: categoryLabel,
      subcategoryOne: sub1Label,
      subcategoryTwo: sub2Label,
      subcategoryThree: sub3Label,
      subcategoryFour: sub4Label,
      description: item.descriptionOverride || catalogueDescription(item),
      sqlRow: item.sqlRow || null,
      websiteRow: item.websiteRow || null,
      stockQty: item.sqlRow?.onhand ?? item.websiteRow?.stock_qty,
      availableStock: item.sqlRow?.available ?? item.websiteRow?.available_stock,
      categoryConfidence: item.websiteRow ? 1 : 0.5,
      publishMode: 'direct',
      filename: filename || item.filename,
    }),
  });
  await readApiJson(publishRes, { fallback: 'Publish failed' });
  return { sku: item.publishSku || item.code, action: publishRes.ok ? 'published' : 'failed' };
}
