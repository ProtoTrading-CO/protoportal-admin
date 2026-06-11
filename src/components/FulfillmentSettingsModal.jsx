import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import categories from '../data/categories.json';
import { fetchFulfillmentUsers, saveFulfillmentUsers } from '../lib/fulfillmentUsers';

const MAIN_CATEGORIES = categories.map((c) => ({ id: c.id, label: c.label }));

function slugify(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `user-${Date.now()}`;
}

function emptyUser() {
  return { id: `user-${Date.now()}`, name: '', whatsapp: '', categoryIds: ['', ''] };
}

export default function FulfillmentSettingsModal({ open, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFulfillmentUsers()
      .then((rows) => setUsers(rows.map((u) => ({
        ...u,
        categoryIds: [u.categoryIds?.[0] || '', u.categoryIds?.[1] || ''],
      }))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const updateUser = (idx, patch) => {
    setUsers((prev) => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u)));
  };

  const updateCategory = (userIdx, catIdx, value) => {
    setUsers((prev) => prev.map((u, i) => {
      if (i !== userIdx) return u;
      const categoryIds = [...(u.categoryIds || ['', ''])];
      categoryIds[catIdx] = value;
      return { ...u, categoryIds };
    }));
  };

  const addUser = () => setUsers((prev) => [...prev, emptyUser()]);

  const removeUser = (idx) => setUsers((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = users.map((u) => ({
        id: u.id || slugify(u.name),
        name: u.name.trim(),
        whatsapp: u.whatsapp.trim(),
        categoryIds: (u.categoryIds || []).filter(Boolean).slice(0, 2),
      }));
      if (payload.some((u) => !u.name)) throw new Error('Every user needs a name.');
      if (payload.some((u) => !u.whatsapp)) throw new Error('Every user needs a WhatsApp number.');
      if (payload.some((u) => u.categoryIds.length < 2)) throw new Error('Each user must have 2 categories assigned.');
      const saved = await saveFulfillmentUsers(payload);
      setUsers(saved.map((u) => ({
        ...u,
        categoryIds: [u.categoryIds?.[0] || '', u.categoryIds?.[1] || ''],
      })));
      onClose(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="adm-modal-backdrop" onClick={() => onClose(false)}>
      <div className="adm-modal adm-modal--form adm-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3 className="adm-modal-title">Fulfillment team</h3>
          <button type="button" className="adm-modal-close" onClick={() => onClose(false)} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="adm-modal-note">Manage fulfillment users, WhatsApp numbers, and category assignments (2 per user).</p>

        <div className="adm-modal-body adm-ff-settings">
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Loader2 size={24} className="star-spinning" />
            </div>
          )}
          {!loading && users.map((user, idx) => (
            <div key={user.id || idx} className="adm-ff-user-card">
              <div className="adm-ff-user-card__head">
                <strong>User {idx + 1}</strong>
                <button type="button" className="adm-icon-btn" onClick={() => removeUser(idx)} title="Remove user" style={{ color: '#c40000' }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="adm-ff-user-grid">
                <label className="adm-field">
                  <span className="adm-field-label">Name</span>
                  <input
                    className="adm-field-input"
                    value={user.name}
                    onChange={(e) => updateUser(idx, { name: e.target.value, id: user.id || slugify(e.target.value) })}
                    placeholder="e.g. Victor"
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-field-label">WhatsApp</span>
                  <input
                    className="adm-field-input"
                    value={user.whatsapp}
                    onChange={(e) => updateUser(idx, { whatsapp: e.target.value })}
                    placeholder="+27..."
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-field-label">Category 1</span>
                  <select className="adm-select adm-select--enhanced" value={user.categoryIds?.[0] || ''} onChange={(e) => updateCategory(idx, 0, e.target.value)}>
                    <option value="">Select…</option>
                    {MAIN_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label className="adm-field">
                  <span className="adm-field-label">Category 2</span>
                  <select className="adm-select adm-select--enhanced" value={user.categoryIds?.[1] || ''} onChange={(e) => updateCategory(idx, 1, e.target.value)}>
                    <option value="">Select…</option>
                    {MAIN_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ))}
          {!loading && (
            <button type="button" className="adm-btn-ghost adm-ff-add-user" onClick={addUser}>
              <Plus size={15} /> Add user
            </button>
          )}
          {error && <p style={{ color: '#c40000', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
        </div>

        <div className="adm-modal-footer adm-modal-footer--end">
          <div className="adm-modal-footer__actions">
            <button type="button" className="adm-btn-ghost" onClick={() => onClose(false)}>Cancel</button>
            <button type="button" className="adm-btn-red" onClick={() => void handleSave()} disabled={saving || loading}>
              {saving ? 'Saving…' : 'Save team'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
