import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, LogIn } from 'lucide-react';
import '../landing.css';

const BUSINESS_TYPES = [
  'Retail store',
  'Online shop / e-commerce',
  'Wholesaler',
  'Importer / distributor',
  'Craft & hobby shop',
  'Gift & novelty store',
  'Pharmacy / health & beauty',
  'Hardware & home store',
  'Stationery & office supply',
  "Baby & children's store",
  'Fashion & clothing boutique',
  'Dollar / variety store',
  'Market trader / spaza shop',
  'School or institution',
  'Events, parties & décor',
  'Other',
];

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

const EMPTY_FORM = {
  contactName: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  businessName: '',
  businessType: '',
  monthlySpend: '',
  website: '',
  vatNumber: '',
  country: 'South Africa',
  province: '',
  city: '',
  companyAddress: '',
  deliveryAddress: '',
  sameDelivery: true,
  acceptWhatsapp: true,
  company_fax: '',
};

export default function RegisterPage({ onLogin }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const portalTitle = useMemo(() => 'Proto Trading — Wholesale Trade Portal', []);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { submitTradeApplication } = await import('../lib/tradeApplication');
      const result = await submitTradeApplication({
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        contactName: form.contactName.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        companyAddress: form.companyAddress.trim(),
        deliveryAddress: form.sameDelivery ? form.companyAddress.trim() : form.deliveryAddress.trim(),
        vatNumber: form.vatNumber.trim() || null,
        country: form.country.trim(),
        province: form.province,
        city: form.city.trim(),
        businessType: form.businessType,
        monthlySpend: form.monthlySpend || null,
        website: form.website.trim() || null,
        acceptWhatsapp: form.acceptWhatsapp,
        instantApproval: true,
        company_fax: form.company_fax,
      });
      setSuccess({
        email: form.email.trim(),
        customerCode: result.customerCode,
      });
      document.title = portalTitle;
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="lp-register-page">
        <header className="lp-register-topbar">
          <a href="/" className="lp-register-brand">
            <span className="lp-register-logo">P</span>
            <span>
              <strong>PROTO</strong>
              <em>TRADING</em>
            </span>
          </a>
        </header>
        <main className="lp-register-main">
          <div className="lp-register-card lp-register-card--success">
            <div className="lp-quiz-success">
              <CheckCircle2 size={52} />
              <h3>You&apos;re approved</h3>
              <p>
                Your trade account is live. Sign in with
                {' '}
                <strong>{success.email}</strong>
                {' '}
                to browse wholesale stock and pricing.
              </p>
              {success.customerCode && (
                <p style={{ marginTop: -8, marginBottom: 20 }}>
                  Your customer code:
                  {' '}
                  <strong style={{ letterSpacing: '0.08em' }}>{success.customerCode}</strong>
                </p>
              )}
              <button type="button" onClick={onLogin}>
                <LogIn size={16} style={{ marginRight: 8, verticalAlign: -2 }} />
                Log in now
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="lp-register-page">
      <header className="lp-register-topbar">
        <a href="/" className="lp-register-brand">
          <span className="lp-register-logo">P</span>
          <span>
            <strong>PROTO</strong>
            <em>TRADING</em>
          </span>
        </a>
        <button type="button" className="btn-outline" onClick={onLogin}>Log in</button>
      </header>

      <main className="lp-register-main">
        <div className="lp-register-intro">
          <p className="lp-register-kicker">Wholesale trade portal</p>
          <h1>Create your trade account</h1>
          <p>
            Register your business for wholesale access. Approved accounts can sign in immediately
            and start ordering from our live catalogue.
          </p>
        </div>

        <form className="lp-register-card" onSubmit={(e) => void handleSubmit(e)}>
          {error && <div className="lp-quiz-error">{error}</div>}

          <section className="lp-register-section">
            <h2>Account details</h2>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field">
                <label>Contact name</label>
                <input value={form.contactName} onChange={set('contactName')} required disabled={busy} placeholder="Full name" />
              </div>
              <div className="lp-quiz-field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={set('email')} required disabled={busy} autoComplete="email" placeholder="you@business.co.za" />
              </div>
              <div className="lp-quiz-field">
                <label>Password</label>
                <input type="password" value={form.password} onChange={set('password')} required disabled={busy} autoComplete="new-password" minLength={8} placeholder="At least 8 characters" />
              </div>
              <div className="lp-quiz-field">
                <label>Confirm password</label>
                <input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required disabled={busy} autoComplete="new-password" minLength={8} />
              </div>
              <div className="lp-quiz-field">
                <label>Mobile / WhatsApp</label>
                <input type="tel" value={form.phone} onChange={set('phone')} required disabled={busy} inputMode="tel" placeholder="071 234 5678" />
              </div>
              <label className="lp-register-check">
                <input type="checkbox" checked={form.acceptWhatsapp} onChange={set('acceptWhatsapp')} disabled={busy} />
                <span>Send order updates on WhatsApp</span>
              </label>
            </div>
          </section>

          <section className="lp-register-section">
            <h2>Business details</h2>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field">
                <label>Business / trading name</label>
                <input value={form.businessName} onChange={set('businessName')} required disabled={busy} />
              </div>
              <div className="lp-quiz-field">
                <label>Business type</label>
                <select value={form.businessType} onChange={set('businessType')} required disabled={busy}>
                  <option value="">Select type</option>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="lp-quiz-field">
                <label>Estimated monthly spend</label>
                <select value={form.monthlySpend} onChange={set('monthlySpend')} disabled={busy}>
                  <option value="">Select band</option>
                  {SPEND_BANDS.map((band) => (
                    <option key={band} value={band}>{band}</option>
                  ))}
                </select>
              </div>
              <div className="lp-quiz-field">
                <label>VAT number</label>
                <input value={form.vatNumber} onChange={set('vatNumber')} disabled={busy} />
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label>Website / social</label>
                <input value={form.website} onChange={set('website')} disabled={busy} placeholder="https://" />
              </div>
            </div>
          </section>

          <section className="lp-register-section">
            <h2>Location & delivery</h2>
            <div className="lp-quiz-fields">
              <div className="lp-quiz-field">
                <label>Country</label>
                <input value={form.country} onChange={set('country')} required disabled={busy} />
              </div>
              <div className="lp-quiz-field">
                <label>Province</label>
                <select value={form.province} onChange={set('province')} required disabled={busy}>
                  <option value="">Select province</option>
                  {SA_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="lp-quiz-field">
                <label>City</label>
                <input value={form.city} onChange={set('city')} required disabled={busy} />
              </div>
              <div className="lp-quiz-field lp-quiz-field--full">
                <label>Company address</label>
                <textarea value={form.companyAddress} onChange={set('companyAddress')} required disabled={busy} rows={3} />
              </div>
              <label className="lp-register-check lp-register-check--full">
                <input type="checkbox" checked={form.sameDelivery} onChange={set('sameDelivery')} disabled={busy} />
                <span>Delivery address is the same as company address</span>
              </label>
              {!form.sameDelivery && (
                <div className="lp-quiz-field lp-quiz-field--full">
                  <label>Delivery address</label>
                  <textarea value={form.deliveryAddress} onChange={set('deliveryAddress')} required disabled={busy} rows={3} />
                </div>
              )}
            </div>
          </section>

          <input
            type="text"
            name="company_fax"
            value={form.company_fax}
            onChange={set('company_fax')}
            tabIndex={-1}
            autoComplete="off"
            className="lp-register-honeypot"
            aria-hidden="true"
          />

          <div className="lp-register-actions">
            <button type="submit" className="lp-quiz-next" disabled={busy} style={{ width: '100%' }}>
              {busy ? <Loader2 size={16} className="lp-register-spin" /> : null}
              {busy ? 'Creating your account…' : 'Register & get instant approval'}
            </button>
            <p className="lp-register-foot">
              Already registered?
              {' '}
              <button type="button" className="lp-register-link" onClick={onLogin}>Sign in to the trade portal</button>
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
