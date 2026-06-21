import { useEffect, useState, lazy, Suspense } from 'react';
import { installAuthFetch } from './lib/adminKey';
import { getSession, isAllowedAdminEmail, onAuthStateChange, signOut } from './lib/auth';
import QueryProvider from './components/QueryProvider';
import AdminLoginPage from './components/AdminLoginPage';

const AdminPage = lazy(() => import('./pages/AdminPage'));
const FulfillmentPage = lazy(() => import('./pages/FulfillmentPage'));

installAuthFetch();

const loadingFallback = (
  <div className="adm-login-page">
    <div className="adm-login-layout">
      <div className="adm-login-card adm-login-card--loading">Loading dashboard…</div>
    </div>
  </div>
);

export default function Root() {
  const path = window.location.pathname;
  const isFulfillment = path === '/fulfillment' || path === '/f' || path.startsWith('/f/');

  if (isFulfillment) {
    return (
      <Suspense fallback={loadingFallback}>
        <FulfillmentPage />
      </Suspense>
    );
  }

  return <AdminGate />;
}

function AdminGate() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getSession().then((s) => {
      if (mounted) {
        setSession(s);
        setBooting(false);
      }
    });
    const { data: { subscription } } = onAuthStateChange((s) => {
      if (mounted) setSession(s);
    });
    const onUnauthorized = () => { void signOut().then(() => setSession(null)); };
    const onForbidden = () => { void signOut().then(() => setSession(null)); };
    window.addEventListener('proto-admin-unauthorized', onUnauthorized);
    window.addEventListener('proto-admin-forbidden', onForbidden);
    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('proto-admin-unauthorized', onUnauthorized);
      window.removeEventListener('proto-admin-forbidden', onForbidden);
    };
  }, []);

  if (booting) return loadingFallback;

  const email = session?.user?.email || '';
  const allowed = session && isAllowedAdminEmail(email);

  if (!allowed) {
    return (
      <AdminLoginPage
        forbidden={!!session && !isAllowedAdminEmail(email)}
        onSignedIn={() => void getSession().then(setSession)}
      />
    );
  }

  const customer = {
    id: session.user.id,
    role: 'admin',
    name: session.user.user_metadata?.name || email.split('@')[0],
    email,
  };

  return (
    <QueryProvider>
      <Suspense fallback={loadingFallback}>
        <AdminPage
          customer={customer}
          onSignOut={() => void signOut().then(() => setSession(null))}
          onViewPortal={() => { window.location.href = 'https://protoportal-main.vercel.app'; }}
        />
      </Suspense>
    </QueryProvider>
  );
}
