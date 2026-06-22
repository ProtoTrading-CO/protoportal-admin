import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';

async function fetchDashboardStats() {
  const res = await fetch('/api/dashboard-stats');
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load stats');
  return json;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats(),
    queryFn: fetchDashboardStats,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 3000,
  });
}
