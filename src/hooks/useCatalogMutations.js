import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import {
  applyDormantLive,
  archiveProduct,
  deleteProduct,
  recycleProduct,
  restoreRecycledProduct,
} from '../lib/products';

async function stockMutate(body) {
  const res = await fetch('/api/stock-actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Action failed');
  return json;
}

function invalidateCatalogAndStats(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['catalog'] });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
}

export function useCatalogMutations() {
  const queryClient = useQueryClient();

  const archive = useMutation({
    mutationFn: (sku) => archiveProduct(sku, true),
    onSettled: () => invalidateCatalogAndStats(queryClient),
  });

  const unarchive = useMutation({
    mutationFn: (sku) => archiveProduct(sku, false),
    onSettled: () => invalidateCatalogAndStats(queryClient),
  });

  const setLive = useMutation({
    mutationFn: (sku) => applyDormantLive(sku),
    onSettled: () => invalidateCatalogAndStats(queryClient),
  });

  const softDelete = useMutation({
    mutationFn: (sku) => recycleProduct(sku, { fromArchive: false }),
    onSettled: () => invalidateCatalogAndStats(queryClient),
  });

  const restoreRecycle = useMutation({
    mutationFn: (sku) => restoreRecycledProduct(sku),
    onSettled: () => invalidateCatalogAndStats(queryClient),
  });

  const permanentDelete = useMutation({
    mutationFn: (sku) => deleteProduct(sku),
    onSettled: () => invalidateCatalogAndStats(queryClient),
  });

  const discardPreview = useMutation({
    mutationFn: (sku) => stockMutate({ action: 'deleteStagedPreview', sku }),
    onSettled: () => invalidateCatalogAndStats(queryClient),
  });

  return {
    archive,
    unarchive,
    setLive,
    softDelete,
    restoreRecycle,
    permanentDelete,
    discardPreview,
  };
}
