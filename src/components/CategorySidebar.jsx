import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';

function buildPathFromRoot(tree, targetId, path = []) {
  for (const node of tree) {
    const next = [...path, node.id];
    if (node.id === targetId) return next;
    if (node.children?.length) {
      const hit = buildPathFromRoot(node.children, targetId, next);
      if (hit) return hit;
    }
  }
  return null;
}

function nodeMatches(node, query) {
  return String(node.label || '').toLowerCase().includes(query);
}

function filterTree(nodes, query) {
  if (!query) return nodes;
  const out = [];
  for (const node of nodes || []) {
    const childMatches = node.children?.length ? filterTree(node.children, query) : [];
    if (nodeMatches(node, query) || childMatches.length) {
      out.push({
        ...node,
        children: nodeMatches(node, query) ? (node.children || []) : childMatches,
      });
    }
  }
  return out;
}

function collectIds(nodes, ids = []) {
  for (const node of nodes || []) {
    ids.push(node.id);
    if (node.children?.length) collectIds(node.children, ids);
  }
  return ids;
}

function RowActions({ node, nodeType, onEditNode, onDeleteNode, onAddChild }) {
  const [open, setOpen] = useState(false);

  if (!onEditNode && !onDeleteNode && !onAddChild) return null;

  return (
    <div className={`cat-sidebar-actions${open ? ' cat-sidebar-actions--open' : ''}`}>
      <button
        type="button"
        className="cat-sidebar-actions-trigger"
        aria-label={`Actions for ${node.label}`}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <button type="button" className="cat-sidebar-actions-backdrop" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="cat-sidebar-actions-menu" role="menu">
            {onAddChild && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); onAddChild(node.id); setOpen(false); }}
              >
                <Plus size={14} /> Add child
              </button>
            )}
            {onEditNode && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); onEditNode({ id: node.id, label: node.label, type: nodeType }); setOpen(false); }}
              >
                <Pencil size={14} /> Rename
              </button>
            )}
            {onDeleteNode && (
              <button
                type="button"
                role="menuitem"
                className="cat-sidebar-actions-menu--danger"
                onClick={(e) => { e.stopPropagation(); onDeleteNode({ id: node.id, label: node.label, type: nodeType }); setOpen(false); }}
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CategoryRow({
  node,
  depth,
  selectedPath,
  pathHere,
  hasChildren,
  open,
  onToggle,
  onSelect,
  nodeType,
  onEditNode,
  onDeleteNode,
  onAddChild,
}) {
  const isSelected = selectedPath.length > 0 && selectedPath[selectedPath.length - 1] === node.id;
  const isOnPath = selectedPath.includes(node.id);

  return (
    <div
      className={`cat-sidebar-item-row${isSelected ? ' cat-sidebar-item-row--active' : ''}${isOnPath && !isSelected ? ' cat-sidebar-item-row--path' : ''}`}
      style={{ '--cat-depth': depth }}
    >
      {hasChildren ? (
        <button
          type="button"
          className="cat-sidebar-toggle"
          aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {open ? <ChevronDown size={16} strokeWidth={2.2} /> : <ChevronRight size={16} strokeWidth={2.2} />}
        </button>
      ) : (
        <span className="cat-sidebar-toggle cat-sidebar-toggle--spacer" aria-hidden="true" />
      )}
      <button
        type="button"
        className="cat-sidebar-item"
        onClick={onSelect}
        title={node.label}
      >
        <span className="cat-sidebar-label">{node.label}</span>
      </button>
      <RowActions
        node={node}
        nodeType={nodeType}
        onEditNode={onEditNode}
        onDeleteNode={onDeleteNode}
        onAddChild={onAddChild}
      />
    </div>
  );
}

function TreeBranch({
  node,
  depth,
  selectedPath,
  onSelectPath,
  isOpen,
  onToggle,
  ancestors,
  onEditNode,
  onDeleteNode,
  onAddChild,
  forceOpen,
}) {
  const hasChildren = node.children?.length > 0;
  const pathHere = [...ancestors, node.id];
  const open = forceOpen || isOpen(node.id);

  return (
    <div className="cat-sidebar-node">
      <CategoryRow
        node={node}
        depth={depth}
        selectedPath={selectedPath}
        pathHere={pathHere}
        hasChildren={hasChildren}
        open={open}
        onToggle={() => onToggle(node.id)}
        onSelect={() => onSelectPath(pathHere)}
        nodeType="subcategory"
        onEditNode={onEditNode}
        onDeleteNode={onDeleteNode}
        onAddChild={onAddChild}
      />
      {hasChildren && open && node.children.map((child) => (
        <TreeBranch
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelectPath={onSelectPath}
          isOpen={isOpen}
          onToggle={onToggle}
          ancestors={pathHere}
          onEditNode={onEditNode}
          onDeleteNode={onDeleteNode}
          onAddChild={onAddChild}
          forceOpen={forceOpen}
        />
      ))}
    </div>
  );
}

/** Expandable category tree — up to 4 sub-levels under each main category. */
export default function CategorySidebar({
  tree = [],
  selectedPath = [],
  onSelectPath,
  showUncategorized = false,
  uncategorizedCount = 0,
  onEditNode,
  onDeleteNode,
  onAddChild,
  showSearch = true,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [filter, setFilter] = useState('');

  const filterQuery = filter.trim().toLowerCase();
  const displayTree = useMemo(
    () => (filterQuery ? filterTree(tree, filterQuery) : tree),
    [tree, filterQuery],
  );

  useEffect(() => {
    if (!selectedPath.length) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      selectedPath.forEach((id) => next.add(id));
      return next;
    });
    setCollapsed((prev) => {
      const next = new Set(prev);
      selectedPath.forEach((id) => next.delete(id));
      return next;
    });
  }, [selectedPath.join('|')]);

  useEffect(() => {
    if (!filterQuery) return;
    const ids = collectIds(displayTree);
    setExpanded((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setCollapsed(new Set());
  }, [filterQuery, displayTree]);

  const isOpen = (id) => {
    if (filterQuery) return true;
    const isOnPath = selectedPath.includes(id);
    return (expanded.has(id) || isOnPath) && !collapsed.has(id);
  };

  const toggle = (id) => {
    if (filterQuery) return;
    const open = isOpen(id);
    if (open) {
      setCollapsed((prev) => new Set(prev).add(id));
    } else {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setExpanded((prev) => new Set(prev).add(id));
    }
  };

  const handleSelectRoot = (nodeId) => {
    const path = buildPathFromRoot(tree, nodeId) || [nodeId];
    onSelectPath(path);
  };

  return (
    <div className="cat-sidebar-wrap">
      {showSearch && (
        <label className="cat-sidebar-search">
          <Search size={15} />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search categories…"
            className="cat-sidebar-search-input"
            aria-label="Search categories"
          />
        </label>
      )}

      <nav className="cat-sidebar" aria-label="Category filter">
        <button
          type="button"
          className={`cat-sidebar-all${!selectedPath.length ? ' cat-sidebar-all--active' : ''}`}
          onClick={() => onSelectPath([])}
        >
          <FolderTree size={16} strokeWidth={2.2} />
          <span>All categories</span>
        </button>

        {showUncategorized && (
          <button
            type="button"
            className={`cat-sidebar-all cat-sidebar-all--sub${selectedPath[0] === '__uncategorized__' ? ' cat-sidebar-all--active' : ''}`}
            onClick={() => onSelectPath(['__uncategorized__'])}
          >
            <span>Uncategorized{uncategorizedCount > 0 ? ` (${uncategorizedCount})` : ''}</span>
          </button>
        )}

        {displayTree.map((node) => (
          <div key={node.id} className="cat-sidebar-root">
            <CategoryRow
              node={node}
              depth={0}
              selectedPath={selectedPath}
              pathHere={[node.id]}
              hasChildren={!!node.children?.length}
              open={isOpen(node.id)}
              onToggle={() => toggle(node.id)}
              onSelect={() => handleSelectRoot(node.id)}
              nodeType="category"
              onEditNode={onEditNode}
              onDeleteNode={onDeleteNode}
              onAddChild={onAddChild}
            />
            {node.children?.length && isOpen(node.id) && node.children.map((child) => (
              <TreeBranch
                key={child.id}
                node={child}
                depth={1}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
                isOpen={isOpen}
                onToggle={toggle}
                ancestors={[node.id]}
                onEditNode={onEditNode}
                onDeleteNode={onDeleteNode}
                onAddChild={onAddChild}
                forceOpen={!!filterQuery}
              />
            ))}
          </div>
        ))}

        {filterQuery && !displayTree.length && (
          <p className="cat-sidebar-empty">No categories match &ldquo;{filter.trim()}&rdquo;</p>
        )}
      </nav>
    </div>
  );
}
