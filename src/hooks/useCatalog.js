import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';

export const CATALOG_STATUSES = ['live', 'archived', 'approval', 'recycle'];

export function buildCatalogParams({
  status = 'live',
  page = 1,
  pageSize = 50,
  search = '',
  categoryPath = [],
  sort = 'title',
} = {}) {
  return { status, page, pageSize, search, categoryPath, sort };
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
  const res = await fetch(`/api/catalog?${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Catalog fetch failed');
  return json;
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
