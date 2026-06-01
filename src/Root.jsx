import { useEffect, useState } from 'react';
import { Lock, LogIn, UserPlus } from 'lucide-react';
import { supabase } from './lib/supabase';
import { getCustomerProfile, signIn, signOut, signUp } from './lib/auth';
import AdminPage from './pages/AdminPage';

export default function Root() {
  const [session, setSession] = useState(undefined);
  const [customer, setCustomer] = useState(null);
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
    setNotice('');
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

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await signUp(email, password, name);
      setMode('signin');
      setPassword('');
      setNotice('Account created. You can now sign in. Admin access still needs approval.');
    } catch (err) {
      setError(err.message || 'Account creation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setSession(null);
    setCustomer(null);
  };

  if (session === undefined) {
    return (
      <div style={styles.center}>
        <div style={{ color: '#e11d48', fontSize: '14px' }}>Loading…</div>
      </div>
    );
  }

  if (session && customer && customer.role !== 'admin') {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <p style={{ color: '#ef4444', marginBottom: '12px' }}>Access denied — admin only.</p>
          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
            Your account exists, but it is not marked as an admin account yet.
          </p>
          <button onClick={handleLogout} style={styles.btn}>Log out</button>
        </div>
      </div>
    );
  }

  if (session && customer?.role === 'admin') {
    return <AdminPage customer={customer} onLogout={handleLogout} onViewPortal={() => {}} />;
  }

  const isSignUp = mode === 'signup';

  return (
    <div style={styles.center}>
      <form onSubmit={isSignUp ? handleSignUp : handleLogin} style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '40px', height: '40px', background: '#c40000', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff', fontFamily: 'Outfit, sans-serif' }}>PROTO TRADING</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {isSignUp ? 'Create Account' : 'Admin Dashboard'}
            </div>
          </div>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
          {isSignUp
            ? 'Create your account here. New accounts are created safely and do not get admin access automatically.'
            : 'Sign in with an approved admin account, or create a new account first.'}
        </p>

        {error && (
          <div style={styles.errorBox}>
            {error}
          </div>
        )}

        {notice && (
          <div style={styles.noticeBox}>
            {notice}
          </div>
        )}

        {isSignUp && (
          <div style={{ marginBottom: '16px' }}>
            <label style={styles.label}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              style={styles.input}
            />
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@proto.co.za"
            required
            style={styles.input}
          />
        </div>

        <div style={{ marginBottom: '18px' }}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            minLength={8}
            required
            style={styles.input}
          />
        </div>

        <button type="submit" disabled={loading} style={{ ...styles.btn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
          {isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
          {loading ? (isSignUp ? 'Creating account…' : 'Signing in…') : (isSignUp ? 'Create account' : 'Sign in')}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(isSignUp ? 'signin' : 'signup');
            setError('');
            setNotice('');
            setPassword('');
          }}
          style={styles.linkBtn}
        >
          {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Create one'}
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
    padding: '20px',
  },
  card: {
    background: '#111',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '420px',
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
  linkBtn: {
    marginTop: '14px',
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '13px',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '8px',
    padding: '10px 14px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#fca5a5',
  },
  noticeBox: {
    background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)',
    borderRadius: '8px',
    padding: '10px 14px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#bbf7d0',
  },
};
