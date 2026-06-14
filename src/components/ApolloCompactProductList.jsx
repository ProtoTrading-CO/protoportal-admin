import { Image } from 'lucide-react';

/** Compact product rows for Apollo image wizard (prefilled from Product Manager). */
export default function ApolloCompactProductList({
  products = [],
  selectedIds,
  onSelectedIdsChange,
}) {
  const toggle = (id) => {
    onSelectedIdsChange((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const ids = products.map((p) => p.id);
    const allOn = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    onSelectedIdsChange(() => (allOn ? new Set() : new Set(ids)));
  };

  const allSelected = products.length > 0 && products.every((p) => selectedIds.has(p.id));

  return (
    <div className="apollo-compact-list">
      <div className="apollo-compact-list-head">
        <span className="adm-muted">{selectedIds.size} of {products.length} selected</span>
        <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={selectAll}>
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="apollo-compact-list-rows">
        {products.map((p) => {
          const id = p.id || p.sku;
          const on = selectedIds.has(id);
          return (
            <label key={id} className={`apollo-compact-row${on ? ' apollo-compact-row--on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(id)} />
              {p.image ? (
                <img src={p.image} alt="" className="adm-product-thumb" />
              ) : (
                <div className="adm-product-thumb adm-product-thumb--placeholder"><Image size={14} /></div>
              )}
              <div className="apollo-compact-row-meta">
                <strong>{p.title || p.name || p.sku}</strong>
                <span className="adm-muted">
                  {p.sku && <>WSK: {p.sku}</>}
                  {p.barcode && <> · BC: {p.barcode}</>}
                </span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
