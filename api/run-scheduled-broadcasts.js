import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';
import {
  applyContactFilters,
  fetchAllWatiContacts,
  fetchCustomerPhoneMap,
  fetchApprovedWatiTemplates,
  mapWhatsappContact,
  normalizePhone,
  watiRequest,
} from './_wati.js';

const FILE = 'broadcast-schedule.json';

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
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  try {
    const data = await readSiteConfigJson(FILE, { items: [] });
    const items = data.items || [];
    const now = Date.now();
    const results = [];

    for (const item of items) {
      if (item.status !== 'pending') continue;
      const due = new Date(item.scheduledAt).getTime();
      if (Number.isNaN(due) || due > now) continue;

      try {
        const result = await sendBroadcast({
          templateName: item.templateName,
          broadcastName: item.broadcastName || item.templateName,
          businessTypes: item.businessTypes || [],
          joinedStatuses: item.joinedStatuses || [],
        });
        item.status = 'sent';
        item.sentAt = new Date().toISOString();
        item.result = result;
        results.push({ id: item.id, status: 'sent', ...result });
      } catch (error) {
        item.status = 'failed';
        item.failedAt = new Date().toISOString();
        item.error = error.message;
        results.push({ id: item.id, status: 'failed', error: error.message });
      }
    }

    if (results.length) {
      await writeSiteConfigJson(FILE, { items });
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to run scheduled broadcasts' });
  }
}
