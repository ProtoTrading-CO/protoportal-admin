#!/usr/bin/env node
/**
 * Export website taxonomy as a PDF matching the Proto category tree reference layout.
 *
 * Usage:
 *   npm run export-category-trees
 *   OUTPUT=exports/my-trees.pdf node scripts/export-category-trees-pdf.mjs
 */

import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Page groups mirror Final 2026-06-25 reference. */
const PAGE_GROUPS = [
  ['Arts and Crafts'],
  ['Stationery'],
  ['Beads'],
  ['Jewellery'],
  ['Bag & Belt Components'],
  ['Fashion & Accessories'],
  ['Beauty & Personal Care'],
  ['Homeware'],
  ['Confectionery', 'Electronics & Accessories'],
  ['Party, Events & Seasonals', 'Kids Toys & Games'],
  ['Hardware'],
  ['Packaging & Storage'],
  ['Textiles'],
];

const OUTPUT = process.env.OUTPUT
  || join(ROOT, 'exports', `proto-category-trees-${new Date().toISOString().slice(0, 10)}.pdf`);

function loadTaxonomy() {
  return JSON.parse(readFileSync(join(ROOT, 'src/data/categories.json'), 'utf8'));
}

function toCaps(label) {
  return String(label || '').trim().toUpperCase();
}

function flattenTree(node, depth = 0, out = []) {
  out.push({ label: node.label, depth });
  for (const child of node.children || []) flattenTree(child, depth + 1, out);
  return out;
}

function findCategory(tree, label) {
  const target = label.trim().toLowerCase();
  return tree.find((n) => n.label.trim().toLowerCase() === target) || null;
}

function fontSizeForDepth(depth) {
  if (depth <= 1) return 9.5;
  if (depth === 2) return 8.5;
  return 7.5;
}

function lineHeight(fs) {
  return fs + 2;
}

function drawPageHeader(doc) {
  doc.setFillColor(139, 26, 26);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 4, 'F');
}

function drawPageFooter(doc, pageNum, totalPages) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`— ${pageNum} of ${totalPages} —`, w / 2, h - 16, { align: 'center' });
}

function drawLines(doc, lines, {
  startIdx, x, colWidth, startY, maxY, skipRoot = false,
}) {
  let y = startY;
  let idx = startIdx;

  while (idx < lines.length) {
    const { label, depth } = lines[idx];
    if (skipRoot && depth === 0) {
      idx += 1;
      continue;
    }
    const displayDepth = skipRoot ? Math.max(0, depth - 1) : depth;
    const fs = depth === 0 ? 14 : fontSizeForDepth(depth);
    const lh = lineHeight(fs);
    const indent = displayDepth * 11;
    const chunks = doc.splitTextToSize(toCaps(label), colWidth - indent - 4);

    let overflow = false;
    for (const chunk of chunks) {
      if (y + lh > maxY) {
        overflow = true;
        break;
      }
      doc.setFont('helvetica', depth <= 1 ? 'bold' : 'normal');
      doc.setFontSize(fs);
      doc.setTextColor(17, 17, 17);
      doc.text(chunk, x + indent, y);
      y += lh;
    }
    if (overflow) return { nextIdx: idx, y, done: false };
    idx += 1;
  }
  return { nextIdx: idx, y, done: true };
}

function exportPdf(tree) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxY = pageH - 34;
  let pageNum = 0;

  for (const group of PAGE_GROUPS) {
    const nodes = group.map((label) => findCategory(tree, label)).filter(Boolean);
    if (!nodes.length) continue;

    if (nodes.length > 1) {
      const colWidth = (pageW - margin * 2 - 20) / 2;
      const progress = nodes.map((node) => ({ node, lines: flattenTree(node), idx: 0, titleDrawn: false }));

      while (progress.some((p) => p.idx < p.lines.length)) {
        if (pageNum > 0) doc.addPage();
        pageNum += 1;
        drawPageHeader(doc);

        progress.forEach((p, i) => {
          if (p.idx >= p.lines.length) return;
          const x = margin + i * (colWidth + 20);
          let y = margin + 8;

          if (!p.titleDrawn) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(17, 17, 17);
            doc.text(toCaps(p.node.label), x, y);
            p.titleDrawn = true;
            y += 18;
          } else {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(120, 120, 120);
            doc.text(`${toCaps(p.node.label)} (CONT.)`, x, y);
            y += 12;
          }

          const result = drawLines(doc, p.lines, {
            startIdx: p.idx,
            x,
            colWidth,
            startY: y,
            maxY,
            skipRoot: true,
          });
          p.idx = result.nextIdx;
        });
      }
      continue;
    }

    const node = nodes[0];
    const lines = flattenTree(node);
    let idx = 0;
    let titleDrawn = false;
    const colCount = 3;
    const colWidth = (pageW - margin * 2) / colCount;

    while (idx < lines.length) {
      if (pageNum > 0) doc.addPage();
      pageNum += 1;
      drawPageHeader(doc);

      const colHeights = Array(colCount).fill(margin + 8);
      let col = 0;

      if (!titleDrawn) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(17, 17, 17);
        doc.text(toCaps(node.label), margin, margin + 4);
        colHeights.fill(margin + 24);
        titleDrawn = true;
        idx = 1;
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`${toCaps(node.label)} (CONTINUED)`, margin, margin + 2);
        colHeights.fill(margin + 18);
      }

      while (idx < lines.length) {
        const { label, depth } = lines[idx];
        const fs = fontSizeForDepth(depth);
        const lh = lineHeight(fs);
        const indent = depth * 11;
        const x = margin + col * colWidth;
        let y = colHeights[col];
        const chunks = doc.splitTextToSize(toCaps(label), colWidth - indent - 8);

        let overflow = false;
        for (const chunk of chunks) {
          if (y + lh > maxY) {
            overflow = true;
            break;
          }
          doc.setFont('helvetica', depth <= 1 ? 'bold' : 'normal');
          doc.setFontSize(fs);
          doc.setTextColor(17, 17, 17);
          doc.text(chunk, x + indent, y);
          y += lh;
        }

        if (overflow) {
          col += 1;
          if (col >= colCount) break;
          continue;
        }

        colHeights[col] = y;
        idx += 1;
        if (colHeights[col] > maxY - 48 && col < colCount - 1) col += 1;
      }
    }
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    drawPageFooter(doc, p, total);
  }

  const outDir = dirname(OUTPUT);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  doc.save(OUTPUT);
  return { path: OUTPUT, pages: total };
}

const tree = loadTaxonomy();
const result = exportPdf(tree);
console.log(`Wrote ${result.pages}-page PDF → ${result.path}`);
