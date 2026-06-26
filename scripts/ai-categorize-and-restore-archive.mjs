#!/usr/bin/env node
/**
 * AI + rules: recategorize ALL archived_products and restore to website_stock.
 *
 * Phases:
 *  1. Legacy label remap rules (old tree → current taxonomy)
 *  2. Fuzzy path repair + title heuristics
 *  3. OpenRouter vision (gemini-2.5-pro) for anything still invalid — ≥90% confidence
 *  4. Unarchive every row (empty archived_products)
 *
 * Usage:
 *   node scripts/ai-categorize-and-restore-archive.mjs
 *   DRY_RUN=false OPENROUTER_API_KEY=... node scripts/ai-categorize-and-restore-archive.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadBundledTaxonomy,
  validatePath,
  fuzzyFixPath,
  labelsToDbFields,
  firstChildPath,
  flattenLeafPaths,
  inferPathFromTitle,
  normLabel,
} from './lib/taxonomy-paths.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.env.DRY_RUN !== 'false';
const CONFIDENCE_MIN = Number(process.env.CONFIDENCE_MIN || 0.9);
const MODEL = process.env.ARCHIVE_AI_MODEL || 'google/gemini-2.5-pro';
const CONCURRENCY = Math.max(1, Math.min(5, Number(process.env.CONCURRENCY || 3)));
const PAGE = 1000;

const url = process.env.STOCK_SUPABASE_URL || process.env.VITE_STOCK_SUPABASE_URL;
const key = process.env.STOCK_SUPABASE_KEY || process.env.VITE_STOCK_SUPABASE_KEY;
const openRouterKey = process.env.OPENROUTER_API_KEY || '';

if (!url || !key) {
  console.error('Missing stock Supabase env vars');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const tree = loadBundledTaxonomy();
const REMAP_RULES = JSON.parse(
  readFileSync(join(__dirname, 'lib/catalog-remap-rules.json'), 'utf8'),
);
const TAXONOMY_PATHS = flattenLeafPaths(tree);

function findRule(cat, sub1, sub2, sub3) {
  for (const r of REMAP_RULES) {
    if (r.oldCat && normLabel(r.oldCat) !== normLabel(cat)) continue;
    if (r.oldSub1 && normLabel(r.oldSub1) !== normLabel(sub1)) continue;
    if (r.oldSub2 && normLabel(r.oldSub2) !== normLabel(sub2)) continue;
    if (r.oldSub3 && normLabel(r.oldSub3) !== normLabel(sub3)) continue;
    return r;
  }
  return null;
}

function applyRule(rule, row) {
  const mainChanged = rule.newCat != null && normLabel(rule.newCat) !== normLabel(row.category);
  const labels = [
    rule.newCat ?? row.category,
    rule.newSub1 !== undefined ? rule.newSub1 : (mainChanged ? null : row.subcategory_one),
    rule.newSub2 !== undefined ? rule.newSub2 : (mainChanged || rule.newSub1 !== undefined ? null : row.subcategory_two),
    rule.newSub3 !== undefined ? rule.newSub3 : null,
  ].filter(Boolean);
  if (labels.length < 2 && labels[0]) {
    const [m, s] = firstChildPath(tree, labels[0]);
    return [m, s];
  }
  return labels;
}

function resolveCategoryPath(row) {
  const raw = [row.category, row.subcategory_one, row.subcategory_two, row.subcategory_three].filter(Boolean);
  let path = validatePath(tree, raw);
  if (path) return { path, method: 'existing' };

  const rule = findRule(row.category, row.subcategory_one, row.subcategory_two, row.subcategory_three);
  if (rule) {
    const ruled = applyRule(rule, row);
    path = validatePath(tree, ruled) || fuzzyFixPath(tree, ruled);
    if (path) return { path, method: 'rule' };
  }

  path = fuzzyFixPath(tree, raw);
  if (path) return { path, method: 'fuzzy' };

  path = inferPathFromTitle(tree, row.title, row.original_description);
  if (path) return { path, method: 'title' };

  return { path: null, method: null };
}

async function fetchAllArchived() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from('archived_products').select('*').order('sku').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchImageBase64(imageUrl) {
  const raw = String(imageUrl || '').split(',')[0].trim();
  if (!raw) return null;
  try {
    const res = await fetch(raw, { redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    const contentType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    return { base64: buf.toString('base64'), contentType };
  } catch {
    return null;
  }
}

async function classifyWithAi(row) {
  if (!openRouterKey) return null;
  const image = await fetchImageBase64(row.image_url_one);
  const pathSample = TAXONOMY_PATHS.slice(0, 400).map((p) => p.join(' > ')).join('\n');
  const content = [];
  if (image) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.contentType};base64,${image.base64}` } });
  }
  content.push({
    type: 'text',
    text: `You are a wholesale catalogue taxonomist. Pick the BEST matching category path from the allowed list.

Product:
- Title: ${row.title || row.sku}
- Description: ${row.original_description || '(none)'}
- Barcode: ${row.barcode || '(none)'}
- Old category: ${row.category || '(none)'} > ${row.subcategory_one || ''}

ALLOWED PATHS (Category > Subcategory > ...):
${pathSample}

Return ONLY JSON:
{"path":["Exact Category Label","Exact Subcategory Label", "...optional deeper..."], "confidence":0.0-1.0, "reason":"brief"}

Rules:
- path labels MUST match the allowed list EXACTLY (case and punctuation).
- Minimum depth: category + subcategory.
- Only return confidence >= ${CONFIDENCE_MIN} if you are at least ${Math.round(CONFIDENCE_MIN * 100)}% sure.
- If unsure, set confidence below ${CONFIDENCE_MIN}.`,
  });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://protoportal-admin.vercel.app',
      'X-Title': 'Proto Archive Restore',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content }],
      max_tokens: 400,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = await res.json();
  const text = payload.choices?.[0]?.message?.content || '';
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]);
  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence) || confidence < CONFIDENCE_MIN) return null;
  const path = validatePath(tree, parsed.path || []);
  if (!path) return null;
  return { path, confidence, reason: parsed.reason || '' };
}

async function updateArchivedCategories(sku, path) {
  const fields = { ...labelsToDbFields(path), updated_at: new Date().toISOString() };
  if (DRY_RUN) return;
  const { error } = await sb.from('archived_products').update(fields).eq('sku', sku);
  if (error) throw error;
}

async function restoreToLive(row) {
  if (DRY_RUN) return { ok: true, mode: 'dry-run' };

  const { data: live } = await sb.from('website_stock').select('sku').eq('sku', row.sku).maybeSingle();

  if (live) {
    const fields = {
      ...labelsToDbFields([
        row.category,
        row.subcategory_one,
        row.subcategory_two,
        row.subcategory_three,
        row.subcategory_four,
      ].filter(Boolean)),
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await sb.from('website_stock').update(fields).eq('sku', row.sku);
    if (upErr) throw upErr;
    const { error: delErr } = await sb.from('archived_products').delete().eq('sku', row.sku);
    if (delErr) throw delErr;
    return { ok: true, mode: 'dedupe-live' };
  }

  const { error: unErr } = await sb.rpc('unarchive_product', { p_sku: row.sku });
  if (unErr) throw unErr;
  const { error: upsertErr } = await sb.rpc('upsert_website_product_from_stock', { p_website_sku: row.sku });
  if (upsertErr) console.warn(`upsert_website_product_from_stock ${row.sku}:`, upsertErr.message);
  return { ok: true, mode: 'unarchived' };
}

async function mapPool(items, fn, limit) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function main() {
  console.log(`DRY_RUN=${DRY_RUN} MODEL=${MODEL} CONFIDENCE_MIN=${CONFIDENCE_MIN}`);
  const rows = await fetchAllArchived();
  console.log(`Loaded ${rows.length} archived products`);

  const stats = { existing: 0, rule: 0, fuzzy: 0, title: 0, ai: 0, failed: 0 };
  const failed = [];
  const resolved = [];

  for (const row of rows) {
    let { path, method } = resolveCategoryPath(row);
    if (!path) {
      resolved.push({ row, path: null, method: null, needsAi: true });
      continue;
    }
    stats[method] += 1;
    resolved.push({ row, path, method, needsAi: false });
  }

  const needsAi = resolved.filter((r) => r.needsAi);
  console.log(`Phase 1 resolved: ${rows.length - needsAi.length} (existing ${stats.existing}, rule ${stats.rule}, fuzzy ${stats.fuzzy}, title ${stats.title})`);
  console.log(`Phase 2 AI needed: ${needsAi.length}${openRouterKey ? '' : ' (no OPENROUTER_API_KEY — using title/first-child fallback)'}`);

  for (const item of needsAi) {
    try {
      let ai = null;
      if (openRouterKey) {
        ai = await classifyWithAi(item.row);
      }
      if (ai?.path) {
        item.path = ai.path;
        item.method = 'ai';
        item.needsAi = false;
        stats.ai += 1;
        continue;
      }

      const fallback = inferPathFromTitle(tree, item.row.title, item.row.original_description);
      const mainGuess = item.row.category && tree.find((n) => normLabel(n.label) === normLabel(item.row.category));
      const pathFromMain = mainGuess
        ? firstChildPath(tree, mainGuess.label)
        : firstChildPath(tree, 'Homeware');
      const path = fallback || validatePath(tree, pathFromMain);
      if (path) {
        item.path = path;
        item.method = 'fallback';
        item.needsAi = false;
        stats.title += 1;
      } else {
        stats.failed += 1;
        failed.push({ sku: item.row.sku, title: item.row.title, category: item.row.category });
      }
    } catch (err) {
      stats.failed += 1;
      failed.push({ sku: item.row.sku, title: item.row.title, error: err.message });
    }
  }

  console.log('Category resolution:', stats);
  if (failed.length) {
    writeFileSync(join(__dirname, 'archive-restore-failed.json'), JSON.stringify(failed, null, 2));
    console.warn(`Wrote ${failed.length} failures to scripts/archive-restore-failed.json`);
  }

  let catUpdated = 0;
  for (const item of resolved) {
    if (!item.path) continue;
    await updateArchivedCategories(item.row.sku, item.path);
    item.row = { ...item.row, ...labelsToDbFields(item.path) };
    catUpdated += 1;
  }
  console.log(`Updated categories on ${catUpdated} rows`);

  const toRestore = resolved.filter((r) => r.path);
  console.log(`Restoring ${toRestore.length} products to website_stock…`);

  let restored = 0;
  let restoreErrors = 0;
  await mapPool(toRestore, async (item) => {
    try {
      await restoreToLive(item.row);
      restored += 1;
      if (restored % 100 === 0) console.log(`  restored ${restored}/${toRestore.length}`);
    } catch (err) {
      restoreErrors += 1;
      console.error(`  restore ${item.row.sku}: ${err.message}`);
    }
  }, 8);

  const { count } = await sb.from('archived_products').select('sku', { count: 'exact', head: true });
  console.log(`\nDone — restored: ${restored}, restore errors: ${restoreErrors}, remaining archived: ${count ?? '?'}`);
  if (!DRY_RUN && count === 0) console.log('✓ archived_products is empty');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
