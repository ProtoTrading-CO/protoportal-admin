#!/usr/bin/env node
/**
 * Smoke checks for post-PR#55 QA (no auth required for pure logic tests).
 * Run: node scripts/qa-smoke-check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderMatchesTab, isOrderConfirmationSent } from '../src/lib/orderStatus.js';
import { parseOrderTab, parsePositiveInt, parseBusinessTypeFilter } from '../api/_admin-query-params.js';
import { injectMotarroIntoTree } from '../lib/mottaro-category.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = (relPath) => readFileSync(join(REPO_ROOT, relPath), 'utf8');

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

// PricingPanel extraction
const adminPage = readSrc('src/pages/AdminPage.jsx');
assert.match(adminPage, /const PricingPanel = lazy\(/, 'PricingPanel is lazy');
assert.doesNotMatch(adminPage, /const applyPricing = async/, 'applyPricing moved into PricingPanel');
assert.doesNotMatch(adminPage, /const toggleSelectAllPricing = /, 'toggleSelectAllPricing moved into PricingPanel');
assert.doesNotMatch(adminPage, /const loadCategoryWorkingSet = async/, 'loadCategoryWorkingSet dispatcher removed');
assert.doesNotMatch(adminPage, /const \[pricingCategory,/, 'pricing state moved out of AdminPage');
assert.doesNotMatch(adminPage, /const \[priceDelta,/, 'priceDelta state moved out of AdminPage');

const pricingPanel = readSrc('src/components/PricingPanel.jsx');
assert.match(pricingPanel, /export default function PricingPanel/, 'PricingPanel default export');
assert.match(pricingPanel, /fetchReorderProducts\(\{ mainCategory: categoryId \}\)/, 'PricingPanel fetches category rows');

const sidebar = readSrc('src/components/GroupedSidebar.jsx');
assert.match(sidebar, /pricing: \(\) => import\('\.\/PricingPanel'\)/, 'sidebar prefetches PricingPanel on hover');
console.log('✓ PricingPanel extracted, lazy, prefetched');

// ReorderPanel + TaxonomyModals extraction
assert.match(adminPage, /const ReorderPanel = lazy\(/, 'ReorderPanel is lazy');
assert.doesNotMatch(adminPage, /const \[reorderCategoryPath,/, 'reorder state moved out of AdminPage');
assert.doesNotMatch(adminPage, /const \[moveModalOpen,/, 'reorder move modal state moved out of AdminPage');
assert.doesNotMatch(adminPage, /import ReorderGrid from/, 'ReorderGrid only imported by ReorderPanel');
assert.match(adminPage, /<TaxonomyModals/, 'TaxonomyModals used once at page level');
assert.doesNotMatch(adminPage, /Rename \{editTaxonomyModal\.type/, 'inline taxonomy rename modal removed');

const reorderPanel = readSrc('src/components/ReorderPanel.jsx');
assert.match(reorderPanel, /adm-reorder-toolbar/, 'ReorderPanel owns reorder toolbar');
assert.match(reorderPanel, /forwardRef\(function ReorderPanel/, 'ReorderPanel uses forwardRef for imperative refresh');

const taxonomyModals = readSrc('src/components/TaxonomyModals.jsx');
assert.match(taxonomyModals, /export default function TaxonomyModals/, 'TaxonomyModals default export');

assert.match(sidebar, /reorder: \(\) => import\('\.\/ReorderPanel'\)/, 'sidebar prefetches ReorderPanel on hover');
console.log('✓ ReorderPanel + TaxonomyModals extracted');

console.log('\nAll smoke checks passed.');
