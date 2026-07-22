import { requireCronOrAdminKey } from './_admin-auth.js';
import { getPortalAdminClient } from './_site-config.js';
import { generateApolloNotifications } from './apollo-notifications.js';

/**
 * Weekday Apollo intelligence run.
 *
 * Persists deduplicated operational signals before the team starts work.
 * It deliberately does not execute actions or send customer messages.
 */
export default async function handler(req, res) {
  if (!(await requireCronOrAdminKey(req, res))) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await generateApolloNotifications({
      supabase: getPortalAdminClient(),
      persist: true,
      includeAdvisory: true,
      includeExceptions: true,
    });

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      counts: result.counts,
      businessHealthScore: result.businessHealthScore,
      topSignals: (result.items || []).slice(0, 5).map((item) => ({
        category: item.category,
        severity: item.severity,
        title: item.title,
        priorityScore: item.priorityScore,
      })),
    });
  } catch (err) {
    console.error('apollo-daily-brief:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Apollo daily brief failed' });
  }
}
