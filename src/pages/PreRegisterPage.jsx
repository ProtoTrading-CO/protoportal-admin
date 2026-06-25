import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Store } from 'lucide-react';
import { BUSINESS_TYPES } from '../lib/businessTypes';
import { getDailyQuote } from '../lib/dailyQuote';

const SPEND_BANDS = [
  'R0 – R5,000',
  'R5,000 – R10,000',
  'R10,000 – R25,000',
  'R25,000 – R50,000',
  'R50,000+',
];

const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];

const PORTAL_URL = 'https://protoportal-main.vercel.app';

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  business_name: '',
  business_type: '',
  monthly_spend: '',
  website: '',
  vat_number: '',
  country: 'South Africa',
  province: '',
  city: '',
  company_address: '',
  delivery_address: '',
  sameDelivery: true,
  accept_whatsapp: true,
  company_fax: '',
};

function Field({ label, required, children, hint }) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">
        {label}
        {required && <span className="pre-reg-required">*</span>}
      </span>
      {children}
      {hint && <span className="pre-reg-hint">{hint}</span>}
    </label>
  );
}

export default function PreRegisterPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const quote = useMemo(() => getDailyQuote(), []);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        delivery_address: form.sameDelivery ? form.company_address : form.delivery_address,
      };
      const res = await fetch('/api/public-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Registration failed');
      setSuccess({
        email: form.email,
        customerCode: json.customerCode,
        portalUrl: json.portalUrl || PORTAL_URL,
      });
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="pre-reg-page">
        <div className="pre-reg-shell">
          <div className="pre-reg-success">
            <CheckCircle2 size={56} strokeWidth={1.75} />
            <h1>You&apos;re approved</h1>
            <p>
              Your Proto Trading trade account is live. Sign in with
              {' '}
              <strong>{success.email}</strong>
              {' '}
              on the trade portal.
            </p>
            {success.customerCode && (
              <p className="pre-reg-code">
                Your customer code:
                {' '}
                <strong>{success.customerCode}</strong>
              </p>
            )}
            <a href={success.portalUrl} className="adm-btn-red pre-reg-portal-btn">
              <ExternalLink size={16} />
              Go to trade portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pre-reg-page">
      <div className="pre-reg-shell">
        <header className="pre-reg-header">
          <div className="pre-reg-brand">
            <div className="adm-login-logo">P</div>
            <div>
              <p className="pre-reg-kicker">Proto Trading</p>
              <h1>Trade account pre-registration</h1>
              <p className="pre-reg-lead">
                Register your business for wholesale access. Approved accounts can sign in immediately.
              </p>
            </div>
          </div>
          <blockquote className="pre-reg-quote">
            <p>&ldquo;{quote.text}&rdquo;</p>
            <footer>&mdash; {quote.author}</footer>
          </blockquote>
        </header>

        <form className="pre-reg-form" onSubmit={(e) => void handleSubmit(e)}>
          {error && <div className="adm-login-error" role="alert">{error}</div>}

          <section className="pre-reg-section">
            <h2><Store size={18} /> Account details</h2>
            <div className="pre-reg-grid">
              <Field label="Contact name" required>
                <input className="adm-field-input" value={form.name} onChange={set('name')} required disabled={busy} placeholder="Full name" />
              </Field>
              <Field label="Email" required>
                <input type="email" className="adm-field-input" value={form.email} onChange={set('email')} required disabled={busy} autoComplete="email" placeholder="you@business.co.za" />
              </Field>
              <Field label="Password" required hint="At least 8 characters">
                <input type="password" className="adm-field-input" value={form.password} onChange={set('password')} required disabled={busy} autoComplete="new-password" minLength={8} />
              </Field>
              <Field label="Confirm password" required>
                <input type="password" className="adm-field-input" value={form.confirmPassword} onChange={set('confirmPassword')} required disabled={busy} autoComplete="new-password" minLength={8} />
              </Field>
              <Field label="Mobile / WhatsApp" required>
                <input type="tel" className="adm-field-input" value={form.phone} onChange={set('phone')} required disabled={busy} inputMode="tel" placeholder="071 234 5678" />
              </Field>
              <label className="pre-reg-check">
                <input type="checkbox" checked={form.accept_whatsapp} onChange={set('accept_whatsapp')} disabled={busy} />
                <span>Send order updates on WhatsApp</span>
              </label>
            </div>
          </section>

          <section className="pre-reg-section">
            <h2>Business details</h2>
            <div className="pre-reg-grid">
              <Field label="Business / trading name" required>
                <input className="adm-field-input" value={form.business_name} onChange={set('business_name')} required disabled={busy} />
              </Field>
              <Field label="Business type" required>
                <select className="adm-field-input" value={form.business_type} onChange={set('business_type')} required disabled={busy}>
                  <option value="">Select type</option>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>
              <Field label="Estimated monthly spend">
                <select className="adm-field-input" value={form.monthly_spend} onChange={set('monthly_spend')} disabled={busy}>
                  <option value="">Select band</option>
                  {SPEND_BANDS.map((band) => (
                    <option key={band} value={band}>{band}</option>
                  ))}
                </select>
              </Field>
              <Field label="VAT number">
                <input className="adm-field-input" value={form.vat_number} onChange={set('vat_number')} disabled={busy} />
              </Field>
              <Field label="Website / social">
                <input className="adm-field-input" value={form.website} onChange={set('website')} disabled={busy} placeholder="https://" />
              </Field>
            </div>
          </section>

          <section className="pre-reg-section">
            <h2>Location & delivery</h2>
            <div className="pre-reg-grid">
              <Field label="Country" required>
                <input className="adm-field-input" value={form.country} onChange={set('country')} required disabled={busy} />
              </Field>
              <Field label="Province" required>
                <select className="adm-field-input" value={form.province} onChange={set('province')} required disabled={busy}>
                  <option value="">Select province</option>
                  {SA_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="City" required>
                <input className="adm-field-input" value={form.city} onChange={set('city')} required disabled={busy} />
              </Field>
              <Field label="Company address" required>
                <textarea className="adm-field-input pre-reg-textarea" value={form.company_address} onChange={set('company_address')} required disabled={busy} rows={3} />
              </Field>
              <label className="pre-reg-check pre-reg-check--full">
                <input type="checkbox" checked={form.sameDelivery} onChange={set('sameDelivery')} disabled={busy} />
                <span>Delivery address is the same as company address</span>
              </label>
              {!form.sameDelivery && (
                <Field label="Delivery address" required>
                  <textarea className="adm-field-input pre-reg-textarea" value={form.delivery_address} onChange={set('delivery_address')} required disabled={busy} rows={3} />
                </Field>
              )}
            </div>
          </section>

          {/* Honeypot */}
          <input
            type="text"
            name="company_fax"
            value={form.company_fax}
            onChange={set('company_fax')}
            tabIndex={-1}
            autoComplete="off"
            className="pre-reg-honeypot"
            aria-hidden="true"
          />

          <div className="pre-reg-actions">
            <button type="submit" className="adm-btn-red pre-reg-submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : null}
              {busy ? 'Creating your account…' : 'Register & get instant approval'}
            </button>
            <p className="pre-reg-foot">
              Already registered?
              {' '}
              <a href={PORTAL_URL}>Sign in to the trade portal</a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
