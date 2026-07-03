import { requireAdminKey } from './_admin-auth.js';
import { readEmailCampaigns } from './_email-campaigns.js';

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const campaigns = await readEmailCampaigns();
      return res.status(200).json({ campaigns });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load campaigns' });
    }
  }

  return res.status(405).end();
}
