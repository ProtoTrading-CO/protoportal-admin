import { requireAdminKey } from './_admin-auth.js';
import {
  applyContactFilters,
  fetchAllWatiContacts,
  fetchCustomerPhoneMap,
  fetchApprovedWatiTemplates,
  mapWhatsappContact,
  normalizePhone,
  watiRequest,
} from './_wati.js';

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const templateName = String(req.body?.templateName || '').trim();
    const broadcastName = String(req.body?.broadcastName || templateName).trim();
    const search = String(req.body?.search || '');
    const businessTypes = Array.isArray(req.body?.businessTypes) ? req.body.businessTypes : [];
    const joinedStatuses = Array.isArray(req.body?.joinedStatuses) ? req.body.joinedStatuses : [];

    if (!templateName) return res.status(400).json({ error: 'Template is required' });

    const approvedTemplates = await fetchApprovedWatiTemplates();
    const selectedTemplate = approvedTemplates.find((template) => template.name === templateName);
    if (!selectedTemplate) return res.status(400).json({ error: 'Selected WATI template is not available' });

    const [watiContacts, customerMap] = await Promise.all([
      fetchAllWatiContacts(),
      fetchCustomerPhoneMap(),
    ]);

    const mapped = watiContacts.map((contact) => {
      const customer = customerMap.get(normalizePhone(contact.phone || contact.wAid || contact.waId || contact.rcsPhone || ''));
      return mapWhatsappContact(contact, customer);
    });

    const filtered = applyContactFilters(mapped, { search, businessTypes, joinedStatuses })
      .filter((contact) => contact.phone && contact.allowBroadcast);

    if (!filtered.length) return res.status(400).json({ error: 'No matching WhatsApp contacts found' });

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
        failed.push({ phone: contact.phone, name: contact.displayName, error: error.message });
      }
    }

    return res.status(200).json({ ok: true, sent, failed: failed.length, failedList: failed.slice(0, 25), templateName, broadcastName });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to send WhatsApp broadcast' });
  }
}
