import { requireAdminKey } from './_admin-auth.js';
import {
  buildOutgoingList,
  loadOutgoingTemplate,
  readOutgoingOverrides,
  saveOutgoingTemplate,
  sendOutgoing,
  mergeOutgoingTemplate,
} from './_outgoing-email.js';
import { getOutgoingMeta, isOutgoingSlug } from '../lib/outgoing-emails.mjs';

/** Admin CRUD + test send for fixed outgoing transactional emails. */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const overrides = await readOutgoingOverrides();
      return res.status(200).json({ templates: buildOutgoingList(overrides) });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load templates' });
    }
  }

  if (req.method === 'PUT') {
    const slug = String(req.body?.slug || '').trim();
    if (!isOutgoingSlug(slug)) {
      return res.status(400).json({ error: 'Unknown email template' });
    }
    try {
      const saved = await saveOutgoingTemplate(slug, {
        subject: req.body?.subject,
        introText: req.body?.introText,
        htmlBlock: req.body?.htmlBlock,
      });
      return res.status(200).json({ ok: true, slug, template: saved });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Save failed' });
    }
  }

  if (req.method === 'POST') {
    const slug = String(req.body?.slug || '').trim();
    const testEmail = String(req.body?.testEmail || '').trim().toLowerCase();
    if (!isOutgoingSlug(slug)) {
      return res.status(400).json({ error: 'Unknown email template' });
    }
    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid testEmail is required' });
    }
    if (!process.env.BREVO_API_KEY) {
      return res.status(503).json({ error: 'BREVO_API_KEY is not configured' });
    }

    try {
      const meta = getOutgoingMeta(slug);
      const hasDraft = req.body?.subject !== undefined
        || req.body?.introText !== undefined
        || req.body?.htmlBlock !== undefined;
      const templateOverride = hasDraft
        ? mergeOutgoingTemplate(slug, {
          subject: req.body?.subject,
          introText: req.body?.introText,
          htmlBlock: req.body?.htmlBlock,
        })
        : await loadOutgoingTemplate(slug);

      await sendOutgoing(slug, {
        to: { email: testEmail, name: meta.previewVars?.name || 'Test' },
        vars: meta.previewVars || {},
        templateOverride,
      });
      return res.status(200).json({ ok: true, test: true, email: testEmail });
    } catch (err) {
      console.error('outgoing-emails test:', err?.message || err);
      return res.status(500).json({ error: err.message || 'Test send failed' });
    }
  }

  return res.status(405).end();
}
