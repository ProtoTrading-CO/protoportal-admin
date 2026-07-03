import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { resolvePathLabels } from './CategorySidebar';
import { subcategoryOptionsFromTree } from '../lib/taxonomyAdmin';

function childrenOf(tree, id) {
  if (!id) return [];
  const stack = [...(tree || [])];
  while (stack.length) {
    const node = stack.shift();
    if (node.id === id) return node.children || [];
    if (node.children?.length) stack.push(...node.children);
  }
  return [];
}

export default function BulkMoveModal({
  open,
  count,
  taxonomyTree = [],
  initialCategoryId = '',
  saving = false,
  onClose,
  onConfirm,
  onAddSubcategory,
}) {
  const mainCategories = useMemo(
    () => (taxonomyTree || []).map((c) => ({ id: c.id, label: c.label })),
    [taxonomyTree],
  );

  const [moveCategoryId, setMoveCategoryId] = useState('');
  const [moveChild1Id, setMoveChild1Id] = useState('');
  const [moveChild2Id, setMoveChild2Id] = useState('');
  const [moveChild3Id, setMoveChild3Id] = useState('');
  const [moveChild4Id, setMoveChild4Id] = useState('');

  useEffect(() => {
    if (!open) return;
    setMoveCategoryId(initialCategoryId || mainCategories[0]?.id || '');
    setMoveChild1Id('');
    setMoveChild2Id('');
    setMoveChild3Id('');
    setMoveChild4Id('');
  }, [open, initialCategoryId, mainCategories]);

  if (!open) return null;

  const child1Options = subcategoryOptionsFromTree(taxonomyTree, moveCategoryId);
  const child2Options = childrenOf(taxonomyTree, moveChild1Id);
  const child3Options = childrenOf(taxonomyTree, moveChild2Id);
  const child4Options = childrenOf(taxonomyTree, moveChild3Id);
  const deepestId = moveChild4Id || moveChild3Id || moveChild2Id || moveChild1Id;
  // Contiguous path only — never allow a gap (e.g. child2 empty while child3 is set).
  // The UI already resets deeper selects when a parent changes, but we assert
  // it here so the server never sees a spliced [main, empty, sub2] path.
  const rawPath = [moveCategoryId, moveChild1Id, moveChild2Id, moveChild3Id, moveChild4Id];
  const firstEmpty = rawPath.findIndex((seg) => !seg);
  const contiguousPath = firstEmpty === -1 ? rawPath : rawPath.slice(0, firstEmpty);
  const hasPathGap = rawPath.some((seg, i) => !seg && rawPath.slice(i + 1).some(Boolean));
  const movePreviewLabel = contiguousPath.length >= 2
    ? resolvePathLabels(taxonomyTree, contiguousPath).join(' › ')
    : 'Select a main category and subcategory';

  const handleConfirm = () => {
    if (hasPathGap) return;
    if (contiguousPath.length < 2) return;
    const categoryPathIds = contiguousPath;
    const finalSubId = categoryPathIds[categoryPathIds.length - 1];
    onConfirm?.({
      categoryPathIds,
      categoryId: moveCategoryId,
      subcategoryId: finalSubId,
      destinationLabel: movePreviewLabel,
    });
  };

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3 className="adm-modal-title">Move {count} product{count === 1 ? '' : 's'}</h3>
          <button type="button" className="adm-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="adm-modal-note">Choose the destination category. Products update on the trade website immediately.</p>
        <p className="adm-modal-note" style={{ fontWeight: 700, color: '#334155' }}>
          Destination: {movePreviewLabel}
        </p>
        <div className="adm-modal-body">
          <label className="adm-field">
            <span className="adm-field-label">Main category</span>
            <select
              value={moveCategoryId}
              onChange={(e) => {
                setMoveCategoryId(e.target.value);
                setMoveChild1Id('');
                setMoveChild2Id('');
                setMoveChild3Id('');
                setMoveChild4Id('');
              }}
              className="adm-select adm-select--enhanced"
            >
              {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          {child1Options.length > 0 && (
            <label className="adm-field">
              <span className="adm-field-label">Child category 1</span>
              <select
                value={moveChild1Id}
                onChange={(e) => {
                  setMoveChild1Id(e.target.value);
                  setMoveChild2Id('');
                  setMoveChild3Id('');
                  setMoveChild4Id('');
                }}
                className="adm-select adm-select--enhanced"
              >
                <option value="">— None —</option>
                {child1Options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          )}
          {moveChild1Id && child2Options.length > 0 && (
            <label className="adm-field">
              <span className="adm-field-label">Child category 2</span>
              <select
                value={moveChild2Id}
                onChange={(e) => {
                  setMoveChild2Id(e.target.value);
                  setMoveChild3Id('');
                  setMoveChild4Id('');
                }}
                className="adm-select adm-select--enhanced"
              >
                <option value="">— None —</option>
                {child2Options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          )}
          {moveChild2Id && child3Options.length > 0 && (
            <label className="adm-field">
              <span className="adm-field-label">Child category 3</span>
              <select
                value={moveChild3Id}
                onChange={(e) => {
                  setMoveChild3Id(e.target.value);
                  setMoveChild4Id('');
                }}
                className="adm-select adm-select--enhanced"
              >
                <option value="">— None —</option>
                {child3Options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          )}
          {moveChild3Id && child4Options.length > 0 && (
            <label className="adm-field">
              <span className="adm-field-label">Child category 4</span>
              <select
                value={moveChild4Id}
                onChange={(e) => setMoveChild4Id(e.target.value)}
                className="adm-select adm-select--enhanced"
              >
                <option value="">— None —</option>
                {child4Options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="adm-modal-footer">
          <button
            type="button"
            className="adm-modal-link-btn adm-modal-link-btn--add"
            onClick={() => onAddSubcategory?.(deepestId || moveCategoryId)}
          >
            <Plus size={15} strokeWidth={2.5} /> New subcategory
          </button>
          <div className="adm-modal-footer__actions">
            <button type="button" className="adm-btn-ghost" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="adm-btn-red"
              onClick={handleConfirm}
              disabled={saving || contiguousPath.length < 2 || hasPathGap}
            >
              {saving ? 'Moving…' : 'Confirm move'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
