import { fetchAdminProductsPage } from './products';

function collectImageUrls(p) {
  const seen = new Set();
  const urls = [];
  const add = (url) => {
    const u = String(url || '').trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    urls.push(u);
  };
  add(p.image);
  (p.images || []).forEach(add);
  add(p.secondaryImage);
  add(p.imageThree);
  add(p.imageFour);
  return urls;
}

function toSheetRow(p, subLabel = '') {
  const images = collectImageUrls(p);
  return {
    Barcode: p.barcode || p.code || '',
    SKU: p.websiteSku || p.sku || '',
    Name: p.name || p.title || '',
    Subcategory: subLabel,
    Price: p.price ?? '',
    'Image URLs': images.join(', '),
  };
}

function subcategoryLabel(p, cat) {
  const subId = p.categoryPath?.[1];
  if (!subId) return '';
  const sub = (cat?.children || []).find((s) => s.id === subId);
  return sub?.label || subId;
}

function uniqueSheetName(label, used) {
  const base = String(label || 'Sheet').slice(0, 31);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let i = 2; i < 100; i += 1) {
    const suffix = ` (${i})`;
    const name = `${String(label || 'Sheet').slice(0, 31 - suffix.length)}${suffix}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Sheet ${used.size + 1}`.slice(0, 31);
  used.add(fallback);
  return fallback;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const s = (a.Subcategory || '').localeCompare(b.Subcategory || '');
    if (s) return s;
    return (a.Name || '').localeCompare(b.Name || '');
  });
}

/** Export live products — one sheet per main category, lean columns + image URLs. */
export async function exportLiveProductsXlsx(taxonomyTree = []) {
  const XLSX = await import('xlsx');
  const { rows: all } = await fetchAdminProductsPage({
    page: 1,
    pageSize: 999999,
    searchQuery: '',
    categoryFilter: 'all',
  });

  const categories = Array.isArray(taxonomyTree) ? taxonomyTree : [];
  const catById = new Map(categories.map((c) => [c.id, c]));
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set();

  categories.forEach((cat) => {
    const catProducts = all.filter((p) => p.category === cat.id || p.categoryPath?.[0] === cat.id);
    if (!catProducts.length) return;

    const rows = sortRows(
      catProducts.map((p) => toSheetRow(p, subcategoryLabel(p, cat))),
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(cat.label || cat.id, usedSheetNames));
  });

  const uncategorised = all.filter((p) => {
    const catId = p.category || p.categoryPath?.[0];
    return !catId || !categories.some((c) => c.id === catId);
  });
  if (uncategorised.length) {
    const rows = sortRows(uncategorised.map((p) => toSheetRow(p)));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName('Uncategorised', usedSheetNames));
  }

  if (!wb.SheetNames.length) {
    const ws = XLSX.utils.json_to_sheet(sortRows(all.map((p) => toSheetRow(p))));
    XLSX.utils.book_append_sheet(wb, ws, 'Live products');
  }

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `proto-live-products-${stamp}.xlsx`);
}
