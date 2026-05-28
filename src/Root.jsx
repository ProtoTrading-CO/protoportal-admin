import { useEffect, useState } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { supabase } from './lib/supabase';
import { getCustomerProfile, signIn, signOut } from './lib/auth';
import AdminPage from './pages/AdminPage';

export default function Root() {
  const [session, setSession] = useState(undefined);
  const [customer, setCustomer] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCustomer = async (userId) => {
    const profile = await getCustomerProfile(userId);
    setCustomer(profile);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (data.session?.user) void loadCustomer(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess ?? null);
      if (sess?.user) await loadCustomer(sess.user.id);
      else setCustomer(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { session: sess } = await signIn(email, password);
      if (sess) {
        setSession(sess);
        await loadCustomer(sess.user.id);
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setSession(null);
    setCustomer(null);
  };

  // Loading state
  if (session === undefined) {
    return (
      <div style={styles.center}>
        <div style={{ color: '#e11d48', fontSize: '14px' }}>Loading…</div>
      </div>
    );
  }

  // Not admin
  if (session && customer && customer.role !== 'admin') {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <p style={{ color: '#ef4444', marginBottom: '16px' }}>Access denied — admin only.</p>
          <button onClick={handleLogout} style={styles.btn}>Log out</button>
        </div>
      </div>
    );
  }

  // Logged in as admin
  if (session && customer?.role === 'admin') {
    return <AdminPage customer={customer} onLogout={handleLogout} onViewPortal={() => {}} />;
  }

  // Login form
  return (
    <div style={styles.center}>
      <form onSubmit={handleLogin} style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ width: '40px', height: '40px', background: '#c40000', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff', fontFamily: 'Outfit, sans-serif' }}>PROTO TRADING</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' }}>Admin Dashboard</div>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@proto.co.za"
            required
            style={styles.input}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={styles.input}
          />
        </div>

        <button type="submit" disabled={loading} style={{ ...styles.btn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
          <LogIn size={16} />
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#050505',
    fontFamily: 'Inter, sans-serif',
  },
  card: {
    background: '#111',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#f1f5f9',
    fontSize: '14px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '11px 20px',
    background: '#c40000',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '700',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
