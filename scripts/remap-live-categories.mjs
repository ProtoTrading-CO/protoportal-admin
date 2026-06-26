#!/usr/bin/env node
/**
 * Remap legacy category labels on website_stock → current taxonomy tree.
 *
 * Usage:
 *   DRY_RUN=false node scripts/remap-live-categories.mjs
 *   OPENROUTER_API_KEY=...  (optional — vision for stragglers only)
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
const REMAP_RULES = JSON.parse(readFileSync(join(__dirname, 'lib/catalog-remap-rules.json'), 'utf8'));
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
  if (labels.length < 2 && labels[0]) return firstChildPath(tree, labels[0]);
  return labels;
}

function resolveCategoryPath(row) {
  const raw = [row.category, row.subcategory_one, row.subcategory_two, row.subcategory_three].filter(Boolean);
  let path = validatePath(tree, raw);
  if (path) return { path, method: 'valid', changed: false };

  const rule = findRule(row.category, row.subcategory_one, row.subcategory_two, row.subcategory_three);
  if (rule) {
    const ruled = applyRule(rule, row);
    path = validatePath(tree, ruled) || fuzzyFixPath(tree, ruled);
    if (path) return { path, method: 'rule', changed: true };
  }

  path = fuzzyFixPath(tree, raw);
  if (path) return { path, method: 'fuzzy', changed: true };

  path = inferPathFromTitle(tree, row.title, row.original_description);
  if (path) return { path, method: 'title', changed: true };

  const mainGuess = row.category && tree.find((n) => normLabel(n.label) === normLabel(row.category));
  path = validatePath(tree, mainGuess ? firstChildPath(tree, mainGuess.label) : firstChildPath(tree, 'Homeware'));
  if (path) return { path, method: 'fallback', changed: true };

  return { path: null, method: null, changed: false };
}

async function fetchAllLive() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('website_stock')
      .select('sku, title, category, subcategory_one, subcategory_two, subcategory_three, subcategory_four, original_description, image_url_one')
      .order('sku')
      .range(from, from + PAGE - 1);
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
    text: `Pick the best taxonomy path for this wholesale product from the allowed list.

Title: ${row.title || row.sku}
Description: ${row.original_description || '(none)'}
Old path: ${row.category || ''} > ${row.subcategory_one || ''}

ALLOWED PATHS:
${pathSample}

Return ONLY JSON: {"path":["Category","Subcategory",...], "confidence":0.0-1.0}
Labels must match exactly. Minimum category + subcategory. confidence >= ${CONFIDENCE_MIN} only when ≥${Math.round(CONFIDENCE_MIN * 100)}% sure.`,
  });

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://protoportal-admin.vercel.app',
      'X-Title': 'Proto Live Remap',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content }],
      max_tokens: 400,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const payload = await res.json();
  const text = payload.choices?.[0]?.message?.content || '';
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]);
  if (Number(parsed.confidence) < CONFIDENCE_MIN) return null;
  const path = validatePath(tree, parsed.path || []);
  return path ? { path } : null;
}

function pathChanged(row, path) {
  const fields = labelsToDbFields(path);
  return fields.category !== row.category
    || fields.subcategory_one !== (row.subcategory_one || row.category)
    || fields.subcategory_two !== (row.subcategory_two || null)
    || fields.subcategory_three !== (row.subcategory_three || null)
    || fields.subcategory_four !== (row.subcategory_four || null);
}

async function main() {
  console.log(`DRY_RUN=${DRY_RUN}`);
  const rows = await fetchAllLive();
  console.log(`Loaded ${rows.length} live products`);

  const stats = { valid: 0, rule: 0, fuzzy: 0, title: 0, fallback: 0, ai: 0, failed: 0, updated: 0 };
  const failed = [];
  const updates = [];

  for (const row of rows) {
    let result = resolveCategoryPath(row);
    if (!result.path && openRouterKey) {
      try {
        const ai = await classifyWithAi(row);
        if (ai?.path) result = { path: ai.path, method: 'ai', changed: true };
      } catch (err) {
        failed.push({ sku: row.sku, error: err.message });
      }
    }
    if (!result.path) {
      stats.failed += 1;
      failed.push({ sku: row.sku, title: row.title, category: row.category });
      continue;
    }
    if (!result.changed) {
      stats.valid += 1;
      continue;
    }
    if (!pathChanged(row, result.path)) continue;
    stats[result.method] = (stats[result.method] || 0) + 1;
    updates.push({ sku: row.sku, path: result.path, method: result.method });
  }

  console.log('Resolution:', stats);
  console.log(`Applying ${updates.length} updates…`);

  if (failed.length) {
    writeFileSync(join(__dirname, 'live-remap-failed.json'), JSON.stringify(failed, null, 2));
  }

  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    if (!DRY_RUN) {
      await Promise.all(batch.map(async ({ sku, path }) => {
        const fields = { ...labelsToDbFields(path), updated_at: new Date().toISOString() };
        const { error } = await sb.from('website_stock').update(fields).eq('sku', sku);
        if (error) throw new Error(`${sku}: ${error.message}`);
      }));
    }
    stats.updated += batch.length;
    if (stats.updated % 200 === 0 || i + BATCH >= updates.length) {
      console.log(`  ${stats.updated}/${updates.length}`);
    }
  }

  let invalid = 0;
  let from = 0;
  while (true) {
    const { data } = await sb.from('website_stock').select('category,subcategory_one,subcategory_two,subcategory_three').range(from, from + PAGE - 1);
    for (const r of data || []) {
      if (!validatePath(tree, [r.category, r.subcategory_one, r.subcategory_two, r.subcategory_three].filter(Boolean))) {
        invalid += 1;
      }
    }
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }

  console.log(`\nDone — updated ${stats.updated}, invalid paths remaining: ${invalid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
