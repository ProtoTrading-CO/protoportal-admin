import { useCallback, useEffect, useState } from 'react';
import { fetchReorderProducts, updateProduct } from '../lib/products';
import { subcategoryOptionsFromTree } from '../lib/taxonomyAdmin';
import { saveSpecials } from '../lib/specials';

// Pricing — bulk-adjust selected products by a percentage and stamp them
// onto This Week's Specials. Extracted from AdminPage so state, load and
// apply handlers live with the panel. The Specials list is still owned by
// AdminPage because Product Manager's star toggle mutates the same array.
export default function PricingPanel({
  taxonomyTree = [],
  specials,
  onSpecialsChange,
  onShowToast,
}) {
  const mainCategories = (taxonomyTree || []).map((c) => ({ id: c.id, label: c.label }));
  const [category, setCategory] = useState(mainCategories[0]?.id || '');
  const [subcategory, setSubcategory] = useState('all');
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [delta, setDelta] = useState('-10');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const toast = useCallback((message, type = 'success') => {
    onShowToast?.(message, type);
  }, [onShowToast]);

  const load = useCallback(async (categoryId) => {
    if (!categoryId) return;
    setLoading(true);
    try {
      const rows = await fetchReorderProducts({ mainCategory: categoryId });
      setProducts(rows);
    } catch (err) {
      toast(err.message || 'Failed to load products', 'error');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(category); }, [category, load]);

  useEffect(() => {
    if (!mainCategories.some((c) => c.id === category) && mainCategories[0]?.id) {
      setCategory(mainCategories[0].id);
    }
  }, [mainCategories, category]);

  const visible = subcategory === 'all'
    ? products
    : products.filter((p) => p.categoryPath?.[1] === subcategory);

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) return setSelectedIds([]);
    setSelectedIds(products.map((p) => p.id));
  };

  const applyPricing = async () => {
    const pct = Number(delta || 0);
    if (!Number.isFinite(pct) || pct === 0) {
      toast('Enter a non-zero percentage', 'error');
      return;
    }
    if (!selectedIds.length) {
      toast('Select at least one product', 'error');
      return;
    }
    setSaving(true);
    try {
      const selected = products.filter((p) => selectedIds.includes(p.id));
      await Promise.all(selected.map((p) => updateProduct(p.id, {
        price: Number(((p.price || 0) * (1 + pct / 100)).toFixed(2)),
      })));

      // Add newly-repriced items to This Week's Specials (capped at 10).
      const nextSpecials = [...(specials || [])];
      const seen = new Set(nextSpecials.map((s) => s.productId));
      for (const product of selected) {
        if (seen.has(product.id)) continue;
        if (nextSpecials.length >= 10) break;
        nextSpecials.push({
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          productImage: product.image || '',
          deal: 'none',
          discountPct: 10,
          bogoX: 1,
          bogoY: 1,
        });
        seen.add(product.id);
      }
      if (nextSpecials.length !== (specials || []).length) {
        await saveSpecials(nextSpecials);
        onSpecialsChange?.(nextSpecials);
      }
      await load(category);
      toast(`Updated ${selected.length} product price(s) — added to This Week's Specials`);
    } catch (err) {
      toast(err.message || 'Pricing update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title">Pricing</h2>
          <p className="adm-section-note">Select products and apply a percentage price adjustment.</p>
        </div>
      </div>
      <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setSubcategory('all'); setSelectedIds([]); }}
          className="adm-select"
        >
          {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <select
          value={subcategory}
          onChange={(e) => { setSubcategory(e.target.value); setSelectedIds([]); }}
          className="adm-select"
        >
          <option value="all">All subcategories</option>
          {subcategoryOptionsFromTree(taxonomyTree, category).map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={toggleSelectAll}
          className="adm-btn-ghost"
          disabled={loading}
        >
          {selectedIds.length === products.length ? 'Clear all' : 'Select all'}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="adm-tiny-input"
            placeholder="-10"
          />
          <button
            type="button"
            onClick={() => void applyPricing()}
            className="adm-btn-red"
            disabled={saving}
          >
            {saving ? 'Applying…' : 'Apply %'}
          </button>
        </div>
      </div>
      <div className="adm-checkbox-list">
        {visible.map((product) => (
          <label
            key={product.id}
            className={`adm-checkbox-row${selectedIds.includes(product.id) ? ' adm-checkbox-row--pricing-selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(product.id)}
              onChange={(e) => setSelectedIds((prev) => (
                e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id)
              ))}
            />
            <span style={{ fontWeight: 700 }}>{product.name}</span>
            <small className="adm-muted">
              {product.code}{product.price > 0 ? ` · R${Number(product.price).toFixed(2)}` : ''}
            </small>
          </label>
        ))}
        {loading && (
          <p className="adm-muted" style={{ padding: 12 }}>Loading products…</p>
        )}
        {!loading && !visible.length && (
          <p className="adm-muted" style={{ padding: 12 }}>No products in this selection.</p>
        )}
      </div>
    </div>
  );
}
