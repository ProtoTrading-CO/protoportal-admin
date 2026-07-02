import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { readApiJson } from '../lib/apiError';

export const CATALOG_STATUSES = ['live', 'archived', 'approval', 'recycle'];

export function buildCatalogParams({
  status = 'live',
  page = 1,
  pageSize = 50,
  search = '',
  categoryPath = [],
  sort = 'title',
  stockFilter,
  archivedSource,
} = {}) {
  return { status, page, pageSize, search, categoryPath, sort, stockFilter, archivedSource };
}

async function fetchCatalog(params) {
  const qs = new URLSearchParams({
    status: params.status,
    page: String(params.page),
    pageSize: String(params.pageSize),
    sort: params.sort || 'title',
  });
  if (params.search) qs.set('search', params.search);
  if (params.categoryPath?.length) qs.set('categoryPath', JSON.stringify(params.categoryPath));
  if (params.stockFilter) qs.set('stockFilter', params.stockFilter);
  if (params.archivedSource && params.archivedSource !== 'all') qs.set('archivedSource', params.archivedSource);
  try {
    const res = await fetch(`/api/catalog?${qs}`);
    return readApiJson(res, { fallback: 'Catalog fetch failed — try Refresh' });
  } catch (err) {
    if (err.message?.includes('fetch') || err.name === 'TypeError') {
      throw new Error('Failed to fetch catalogue — server may be busy; try Refresh');
    }
    throw err;
  }
}

/** Fetch every row matching catalog filters (paged server reads). */
export async function fetchAllCatalogRows(params) {
  const pageSize = 200;
  let page = 1;
  const all = [];
  while (true) {
    const json = await fetchCatalog({ ...params, page, pageSize });
    all.push(...(json.rows || []));
    if (!json.hasMore) break;
    page += 1;
  }
  return all;
}

export function useCatalogQuery(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.catalog(params),
    queryFn: () => fetchCatalog(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

export function useTaxonomyQuery() {
  return useQuery({
    queryKey: queryKeys.taxonomy(),
    queryFn: async () => {
      const res = await fetch('/api/taxonomy');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Taxonomy fetch failed');
      return json.categories || json;
    },
    staleTime: 5 * 60_000,
  });
}
