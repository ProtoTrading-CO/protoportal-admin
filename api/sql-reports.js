import { requireAdminKey } from './_admin-auth.js';
import {
  fetchSqlReportsCatalogue,
  isSqlReportsConfigured,
  listSqlReports,
  runSqlReport,
  SQL_REPORT_SOURCE,
} from './_sql-reports.js';

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const reports = isSqlReportsConfigured()
        ? await fetchSqlReportsCatalogue()
        : listSqlReports();
      return res.status(200).json({
        ok: true,
        source: SQL_REPORT_SOURCE,
        readOnly: true,
        configured: isSqlReportsConfigured(),
        reports,
      });
    } catch (err) {
      return res.status(503).json({ ok: false, error: err.message || 'Could not list SQL reports' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const reportId = String(req.body?.reportId || req.body?.report || '').trim();
  const params = req.body?.params || req.body?.parameters || {};
  if (!reportId) {
    return res.status(400).json({ error: 'reportId is required' });
  }

  try {
    const result = await runSqlReport(reportId, params);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const code = err.code || 'REPORT_FAILED';
    const status = code === 'INVALID_PARAMS' || code === 'UNAPPROVED_REPORT' ? 400
      : code === 'BRIDGE_UNAVAILABLE' ? 503
        : 500;
    return res.status(status).json({ ok: false, error: err.message || 'SQL report failed', code });
  }
}
