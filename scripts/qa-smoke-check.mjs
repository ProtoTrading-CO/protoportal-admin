#!/usr/bin/env node
/**
 * Smoke checks for post-PR#55 QA (no auth required for pure logic tests).
 * Run: node scripts/qa-smoke-check.mjs
 */
import assert from 'node:assert/strict';
import { orderMatchesTab, isOrderConfirmationSent } from '../src/lib/orderStatus.js';
import { parseOrderTab, parsePositiveInt, parseBusinessTypeFilter } from '../api/_admin-query-params.js';
import { injectMotarroIntoTree } from '../lib/mottaro-category.mjs';

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

// Item 1 — stale standalone PM sections removed (ProductManagerEngine owns catalogue)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const adminPageSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/pages/AdminPage.jsx'), 'utf8');
assert.doesNotMatch(adminPageSrc, /false\s*&&\s*activeSection/, 'No dead false&& section guards in AdminPage');
assert.doesNotMatch(adminPageSrc, /activeSection\s*===\s*'dormant-products'/, 'No dormant-products section');
console.log('✓ Item 1 stale AdminPage sections removed');

console.log('\nAll smoke checks passed.');
