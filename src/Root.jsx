import { useEffect, useState, lazy, Suspense } from 'react';
import { installAuthFetch } from './lib/adminKey';
import {
  getVerifiedSession,
  isAllowedAdminEmail,
  onAuthStateChange,
  signOut,
  verifyAdminSession,
} from './lib/auth';
import QueryProvider from './components/QueryProvider';
import AdminLoginPage from './components/AdminLoginPage';

const AdminPage = lazy(() => import('./pages/AdminPage'));
const FulfillmentPage = lazy(() => import('./pages/FulfillmentPage'));

/** Primary URL — protoportal-admin.vercel.app is often blocked by Vercel DDoS mitigations. */
const CANONICAL_ADMIN_ORIGIN = 'https://protopanel.co.za';

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

    async function resolveSession() {
      const verified = await getVerifiedSession();
      if (!verified?.access_token) {
        if (mounted) {
          setSession(null);
          setBooting(false);
        }
        return;
      }
      const ok = await verifyAdminSession();
      if (!ok) {
        await signOut();
        if (mounted) {
          setSession(null);
          setBooting(false);
        }
        return;
      }
      if (mounted) {
        setSession(verified);
        setBooting(false);
      }
    }

    void resolveSession();

    const { data: { subscription } } = onAuthStateChange(async (s) => {
      if (!mounted) return;
      if (!s?.access_token) {
        setSession(null);
        return;
      }
      const email = s.user?.email || '';
      if (!isAllowedAdminEmail(email)) {
        await signOut();
        setSession(null);
        return;
      }
      const ok = await verifyAdminSession();
      if (!ok) {
        await signOut();
        setSession(null);
        return;
      }
      setSession(s);
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
        onSignedIn={() => {
          void getVerifiedSession().then(async (s) => {
            if (!s) {
              setSession(null);
              return;
            }
            const ok = await verifyAdminSession();
            if (!ok) {
              await signOut();
              setSession(null);
              return;
            }
            setSession(s);
          });
        }}
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

export { CANONICAL_ADMIN_ORIGIN };
