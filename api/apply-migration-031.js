import { readFileSync } from 'fs';
import { join } from 'path';
import { requireAdminKey } from './_admin-auth.js';

/**
 * One-time: apply migration 031 in Supabase SQL Editor (Dashboard → SQL).
 * This endpoint returns the SQL for copy-paste if direct execution is unavailable.
 */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  const sqlPath = join(process.cwd(), 'migrations', '031_auto_approve_trade_signups.sql');
  let sql = '';
  try {
    sql = readFileSync(sqlPath, 'utf8');
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not read migration file' });
  }

  return res.status(200).json({
    ok: true,
    message: 'Paste this SQL into Supabase Dashboard → SQL Editor → Run (portal project).',
    sql,
  });
}
