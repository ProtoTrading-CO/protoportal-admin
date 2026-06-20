import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { queryClient } from '../lib/queryClient';

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'proto_admin_query_cache',
});

export default function QueryProvider({ children }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            if (query.state.status !== 'success') return false;
            const key = query.queryKey[0];
            return key !== 'catalog';
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
