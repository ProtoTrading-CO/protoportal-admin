import { useMemo, useState } from 'react';
import { Loader2, Lock, LogIn } from 'lucide-react';
import { signIn } from '../lib/auth';
import { getDailyQuote } from '../lib/dailyQuote';

export default function AdminLoginPage({ forbidden = false, onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(forbidden ? 'This account is not authorized for the admin dashboard.' : '');
  const quote = useMemo(() => getDailyQuote(), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      onSignedIn?.();
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-login-page">
      <div className="adm-login-layout">
        <blockquote className="adm-login-quote" aria-label="Daily quote">
          <p className="adm-login-quote-text">&ldquo;{quote.text}&rdquo;</p>
          <footer className="adm-login-quote-author">&mdash; {quote.author}</footer>
        </blockquote>

        <div className="adm-login-card">
          <div className="adm-login-brand">
            <div className="adm-login-logo">P</div>
            <h1>Proto Admin</h1>
            <p>Sign in with your authorized account</p>
          </div>

          {error && <div className="adm-login-error" role="alert">{error}</div>}

          <form className="adm-login-form" onSubmit={(e) => void handleSubmit(e)}>
            <label className="adm-field">
              <span className="adm-field-label">Email</span>
              <input
                type="email"
                className="adm-field-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={busy}
                placeholder="you@proto.co.za"
              />
            </label>
            <label className="adm-field">
              <span className="adm-field-label">Password</span>
              <input
                type="password"
                className="adm-field-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={busy}
              />
            </label>
            <button type="submit" className="adm-btn-red adm-login-submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="adm-login-foot">
            <Lock size={12} /> Access restricted to Proto team accounts
          </p>
          {typeof window !== 'undefined'
            && window.location.hostname === 'protoportal-admin.vercel.app' && (
            <p className="adm-login-hint">
              This URL is blocked by Vercel. Use{' '}
              <a href="https://protopanel.co.za">protopanel.co.za</a> instead.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
