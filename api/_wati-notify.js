const ORDER_TEMPLATE = process.env.WATI_ORDER_TEMPLATE || 'proto_order_notis';

export function watiConfig() {
  const baseUrl = (process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950').replace(/\/$/, '');
  const token = process.env.WATI_API_TOKEN;
  return { baseUrl, token };
}

export function normalizeWhatsapp(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `27${digits.slice(1)}`;
  return digits;
}

/** WhatsApp template params cannot contain newlines/tabs or 4+ consecutive spaces. */
export function sanitizeTemplateParam(value, maxLen = 900) {
  let text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`;
  return text;
}

async function watiFetch(baseUrl, token, path, body, method) {
  const httpMethod = method || (body !== undefined ? 'POST' : 'GET');
  const res = await fetch(`${baseUrl}${path}`, {
    method: httpMethod,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text?.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, json };
}

function watiMessageId(json) {
  return json?.messageId || json?.whatsappMessageId || json?.localMessageId || json?.id || null;
}

function watiInfo(json) {
  return String(json?.info || json?.message || json?.error || json?.description || '').trim();
}

/** Parse WATI sendTemplateMessage / sendSessionMessage responses. HTTP 200 ≠ delivered. */
export function parseWatiSendResult({ ok, status, json }) {
  const info = watiInfo(json);
  const messageId = watiMessageId(json);
  const resultFlag = json?.result;

  const explicitSuccess = resultFlag === true
    || json?.ok === true
    || String(resultFlag || '').toLowerCase() === 'success'
    || Boolean(messageId);

  const explicitFail = resultFlag === false
    || json?.validWhatsAppNumber === false
    || /undeliverable|invalid phone|not a valid whatsapp|template.*not found|rejected|does not exist/i.test(info);

  if (ok && explicitSuccess && !explicitFail) {
    return { success: true, response: json, messageId };
  }

  if (!ok || explicitFail) {
    const error = info
      || (resultFlag === false ? 'WATI rejected the send' : null)
      || (json?.validWhatsAppNumber === false ? 'Not a valid WhatsApp number' : null)
      || `WATI send failed (${status})`;
    return { success: false, error, response: json };
  }

  if (ok) {
    return { success: true, response: json, messageId };
  }

  return { success: false, error: info || `WATI send failed (${status})`, response: json };
}

export async function watiEnsureContact(baseUrl, token, phone, name) {
  const digits = normalizeWhatsapp(phone);
  if (!digits) throw new Error('Invalid phone number');
  const { json } = await watiFetch(baseUrl, token, '/api/v1/addContact', {
    name: sanitizeTemplateParam(name || 'Fulfilment', 120),
    phoneNumber: digits,
    allowBroadcast: true,
  });
  return json;
}

export async function watiSendTemplate(baseUrl, token, phone, parameters, templateName = ORDER_TEMPLATE) {
  const { ok, status, json } = await watiFetch(
    baseUrl,
    token,
    `/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
    {
      template_name: templateName,
      broadcast_name: templateName,
      parameters,
    },
  );
  return parseWatiSendResult({ ok, status, json });
}

export async function watiSendSessionMessage(baseUrl, token, phone, messageText) {
  const text = String(messageText).slice(0, 4090);
  const query = new URLSearchParams({ messageText: text });
  const { ok, status, json } = await watiFetch(
    baseUrl,
    token,
    `/api/v1/sendSessionMessage/${encodeURIComponent(phone)}?${query.toString()}`,
    undefined,
    'POST',
  );
  return parseWatiSendResult({ ok, status, json });
}

export function buildSessionOrderMessage({ placedAt, customerName, summary, fulfillmentUrl, orderRef }) {
  const lines = [
    '🛒 *New Proto order*',
    orderRef ? `Ref: ${orderRef}` : null,
    `Time: ${placedAt}`,
    `From: ${customerName}`,
    `Items: ${summary}`,
    `Open: ${fulfillmentUrl}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function isUtilityOrderTemplate() {
  return (process.env.WATI_ORDER_TEMPLATE_CATEGORY || 'UTILITY').toUpperCase() === 'UTILITY';
}

export function shouldUseSessionBackup(templateSucceeded) {
  if (isUtilityOrderTemplate()) return false;
  if (process.env.WATI_ORDER_SESSION_BACKUP === 'false') return false;
  if (process.env.WATI_ORDER_SESSION_BACKUP === 'true') return true;
  return !templateSucceeded;
}

export function formatNotifyError({ templateError, sessionError, sessionAttempted }) {
  if (templateError && sessionAttempted && sessionError) {
    return `Template: ${templateError} · Session: ${sessionError}`;
  }
  if (templateError) return `Template: ${templateError}`;
  if (sessionError) return `Session: ${sessionError}`;
  return 'WhatsApp delivery failed';
}
