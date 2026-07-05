import { requireAdminKey } from './_admin-auth.js';
import {
  buildOutgoingList,
  deleteOutgoingOverride,
  isOutgoingConflictError,
  loadOutgoingTemplate,
  readOutgoingOverrides,
  saveOutgoingTemplate,
  sendOutgoing,
  mergeOutgoingTemplate,
} from './_outgoing-email.js';
import { composeOutgoingParts, sendBrevoTransactional } from './_brevo-email.js';
import { getOutgoingMeta, isOutgoingSlug } from '../lib/outgoing-emails.mjs';
import {
  ORDER_CONFIRMATION_SAMPLE,
  buildOrderEmailHtml,
} from '../lib/order-confirmation-email.mjs';

const TEST_PREFIX = '[TEST] ';

function conflictStatus(err) {
  return isOutgoingConflictError(err) ? 409 : 400;
}

async function sendOutgoingTestEmail(slug, { testEmail, templateOverride, previewVars }) {
  if (slug === 'order_confirmation_customer') {
    const { subject, introHtml } = composeOutgoingParts(templateOverride, previewVars);
    const html = buildOrderEmailHtml({
      ...ORDER_CONFIRMATION_SAMPLE,
      customerName: previewVars.name,
      orderNumber: previewVars.order_number,
      introHtml,
    });
    await sendBrevoTransactional({
      to: { email: testEmail, name: previewVars.name || 'Test' },
      subject: `${TEST_PREFIX}${subject}`.trim(),
      htmlContent: html,
      textContent: `Test order confirmation for ${previewVars.order_number}`,
    });
    return;
  }

  await sendOutgoing(slug, {
    to: { email: testEmail, name: previewVars?.name || 'Test' },
    vars: previewVars || {},
    templateOverride,
    subjectPrefix: TEST_PREFIX,
  });
}

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
      return res.status(conflictStatus(err)).json({ error: err.message || 'Save failed' });
    }
  }

  if (req.method === 'DELETE') {
    const slug = String(req.query?.slug || req.body?.slug || '').trim();
    if (!isOutgoingSlug(slug)) {
      return res.status(400).json({ error: 'Unknown email template' });
    }
    try {
      const restored = await deleteOutgoingOverride(slug);
      return res.status(200).json({ ok: true, slug, reverted: true, template: restored });
    } catch (err) {
      return res.status(conflictStatus(err)).json({ error: err.message || 'Revert failed' });
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

      await sendOutgoingTestEmail(slug, {
        testEmail,
        templateOverride,
        previewVars: meta.previewVars || {},
      });
      return res.status(200).json({ ok: true, test: true, email: testEmail });
    } catch (err) {
      console.error('outgoing-emails test:', err?.message || err);
      return res.status(500).json({ error: err.message || 'Test send failed' });
    }
  }

  return res.status(405).end();
}
