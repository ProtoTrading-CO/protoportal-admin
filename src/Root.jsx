import { useEffect, useState, lazy, Suspense } from 'react';
import { installAuthFetch } from './lib/adminKey';
import {
  getVerifiedSession,
  isAllowedAdminEmail,
  onAuthStateChange,
  signOut,
  verifyAdminSession,
} from './lib/auth';
import { setImageGenOperator } from './lib/imageGenSession';
import QueryProvider from './components/QueryProvider';
import AdminLoginPage from './components/AdminLoginPage';
import AdminResetPasswordPage from './components/AdminResetPasswordPage';

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
  const isResetPassword = path === '/reset-password';

  if (isFulfillment) {
    return (
      <Suspense fallback={loadingFallback}>
        <FulfillmentPage />
      </Suspense>
    );
  }

  if (isResetPassword) {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    return (
      <AdminResetPasswordPage
        token={token}
        onDone={() => { window.location.replace('/'); }}
      />
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
      try {
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
          if (verified.user?.email) setImageGenOperator(verified.user.email);
          setBooting(false);
        }
      } catch {
        if (mounted) {
          setSession(null);
          setBooting(false);
        }
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
      if (email) setImageGenOperator(email);
    });

    const onUnauthorized = () => { void signOut().then(() => setSession(null)); };
    // 403 means the server rejected this user's email — sign out so they can re-auth with a valid account
    const onForbidden = () => {
      void getVerifiedSession().then((s) => {
        if (!s || !isAllowedAdminEmail(s.user?.email || '')) {
          void signOut().then(() => setSession(null));
        }
      });
    };
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
            if (s.user?.email) setImageGenOperator(s.user.email);
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
