import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Tag, Trash2 } from 'lucide-react';
import SectionErrorBoundary from './SectionErrorBoundary';
import { ADMIN_REFRESH_EVENT } from '../lib/adminRefresh';
import { emptyPromoCode, fetchPromoCodes, savePromoCodes } from '../lib/promoCodes';
import { formatSortSavedAt } from '../lib/sortOrderStore';

function PromoCodeRow({ row, index, onChange, onRemove, disabled }) {
  const set = (key, value) => onChange(index, { ...row, [key]: value });

  return (
    <div className="adm-card" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontFamily: 'monospace', fontSize: 15 }}>{row.code || 'New code'}</strong>
        <button
          type="button"
          className="adm-btn-ghost adm-btn-sm"
          style={{ color: '#c40000' }}
          onClick={() => onRemove(index)}
          disabled={disabled}
        >
          <Trash2 size={14} /> Remove
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Code</span>
          <input
            className="adm-field-input"
            value={row.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="PROTO75"
            disabled={disabled}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Discount %</span>
          <input
            className="adm-field-input"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={row.discountPct}
            onChange={(e) => set('discountPct', e.target.value)}
            disabled={disabled}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Min order (R)</span>
          <input
            className="adm-field-input"
            type="number"
            min={0}
            step={1}
            value={row.minOrder}
            onChange={(e) => set('minOrder', e.target.value)}
            disabled={disabled}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Expires</span>
          <input
            className="adm-field-input"
            type="date"
            value={row.expiresAt ? String(row.expiresAt).slice(0, 10) : ''}
            onChange={(e) => set('expiresAt', e.target.value || '')}
            disabled={disabled}
          />
        </label>
      </div>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Checkout label</span>
        <input
          className="adm-field-input"
          value={row.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="7.5% off your order"
          disabled={disabled}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={row.active !== false}
          onChange={(e) => set('active', e.target.checked)}
          disabled={disabled}
        />
        Active at checkout
      </label>
    </div>
  );
}

export default function PromoCodesPanel({ onShowToast }) {
  const [codes, setCodes] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const toast = useCallback((message, type = 'success') => {
    onShowToast?.(message, type);
  }, [onShowToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPromoCodes({ force: true });
      setCodes(data.codes.length ? data.codes : []);
      setUpdatedAt(data.updatedAt);
    } catch (err) {
      toast(err.message || 'Failed to load promo codes', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onRefresh = (event) => {
      if (event.detail === 'promo-codes') void load();
    };
    window.addEventListener(ADMIN_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_REFRESH_EVENT, onRefresh);
  }, [load]);

  const updateRow = (index, nextRow) => {
    setCodes((prev) => prev.map((row, i) => (i === index ? nextRow : row)));
  };

  const removeRow = (index) => {
    setCodes((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setCodes((prev) => [...prev, emptyPromoCode()]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = codes.map((row) => ({
        code: String(row.code || '').trim().toUpperCase(),
        discountPct: Number(row.discountPct) || 0,
        active: row.active !== false,
        expiresAt: row.expiresAt || null,
        minOrder: Number(row.minOrder) || 0,
        label: String(row.label || '').trim(),
      })).filter((row) => row.code);
      const saved = await savePromoCodes(payload);
      setCodes(saved.codes);
      setUpdatedAt(saved.updatedAt);
      toast('Promo codes saved — trade portal checkout uses /api/validate-promo');
    } catch (err) {
      toast(err.message || 'Failed to save promo codes', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionErrorBoundary name="promo-codes" title="Promo Codes crashed">
      <div className="adm-panel">
        <div className="adm-section-head">
          <div>
            <h2 className="adm-section-title"><Tag size={20} style={{ verticalAlign: -4, marginRight: 8 }} />Promo Codes</h2>
            <p className="adm-section-note">
              Manage checkout discount codes stored in site-config. The trade portal validates codes via POST /api/validate-promo.
            </p>
            {updatedAt && (
              <p className="adm-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Last saved {formatSortSavedAt(updatedAt)}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="adm-btn-ghost" onClick={addRow} disabled={loading || saving}>
              <Plus size={15} /> Add code
            </button>
            <button type="button" className="adm-btn-green" onClick={() => void handleSave()} disabled={loading || saving}>
              {saving ? <><Loader2 size={15} className="spin" /> Saving…</> : 'Save promo codes'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', padding: '24px 0' }}>
            <Loader2 size={16} className="spin" /> Loading promo codes…
          </div>
        ) : codes.length === 0 ? (
          <div className="adm-empty" style={{ padding: '32px 0' }}>
            No promo codes yet. Add one to enable checkout discounts on the trade portal.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            {codes.map((row, index) => (
              <PromoCodeRow
                key={`${row.code || 'new'}-${index}`}
                row={row}
                index={index}
                onChange={updateRow}
                onRemove={removeRow}
                disabled={saving}
              />
            ))}
          </div>
        )}
      </div>
    </SectionErrorBoundary>
  );
}
