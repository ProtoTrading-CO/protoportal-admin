import { requireCronOrAdminKey } from './_admin-auth.js';
import { mutateSiteConfigJson } from './_site-config-mutate.js';
import { runEmailBroadcast } from './_send-email-broadcast.js';
import { EMPTY_SCHEDULE, SCHEDULED_EMAILS_FILE } from './scheduled-emails.js';

export const config = { maxDuration: 300 };

// A 'sending' claim older than this is treated as interrupted. We do NOT
// auto-resend it — re-blasting a broadcast to a whole audience is worse than
// pausing it — so it's flagged for manual review instead.
const STALE_CLAIM_MS = 20 * 60 * 1000;

async function reapInterruptedSends() {
  await mutateSiteConfigJson(SCHEDULED_EMAILS_FILE, EMPTY_SCHEDULE, (store) => {
    const now = Date.now();
    let changed = false;
    const items = (store.items || []).map((item) => {
      if (item.status === 'sending' && now - (Date.parse(item.claimedAt || '') || 0) > STALE_CLAIM_MS) {
        changed = true;
        return {
          ...item,
          status: 'failed',
          failedAt: new Date().toISOString(),
          error: 'Interrupted mid-send — some recipients may have received it. Review before resending.',
        };
      }
      return item;
    });
    if (!changed) return { abort: true };
    return { store: { items } };
  });
}

async function claimDueItem() {
  let claimed = null;
  await mutateSiteConfigJson(SCHEDULED_EMAILS_FILE, EMPTY_SCHEDULE, (store) => {
    // Reset on every invocation: this callback re-runs on each optimistic-lock
    // retry. Without the reset, a retry that finds the item already claimed by a
    // concurrent run would still return the stale claim and double-send it.
    claimed = null;
    const now = Date.now();
    const items = (store.items || []).map((item) => ({ ...item }));
    // Only pending items are ever claimed — a 'sending' item is never
    // re-run, so a failed status-write can't cause a double broadcast.
    const due = items.find((item) => item.status === 'pending' && new Date(item.scheduledAt).getTime() <= now);
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

  await reapInterruptedSends();

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
