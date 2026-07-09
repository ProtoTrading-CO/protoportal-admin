import { resolveProductByCode } from '../../../_sql-provider.js';
import { isStmastAccessConfigured } from '../../../_sql-stmast.js';
import { WARNING_CODES } from '../envelope.js';

export default {
  id: 'erp.product_by_code',
  adapter: 'sql',
  params: {
    code: { type: 'string', required: true },
  },
  maxRows: 1,
  timeoutMs: 15000,
  cacheTtlMs: 60000,

  async run(_client, params) {
    const code = String(params.code || '').trim().toUpperCase();
    const warnings = [];
    const bridgeConfigured = isStmastAccessConfigured();

    const { product, dataSource, bridgeAttempted } = await resolveProductByCode(code);

    if (bridgeAttempted && dataSource !== 'erp_sql') {
      warnings.push(WARNING_CODES.BRIDGE_OFFLINE);
    }

    if (!product) {
      return {
        data: { product: null, code, dataSource: null },
        source: bridgeConfigured ? ['stmast_cache', 'erp_sql'] : ['stmast_cache'],
        warnings: [...warnings, WARNING_CODES.ERP_NOT_FOUND],
      };
    }

    const source = dataSource === 'erp_sql' ? ['erp_sql'] : ['stmast_cache'];

    return {
      data: { product, code, dataSource },
      source,
      warnings,
    };
  },
};
