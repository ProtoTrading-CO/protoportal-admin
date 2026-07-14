#!/usr/bin/env node
/** Test the deployed read-only /buying-history bridge endpoint. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    let value = rest.join('=').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key.trim()] === undefined) process.env[key.trim()] = value;
  }
}

const base = String(process.env.STOCK_SQL_BRIDGE_URL || '').trim().replace(/\/$/, '');
const key = String(process.env.STOCK_SQL_BRIDGE_KEY || '').trim();
const skus = process.argv.slice(2).map((value) => value.trim().toUpperCase()).filter(Boolean);
if (!base || !key) throw new Error('STOCK_SQL_BRIDGE_URL and STOCK_SQL_BRIDGE_KEY are required');
if (!skus.length) skus.push('8626100145');

const response = await fetch(`${base}/buying-history`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': key },
  body: JSON.stringify({ skus, months: 24 }),
  signal: AbortSignal.timeout(45000),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(result.error || `Bridge returned ${response.status}`);
if (!result.meta?.readOnly) throw new Error('Bridge did not report readOnly=true');

console.log(JSON.stringify({
  readOnly: result.meta.readOnly,
  months: result.meta.months,
  requested: result.meta.requestedSkuCount,
  found: result.meta.foundSkuCount,
  missing: result.meta.missingSkuCount,
  sample: (result.items || []).slice(0, 3).map((item) => ({
    code: item.code,
    found: item.found,
    onHand: item.onHand,
    available: item.available,
    units12m: item.sales?.units12m,
  })),
}, null, 2));
