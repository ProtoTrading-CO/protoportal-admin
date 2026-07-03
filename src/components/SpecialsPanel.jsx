import { useCallback, useEffect, useState } from 'react';
import { DollarSign, ImagePlus, Megaphone, RefreshCw, Star, X } from 'lucide-react';
import { fetchSpecials, saveSpecials } from '../lib/specials';
import { fetchPopupSpecial, savePopupSpecial, uploadPopupImage } from '../lib/popupSpecial';
import { fetchCheckoutPromo, saveCheckoutPromo } from '../lib/checkoutPromo';

// Specials — three sub-panels sharing the "Specials" tab: weekly featured
// products, PROTO75 checkout promo, and the popup flyer. Extracted from
// AdminPage so it owns its own state/effects; the parent only exposes a
// stable toggleSpecial callback for the Product Manager star.
export default function SpecialsPanel({
  specials,
  onSpecialsChange,
  onShowToast,
}) {
  const [saving, setSaving] = useState(false);
  const [checkoutPromo, setCheckoutPromo] = useState({
    active: true,
    code: 'PROTO75',
    percent: 7.5,
    label: '7.5% off your order',
  });
  const [checkoutPromoSaving, setCheckoutPromoSaving] = useState(false);
  const [popupForm, setPopupForm] = useState({ active: false, imageUrl: '', title: '' });
  const [popupSaving, setPopupSaving] = useState(false);
  const [popupUploading, setPopupUploading] = useState(false);

  const toast = useCallback((message, type = 'success') => {
    onShowToast?.(message, type);
  }, [onShowToast]);

  const loadPopup = useCallback(async () => {
    try {
      const data = await fetchPopupSpecial();
      setPopupForm({ active: Boolean(data.active), imageUrl: data.imageUrl || '', title: data.title || '' });
    } catch (err) {
      toast(err.message || 'Failed to load popup', 'error');
    }
  }, [toast]);

  const loadCheckoutPromo = useCallback(async () => {
    try {
      const data = await fetchCheckoutPromo({ force: true });
      setCheckoutPromo({
        active: !!data.active,
        code: data.code || 'PROTO75',
        percent: Number(data.percent) || 7.5,
        label: data.label || '7.5% off your order',
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadPopup();
    void loadCheckoutPromo();
  }, [loadPopup, loadCheckoutPromo]);

  const updateSpecialDeal = async (productId, patch) => {
    const next = specials.map((s) => (s.productId === productId ? { ...s, ...patch } : s));
    onSpecialsChange(next);
    setSaving(true);
    try { await saveSpecials(next); } catch { /* silent */ } finally { setSaving(false); }
  };

  const removeSpecial = async (productId) => {
    const next = specials.filter((s) => s.productId !== productId);
    onSpecialsChange(next);
    setSaving(true);
    try { await saveSpecials(next); } catch { /* silent */ } finally { setSaving(false); }
  };

  const clearAll = async () => {
    if (!window.confirm('Remove all specials?')) return;
    onSpecialsChange([]);
    setSaving(true);
    try { await saveSpecials([]); } catch { /* silent */ } finally { setSaving(false); }
  };

  const savePopup = async () => {
    setPopupSaving(true);
    try {
      await savePopupSpecial(popupForm);
      toast('Popup special saved');
    } catch (err) {
      toast(err.message || 'Failed to save popup', 'error');
    } finally {
      setPopupSaving(false);
    }
  };

  const savePromo = async () => {
    setCheckoutPromoSaving(true);
    try {
      await saveCheckoutPromo(checkoutPromo);
      toast('Checkout promo saved — applies on trade portal cart');
    } catch (err) {
      toast(err.message || 'Failed to save checkout promo', 'error');
    } finally {
      setCheckoutPromoSaving(false);
    }
  };

  const handlePopupImage = async (file) => {
    if (!file) return;
    setPopupUploading(true);
    try {
      const { url } = await uploadPopupImage(file);
      setPopupForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (err) {
      toast(err.message || 'Failed to upload image', 'error');
    } finally {
      setPopupUploading(false);
    }
  };

  return (
    <div className="adm-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Star size={20} style={{ color: '#f59e0b' }} /> Specials
          </h2>
          <p className="adm-section-note">Weekly featured products and login popup promo. Star a product in Product Manager to add it here.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saving && <span className="adm-muted" style={{ fontSize: 12 }}>Saving…</span>}
          {specials.length > 0 && (
            <button type="button" onClick={() => void clearAll()} className="adm-btn-ghost" style={{ color: '#c40000' }}>
              Clear all
            </button>
          )}
          <span className="adm-pill">{specials.length} / 10</span>
        </div>
      </div>

      {specials.length === 0 && (
        <div className="adm-empty" style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
          <Star size={36} style={{ color: '#d1d5db', marginBottom: 12 }} />
          <p style={{ margin: 0 }}>No specials yet. Go to <strong>Product Manager</strong> and click the ☆ star on any product to add it here.</p>
        </div>
      )}

      {specials.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {specials.map((item) => (
            <div key={item.productId} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start', padding: 16, background: '#fafafa', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Star size={14} className="star-spinning" />
                  {item.productName}
                </div>
                <div className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>{item.productCode}</div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>Deal:</span>
                    <select
                      value={item.deal || 'none'}
                      onChange={(e) => void updateSpecialDeal(item.productId, { deal: e.target.value })}
                      className="adm-select"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                      <option value="none">No deal — just featured</option>
                      <option value="discount">Discount %</option>
                      <option value="bogo">Buy X Get Y Free</option>
                    </select>
                  </label>

                  {item.deal === 'discount' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>Discount:</span>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={item.discountPct || 10}
                        onChange={(e) => void updateSpecialDeal(item.productId, { discountPct: Number(e.target.value) })}
                        className="adm-tiny-input"
                        style={{ width: 56 }}
                      />
                      <span className="adm-muted">%</span>
                    </label>
                  )}

                  {item.deal === 'bogo' && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>Buy</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={item.bogoX || 1}
                          onChange={(e) => void updateSpecialDeal(item.productId, { bogoX: Number(e.target.value) })}
                          className="adm-tiny-input"
                          style={{ width: 48 }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>Get</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={item.bogoY || 1}
                          onChange={(e) => void updateSpecialDeal(item.productId, { bogoY: Number(e.target.value) })}
                          className="adm-tiny-input"
                          style={{ width: 48 }}
                        />
                        <span style={{ fontWeight: 600 }}>Free</span>
                      </label>
                    </>
                  )}

                  <span style={{ marginLeft: 'auto', background: '#8B1A1A', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {item.deal === 'discount' ? `${item.discountPct || 10}% OFF`
                      : item.deal === 'bogo' ? `Buy ${item.bogoX || 1} Get ${item.bogoY || 1} Free`
                        : "This Week's Special"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void removeSpecial(item.productId)}
                className="adm-icon-btn"
                title="Remove from specials"
                style={{ color: '#c40000', marginTop: 2 }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
      <div className="adm-section-head">
        <div>
          <h3 className="adm-subtitle"><DollarSign size={16} /> PROTO75 — Cart checkout discount</h3>
          <p className="adm-section-note">Amount deducted at cart checkout on site.proto.co.za when customers enter the promo code.</p>
        </div>
        <button type="button" onClick={() => void loadCheckoutPromo()} className="adm-btn-ghost"><RefreshCw size={15} /></button>
      </div>
      <div className="adm-responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720, marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
          <input type="checkbox" checked={checkoutPromo.active} onChange={(e) => setCheckoutPromo((p) => ({ ...p, active: e.target.checked }))} style={{ accentColor: '#dc2626' }} />
          Active at checkout
        </label>
        <label>
          <span className="adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Promo code</span>
          <input className="adm-field-input" style={{ width: '100%' }} value={checkoutPromo.code} onChange={(e) => setCheckoutPromo((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
        </label>
        <label>
          <span className="adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Discount %</span>
          <input className="adm-field-input" type="number" min="0" max="50" step="0.5" style={{ width: '100%' }} value={checkoutPromo.percent} onChange={(e) => setCheckoutPromo((p) => ({ ...p, percent: Number(e.target.value) }))} />
        </label>
        <label>
          <span className="adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Cart label</span>
          <input className="adm-field-input" style={{ width: '100%' }} value={checkoutPromo.label} onChange={(e) => setCheckoutPromo((p) => ({ ...p, label: e.target.value }))} />
        </label>
      </div>
      <button type="button" className="adm-btn-red" disabled={checkoutPromoSaving} onClick={() => void savePromo()} style={{ marginBottom: 24 }}>
        {checkoutPromoSaving ? 'Saving…' : 'Save PROTO75 checkout promo'}
      </button>

      <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
      <div className="adm-section-head">
        <div>
          <h3 className="adm-subtitle"><Megaphone size={16} /> Popup / Banner Promo</h3>
          <p className="adm-section-note">Flyer popup shown once per customer when they log in (while active).</p>
        </div>
        <button type="button" onClick={() => void loadPopup()} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
      </div>
      <div className="adm-responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
            <input type="checkbox" checked={popupForm.active} onChange={(e) => setPopupForm((p) => ({ ...p, active: e.target.checked }))} style={{ accentColor: '#dc2626' }} />
            Active — show popup to logged-in customers
          </label>
          <div>
            <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Admin label (optional)</label>
            <input className="adm-field-input" style={{ width: '100%' }} value={popupForm.title} onChange={(e) => setPopupForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. June clearance flyer" />
          </div>
          <div>
            <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Flyer image</label>
            <label className="adm-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <ImagePlus size={15} /> {popupUploading ? 'Uploading…' : 'Upload flyer'}
              <input type="file" accept="image/*" hidden onChange={(e) => { void handlePopupImage(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          <button type="button" className="adm-btn-red" disabled={popupSaving} onClick={() => void savePopup()}>{popupSaving ? 'Saving…' : 'Save popup'}</button>
        </div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, background: '#f9fafb', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {popupForm.imageUrl
            ? <img src={popupForm.imageUrl} alt="Popup preview" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8 }} />
            : <span className="adm-muted">No image uploaded</span>}
        </div>
      </div>
    </div>
  );
}
