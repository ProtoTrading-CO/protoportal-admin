#!/usr/bin/env node
/**
 * Export categories.json → Excel with tree columns (Level 1 … Level 5 + full path).
 *
 * Usage: node scripts/export-category-tree-xlsx.mjs
 * Output: exports/proto-category-tree-YYYY-MM-DD.xlsx
 */

import XLSX from 'xlsx';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_DEPTH = 5;
const today = new Date().toISOString().slice(0, 10);

function walkTree(nodes, ancestors = [], rows = []) {
  for (const node of nodes || []) {
    const path = [...ancestors, node];
    const labels = path.map((n) => n.label);
    const ids = path.map((n) => n.id);
    const depth = path.length;
    const hasChildren = !!(node.children?.length);

    const row = {
      'Full path': labels.join(' > '),
      Depth: depth,
      'Is leaf': hasChildren ? 'No' : 'Yes',
    };

    for (let i = 0; i < MAX_DEPTH; i += 1) {
      row[`Level ${i + 1}`] = labels[i] || '';
      row[`Level ${i + 1} ID`] = ids[i] || '';
    }

    rows.push(row);

    if (hasChildren) walkTree(node.children, path, rows);
  }
  return rows;
}

function main() {
  const tree = JSON.parse(readFileSync(join(__dirname, '../src/data/categories.json'), 'utf8'));
  const rows = walkTree(tree);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  const colWidths = [
    { wch: 72 },
    { wch: 6 },
    { wch: 8 },
    ...Array.from({ length: MAX_DEPTH * 2 }, (_, i) => ({ wch: i % 2 === 0 ? 28 : 32 })),
  ];
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Category tree');

  const summary = tree.map((main) => {
    let count = 0;
    function countNodes(nodes) {
      for (const n of nodes || []) {
        count += 1;
        countNodes(n.children);
      }
    }
    countNodes([main]);
    return { 'Main category': main.label, 'Main category ID': main.id, 'Nodes (incl. self)': count };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');

  const outDir = join(__dirname, '../exports');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `proto-category-tree-${today}.xlsx`);
  XLSX.writeFile(wb, outPath);

  console.log(`Wrote ${rows.length} category rows → ${outPath}`);
}

main();
