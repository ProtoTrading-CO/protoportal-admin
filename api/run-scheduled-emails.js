import { requireCronOrAdminKey } from './_admin-auth.js';
import { mutateSiteConfigJson } from './_site-config-mutate.js';
import { runEmailBroadcast } from './_send-email-broadcast.js';
import { EMPTY_SCHEDULE, SCHEDULED_EMAILS_FILE } from './scheduled-emails.js';

export const config = { maxDuration: 300 };

// A 'sending' claim older than this is treated as a crashed run and retried.
const STALE_CLAIM_MS = 20 * 60 * 1000;

async function claimDueItem() {
  let claimed = null;
  await mutateSiteConfigJson(SCHEDULED_EMAILS_FILE, EMPTY_SCHEDULE, (store) => {
    const now = Date.now();
    const items = (store.items || []).map((item) => ({ ...item }));
    const due = items.find((item) => {
      if (item.status === 'pending') return new Date(item.scheduledAt).getTime() <= now;
      if (item.status === 'sending') {
        return now - (Date.parse(item.claimedAt || '') || 0) > STALE_CLAIM_MS;
      }
      return false;
    });
    if (!due) return { abort: true };
    due.status = 'sending';
    due.claimedAt = new Date().toISOString();
    claimed = { ...due };
    return { store: { items } };
  });
  return claimed;
}

async function finishItem(id, patch) {
  await mutateSiteConfigJson(SCHEDULED_EMAILS_FILE, EMPTY_SCHEDULE, (store) => {
    const items = (store.items || []).map((item) => (item.id === id ? { ...item, ...patch } : item));
    return { store: { items } };
  });
}

/** Cron: execute due scheduled email broadcasts, one per claim, until time runs low. */
export default async function handler(req, res) {
  if (!(await requireCronOrAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');

  const startedAt = Date.now();
  const results = [];

  // Leave ~90s headroom per additional job so a claimed item always gets to
  // finish inside the function limit.
  while (Date.now() - startedAt < 180_000) {
    const item = await claimDueItem();
    if (!item) break;
    try {
      const outcome = await runEmailBroadcast({
        audience: item.audience,
        subject: item.subject,
        introText: item.introText,
        htmlBlock: item.htmlBlock,
        businessTypes: item.businessTypes,
      });
      if (outcome.error && !outcome.total) {
        await finishItem(item.id, { status: 'failed', failedAt: new Date().toISOString(), error: outcome.error });
        results.push({ id: item.id, subject: item.subject, error: outcome.error });
      } else {
        await finishItem(item.id, {
          status: 'sent',
          sentAt: new Date().toISOString(),
          result: { total: outcome.total, sent: outcome.sent, failed: outcome.failed },
        });
        results.push({ id: item.id, subject: item.subject, sent: outcome.sent, failed: outcome.failed });
      }
    } catch (err) {
      await finishItem(item.id, { status: 'failed', failedAt: new Date().toISOString(), error: err.message || 'send_failed' });
      results.push({ id: item.id, subject: item.subject, error: err.message || 'send_failed' });
    }
  }

  return res.status(200).json({ ok: true, executed: results.length, results });
}
