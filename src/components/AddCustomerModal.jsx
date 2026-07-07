import { useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { addCustomerManually } from '../lib/customers';

const SECTIONS = [
  {
    value: 'approved',
    label: 'Approved trade customer',
    hint: 'Creates a login account, marked approved. A welcome email is sent with a link to set their password. No code is assigned.',
  },
  {
    value: 'approved-10000',
    label: 'Approved + 10000 club',
    hint: 'Same as approved, plus the “10000 club” tag.',
  },
  {
    value: 'pre-registration',
    label: 'Pre-registration (10000 club list)',
    hint: 'Adds them to the allowlist. When they sign up they auto-approve, get tagged “10000 club” and receive the welcome email.',
  },
];

export default function AddCustomerModal({ open, onClose, onAdded, onShowToast }) {
  const [section, setSection] = useState('approved');
  const [form, setForm] = useState({
    email: '', name: '', business_name: '', contact_name: '', phone: '',
    monthly_spend: '', account_code: '',
  });
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isPreReg = section === 'pre-registration' || section === '10000-club';

  const submit = async () => {
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes('@')) { onShowToast?.('Enter a valid email', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        section,
        email,
        name: form.name.trim() || form.business_name.trim(),
        business_name: form.business_name.trim(),
        contact_name: form.contact_name.trim(),
        phone: form.phone.trim(),
      };
      if (form.monthly_spend.trim()) payload.monthly_spend = form.monthly_spend.trim();
      if (isPreReg && form.account_code.trim()) payload.account_code = form.account_code.trim();
      const res = await addCustomerManually(payload);
      const where = res.section === 'pre-registration' ? 'Pre-registration' : 'Approved customers';
      const mail = res.welcomeEmail === 'sent' ? ' Welcome email sent.' : '';
      onShowToast?.(`Added to ${where}.${mail}`, 'success');
      onAdded?.(res);
      onClose?.();
      setForm({ email: '', name: '', business_name: '', contact_name: '', phone: '', monthly_spend: '', account_code: '' });
    } catch (err) {
      onShowToast?.(err.message || 'Failed to add customer', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-modal-backdrop" onClick={() => !saving && onClose?.()}>
      <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3 className="adm-modal-title"><UserPlus size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Add customer</h3>
          <button type="button" className="adm-modal-close" onClick={() => onClose?.()} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="adm-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="adm-field-label">Section</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {SECTIONS.map((s) => (
                <label key={s.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 10px', border: `1.5px solid ${section === s.value ? '#8B1A1A' : '#e5e7eb'}`, background: section === s.value ? '#fdf3f3' : '#fff', borderRadius: 8, transition: 'border-color .12s, background .12s' }}>
                  <input type="radio" name="add-section" checked={section === s.value} onChange={() => setSection(s.value)} style={{ marginTop: 3, accentColor: '#8B1A1A' }} />
                  <span>
                    <span style={{ fontWeight: 700 }}>{s.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="adm-field-label">Email *</label>
              <input className="adm-input" type="email" value={form.email} onChange={set('email')} placeholder="customer@business.co.za" />
            </div>
            <div>
              <label className="adm-field-label">Business name</label>
              <input className="adm-input" value={form.business_name} onChange={set('business_name')} />
            </div>
            <div>
              <label className="adm-field-label">Contact name</label>
              <input className="adm-input" value={form.contact_name} onChange={set('contact_name')} />
            </div>
            {/* Phone + monthly spend only apply to a real approved account —
                the pre-registration allowlist ignores them. */}
            {!isPreReg && (
              <>
                <div>
                  <label className="adm-field-label">Phone</label>
                  <input className="adm-input" value={form.phone} onChange={set('phone')} placeholder="+27…" />
                </div>
                <div>
                  <label className="adm-field-label">Monthly spend</label>
                  <input className="adm-input" value={form.monthly_spend} onChange={set('monthly_spend')} />
                </div>
              </>
            )}
            {isPreReg && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="adm-field-label">Account reference (optional)</label>
                <input className="adm-input" value={form.account_code} onChange={set('account_code')} placeholder="Positill account code — reference only, not a customer code" />
              </div>
            )}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
            No customer code is set here. Allocate it later from the customer's profile — saving the code
            is what sends the confirmation email.
          </p>
        </div>
        <div className="adm-modal-footer adm-modal-footer--end">
          <div className="adm-modal-footer__actions">
            <button type="button" className="adm-btn-ghost" onClick={() => onClose?.()} disabled={saving}>Cancel</button>
            <button type="button" className="adm-btn-red" onClick={() => void submit()} disabled={saving}>
              {saving ? <><Loader2 size={14} className="spin" /> Adding…</> : 'Add customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
