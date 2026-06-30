/** Client-side filename parser — mirrors api/_product-loader-filename.js */
const IMAGE_COLUMNS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const SLOT_SUFFIX = /^(?<sku>.+)-(?<slot>[1-4])$/i;
const NOISE_PATTERNS = [
  /\s+copy$/i,
  /\s+\(\d+\)$/,
  /[_\s]+(front|back|side|detail|hero)$/i,
];

export function parseIntakeFilename(filename) {
  const raw = String(filename || '').trim();
  const dot = raw.lastIndexOf('.');
  const stem = dot > 0 ? raw.slice(0, dot) : raw;
  let working = stem.trim();

  if (!working) {
    return {
      sourceSku: '',
      displayCode: '',
      imageNumber: 1,
      imageColumn: IMAGE_COLUMNS[0],
      parseError: 'empty_filename',
    };
  }

  let imageNumber = 1;
  const slotMatch = working.match(SLOT_SUFFIX);
  if (slotMatch?.groups?.sku) {
    working = String(slotMatch.groups.sku || '').trim();
    imageNumber = Math.min(4, Math.max(1, Number.parseInt(slotMatch.groups.slot || '1', 10) || 1));
  }

  for (const pattern of NOISE_PATTERNS) {
    working = working.replace(pattern, '').trim();
  }

  const displayCode = working;
  const sourceSku = working.toUpperCase();

  return {
    sourceSku,
    displayCode,
    imageNumber,
    imageColumn: IMAGE_COLUMNS[imageNumber - 1] || IMAGE_COLUMNS[0],
    parseError: sourceSku.length < 2 ? 'sku_too_short' : null,
  };
}

export function isImageFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('image/')) return true;
  return IMAGE_EXT.test(file.name || '');
}

export const WEBSITE_STATUS_LABELS = {
  live: 'Live',
  dormant: 'Dormant',
  new: 'New Product',
  not_found: 'Not Found',
};

export function websiteStatusLabel(status) {
  return WEBSITE_STATUS_LABELS[status] || status || '—';
}

export function classifyDormantRow(row) {
  const hasCategory = Boolean(row.category && row.subcategoryOne);
  const hasImages = Boolean(
    row.imageUrlOne || row.imageUrlTwo || row.imageUrlThree || row.imageUrlFour,
  );
  if (!hasCategory) return 'waitingCategories';
  if (!hasImages) return 'waitingImages';
  if (!row.price || Number(row.price) <= 0) return 'waitingApproval';
  return 'readyToPublish';
}

export const DORMANT_SECTION_LABELS = {
  waitingImages: 'Waiting Images',
  waitingCategories: 'Waiting Categories',
  waitingApproval: 'Waiting Approval',
  readyToPublish: 'Ready To Publish',
};

export function exportBatchReportCsv(items, summary) {
  const header = ['Filename', 'SKU', 'Description', 'Slot', 'Group', 'Status', 'Price', 'SOH', 'Error'];
  const lines = [header.join(',')];
  for (const row of items) {
    lines.push([
      row.filename,
      row.code || '',
      `"${String(row.title || '').replace(/"/g, '""')}"`,
      row.imageSlot || 1,
      row.group || '',
      row.status || '',
      row.price ?? '',
      row.stockOnHand ?? row.sqlRow?.available ?? '',
      `"${String(row.processError || row.parseError || '').replace(/"/g, '""')}"`,
    ].join(','));
  }
  if (summary) {
    lines.push('');
    lines.push(`Summary,Found,${summary.total},Matched,${summary.matched}`);
  }
  return lines.join('\n');
}
