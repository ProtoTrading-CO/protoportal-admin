function findNode(tree, id) {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

function childrenOf(tree, id) {
  return findNode(tree, id)?.children || [];
}

/**
 * Cascading category picker for the image-upload flows (Single, Folder,
 * Nutstore). Renders the parent category plus every subcategory level that
 * exists beneath the current selection (subcategory_one → four), so a deep
 * path like Textiles → Ribbons → Satin → 25mm can be chosen in full. Changing
 * a level clears everything below it.
 */
export default function BatchCategoryPicker({
  taxonomyTree,
  categoryLabel = 'Default category (new products)',
  categoryPlaceholder = '— Select if needed —',
  categoryId,
  setCategoryId,
  sub1Id,
  setSub1Id,
  sub2Id,
  setSub2Id,
  sub3Id,
  setSub3Id,
  sub4Id,
  setSub4Id,
}) {
  const sub1Options = categoryId ? childrenOf(taxonomyTree, categoryId) : [];
  const sub2Options = sub1Id ? childrenOf(taxonomyTree, sub1Id) : [];
  const sub3Options = sub2Id ? childrenOf(taxonomyTree, sub2Id) : [];
  const sub4Options = sub3Id ? childrenOf(taxonomyTree, sub3Id) : [];

  const onCategory = (v) => {
    setCategoryId(v);
    setSub1Id('');
    setSub2Id('');
    setSub3Id('');
    setSub4Id('');
  };
  const onSub1 = (v) => {
    setSub1Id(v);
    setSub2Id('');
    setSub3Id('');
    setSub4Id('');
  };
  const onSub2 = (v) => {
    setSub2Id(v);
    setSub3Id('');
    setSub4Id('');
  };
  const onSub3 = (v) => {
    setSub3Id(v);
    setSub4Id('');
  };

  return (
    <>
      <label>
        {categoryLabel}
        <select className="adm-select adm-select--enhanced" value={categoryId} onChange={(e) => onCategory(e.target.value)}>
          <option value="">{categoryPlaceholder}</option>
          {taxonomyTree.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
        </select>
      </label>
      {sub1Options.length > 0 && (
        <label>
          Subcategory
          <select className="adm-select adm-select--enhanced" value={sub1Id} onChange={(e) => onSub1(e.target.value)}>
            <option value="">— Optional —</option>
            {sub1Options.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
        </label>
      )}
      {sub2Options.length > 0 && (
        <label>
          Subcategory 2
          <select className="adm-select adm-select--enhanced" value={sub2Id} onChange={(e) => onSub2(e.target.value)}>
            <option value="">— Optional —</option>
            {sub2Options.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
        </label>
      )}
      {sub3Options.length > 0 && (
        <label>
          Subcategory 3
          <select className="adm-select adm-select--enhanced" value={sub3Id} onChange={(e) => onSub3(e.target.value)}>
            <option value="">— Optional —</option>
            {sub3Options.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
        </label>
      )}
      {sub4Options.length > 0 && (
        <label>
          Subcategory 4
          <select className="adm-select adm-select--enhanced" value={sub4Id} onChange={(e) => setSub4Id(e.target.value)}>
            <option value="">— Optional —</option>
            {sub4Options.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
          </select>
        </label>
      )}
    </>
  );
}
