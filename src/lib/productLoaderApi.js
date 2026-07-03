import { readApiJson } from './apiError.js';
import { catalogueDisplayTitle, catalogueDescription } from './productLoaderDisplay.js';

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
    return {
      ...item,
      file,
      group,
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

export async function publishLoaderImageItem(item, {
  taxonomyTree,
  findNode,
  defaultCategoryId,
  defaultSub1Id,
  overwrite,
  filename,
}) {
  if (!item?.file || !item.code) throw new Error('Missing image or product code');

  const needsCategory = !item.websiteRow?.category;
  if (needsCategory && !defaultCategoryId) {
    throw new Error('Pick a default category for products not already on the website.');
  }

  const b64 = await fileToBase64(item.file);
  const uploadRes = await fetch('/api/upload-product-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: item.filename,
      contentType: item.file.type || 'image/jpeg',
      base64: b64,
      sku: item.code,
      imageSlot: item.imageSlot,
    }),
  });
  const uploadJson = await readApiJson(uploadRes, { fallback: 'Upload failed' });

  const catId = item.websiteRow?.category
    ? (taxonomyTree.find((c) => c.label === item.websiteRow.category)?.id || defaultCategoryId)
    : defaultCategoryId;
  const sub1IdForItem = item.websiteRow?.subcategory_one
    ? ((findNode(taxonomyTree, catId)?.children || []).find((c) => c.label === item.websiteRow.subcategory_one)?.id || defaultSub1Id)
    : defaultSub1Id;

  const catNode = findNode(taxonomyTree, catId);
  const sub1Node = findNode(taxonomyTree, sub1IdForItem);
  const categoryLabel = catNode?.label || item.websiteRow?.category || '';
  const sub1Label = sub1Node?.label || item.websiteRow?.subcategory_one || categoryLabel;

  if (!categoryLabel) throw new Error('No category available');

  const publishRes = await fetch('/api/product-loader-publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: item.code,
      displayCode: item.displayCode,
      title: catalogueDisplayTitle(item),
      price: item.price ?? item.sqlRow?.price ?? 0,
      barcode: item.barcode || item.websiteRow?.barcode || item.code,
      imageUrl: uploadJson.url,
      imageSlot: item.imageSlot,
      imageSource: 'upload',
      overwriteImage: overwrite || item.warnings?.includes('image_exists'),
      category: categoryLabel,
      subcategoryOne: sub1Label,
      subcategoryTwo: item.websiteRow?.subcategory_two || null,
      description: catalogueDescription(item),
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
  return { sku: item.code, action: publishRes.ok ? 'published' : 'failed' };
}
