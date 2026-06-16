import { lazy, Suspense } from 'react';
import { installAuthFetch } from './lib/adminKey';
import QueryProvider from './components/QueryProvider';

const AdminPage = lazy(() => import('./pages/AdminPage'));
const FulfillmentPage = lazy(() => import('./pages/FulfillmentPage'));

installAuthFetch();

const adminUser = {
  id: 'proto-admin',
  role: 'admin',
  name: 'Proto Admin',
  email: 'admin@proto.co.za',
};

const loadingFallback = (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ color: '#e11d48', fontSize: '14px', fontWeight: 700 }}>Loading dashboard…</div>
  </div>
);

export default function Root() {
  // Match both /fulfillment (legacy) and /f/<orderId>/<token> (short link).
  const path = window.location.pathname;
  const isFulfillment = path === '/fulfillment' || path === '/f' || path.startsWith('/f/');

  if (isFulfillment) {
    return (
      <Suspense fallback={loadingFallback}>
        <FulfillmentPage />
      </Suspense>
    );
  }

  return (
    <QueryProvider>
      <Suspense fallback={loadingFallback}>
        <AdminPage
          customer={adminUser}
          onViewPortal={() => { window.location.href = 'https://protoportal-main.vercel.app'; }}
        />
      </Suspense>
    </QueryProvider>
  );
}
