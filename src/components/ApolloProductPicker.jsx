import { useCallback, useEffect, useState } from 'react';
import { Image, Loader2, Search } from 'lucide-react';
import CategorySidebar from './CategorySidebar';
import { fetchAdminProductsPage } from '../lib/products';

export default function ApolloProductPicker({
  taxonomyTree = [],
  selectedIds,
  onSelectedIdsChange,
}) {
  const [categoryPath, setCategoryPath] = useState([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 80;

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminProductsPage({
        page,
        pageSize,
        searchQuery: searchDebounced,
        categoryPathFilter: categoryPath,
      });
      setRows(data.rows);
      setTotal(data.total);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchDebounced, categoryPath]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [categoryPath, searchDebounced]);

  const toggle = (id) => {
    onSelectedIdsChange((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInView = () => {
    const ids = rows.map((p) => p.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    onSelectedIdsChange((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="apollo-picker">
      <div className="apollo-picker-layout">
        <CategorySidebar
          tree={taxonomyTree}
          selectedPath={categoryPath}
          onSelectPath={setCategoryPath}
        />
        <div className="apollo-picker-main">
          <div className="apollo-picker-toolbar">
            <label className="adm-search apollo-picker-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU, barcode, name…"
                className="adm-search-input"
              />
            </label>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={selectAllInView}>
              {rows.length > 0 && rows.every((p) => selectedIds.has(p.id)) ? 'Deselect view' : `Select all in view (${rows.length})`}
            </button>
            <span className="adm-muted">{selectedIds.size} selected · {total} products</span>
          </div>

          {loading ? (
            <div className="adm-loading-inline"><Loader2 size={18} className="spin" /> Loading products…</div>
          ) : (
            <div className="apollo-picker-grid">
              {rows.map((p) => (
                <label key={p.id} className={`apollo-picker-card${selectedIds.has(p.id) ? ' apollo-picker-card--on' : ''}`}>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggle(p.id)} />
                  <div className="apollo-picker-thumbs">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="apollo-picker-thumb">
                        {p.images?.[i] ? <img src={p.images[i]} alt="" /> : <Image size={12} color="#cbd5e1" />}
                      </div>
                    ))}
                  </div>
                  <div className="apollo-picker-meta">
                    <strong>{p.name}</strong>
                    <span>{p.sku || p.id}</span>
                  </div>
                </label>
              ))}
              {!rows.length && <p className="adm-muted">No products in this category.</p>}
            </div>
          )}

          {totalPages > 1 && (
            <div className="apollo-picker-pager">
              <button type="button" className="adm-btn-ghost adm-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span className="adm-muted">Page {page} / {totalPages}</span>
              <button type="button" className="adm-btn-ghost adm-btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
