import { fetchApprovedWatiTemplates } from './_wati.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const templates = await fetchApprovedWatiTemplates();
    return res.status(200).json({ templates });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load WhatsApp templates' });
  }
}
