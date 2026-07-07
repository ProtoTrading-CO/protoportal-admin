import { requireCronOrAdminKey } from './_admin-auth.js';
import { mutateSiteConfigJson } from './_site-config-mutate.js';
import {
  applyContactFilters,
  fetchAllWatiContacts,
  fetchCustomerPhoneMap,
  fetchApprovedWatiTemplates,
  mapWhatsappContact,
  normalizePhone,
  watiRequest,
} from './_wati.js';

export const config = { maxDuration: 300 };

const FILE = 'broadcast-schedule.json';
const EMPTY = { items: [] };
// A 'sending' claim older than this is treated as interrupted. We do NOT
// auto-resend it — re-blasting a WhatsApp broadcast to a whole audience is
// worse than pausing it — so it's flagged for manual review instead.
const STALE_CLAIM_MS = 20 * 60 * 1000;

async function reapInterrupted() {
  await mutateSiteConfigJson(FILE, EMPTY, (store) => {
    const now = Date.now();
    let changed = false;
    const items = (store.items || []).map((item) => {
      if (item.status === 'sending' && now - (Date.parse(item.claimedAt || '') || 0) > STALE_CLAIM_MS) {
        changed = true;
        return { ...item, status: 'failed', failedAt: new Date().toISOString(), error: 'Interrupted mid-send — some contacts may have received it. Review before resending.' };
      }
      return item;
    });
    if (!changed) return { abort: true };
    return { store: { items } };
  });
}

async function claimDueItem() {
  let claimed = null;
  await mutateSiteConfigJson(FILE, EMPTY, (store) => {
    // Reset on every invocation: mutateSiteConfigJson re-runs this callback on
    // each optimistic-lock retry. If a concurrent run claimed the item between
    // our read and write, the retry must NOT return a stale claim from a prior
    // attempt (that would double-blast the whole audience).
    claimed = null;
    const now = Date.now();
    const items = (store.items || []).map((item) => ({ ...item }));
    // Only 'pending' items are ever claimed — a 'sending' item is never re-run,
    // so a crash after claim can't double-blast the audience.
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
  await mutateSiteConfigJson(FILE, EMPTY, (store) => {
    const items = (store.items || []).map((item) => (item.id === id ? { ...item, ...patch } : item));
    return { store: { items } };
  });
}

async function sendBroadcast({ templateName, broadcastName, businessTypes, joinedStatuses }) {
  const approvedTemplates = await fetchApprovedWatiTemplates();
  const selectedTemplate = approvedTemplates.find((t) => t.name === templateName);
  if (!selectedTemplate) throw new Error(`Template ${templateName} is not available`);

  const [watiContacts, customerMap] = await Promise.all([
    fetchAllWatiContacts(),
    fetchCustomerPhoneMap(),
  ]);

  const mapped = watiContacts.map((contact) => {
    const customer = customerMap.get(normalizePhone(contact.phone || contact.wAid || contact.waId || contact.rcsPhone || ''));
    return mapWhatsappContact(contact, customer);
  });

  const filtered = applyContactFilters(mapped, { search: '', businessTypes, joinedStatuses })
    .filter((contact) => contact.phone && contact.allowBroadcast);

  if (!filtered.length) throw new Error('No matching WhatsApp contacts found');

  let sent = 0;
  const failed = [];

  for (const contact of filtered) {
    try {
      await watiRequest(`/api/v1/sendTemplateMessage?whatsappNumber=${contact.phone}`, {
        method: 'POST',
        body: {
          template_name: templateName,
          broadcast_name: broadcastName,
          parameters: [],
        },
      });
      sent += 1;
    } catch (error) {
      failed.push({ phone: contact.phone, error: error.message });
    }
  }

  return { sent, failed: failed.length, failedList: failed.slice(0, 25) };
}

export default async function handler(req, res) {
  if (!(await requireCronOrAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const startedAt = Date.now();
  const results = [];

  try {
    await reapInterrupted();

    // Claim one due broadcast at a time (atomic compare-and-set) and mark it
    // 'sending' BEFORE dispatching, so an overlapping tick or a mid-send crash
    // can never re-blast the whole audience. Leave headroom under the limit.
    while (Date.now() - startedAt < 180_000) {
      const item = await claimDueItem();
      if (!item) break;
      try {
        const result = await sendBroadcast({
          templateName: item.templateName,
          broadcastName: item.broadcastName || item.templateName,
          businessTypes: item.businessTypes || [],
          joinedStatuses: item.joinedStatuses || [],
        });
        await finishItem(item.id, { status: 'sent', sentAt: new Date().toISOString(), result });
        results.push({ id: item.id, status: 'sent', ...result });
      } catch (error) {
        await finishItem(item.id, { status: 'failed', failedAt: new Date().toISOString(), error: error.message });
        results.push({ id: item.id, status: 'failed', error: error.message });
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to run scheduled broadcasts' });
  }
}
