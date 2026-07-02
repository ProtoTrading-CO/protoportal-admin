import { useEffect, useState } from 'react';
import { getAccessToken } from '../lib/auth';

function formatSyncTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Never';
  }
}

/** Polls /api/sync-status for header SOH + price sync times. */
export default function SyncStatusBadge() {
  const [status, setStatus] = useState({ stockSyncedAt: null, priceSyncedAt: null });

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/sync-status', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const json = await res.json();
        if (mounted) {
          setStatus({
            stockSyncedAt: json.stockSyncedAt || null,
            priceSyncedAt: json.priceSyncedAt || null,
          });
        }
      } catch {
        /* badge is non-critical */
      }
    }

    void load();
    const id = setInterval(() => { void load(); }, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="adm-sync-badge" title="Last ERP → website sync times (requires migration 038 on Supabase)">
      SOH synced {formatSyncTime(status.stockSyncedAt)} · Prices synced {formatSyncTime(status.priceSyncedAt)}
    </div>
  );
}
