import { resolvePathLabels } from '../components/CategorySidebar';

const STATUS_LABELS = {
  live: 'Live',
  archived: 'Archived',
  approval: 'Approval',
  recycle: 'Recycle bin',
};

function productToCatalogRow(p, tree) {
  const pathIds = Array.isArray(p.categoryPath) ? p.categoryPath : [];
  const pathLabels = resolvePathLabels(tree, pathIds);
  const fallbackLabels = [p.categoryLabel, ...(p.subcategoryLabels || [])].filter(Boolean);

  const labels = pathLabels.length ? pathLabels : fallbackLabels;
  const fullPath = labels.join(' > ');

  return {
    'Website SKU': p.sku || p.websiteSku || '',
    Barcode: p.barcode || p.code || '',
    'Product name': p.name || p.title || '',
    'Main category': labels[0] || '',
    'Subcategory 1': labels[1] || '',
    'Subcategory 2': labels[2] || '',
    'Subcategory 3': labels[3] || '',
    'Subcategory 4': labels[4] || '',
    'Category path': fullPath,
    'Category path IDs': pathIds.join(' / '),
    'Price (ex VAT)': p.price ?? '',
    'Stock (units)': p.stockQty ?? '',
    'Units of issue': p.unitsOfIssue || '',
    Description: p.description || p.originalDescription || '',
  };
}

function sortCatalogRows(rows) {
  return [...rows].sort((a, b) => {
    const c = (a['Category path'] || '').localeCompare(b['Category path'] || '');
    if (c) return c;
    return (a['Product name'] || '').localeCompare(b['Product name'] || '');
  });
}

async function fetchAllCatalogProducts(status) {
  const pageSize = 200;
  const rows = [];
  let page = 1;

  while (true) {
    const qs = new URLSearchParams({
      status,
      page: String(page),
      pageSize: String(pageSize),
      sort: 'title',
    });
    const res = await fetch(`/api/catalog?${qs}`, { credentials: 'same-origin' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load products');
    rows.push(...(json.rows || []));
    if (!json.hasMore) break;
    page += 1;
  }

  return rows;
}

/** Export catalogue rows with full category + subcategory columns (Product Manager). */
export async function exportProductsCatalogXlsx({ status = 'live', taxonomyTree = [] } = {}) {
  const XLSX = await import('xlsx');
  const tree = Array.isArray(taxonomyTree) ? taxonomyTree : [];
  const products = await fetchAllCatalogProducts(status);
  const sheetRows = sortCatalogRows(products.map((p) => productToCatalogRow(p, tree)));

  const wb = XLSX.utils.book_new();
  const mainSheet = STATUS_LABELS[status] || 'Products';
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws['!cols'] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 42 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 52 },
    { wch: 36 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, mainSheet.slice(0, 31));

  const stamp = new Date().toISOString().slice(0, 10);
  const statusSlug = String(status).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  XLSX.writeFile(wb, `proto-products-${statusSlug}-${stamp}.xlsx`);
  return sheetRows.length;
}

/** @deprecated Use exportProductsCatalogXlsx — kept for callers expecting live-only export. */
export async function exportLiveProductsXlsx(taxonomyTree = []) {
  return exportProductsCatalogXlsx({ status: 'live', taxonomyTree });
}
