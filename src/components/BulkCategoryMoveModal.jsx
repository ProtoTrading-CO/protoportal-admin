import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { resolvePathLabels } from './CategorySidebar';
import { childrenOfTree, subcategoryOptionsFromTree } from '../lib/taxonomyAdmin';

export default function BulkCategoryMoveModal({
  open,
  count = 0,
  tree = [],
  initialCategoryId = '',
  pending = false,
  onClose,
  onConfirm,
  onAddSubcategory,
}) {
  const mainCategories = tree;
  const [categoryId, setCategoryId] = useState('');
  const [child1Id, setChild1Id] = useState('');
  const [child2Id, setChild2Id] = useState('');
  const [child3Id, setChild3Id] = useState('');
  const [child4Id, setChild4Id] = useState('');

  useEffect(() => {
    if (!open) return;
    setCategoryId(initialCategoryId || mainCategories[0]?.id || '');
    setChild1Id('');
    setChild2Id('');
    setChild3Id('');
    setChild4Id('');
  }, [open, initialCategoryId, mainCategories]);

  const child1Options = useMemo(() => subcategoryOptionsFromTree(tree, categoryId), [tree, categoryId]);
  const child2Options = useMemo(() => childrenOfTree(tree, child1Id), [tree, child1Id]);
  const child3Options = useMemo(() => childrenOfTree(tree, child2Id), [tree, child2Id]);
  const child4Options = useMemo(() => childrenOfTree(tree, child3Id), [tree, child3Id]);

  const categoryPathIds = [categoryId, child1Id, child2Id, child3Id, child4Id].filter(Boolean);
  const deepestId = child4Id || child3Id || child2Id || child1Id;
  const previewLabel = categoryPathIds.length >= 2
    ? resolvePathLabels(tree, categoryPathIds).join(' › ')
    : 'Select a main category and subcategory';

  if (!open) return null;

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h3 className="adm-modal-title">
            Move {count} product{count === 1 ? '' : 's'}
          </h3>
          <button type="button" className="adm-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="adm-modal-note">Choose the destination category and subcategories for the selected products.</p>
        <p className="adm-modal-note" style={{ fontWeight: 700, color: '#334155' }}>
          Destination: {previewLabel}
        </p>
        <div className="adm-modal-body">
          <label className="adm-field">
            <span className="adm-field-label">Main category</span>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setChild1Id('');
                setChild2Id('');
                setChild3Id('');
                setChild4Id('');
              }}
              className="adm-select adm-select--enhanced"
            >
              {mainCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          {child1Options.length > 0 && (
            <label className="adm-field">
              <span className="adm-field-label">Subcategory 1</span>
              <select
                value={child1Id}
                onChange={(e) => {
                  setChild1Id(e.target.value);
                  setChild2Id('');
                  setChild3Id('');
                  setChild4Id('');
                }}
                className="adm-select adm-select--enhanced"
              >
                <option value="">— Select —</option>
                {child1Options.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          )}
          {child1Id && child2Options.length > 0 && (
            <label className="adm-field">
              <span className="adm-field-label">Subcategory 2</span>
              <select
                value={child2Id}
                onChange={(e) => {
                  setChild2Id(e.target.value);
                  setChild3Id('');
                  setChild4Id('');
                }}
                className="adm-select adm-select--enhanced"
              >
                <option value="">— Select —</option>
                {child2Options.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          )}
          {child2Id && child3Options.length > 0 && (
            <label className="adm-field">
              <span className="adm-field-label">Subcategory 3</span>
              <select
                value={child3Id}
                onChange={(e) => {
                  setChild3Id(e.target.value);
                  setChild4Id('');
                }}
                className="adm-select adm-select--enhanced"
              >
                <option value="">— Select —</option>
                {child3Options.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          )}
          {child3Id && child4Options.length > 0 && (
            <label className="adm-field">
              <span className="adm-field-label">Subcategory 4</span>
              <select
                value={child4Id}
                onChange={(e) => setChild4Id(e.target.value)}
                className="adm-select adm-select--enhanced"
              >
                <option value="">— Select —</option>
                {child4Options.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="adm-modal-footer">
          {onAddSubcategory && (
            <button
              type="button"
              className="adm-btn-ghost"
              onClick={() => onAddSubcategory(deepestId || categoryId)}
            >
              Add subcategory here
            </button>
          )}
          <button type="button" className="adm-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="adm-btn-red"
            disabled={pending || categoryPathIds.length < 2}
            onClick={() => onConfirm({
              categoryPathIds,
              categoryId,
              subcategoryId: deepestId,
              previewLabel,
            })}
          >
            {pending ? 'Moving…' : 'Confirm move'}
          </button>
        </div>
      </div>
    </div>
  );
}
