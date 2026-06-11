import { lazy, Suspense, useEffect, useState } from 'react';
import { getStoredAdminKey, storeAdminKey, clearAdminKey, verifyAdminKey, installAuthFetch } from './lib/adminKey';

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

function LoginGate({ onUnlocked }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const ok = await verifyAdminKey(key.trim());
      if (ok) {
        storeAdminKey(key.trim());
        onUnlocked();
      } else {
        setError('Incorrect dashboard password.');
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: 'Inter, sans-serif', padding: '20px' }}>
      <form onSubmit={submit} style={{ background: '#1e293b', padding: '36px 32px', borderRadius: '16px', width: '100%', maxWidth: '380px', boxShadow: '0 18px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ color: '#e11d48', fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Proto Trading</div>
        <h1 style={{ color: '#f8fafc', fontSize: '22px', fontWeight: 800, margin: '0 0 18px' }}>Admin dashboard</h1>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Dashboard password</label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
          autoComplete="current-password"
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: '14px', marginBottom: '12px' }}
        />
        {error && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        <button
          type="submit"
          disabled={busy || !key.trim()}
          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#e11d48', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy || !key.trim() ? 0.7 : 1 }}
        >
          {busy ? 'Checking…' : 'Unlock dashboard'}
        </button>
      </form>
    </div>
  );
}

export default function Root() {
  // Match both /fulfillment (legacy) and /f/<orderId>/<token> (short link).
  const path = window.location.pathname;
  const isFulfillment = path === '/fulfillment' || path === '/f' || path.startsWith('/f/');
  // undefined = checking stored key, false = needs login, true = unlocked
  const [unlocked, setUnlocked] = useState(isFulfillment ? true : undefined);

  useEffect(() => {
    if (isFulfillment) return;
    const stored = getStoredAdminKey();
    if (!stored) {
      setUnlocked(false);
      return;
    }
    verifyAdminKey(stored)
      .then((ok) => {
        if (!ok) clearAdminKey();
        setUnlocked(ok);
      })
      .catch(() => setUnlocked(true)); // offline/network blip — let API calls surface errors
  }, [isFulfillment]);

  if (isFulfillment) {
    return (
      <Suspense fallback={loadingFallback}>
        <FulfillmentPage />
      </Suspense>
    );
  }

  if (unlocked === undefined) return loadingFallback;
  if (!unlocked) return <LoginGate onUnlocked={() => setUnlocked(true)} />;

  return (
    <Suspense fallback={loadingFallback}>
      <AdminPage
        customer={adminUser}
        onLogout={() => { clearAdminKey(); window.location.reload(); }}
        onViewPortal={() => { window.location.href = 'https://protoportal-main.vercel.app'; }}
      />
    </Suspense>
  );
}
