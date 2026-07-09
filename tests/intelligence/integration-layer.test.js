import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveIntent, resolutionToRoute } from '../../api/intelligence/intent-engine/resolve.js';
import { biRun, biFormat } from '../../api/intelligence/bi/facade.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function readAllJsFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) readAllJsFiles(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

function fileMustNotImportSql(filePath) {
  const src = readFileSync(filePath, 'utf8');
  expect(src).not.toMatch(/from\s+['"].*mssql/);
  expect(src).not.toMatch(/from\s+['"].*_sql-provider/);
  expect(src).not.toMatch(/from\s+['"].*adapters\/sql/);
}

describe('integration layer — intent to context routing', () => {
  it('routes SKU through intent engine to product.context', () => {
    const resolved = resolveIntent('8614001234');
    const route = resolutionToRoute(resolved);
    expect(route.intent).toBe('product.context');
    expect(route.entityType).toBe('product');
    expect(route.params.code).toBe('8614001234');
  });

  it('routes Motarro through intent engine to supplier.context', async () => {
    const route = resolutionToRoute(resolveIntent('Motarro'));
    expect(route.intent).toBe('supplier.context');

    const envelope = await biRun(route.intent, route.params, {});
    expect(envelope.ok).toBe(true);
    expect(envelope.data.stub).toBe(true);
    expect(envelope.data.notAvailable).toContain('lead_times');

    const md = biFormat(route.intent, envelope);
    expect(md).toContain('Motarro');
    expect(md).toContain('not yet available');
  });

  it('routes Container 57 through intent engine to container.context', async () => {
    const route = resolutionToRoute(resolveIntent('Container 57'));
    expect(route.intent).toBe('container.context');

    const envelope = await biRun(route.intent, route.params, {});
    expect(envelope.ok).toBe(true);
    expect(envelope.data.reference).toBe('Container 57');
    expect(envelope.data.notAvailable).toContain('erp_lines');
  });

  it('asks for clarification on ambiguous material terms', () => {
    const resolved = resolveIntent('Leather');
    expect(resolved?.ok).toBe(false);
    expect(resolved.reason).toBe('clarify');
    expect(resolved.reply).toMatch(/product line|supplier|customer/i);
  });
});

describe('integration layer — customer disambiguation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns multiple matches when customer search is ambiguous', async () => {
    vi.doMock('../../api/intelligence/query-engine/execute.js', () => ({
      executeQuery: vi.fn(async (queryId) => {
        if (queryId === 'portal.customers_search') {
          return {
            ok: true,
            data: {
              customers: [
                { id: 'c1', name: 'Smith Trading', business: 'Smith', email: 'a@smith.za' },
                { id: 'c2', name: 'Smith Stationers', business: 'Smith Co', email: 'b@smith.za' },
              ],
            },
            meta: { source: ['portal_supabase'], partial: false, warnings: [], cache: 'miss' },
          };
        }
        return { ok: true, data: {}, meta: {} };
      }),
    }));

    const { biRun: biRunMocked } = await import('../../api/intelligence/bi/facade.js');
    const route = resolutionToRoute(resolveIntent('Find customer Smith'));
    expect(route.intent).toBe('customer.context');

    const envelope = await biRunMocked(route.intent, route.params, {});
    expect(envelope.ok).toBe(true);
    expect(envelope.data.matches).toHaveLength(2);
    expect(envelope.data.profile).toBeNull();
  });
});

describe('integration layer — no raw SQL bypass', () => {
  it('entity-registry modules do not import SQL adapters', () => {
    const files = readAllJsFiles(join(ROOT, 'api/intelligence/entity-registry'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) fileMustNotImportSql(file);
  });

  it('intent engine resolve path does not import SQL adapters', () => {
    fileMustNotImportSql(join(ROOT, 'api/intelligence/intent-engine/resolve.js'));
  });

  it('supplier and container stubs do not call Query Engine', async () => {
    const supplierSrc = readFileSync(join(ROOT, 'api/intelligence/bi/contexts/supplier.js'), 'utf8');
    const containerSrc = readFileSync(join(ROOT, 'api/intelligence/bi/contexts/container.js'), 'utf8');
    expect(supplierSrc).not.toMatch(/executeQuery/);
    expect(containerSrc).not.toMatch(/executeQuery/);
  });
});
