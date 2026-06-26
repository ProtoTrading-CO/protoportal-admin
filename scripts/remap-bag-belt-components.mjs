#!/usr/bin/env node
/**
 * Move mis-categorised bag/leather hardware from Jewellery > Findings (etc.)
 * into Bag & Belt Components with correct subcategories.
 *
 * Usage:
 *   node scripts/remap-bag-belt-components.mjs          # dry run (default)
 *   DRY_RUN=false node scripts/remap-bag-belt-components.mjs
 */

import { createClient } from '@supabase/supabase-js';
import {
  loadBundledTaxonomy,
  validatePath,
  labelsToDbFields,
  normLabel,
} from './lib/taxonomy-paths.mjs';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const PAGE = 1000;

const url = process.env.STOCK_SUPABASE_URL || process.env.VITE_STOCK_SUPABASE_URL;
const key = process.env.STOCK_SUPABASE_KEY || process.env.VITE_STOCK_SUPABASE_KEY;

if (!url || !key) {
  console.error('Missing stock Supabase env vars');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const tree = loadBundledTaxonomy();

const BAG_MAIN = 'Bag & Belt Components';

/** ERP / catalogue signals for strap and bag hardware (not jewellery lobster clasps). */
function isBagHardware(row) {
  const title = String(row.title || '').trim();
  const sku = String(row.sku || '').trim();
  const lower = title.toLowerCase();

  if (/jewellery findings\s*[–-]\s*clasp lobster/i.test(title)) return false;
  if (/clasp lobster/i.test(lower)) return false;
  if (/\bpendant\b.*\bclasp\b/i.test(lower)) return false;

  if (/^86167/i.test(sku)) return true;
  if (/^86169/i.test(sku)) return true;
  if (/^RIV/i.test(sku)) return true;
  if (/^EL00/i.test(sku) && /eyelet mould/i.test(lower)) return true;

  if (/^metal (magnetic )?clasp\s*[–-]/i.test(title)) return true;
  if (/^(buckle|slider|d-ring|square ring|snap hook|swivel|press studs|belt buckle|double capped rivet|eyelet mould|binding post)\s*[-–]/i.test(title)) {
    return true;
  }
  if (/^eyelet machine\b/i.test(title)) return true;

  return false;
}

function inferFinish(title, sku) {
  const t = String(title || '').toLowerCase();
  if (/antique/i.test(t)) return 'Antique';
  if (/\bgold\b/i.test(t) && !/gold plated nickel/i.test(t)) return 'Gold';
  if (/silver|nickel/i.test(t)) return 'Silver';

  const s = String(sku || '').toUpperCase();
  if (s.endsWith('B')) return 'Antique';
  if (s.endsWith('G')) return 'Gold';
  if (s.endsWith('N') || s.endsWith('S') || s.endsWith('A')) return 'Silver';

  return null;
}

function classifyBagHardware(row) {
  const title = String(row.title || '').trim();
  const sku = String(row.sku || '').trim();
  const lower = title.toLowerCase();

  let sub1 = null;

  if (/^belt buckle\s*[–-]/i.test(title) || /^86169/i.test(sku)) {
    sub1 = 'LT Buckles';
  } else if (/^press studs\s*[–-]/i.test(title)) {
    sub1 = 'Press Studs';
  } else if (/^snap hook\s*[–-]/i.test(title)) {
    sub1 = 'Snap & Hooks';
  } else if (/^swivel\s*[–-]/i.test(title)) {
    sub1 = 'Swivel';
  } else if (/^metal (magnetic )?clasp\s*[–-]/i.test(title)) {
    sub1 = 'Clasps';
  } else if (/^(d-ring|square ring)\s*[–-]/i.test(title)) {
    sub1 = 'Square and D-Rings';
  } else if (/^binding post\s*[–-]/i.test(title)) {
    sub1 = 'Rivets';
  } else if (/^slider\s*[–-]/i.test(title)) {
    sub1 = 'Sliders';
  } else if (/^buckle\s*[–-]/i.test(title)) {
    sub1 = 'Buckles';
  } else if (/double capped rivet/i.test(lower) || /^RIV/i.test(sku)) {
    sub1 = 'Rivets';
  } else if (/eyelet mould/i.test(lower)) {
    sub1 = 'Eyelets';
  } else if (/^eyelet machine\b/i.test(lower)) {
    return [BAG_MAIN, 'Tools'];
  } else if (/^86167/i.test(sku)) {
    if (/snap hook/i.test(lower)) sub1 = 'Snap & Hooks';
    else if (/swivel/i.test(lower)) sub1 = 'Swivel';
    else if (/d-ring|square ring/i.test(lower)) sub1 = 'Square and D-Rings';
    else if (/slider/i.test(lower)) sub1 = 'Sliders';
    else if (/buckle/i.test(lower)) sub1 = 'Buckles';
    else if (/press stud/i.test(lower)) sub1 = 'Press Studs';
    else if (/binding post|rivet/i.test(lower)) sub1 = 'Rivets';
    else if (/magnetic clasp|metal clasp/i.test(lower)) sub1 = 'Clasps';
    else if (/eyelet/i.test(lower)) sub1 = 'Eyelets';
  }

  if (!sub1) return null;

  const finish = inferFinish(title, sku);
  const labels = [BAG_MAIN, sub1];
  if (finish) labels.push(finish);

  let path = validatePath(tree, labels);
  if (!path && finish) {
    path = validatePath(tree, [BAG_MAIN, sub1]);
  }
  return path;
}

function pathChanged(row, path) {
  const fields = labelsToDbFields(path);
  return normLabel(fields.category) !== normLabel(row.category)
    || normLabel(fields.subcategory_one) !== normLabel(row.subcategory_one || row.category)
    || normLabel(fields.subcategory_two || '') !== normLabel(row.subcategory_two || '')
    || normLabel(fields.subcategory_three || '') !== normLabel(row.subcategory_three || '');
}

async function fetchAllLive() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('website_stock')
      .select('sku, title, category, subcategory_one, subcategory_two, subcategory_three')
      .order('sku')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function main() {
  console.log(`DRY_RUN=${DRY_RUN}`);
  const rows = await fetchAllLive();
  console.log(`Loaded ${rows.length} live products`);

  const candidates = rows.filter(isBagHardware);
  console.log(`Bag hardware candidates: ${candidates.length}`);

  const updates = [];
  const skipped = [];

  for (const row of candidates) {
    if (normLabel(row.category) === normLabel(BAG_MAIN) && validatePath(tree, [
      row.category,
      row.subcategory_one,
      row.subcategory_two,
      row.subcategory_three,
    ].filter(Boolean))) {
      continue;
    }

    const path = classifyBagHardware(row);
    if (!path) {
      skipped.push({ sku: row.sku, title: row.title, reason: 'unclassified' });
      continue;
    }
    if (!pathChanged(row, path)) continue;
    updates.push({ sku: row.sku, title: row.title, from: [row.category, row.subcategory_one, row.subcategory_two].filter(Boolean).join(' > '), to: path.join(' > ') });
  }

  console.log(`Updates to apply: ${updates.length}`);
  if (skipped.length) console.log(`Skipped (unclassified): ${skipped.length}`, skipped.slice(0, 5));

  const bySub = {};
  for (const u of updates) {
    const sub = u.to.split(' > ').slice(1).join(' > ');
    bySub[sub] = (bySub[sub] || 0) + 1;
  }
  console.log('By target path:', bySub);

  if (updates.length && updates.length <= 20) {
    for (const u of updates) console.log(`  ${u.sku}: ${u.from} → ${u.to}`);
  }

  const BATCH = 50;
  let applied = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    if (!DRY_RUN) {
      await Promise.all(batch.map(async ({ sku, to }) => {
        const path = to.split(' > ');
        const fields = { ...labelsToDbFields(path), updated_at: new Date().toISOString() };
        const { error } = await sb.from('website_stock').update(fields).eq('sku', sku);
        if (error) throw new Error(`${sku}: ${error.message}`);
      }));
    }
    applied += batch.length;
    if (applied % 100 === 0 || applied === updates.length) {
      console.log(`  ${applied}/${updates.length}`);
    }
  }

  const { count } = await sb
    .from('website_stock')
    .select('*', { count: 'exact', head: true })
    .eq('category', BAG_MAIN);

  console.log(`\nDone — ${DRY_RUN ? 'would update' : 'updated'} ${updates.length}; Bag & Belt Components count: ${count}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
