#!/usr/bin/env node
/**
 * Production Apollo smoke — POST /api/apollo on admin.proto.co.za
 * Requires ADMIN_DASH_KEY (+ optional QA_BASE_URL) in .env.local
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnvLocal() {
  const path = join(root, '.env.local');
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}

loadEnvLocal();

const BASE = process.env.QA_BASE_URL || 'https://admin.proto.co.za';
const KEY = process.env.ADMIN_DASH_KEY;

if (!KEY) {
  console.error('Missing ADMIN_DASH_KEY in .env.local');
  process.exit(1);
}

async function ask(query) {
  const res = await fetch(`${BASE}/api/apollo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': KEY,
      'x-admin-email': 'george@proto.co.za',
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: query }] }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

const tests = [
  {
    name: 'Bare SKU 8626100145',
    query: '8626100145',
    check(j) {
      return j.source === 'product.context'
        && !/no products matched/i.test(j.reply || '')
        && /8626100145/.test(j.reply || '');
    },
  },
  {
    name: 'Tell me about SKU 8626100145',
    query: 'Tell me about SKU 8626100145',
    check(j) {
      return j.source === 'product.context'
        && /PLAYING CARDS|playing cards/i.test(j.reply || '');
    },
  },
  {
    name: 'Unknown SKU 9999999999',
    query: '9999999999',
    check(j) {
      return !/no products matched/i.test(j.reply || '')
        && /9999999999/.test(j.reply || '')
        && /couldn'?t find|live erp/i.test(j.reply || '');
    },
  },
];

console.log(`=== Production Apollo smoke — ${BASE} ===\n`);

let passed = 0;
for (const t of tests) {
  const j = await ask(t.query);
  const ok = j.status === 200 && t.check(j);
  if (ok) passed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${t.name}`);
  console.log(`  status=${j.status} source=${j.source || '—'} intent=${j.intent || '—'}`);
  if (!ok) {
    console.log(`  error=${j.error || '—'}`);
    console.log(`  preview: ${String(j.reply || '').slice(0, 180).replace(/\n/g, ' ')}`);
  }
}

console.log(`\n--- ${passed}/${tests.length} passed ---`);
process.exit(passed === tests.length ? 0 : 1);
