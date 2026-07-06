import { randomUUID } from 'crypto';
import { requireAdminKey } from './_admin-auth.js';
import { readSiteConfigJson } from './_site-config.js';
import { mutateSiteConfigJson } from './_site-config-mutate.js';
import { VALID_EMAIL_AUDIENCE } from './_send-email-broadcast.js';

export const SCHEDULED_EMAILS_FILE = 'scheduled-emails.json';
export const EMPTY_SCHEDULE = { items: [] };

/** CRUD for scheduled email broadcasts; the cron in run-scheduled-emails.js executes them. */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const store = await readSiteConfigJson(SCHEDULED_EMAILS_FILE, EMPTY_SCHEDULE);
    const items = (store.items || []).slice().sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
    return res.status(200).json({ items });
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    if (body.deleteId) {
      const deleteId = String(body.deleteId);
      await mutateSiteConfigJson(SCHEDULED_EMAILS_FILE, EMPTY_SCHEDULE, (store) => {
        const items = (store.items || []).filter((item) => item.id !== deleteId || item.status === 'sending');
        return { store: { items } };
      });
      return res.status(200).json({ ok: true });
    }

    const audience = String(body.audience || '').trim();
    if (!VALID_EMAIL_AUDIENCE.has(audience)) {
      return res.status(400).json({ error: 'Invalid audience' });
    }
    const subject = String(body.subject || '').trim();
    if (!subject) return res.status(400).json({ error: 'Subject is required' });
    const introText = String(body.introText || '').trim();
    const htmlBlock = String(body.htmlBlock || '').trim();
    if (!introText && !htmlBlock) {
      return res.status(400).json({ error: 'Write a message body and/or HTML block.' });
    }
    const scheduledAt = new Date(String(body.scheduledAt || ''));
    if (Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: 'A valid scheduled date/time is required' });
    }
    if (scheduledAt.getTime() < Date.now() - 60_000) {
      return res.status(400).json({ error: 'Scheduled time is in the past' });
    }

    const item = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      scheduledAt: scheduledAt.toISOString(),
      status: 'pending',
      audience,
      subject,
      introText,
      htmlBlock,
      businessTypes: Array.isArray(body.businessTypes) ? body.businessTypes.filter(Boolean) : [],
    };

    await mutateSiteConfigJson(SCHEDULED_EMAILS_FILE, EMPTY_SCHEDULE, (store) => {
      const items = [...(store.items || []), item];
      return { store: { items } };
    });

    return res.status(200).json({ ok: true, item });
  }

  return res.status(405).end();
}
