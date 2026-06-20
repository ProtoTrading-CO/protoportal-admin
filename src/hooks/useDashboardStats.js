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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
