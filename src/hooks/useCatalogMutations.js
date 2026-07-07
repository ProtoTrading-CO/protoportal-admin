import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import {
  applyDormantLive,
  archiveProduct,
  bulkArchiveProducts,
  bulkUnarchiveProducts,
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

function invalidateCatalogAndStats(queryClient, statuses = []) {
  for (const status of statuses) {
    queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === 'catalog' && q.queryKey[1]?.status === status,
    });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
  // Signal that catalogue membership changed so the sidebar category-count
  // badges (a separate data source from the list) can refresh. Without this,
  // single-row/bulk archive/restore/delete updated the list but left the
  // badges stale until an unrelated taxonomy reload.
  window.dispatchEvent(new CustomEvent('proto-catalog-mutated'));
}

function refreshApproval() {
  window.dispatchEvent(new CustomEvent('proto-approval-refresh'));
}

export function useCatalogMutations() {
  const queryClient = useQueryClient();

  const archive = useMutation({
    mutationFn: (sku) => archiveProduct(sku, true),
    onSettled: () => invalidateCatalogAndStats(queryClient, ['live', 'archived']),
  });

  const unarchive = useMutation({
    mutationFn: (sku) => archiveProduct(sku, false),
    onSettled: () => invalidateCatalogAndStats(queryClient, ['live', 'archived']),
  });

  const setLive = useMutation({
    mutationFn: (sku) => applyDormantLive(sku),
    onError: (err) => {
      console.error('setLive:', err.message);
    },
  });

  const softDelete = useMutation({
    mutationFn: (arg) => {
      const sku = typeof arg === 'string' ? arg : arg?.sku;
      const fromArchive = typeof arg === 'object' && arg?.fromArchive;
      return recycleProduct(sku, { fromArchive: !!fromArchive });
    },
    onSettled: () => invalidateCatalogAndStats(queryClient, ['live', 'archived', 'recycle']),
  });

  const restoreRecycle = useMutation({
    mutationFn: (sku) => restoreRecycledProduct(sku),
    onSettled: () => invalidateCatalogAndStats(queryClient, ['live', 'archived', 'recycle']),
  });

  const permanentDelete = useMutation({
    mutationFn: (sku) => deleteProduct(sku),
    onSettled: () => invalidateCatalogAndStats(queryClient, ['live', 'archived', 'recycle']),
  });

  const discardPreview = useMutation({
    mutationFn: (sku) => stockMutate({ action: 'deleteStagedPreview', sku }),
    onSettled: () => {
      refreshApproval();
      invalidateCatalogAndStats(queryClient, []);
    },
  });

  const setNewArrival = useMutation({
    mutationFn: ({ sku, isNewArrival }) => stockMutate({ action: 'setNewArrival', sku, isNewArrival: !!isNewArrival }),
    onSettled: () => invalidateCatalogAndStats(queryClient, ['live', 'archived']),
  });

  const bulkArchive = useMutation({
    mutationFn: (skus) => bulkArchiveProducts(skus),
    onSettled: () => invalidateCatalogAndStats(queryClient, ['live', 'archived']),
  });

  const bulkUnarchive = useMutation({
    mutationFn: (skus) => bulkUnarchiveProducts(skus),
    onSettled: () => invalidateCatalogAndStats(queryClient, ['live', 'archived']),
  });

  return {
    archive,
    unarchive,
    bulkArchive,
    bulkUnarchive,
    setLive,
    softDelete,
    restoreRecycle,
    permanentDelete,
    discardPreview,
    setNewArrival,
  };
}
