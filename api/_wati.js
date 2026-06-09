import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export function normalizePhone(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `27${digits.slice(1)}`;
  return digits;
}

export function titleCase(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\w/g, (match) => match.toUpperCase());
}

export function mapCustomParams(contact = {}) {
  return Object.fromEntries(
    (contact.customParams || []).map((item) => [String(item.name || '').toLowerCase(), item.value])
  );
}

export function getWatiConfig() {
  const baseUrl = (process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950').replace(/\/$/, '');
  const token = process.env.WATI_API_TOKEN;
  if (!token) throw new Error('WATI_API_TOKEN is not configured.');
  return { baseUrl, token };
}

export async function watiRequest(path, { method = 'GET', body } = {}) {
  const { baseUrl, token } = getWatiConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const message = json?.info || json?.message || json?.error || `WATI request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

export async function fetchAllWatiContacts() {
  const contacts = [];
  let pageNumber = 1;
  const pageSize = 100;

  while (true) {
    const json = await watiRequest(`/api/v1/getContacts?pageSize=${pageSize}&pageNumber=${pageNumber}`);
    const batch = json.contact_list || [];
    contacts.push(...batch);
    const total = Number(json.link?.total || contacts.length);
    if (!batch.length || contacts.length >= total) break;
    pageNumber += 1;
  }

  return contacts;
}

export async function fetchCustomerPhoneMap() {
  const supabase = getAdminClient();
  const rows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, email, business_name, business_type, phone, created_at, is_approved')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const map = new Map();
  for (const row of rows) {
    const normalized = normalizePhone(row.phone);
    if (!normalized || map.has(normalized)) continue;
    map.set(normalized, row);
  }
  return map;
}

function extractBroadcastName(message = {}) {
  const direct = [
    message.broadcastName,
    message.templateName,
    message.template?.elementName,
    message.template?.name,
  ].find(Boolean);
  if (direct) return direct;

  const description = String(message.eventDescription || '');
  const match = description.match(/using\s+"([^"]+)"\s+template/i);
  if (match?.[1]) return match[1];
  return '';
}

export async function fetchContactMessageSummary(phone) {
  if (!phone) return { lastSentAt: null, lastRespondedAt: null, lastBroadcastAt: null, lastBroadcastName: '' };
  try {
    const json = await watiRequest(`/api/v1/getMessages/${phone}?pageSize=15&pageNumber=1`);
    const items = json.messages?.items || [];
    const lastSent = items.find((item) => item.eventType === 'message' && item.owner === true);
    const lastReply = items.find((item) => item.eventType === 'message' && item.owner === false);
    const lastBroadcast = items.find((item) => item.eventType === 'broadcastMessage');
    return {
      lastSentAt: lastSent?.created || null,
      lastRespondedAt: lastReply?.created || null,
      lastBroadcastAt: lastBroadcast?.created || null,
      lastBroadcastName: extractBroadcastName(lastBroadcast),
    };
  } catch {
    return { lastSentAt: null, lastRespondedAt: null, lastBroadcastAt: null, lastBroadcastName: '' };
  }
}

export function deriveJoinedStatus(contact, customer) {
  const params = mapCustomParams(contact);
  return params.attribute_2 || params.joined || params.join_status || params.join_status_text || (customer?.is_approved ? 'pending' : 'not approved');
}

export function deriveBusinessType(contact, customer) {
  const params = mapCustomParams(contact);
  return params.business_type || params.businesstype || customer?.business_type || '';
}

export function mapWhatsappContact(contact, customer) {
  const params = mapCustomParams(contact);
  const phone = normalizePhone(contact.phone || contact.wAid || contact.waId || contact.rcsPhone || '');
  return {
    id: contact.id,
    phone,
    phoneDisplay: phone ? `+${phone}` : '—',
    displayName: contact.fullName || contact.firstName || customer?.name || customer?.business_name || phone,
    email: params.email || params.customer_email || customer?.email || '',
    businessType: titleCase(deriveBusinessType(contact, customer)),
    joinedStatus: deriveJoinedStatus(contact, customer),
    joinedAt: customer?.created_at || contact.created || null,
    contactStatus: contact.contactStatus || 'UNKNOWN',
    allowBroadcast: contact.allowBroadcast !== false,
    lastUpdated: contact.lastUpdated || null,
    customerName: customer?.name || '',
    businessName: customer?.business_name || '',
  };
}

export function applyContactFilters(contacts, { search = '', businessTypes = [], joinedStatuses = [] } = {}) {
  const searchValue = String(search || '').trim().toLowerCase();
  const businessTypeSet = new Set((businessTypes || []).map((item) => String(item).toLowerCase()));
  const joinedSet = new Set((joinedStatuses || []).map((item) => String(item).toLowerCase()));

  return contacts.filter((contact) => {
    if (businessTypeSet.size && !businessTypeSet.has(String(contact.businessType || '').toLowerCase())) return false;
    if (joinedSet.size && !joinedSet.has(String(contact.joinedStatus || '').toLowerCase())) return false;
    if (!searchValue) return true;
    return [contact.displayName, contact.phone, contact.email, contact.businessType, contact.businessName, contact.customerName]
      .join(' ')
      .toLowerCase()
      .includes(searchValue);
  });
}

export function buildSummary(contacts) {
  const cutoff30d = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const joinedCount = contacts.filter((contact) => String(contact.joinedStatus || '').trim().toLowerCase() === 'joined').length;
  const notJoinedCount = contacts.filter((contact) => ['not joined', 'no thanks'].includes(String(contact.joinedStatus || '').trim().toLowerCase())).length;
  const engaged30d = contacts.filter((contact) => {
    const stamp = contact.lastUpdated ? new Date(contact.lastUpdated).getTime() : 0;
    return stamp && stamp >= cutoff30d;
  }).length;
  const broadcastReadyCount = contacts.filter((contact) => contact.allowBroadcast && contact.contactStatus === 'VALID').length;

  return {
    totalContacts: contacts.length,
    joinedCount,
    notJoinedCount,
    engaged30d,
    broadcastReadyCount,
  };
}

export async function fetchApprovedWatiTemplates() {
  const json = await watiRequest('/api/v1/getMessageTemplates?pageSize=100&pageNumber=1');
  return (json.messageTemplates || [])
    .filter((template) => String(template.status || '').toUpperCase() === 'APPROVED')
    .map((template) => ({
      id: template.id,
      name: template.elementName,
      category: template.category || '',
      language: template.language?.value || template.language?.text || '',
      lastModified: template.lastModified || null,
      status: template.status || '',
      body: typeof template.body === 'string' ? template.body : '',
      footer: typeof template.footer === 'string' ? template.footer : '',
      headerType: template.header?.headerTypeString || template.header?.typeString || 'none',
      headerText: template.header?.text || '',
      mediaFileName: template.header?.mediaFromPC || '',
      buttons: Array.isArray(template.buttons)
        ? template.buttons.map((button, index) => ({
            index,
            type: button.type || '',
            text: button.parameter?.text || button.parameter?.url || button.parameter?.phoneNumber || `Button ${index + 1}`,
          }))
        : [],
    }));
}
