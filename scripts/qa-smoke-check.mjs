#!/usr/bin/env node
/**
 * Smoke checks for post-PR#55 QA (no auth required for pure logic tests).
 * Run: node scripts/qa-smoke-check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderMatchesTab, isOrderConfirmationSent } from '../src/lib/orderStatus.js';
import { parseOrderTab, parsePositiveInt, parseBusinessTypeFilter } from '../api/_admin-query-params.js';
import { injectMotarroIntoTree, isMotarroProduct, filterRowsByMotarroPath } from '../lib/mottaro-category.mjs';
import { parseLoaderFilename } from '../api/_product-loader-filename.js';
import { classifyBatchItem } from '../api/_product-loader-lookup.js';

console.log('QA smoke checks…\n');

// B1 — Mottaro inject
const tree = injectMotarroIntoTree([
  { id: 'arts-and-crafts', label: 'Arts and Crafts', children: [] },
  { id: 'stationery', label: 'Stationery', children: [] },
]);
assert.ok(tree.some((n) => n.id === 'mottaro'), 'Mottaro node present after inject');
const tree2 = injectMotarroIntoTree(tree);
assert.equal(tree2.filter((n) => n.id === 'mottaro').length, 1, 'No double-inject');
console.log('✓ B1 Mottaro inject');

// D4 — order tab bucketing with confirmation_sent_at
const orderSent = { id: '1', status: 'order sent', confirmation_sent_at: null };
const orderSentConfirmed = { id: '2', status: 'order sent', confirmation_sent_at: '2026-01-01T00:00:00Z' };
assert.equal(orderMatchesTab(orderSent, 'sent', {}), true);
assert.equal(orderMatchesTab(orderSentConfirmed, 'sent', {}), false);
assert.equal(orderMatchesTab(orderSentConfirmed, 'paid', {}), true);
assert.equal(isOrderConfirmationSent(orderSentConfirmed), true);
console.log('✓ D4 confirmation_sent_at tab bucketing');

// QA-3 — query param validation
assert.throws(() => parseOrderTab('bogus'), /Invalid tab/);
assert.throws(() => parsePositiveInt('abc', { name: 'page' }), /Invalid page/);
assert.equal(parseBusinessTypeFilter('__unspecified__'), '__unspecified__');
console.log('✓ Query param validation');

// Item 0 — SectionErrorBoundary present
const __dirname = dirname(fileURLToPath(import.meta.url));
const boundarySrc = readFileSync(join(__dirname, '../src/components/SectionErrorBoundary.jsx'), 'utf8');
assert.ok(boundarySrc.includes('class SectionErrorBoundary'), 'SectionErrorBoundary component file present');
console.log('✓ SectionErrorBoundary export');

// Item 3 — Mottaro title-match filter
assert.equal(isMotarroProduct({ title: 'MOTTARO Paint Set' }), true);
assert.equal(isMotarroProduct({ title: 'Regular Pen' }), false);
const mottaroRows = [
  { title: 'MOTTARO Brush', category: 'Art' },
  { title: 'Regular Pen', category: 'Art' },
];
const filtered = filterRowsByMotarroPath(mottaroRows, ['mottaro'], tree);
assert.equal(filtered.length, 1);
console.log('✓ Mottaro archived title-match filter');

// Item 4 — product loader filename: noise before slot
const copyParse = parseLoaderFilename('SKU-2 copy.jpg');
assert.equal(copyParse.imageSlot, 2);
assert.equal(copyParse.code, 'SKU');
const parenParse = parseLoaderFilename('SKU-3 (1).jpg');
assert.equal(parenParse.imageSlot, 3);
assert.equal(parenParse.code, 'SKU');
const plainParse = parseLoaderFilename('ABC-2.jpg');
assert.equal(plainParse.imageSlot, 2);
assert.equal(plainParse.code, 'ABC');
console.log('✓ Product loader filename parser');

// Item 5 — classifyBatchItem for not_found
assert.equal(classifyBatchItem({ canPublish: false, parseError: null }), 'not_found');
assert.equal(classifyBatchItem({ canPublish: true, parseError: null, websiteStatus: 'live' }), 'ready');
console.log('✓ Nutstore classifyBatchItem');

console.log('\nAll smoke checks passed.');
