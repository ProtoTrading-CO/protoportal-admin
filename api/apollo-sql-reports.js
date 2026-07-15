import {
  getSqlReportDefinition,
  listSqlReports,
  runSqlReport,
  SQL_REPORT_SOURCE,
} from './_sql-reports.js';

const SKU_CAPTURE = /\b(\d{8,14})\b/;
const DATE_CAPTURE = /\b(\d{4}-\d{2}-\d{2})\b/g;

export function isSqlReportListQuery(query) {
  return /\b(?:available|show|list)\b.*\bsql reports?\b/i.test(String(query || ''))
    || /\bsql report(?:s)? catalogue\b/i.test(String(query || ''));
}

export function isSqlReportRunQuery(query) {
  const q = String(query || '');
  if (isSqlReportListQuery(q)) return false;
  return /\b(?:sql report|monthly sales|invoice[- ]?line(?:s)? report|stock report|top[- ]?selling report)\b/i.test(q)
    || /\b(?:for the last|from)\s+\d{4}-\d{2}-\d{2}\b/i.test(q)
    || /\bmonthly sales for sku\b/i.test(q);
}

function extractSku(query) {
  const match = String(query || '').match(SKU_CAPTURE);
  return match ? match[1] : null;
}

function extractDateRange(query) {
  const dates = [...String(query || '').matchAll(DATE_CAPTURE)].map((match) => match[1]);
  if (dates.length >= 2) return { startDate: dates[0], endDate: dates[1] };
  return null;
}

function extractMonths(query) {
  const match = String(query || '').match(/last\s+(\d{1,2})\s+months?/i);
  if (match) return Math.min(36, Math.max(1, Number(match[1])));
  return null;
}

function extractDays(query) {
  const match = String(query || '').match(/last\s+(\d{1,3})\s+days?/i);
  if (match) return Math.min(366, Math.max(1, Number(match[1])));
  return null;
}

function extractDepartment(query) {
  const match = String(query || '').match(/department\s+([A-Za-z0-9][A-Za-z0-9/_\-.]{0,63})/i);
  return match ? match[1].trim() : null;
}

export function resolveSqlReportRoute(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  if (isSqlReportListQuery(q)) {
    return { reportId: null, params: {}, mode: 'list' };
  }

  if (!isSqlReportRunQuery(q)) return null;

  if (/\bmonthly sales\b/i.test(q) && /\bsku\b/i.test(q)) {
    const sku = extractSku(q);
    if (!sku) return null;
    return {
      reportId: 'sales.product_monthly',
      params: { sku, months: extractMonths(q) || 12 },
      mode: 'run',
    };
  }

  if (/\binvoice[- ]?line(?:s)?(?:\s+report)?\b/i.test(q)) {
    const sku = extractSku(q);
    if (!sku) return null;
    return {
      reportId: 'sales.invoice_lines',
      params: { sku, days: extractDays(q) || 30 },
      mode: 'run',
    };
  }

  if (/\bstock report\b/i.test(q) && /\bdepartment\b/i.test(q)) {
    const department = extractDepartment(q);
    if (!department) return null;
    return {
      reportId: 'inventory.stock_by_department',
      params: {
        department,
        negativeOnly: /\bnegative stock\b/i.test(q),
        limit: 100,
      },
      mode: 'run',
    };
  }

  if (/\btop[- ]?selling report\b/i.test(q) || (/\btop\b/i.test(q) && /\brevenue\b/i.test(q) && extractDateRange(q))) {
    const range = extractDateRange(q);
    if (!range) return null;
    return {
      reportId: 'sales.top_products',
      params: {
        ...range,
        sortBy: /\brevenue\b/i.test(q) ? 'revenue' : 'units',
        limit: 25,
      },
      mode: 'run',
    };
  }

  return null;
}

function formatFilters(parameters = {}) {
  const entries = Object.entries(parameters).filter(([, value]) => value != null && value !== '');
  if (!entries.length) return '_No filters._';
  return entries.map(([key, value]) => `- **${key}:** ${value}`).join('\n');
}

function formatRows(reportId, rows = []) {
  if (!rows.length) return '_No rows returned._';

  if (reportId === 'inventory.product_lookup') {
    const row = rows[0];
    return [
      `- **SKU:** ${row.CODE || row.code}`,
      `- **Description:** ${row.DESCR || row.description || '—'}`,
      `- **On hand:** ${row.ONHAND ?? row.onhand ?? '—'}`,
      `- **Booked:** ${row.BOOKED ?? row.booked ?? '—'}`,
      `- **Available:** ${row.available ?? '—'}`,
      `- **Department:** ${row.DEPT || row.dept || '—'}`,
    ].join('\n');
  }

  if (reportId === 'inventory.stock_by_department') {
    return rows.slice(0, 15).map((row, index) => (
      `${index + 1}. **${row.CODE || row.code}** — ${row.DESCR || row.description || '—'} · available **${row.available ?? '—'}**`
    )).join('\n');
  }

  if (reportId === 'sales.product_monthly') {
    return rows.map((row) => (
      `- **${row.salesMonth}** — ${row.units ?? 0} units · R ${Number(row.salesValue || 0).toLocaleString('en-ZA')}`
    )).join('\n');
  }

  if (reportId === 'sales.top_products') {
    return rows.slice(0, 15).map((row, index) => (
      `${index + 1}. **${row.sku}** — ${row.description || '—'} · ${row.units ?? 0} units · R ${Number(row.revenue || 0).toLocaleString('en-ZA')}`
    )).join('\n');
  }

  if (reportId === 'sales.invoice_lines') {
    return rows.slice(0, 15).map((row, index) => {
      const date = row.invoiceDate ? new Date(row.invoiceDate).toLocaleDateString('en-ZA') : '—';
      return `${index + 1}. **${row.invoiceNo || '—'}** · ${date} · qty **${row.quantity ?? 0}** · R ${Number(row.lineTotal || 0).toLocaleString('en-ZA')}`;
    }).join('\n');
  }

  return rows.slice(0, 10).map((row, index) => `${index + 1}. ${JSON.stringify(row)}`).join('\n');
}

export function formatSqlReportListReply(reports = listSqlReports()) {
  const lines = reports.map((report) => (
    `- **${report.id}** — ${report.title}\n  ${report.description}`
  ));
  return {
    reply: `## Approved SQL reports\n\n${lines.join('\n\n')}\n\nSource: **${SQL_REPORT_SOURCE}** · read-only SELECT reports only.`,
    source: 'sql-reports',
    intent: 'sql_report_list',
    businessIntent: 'sql_report_list',
  };
}

export function formatSqlReportReply(result) {
  const spec = getSqlReportDefinition(result.reportId);
  const title = spec?.title || result.reportId;
  const capWarning = result.meta?.truncated
    ? `\n\n⚠️ Result reached the server row cap (${result.meta.maxRows}). Narrow your filters before relying on this evidence.`
    : '';
  const more = result.rowCount > 15 ? `\n\n_Showing first 15 of ${result.rowCount} rows._` : '';

  return {
    reply: `## ${title}\n\n**Source:** ${result.source || SQL_REPORT_SOURCE} · read-only\n**Report:** \`${result.reportId}\`\n**Generated:** ${result.generatedAt}\n\n### Filters used\n${formatFilters(result.parameters)}\n\n### Evidence\n${formatRows(result.reportId, result.rows)}${more}${capWarning}`,
    source: 'sql-reports',
    intent: 'sql_report_run',
    businessIntent: 'sql_report_run',
    sqlReport: result,
  };
}

export async function trySqlReportRoute(query) {
  const route = resolveSqlReportRoute(query);
  if (!route) return null;

  if (route.mode === 'list') {
    return formatSqlReportListReply();
  }

  try {
    const result = await runSqlReport(route.reportId, route.params);
    return formatSqlReportReply(result);
  } catch (err) {
    return {
      reply: `## SQL report failed\n\nCould not run **${route.reportId}**: ${err.message || 'unknown error'}.`,
      source: 'sql-reports',
      intent: 'sql_report_run',
      businessIntent: 'sql_report_run',
    };
  }
}
