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
import { BULK_CHUNK_SIZE, runInChunks } from '../lib/bulk-chunk.mjs';

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

// Item 1 — stale sections removed + bulk chunk helpers
const adminPageSrc = readSrc('src/pages/AdminPage.jsx');
assert.doesNotMatch(adminPageSrc, /false\s*&&\s*activeSection/, 'No dead false&& section guards in AdminPage');
assert.doesNotMatch(adminPageSrc, /activeSection\s*===\s*'dormant-products'/, 'No dormant-products section');
console.log('✓ Item 1 stale AdminPage sections removed');

const bulkSrc = readSrc('api/bulk-products.js');
assert.match(bulkSrc, /bulkDeleteProducts/, 'batched delete helper present');
assert.match(bulkSrc, /bulkMoveProducts/, 'batched move helper present');
assert.match(bulkSrc, /runInChunks/, 'chunked archive/unarchive');

let chunkSum = 0;
await runInChunks([1, 2, 3, 4, 5], 2, async (n) => { chunkSum += n; return n; });
assert.equal(chunkSum, 15, 'runInChunks runs all items');
assert.equal(BULK_CHUNK_SIZE, 25, 'chunk size is 25');
console.log('✓ Item 1 bulk-products batched + chunked');

const taxonomyUtilsSrc = readSrc('api/_taxonomy-utils.js');
assert.match(taxonomyUtilsSrc, /expectedUpdatedAt/, 'taxonomy save checks expectedUpdatedAt');
assert.match(taxonomyUtilsSrc, /c\.id !== 'mottaro'/, 'taxonomy save still strips mottaro');
const taxonomyAdminSrc = readSrc('src/lib/taxonomyAdmin.js');
assert.match(taxonomyAdminSrc, /err\.status = 409/, 'taxonomy client handles 409');
console.log('✓ Item 2 taxonomy optimistic locking');

const approveSrc = readSrc('api/approve-customers-bulk.js');
assert.match(approveSrc, /fetchCustomersByEmails/, 'bulk approve batches customer lookup');
assert.match(approveSrc, /runInChunks/, 'bulk approve uses chunked parallelism');
console.log('✓ Item 3 bulk customer approve batched');

// Archive/Nutstore correctness — API contract
const catalogSrc = readSrc('api/catalog.js');
assert.match(catalogSrc, /r\.stockLinked === false/, 'archive filter respects stockLinked=false (item 2)');
assert.match(catalogSrc, /r\.archived_by === 'nutstore'/, 'archive filter keeps nutstore rows visible (item 2)');
assert.match(catalogSrc, /applyCategoryFiltersToQuery\(q, resolveCategoryFilters\(tree, categoryPath\)\)/, 'archive fetch applies category filter (item 7)');
console.log('✓ Item 2 archive Nutstore visibility + category filter');

const stockSrc = readSrc('api/_stock-client.js');
assert.match(stockSrc, /stockLinked: false/, 'enrichRowsWithProductStock exposes stockLinked=false when no ERP row');
assert.doesNotMatch(stockSrc, /available_stock: r\.available_stock \?\? r\.stock_qty \?\? 0/, 'stock enrichment no longer coerces missing ERP stock to 0');
console.log('✓ Item 2 stock enrichment preserves unknown stock');

// Nutstore hardening — parallelism, cache, dedup
const vercelJson = JSON.parse(readSrc('vercel.json'));
assert.equal(vercelJson.functions?.['api/nutstore-batch-lookup.js']?.maxDuration, 30, 'nutstore-batch-lookup has 30s timeout');
assert.equal(vercelJson.functions?.['api/nutstore-process.js']?.maxDuration, 60, 'nutstore-process has 60s timeout');
const nutstoreProcessSrc = readSrc('api/nutstore-process.js');
assert.match(nutstoreProcessSrc, /NUTSTORE_CONCURRENCY = 4/, 'nutstore-process uses concurrency of 4');
assert.doesNotMatch(nutstoreProcessSrc, /for \(const raw of items\)/, 'nutstore-process no longer sequential');
const nutstoreLookupSrc = readSrc('api/_product-loader-lookup.js');
assert.match(nutstoreLookupSrc, /getCachedDormantSkuSet/, 'dormant SKU set cached');
const nutstoreBatchSrc = readSrc('api/nutstore-batch-lookup.js');
assert.match(nutstoreBatchSrc, /codeGroups/, 'nutstore batch lookup dedups by code');
console.log('✓ Item 3 Nutstore hardening (timeouts, parallelism, dedup, cache)');

// Nutstore relink on SKU/barcode edit
const updateProductSrc = readSrc('api/update-product.js');
assert.match(updateProductSrc, /verified\.archived_by === 'nutstore'/, 'update-product re-runs ERP lookup on Nutstore-archived rows');
assert.match(updateProductSrc, /resolveProductLoaderMatch/, 'update-product imports resolveProductLoaderMatch');
console.log('✓ Item 4 Nutstore relink on SKU/barcode edit');

// UI polish — Make live label + move gap validation
const pmEngineSrc = readSrc('src/components/ProductManagerEngine.jsx');
assert.doesNotMatch(pmEngineSrc, /Make live all/, 'Make live all label removed');
assert.match(pmEngineSrc, /Make \{selected\.size\} live/, 'Make live label uses selection count');
assert.doesNotMatch(pmEngineSrc, /: 'Archive all'/, 'Archive all label removed');
assert.match(pmEngineSrc, /`Archive \$\{selected\.size\}`/, 'Archive label uses selection count');

const bulkMoveSrc = readSrc('src/components/BulkMoveModal.jsx');
assert.match(bulkMoveSrc, /hasPathGap/, 'BulkMoveModal enforces contiguous path');
assert.doesNotMatch(bulkMoveSrc, /movePreviewPath\s*=\s*\[[^]*\]\.filter\(Boolean\)/, 'BulkMoveModal no longer silently drops gaps');

const bulkProductsSrc = readSrc('api/bulk-products.js');
assert.match(bulkProductsSrc, /409[^]*Destination category changed/, 'bulk-products returns 409 on stale destination');
console.log('✓ Item 5 UI polish (labels + move gap 409)');

// Perf — heavy section panels are lazy-loaded so the initial AdminPage chunk
// only ships Product Manager. Assert we don't accidentally re-add eager imports.
assert.match(adminPageSrc, /const AnalyticsHub = lazy\(/, 'AnalyticsHub is lazy');
assert.match(adminPageSrc, /const ApolloPanel = lazy\(/, 'ApolloPanel is lazy');
assert.match(adminPageSrc, /const CostTrackingPanel = lazy\(/, 'CostTrackingPanel is lazy');
assert.match(adminPageSrc, /const ProductLoaderPanel = lazy\(/, 'ProductLoaderPanel is lazy');
assert.match(adminPageSrc, /const CrmPanel = lazy\(/, 'CrmPanel is lazy');
assert.match(adminPageSrc, /const WhatsappPanel = lazy\(/, 'WhatsappPanel is lazy');
assert.match(adminPageSrc, /const CustomerEmailModal = lazy\(/, 'CustomerEmailModal is lazy');
assert.match(adminPageSrc, /const CrmContactsModal = lazy\(/, 'CrmContactsModal is lazy');
assert.match(adminPageSrc, /const FulfillmentSettingsModal = lazy\(/, 'FulfillmentSettingsModal is lazy');
assert.doesNotMatch(adminPageSrc, /^import AnalyticsHub /m, 'no eager AnalyticsHub import');
assert.doesNotMatch(adminPageSrc, /^import ApolloPanel /m, 'no eager ApolloPanel import');
assert.doesNotMatch(adminPageSrc, /^import ProductLoaderPanel /m, 'no eager ProductLoaderPanel import');
assert.match(adminPageSrc, /apolloEverActive/, 'Apollo mounted only after first activation');
assert.match(adminPageSrc, /\{customerEmailOpen && \(/, 'CustomerEmailModal mounts only when open');
assert.match(adminPageSrc, /\{crmContactsOpen && \(/, 'CrmContactsModal mounts only when open');
assert.match(adminPageSrc, /\{fulfillmentSettingsOpen && \(/, 'FulfillmentSettingsModal mounts only when open');

const sidebarSrc = readSrc('src/components/GroupedSidebar.jsx');
assert.match(sidebarSrc, /CHUNK_PREFETCH/, 'GroupedSidebar warms lazy chunks on hover');
console.log('✓ Lazy-loaded admin sections + hover chunk prefetch');

// Bundle-perf follow-ups
const orderDocsSrc = readSrc('src/lib/orderDocuments.js');
assert.doesNotMatch(orderDocsSrc, /^import \{ jsPDF \} from 'jspdf'/m, 'jspdf no longer statically imported');
assert.match(orderDocsSrc, /loadJsPDF/, 'orderDocuments uses lazy jspdf loader');

const apolloSrc = readSrc('src/components/ApolloPanel.jsx');
assert.doesNotMatch(apolloSrc, /^import \{ jsPDF \} from 'jspdf'/m, 'ApolloPanel does not statically import jspdf');
assert.match(apolloSrc, /loadJsPDF/, 'ApolloPanel uses lazy jspdf loader');

const lazyJsPdfSrc = readSrc('src/lib/lazyJspdf.js');
assert.match(lazyJsPdfSrc, /_jspdfPromise/, 'lazyJspdf caches the dynamic import');

const useCatalogSrc = readSrc('src/hooks/useCatalog.js');
assert.match(useCatalogSrc, /Promise\.all\(Array\.from\(\{ length: Math\.min\(CONCURRENCY/, 'fetchAllCatalogRows fans out in parallel');

const taxonomySrc = readSrc('api/taxonomy.js');
assert.match(taxonomySrc, /Cache-Control', 's-maxage=60, stale-while-revalidate=300/, 'taxonomy counts endpoint has SWR cache');

console.log('✓ Bundle + perf follow-ups (jspdf lazy, catalog parallel, counts SWR)');

console.log('\nAll smoke checks passed.');
