/** Format checkout delivery choice for PDF/email. */
export function formatDeliveryMethod(method) {
  const m = String(method || '').trim().toLowerCase();
  if (!m) return '';
  if (m.includes('proto') && (m.includes('deliver') || m.includes('trading'))) return 'Proto to deliver';
  if (m.includes('own') || (m.includes('customer') && m.includes('courier'))) {
    return 'Customer elected their own courier';
  }
  if (m === 'proto' || m === 'proto-deliver') return 'Proto to deliver';
  if (m === 'own' || m === 'own-courier') return 'Customer elected their own courier';
  return String(method || '').trim();
}

/** Resolve delivery method from an order row or send payload. */
export function resolveDeliveryMethod(order = {}) {
  const raw = order.delivery_method
    || order.deliveryMethod
    || order.courier_choice
    || order.courierChoice
    || '';
  return formatDeliveryMethod(raw) || String(raw || '').trim();
}

export function stripNoteBullet(line) {
  return String(line || '').replace(/^[\s•·\-–—]+/, '').trim();
}

/** Build auto change lines from confirmed vs original order rows. */
export function deriveAutoNotesFromItems(items = []) {
  const lines = [];
  for (const item of items) {
    if (item.removed) {
      lines.push(`${item.code} — ${item.name}: Out of stock`);
    } else if (item.swapped) {
      lines.push(`${item.originalCode || item.code} — ${item.originalName || item.name}: Substituted with ${item.code}`);
    } else {
      const ordered = item.originalQty != null ? item.originalQty : item.qty;
      const confirmed = item.qty ?? item.finalQty ?? 0;
      if (ordered !== confirmed) {
        lines.push(`${item.code} — ${item.name}: Qty ${ordered} → ${confirmed}`);
      }
    }
  }
  return lines;
}

export function buildOrderNoteSections({ assignedTo = '', autoNotes = '', userNotes = '' } = {}) {
  const autoLines = (Array.isArray(autoNotes) ? autoNotes : String(autoNotes || '').split('\n'))
    .map(stripNoteBullet)
    .filter(Boolean);
  const userLines = String(userNotes || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return [
    assignedTo ? { title: 'Handled by', lines: [assignedTo] } : null,
    autoLines.length ? { title: 'Order changes', lines: autoLines } : null,
    userLines.length ? { title: 'Additional notes', lines: userLines } : null,
  ].filter(Boolean);
}

export function customerDetailRows(order = {}) {
  const c = order.customers || {};
  const contactName = c.contact_name || c.name || '';
  const businessName = c.business_name || '';
  const location = [c.city, c.province, c.country].filter(Boolean).join(', ');
  const rows = [];

  if (contactName) rows.push({ label: 'Customer', value: contactName });
  if (businessName && businessName !== contactName) rows.push({ label: 'Business', value: businessName });
  if (c.email) rows.push({ label: 'Email', value: c.email });
  if (c.phone) rows.push({ label: 'Phone', value: c.phone });
  if (c.business_type) rows.push({ label: 'Business type', value: c.business_type });
  if (location) rows.push({ label: 'Location', value: location });
  if (c.delivery_address) rows.push({ label: 'Delivery address', value: c.delivery_address });

  const delivery = resolveDeliveryMethod(order);
  rows.push({ label: 'Delivery', value: delivery || 'Not specified at checkout' });
  return rows;
}
