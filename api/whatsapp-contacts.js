import {
  applyContactFilters,
  buildSummary,
  fetchContactMessageSummary,
  fetchAllWatiContacts,
  fetchCustomerPhoneMap,
  mapWhatsappContact,
  normalizePhone,
} from './_wati.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(50, Math.max(10, Number(req.query.pageSize || 25)));
    const search = String(req.query.search || '');
    const businessTypes = ([]).concat(req.query.businessType || []).filter(Boolean);
    const joinedStatuses = ([]).concat(req.query.joinedStatus || []).filter(Boolean);

    const [watiContacts, customerMap] = await Promise.all([
      fetchAllWatiContacts(),
      fetchCustomerPhoneMap(),
    ]);

    const mapped = watiContacts.map((contact) => {
      const customer = customerMap.get(normalizePhone(contact.phone || contact.wAid || contact.waId || contact.rcsPhone || ''));
      return mapWhatsappContact(contact, customer);
    });

    const filtered = applyContactFilters(mapped, { search, businessTypes, joinedStatuses });
    const totalFiltered = filtered.length;
    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);
    const enrichedRows = await Promise.all(pageRows.map(async (contact) => ({
      ...contact,
      ...(await fetchContactMessageSummary(contact.phone)),
      engaged: contact.lastUpdated ? new Date(contact.lastUpdated).getTime() >= Date.now() - (30 * 24 * 60 * 60 * 1000) : false,
    })));

    return res.status(200).json({
      contacts: enrichedRows,
      total: mapped.length,
      totalFiltered,
      page,
      pageSize,
      summary: buildSummary(filtered),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to load WhatsApp contacts' });
  }
}
