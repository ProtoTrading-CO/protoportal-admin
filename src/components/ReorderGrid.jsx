import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grip, ImagePlus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { subcategoryOptionsFromTree } from '../lib/taxonomyAdmin';

function deepestGroupKey(product, mainCategoryId) {
  const path = product.categoryPath || [];
  if (!path.length || path[0] !== mainCategoryId) return '__other__';
  for (let i = path.length - 1; i >= 1; i -= 1) {
    if (path[i]) return path[i];
  }
  return path[1] || '__other__';
}

function groupBySubcategory(products, mainCategoryId, tree) {
  const subs = subcategoryOptionsFromTree(tree, mainCategoryId);
  const allSubs = new Map();
  function walk(nodes, prefix = '') {
    for (const n of nodes || []) {
      const label = prefix ? `${prefix} › ${n.label}` : n.label;
      allSubs.set(n.id, label);
      walk(n.children, label);
    }
  }
  walk(subs.length ? subs : tree.find((c) => c.id === mainCategoryId)?.children || []);

  const groups = new Map();
  products.forEach((p) => {
    const key = deepestGroupKey(p, mainCategoryId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });

  const ordered = [];
  const seen = new Set();
  for (const [id, label] of allSubs) {
    if (groups.has(id) && groups.get(id).length) {
      ordered.push({ id, label, products: groups.get(id) });
      seen.add(id);
    }
  }
  for (const [key, prods] of groups) {
    if (key !== '__other__' && !seen.has(key) && prods.length) {
      ordered.push({ id: key, label: allSubs.get(key) || key.replace(/-/g, ' '), products: prods });
    }
  }
  if (groups.has('__other__') && groups.get('__other__').length) {
    ordered.push({ id: '__other__', label: 'Other', products: groups.get('__other__') });
  }
  return ordered;
}

function sameOrder(a, b) {
  return a.length === b.length && a.every((p, i) => p.id === b[i]?.id);
}

function reorderInsert(prev, moveSet, targetId, { toTop = false } = {}) {
  if (!moveSet.size) return prev;
  if (!toTop && moveSet.has(targetId)) return prev;

  const moving = prev.filter((p) => moveSet.has(p.id));
  const rest = prev.filter((p) => !moveSet.has(p.id));

  let next;
  if (toTop) {
    next = [...moving, ...rest];
  } else {
    const idx = rest.findIndex((p) => p.id === targetId);
    if (idx < 0) return prev;
    next = [...rest.slice(0, idx), ...moving, ...rest.slice(idx)];
  }

  return sameOrder(prev, next) ? prev : next;
}

export default function ReorderGrid({
  products,
  onProductsChange,
  selectedIds,
  onToggleSelect,
  mainCategoryId,
  taxonomyTree,
  loading,
  dragDisabled = false,
  onEditProduct,
  onEditSubcategory,
  onDeleteSubcategory,
  onPersistOrder,
}) {
  const scrollRef = useRef(null);
  const scrollRafRef = useRef(null);
  const dragIdRef = useRef(null);
  const overIdRef = useRef(null);
  const moveSetRef = useRef(new Set());
  const pointerRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const captureElRef = useRef(null);
  const captureIdRef = useRef(null);
  const orderRef = useRef(products);
  orderRef.current = products;

  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [draggingSet, setDraggingSet] = useState(() => new Set());

  const groups = useMemo(
    () => groupBySubcategory(products, mainCategoryId, taxonomyTree),
    [products, mainCategoryId, taxonomyTree],
  );

  const getMoveSet = useCallback((id) => (
    selectedIds.has(id) ? new Set(selectedIds) : new Set([id])
  ), [selectedIds]);

  const applyReorder = useCallback((targetId, toTop = false) => {
    onProductsChange((prev) => {
      const next = reorderInsert(prev, moveSetRef.current, targetId, { toTop });
      orderRef.current = next;
      return next;
    });
  }, [onProductsChange]);

  const autoScroll = useCallback((clientY) => {
    const el = scrollRef.current;
    if (!el) return;
    const { top, bottom } = el.getBoundingClientRect();
    const zone = 80;
    const maxStep = 20;

    if (clientY < top + zone) {
      const t = 1 - Math.max(0, (clientY - top) / zone);
      el.scrollTop -= Math.ceil(maxStep * t);
    } else if (clientY > bottom - zone) {
      const t = 1 - Math.max(0, (bottom - clientY) / zone);
      el.scrollTop += Math.ceil(maxStep * t);
    }
  }, []);

  const resolveDropTarget = useCallback((x, y) => {
    const el = document.elementFromPoint(x, y);
    if (el?.closest('[data-reorder-top]')) return '__top__';
    const card = el?.closest('[data-reorder-id]');
    return card?.dataset.reorderId || null;
  }, []);

  const updateDropTarget = useCallback((x, y) => {
    autoScroll(y);
    const nextOver = resolveDropTarget(x, y);
    const currentDrag = dragIdRef.current;

    if (!nextOver || nextOver === currentDrag || moveSetRef.current.has(nextOver)) {
      if (overIdRef.current !== null) {
        overIdRef.current = null;
        setOverId(null);
      }
      return;
    }

    if (nextOver === overIdRef.current) return;

    overIdRef.current = nextOver;
    setOverId(nextOver);

    if (nextOver === '__top__') applyReorder(null, true);
    else applyReorder(nextOver, false);
  }, [autoScroll, resolveDropTarget, applyReorder]);

  const stopDragListeners = useRef(() => {});

  const endDrag = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }

    stopDragListeners.current();

    if (captureElRef.current?.releasePointerCapture && captureIdRef.current != null) {
      try { captureElRef.current.releasePointerCapture(captureIdRef.current); } catch { /* ignore */ }
    }
    captureElRef.current = null;
    captureIdRef.current = null;

    const hadDrag = !!dragIdRef.current;
    dragIdRef.current = null;
    overIdRef.current = null;
    moveSetRef.current = new Set();
    setDragId(null);
    setOverId(null);
    setDraggingSet(new Set());
    document.body.classList.remove('adm-is-reorder-dragging');

    if (hadDrag) onPersistOrder?.(orderRef.current);
  }, [onPersistOrder]);

  const onPointerMove = useCallback((e) => {
    pointerRef.current = { x: e.clientX, y: e.clientY };

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updateDropTarget(pointerRef.current.x, pointerRef.current.y);
      });
    }

    if (!scrollRafRef.current) {
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        autoScroll(pointerRef.current.y);
      });
    }
  }, [updateDropTarget, autoScroll]);

  const onPointerUp = useCallback(() => endDrag(), [endDrag]);

  const startDrag = useCallback((productId, e) => {
    if (dragDisabled) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    captureElRef.current = e.currentTarget;
    captureIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const moveSet = getMoveSet(productId);
    dragIdRef.current = productId;
    moveSetRef.current = moveSet;
    overIdRef.current = null;

    setDragId(productId);
    setOverId(null);
    setDraggingSet(new Set(moveSet));
    document.body.classList.add('adm-is-reorder-dragging');

    const move = (ev) => onPointerMove(ev);
    const up = () => onPointerUp();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    stopDragListeners.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragDisabled, getMoveSet, onPointerMove, onPointerUp]);

  useEffect(() => () => endDrag(), [endDrag]);

  return (
    <div className="adm-reorder-content" ref={scrollRef}>
      {loading && (
        <div className="adm-loading-inline">
          <Loader2 size={18} className="spin" /> Loading products…
        </div>
      )}
      {!loading && products.length === 0 && (
        <div className="adm-empty">No products match these filters.</div>
      )}

      <div
        data-reorder-top
        className={`adm-reorder-top-zone${dragId ? ' adm-reorder-top-zone--visible' : ''}${overId === '__top__' ? ' adm-reorder-top-zone--over' : ''}`}
      >
        ↑ Drop here to move to top
      </div>

      <div className="adm-reorder-grid">
        {groups.map((group) => (
          <div key={`grp-${group.id}`} className="adm-reorder-group">
            <div className="adm-reorder-group-header">
              <span>{group.label}</span>
              {group.id !== '__other__' && (
                <div className="adm-reorder-group-actions">
                  <button
                    type="button"
                    className="adm-reorder-cat-edit"
                    title="Edit subcategory name"
                    onClick={() => onEditSubcategory({ id: group.id, label: group.label, type: 'subcategory' })}
                  >
                    <Pencil size={11} />
                  </button>
                  {onDeleteSubcategory && (
                    <button
                      type="button"
                      className="adm-reorder-cat-edit adm-reorder-cat-edit--danger"
                      title="Delete subcategory"
                      onClick={() => onDeleteSubcategory({ id: group.id, label: group.label, type: 'subcategory' })}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
            {group.products.map((product) => {
              const isDragging = draggingSet.has(product.id);
              const isOver = overId === product.id && !isDragging;
              const isSelected = selectedIds.has(product.id);
              return (
                <div
                  key={product.id}
                  data-reorder-id={product.id}
                  className={`adm-reorder-card${isDragging ? ' adm-reorder-card--dragging' : ''}${isOver ? ' adm-reorder-card--over' : ''}${isSelected ? ' adm-reorder-card--selected' : ''}`}
                >
                  <div className="adm-reorder-card__bar">
                    <label
                      className="adm-reorder-check-wrap"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(product.id)}
                        className="adm-reorder-checkbox"
                        aria-label={`Select ${product.name}`}
                      />
                    </label>
                    {!dragDisabled && (
                      <span
                        className="adm-reorder-drag-handle"
                        aria-label={`Drag ${product.name}`}
                        onPointerDown={(e) => startDrag(product.id, e)}
                      >
                        <Grip size={13} />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEditProduct(product); }}
                      className="adm-reorder-edit-btn"
                      title="Edit image"
                    >
                      <ImagePlus size={16} />
                    </button>
                  </div>
                  <div className="adm-thumb adm-thumb--reorder">
                    {product.image
                      ? <img draggable={false} src={product.image} alt={product.name} />
                      : <span className="adm-muted">No image</span>}
                  </div>
                  <div className="adm-reorder-card-title">{product.name}</div>
                  <div className="adm-muted adm-reorder-card-code">{product.code}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
