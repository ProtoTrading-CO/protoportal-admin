import { useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree } from 'lucide-react';

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

function TreeBranch({ node, depth, selectedPath, onSelectPath, expanded, onToggle, ancestors }) {
  const hasChildren = node.children?.length > 0;
  const pathHere = [...ancestors, node.id];
  const isSelected = selectedPath.length > 0 && selectedPath[selectedPath.length - 1] === node.id;
  const isOnPath = selectedPath.includes(node.id);
  const isOpen = expanded.has(node.id) || isOnPath;

  return (
    <div className="cat-sidebar-node">
      <button
        type="button"
        className={`cat-sidebar-item${isSelected ? ' cat-sidebar-item--active' : ''}${isOnPath && !isSelected ? ' cat-sidebar-item--path' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelectPath(pathHere)}
      >
        {hasChildren ? (
          <span
            className="cat-sidebar-chevron"
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            role="presentation"
          >
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="cat-sidebar-chevron cat-sidebar-chevron--spacer" />
        )}
        <span className="cat-sidebar-label">{node.label}</span>
      </button>
      {hasChildren && isOpen && node.children.map((child) => (
        <TreeBranch
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelectPath={onSelectPath}
          expanded={expanded}
          onToggle={onToggle}
          ancestors={pathHere}
        />
      ))}
    </div>
  );
}

/** Expandable category tree — up to 4 sub-levels under each main category. */
export default function CategorySidebar({ tree = [], selectedPath = [], onSelectPath, showUncategorized = false, uncategorizedCount = 0 }) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectRoot = (nodeId) => {
    const path = buildPathFromRoot(tree, nodeId) || [nodeId];
    onSelectPath(path);
  };

  return (
    <nav className="cat-sidebar" aria-label="Category filter">
      <button
        type="button"
        className={`cat-sidebar-item cat-sidebar-item--all${!selectedPath.length ? ' cat-sidebar-item--active' : ''}`}
        onClick={() => onSelectPath([])}
      >
        <FolderTree size={14} />
        <span className="cat-sidebar-label">All Categories</span>
      </button>
      {showUncategorized && (
        <button
          type="button"
          className={`cat-sidebar-item${selectedPath[0] === '__uncategorized__' ? ' cat-sidebar-item--active' : ''}`}
          onClick={() => onSelectPath(['__uncategorized__'])}
        >
          <span className="cat-sidebar-chevron cat-sidebar-chevron--spacer" />
          <span className="cat-sidebar-label">Uncategorized{uncategorizedCount > 0 ? ` (${uncategorizedCount})` : ''}</span>
        </button>
      )}
      {tree.map((node) => (
        <div key={node.id} className="cat-sidebar-root">
          <button
            type="button"
            className={`cat-sidebar-item${selectedPath.length === 1 && selectedPath[0] === node.id ? ' cat-sidebar-item--active' : ''}${selectedPath.includes(node.id) && selectedPath[selectedPath.length - 1] !== node.id ? ' cat-sidebar-item--path' : ''}`}
            onClick={() => handleSelectRoot(node.id)}
          >
            {node.children?.length ? (
              <span
                className="cat-sidebar-chevron"
                onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
                role="presentation"
              >
                {expanded.has(node.id) || selectedPath.includes(node.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            ) : (
              <span className="cat-sidebar-chevron cat-sidebar-chevron--spacer" />
            )}
            <span className="cat-sidebar-label">{node.label}</span>
          </button>
          {node.children?.length && (expanded.has(node.id) || selectedPath.includes(node.id)) && node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              depth={1}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
              expanded={expanded}
              onToggle={toggle}
              ancestors={[node.id]}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
