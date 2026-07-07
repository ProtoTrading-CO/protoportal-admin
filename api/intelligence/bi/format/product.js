import { money, provenanceFootnote } from '../shared/format.js';

export function formatProductContext(envelope) {
  const { data, meta } = envelope;
  if (!data) return 'No product code provided.';

  if (data.status?.code === 'not_found' || (!data.erp && !data.website)) {
    return `## Product ${data.code || '—'}\n\nNo ERP or website record found for this code.\n\n${provenanceFootnote(meta)}`;
  }

  const lines = [`## Product ${data.code}`, ''];

  if (data.imageUrl) {
    lines.push(`![${data.code}](${data.imageUrl})`, '');
  }

  const title = data.website?.title || data.erp?.title || data.code;
  lines.push(`### ${title}`, '');
  lines.push(`- **Status:** ${data.status?.label || '—'}`);

  if (data.erp) {
    lines.push(`- **ERP on hand:** ${data.erp.onhand ?? '—'} · **booked:** ${data.erp.booked ?? '—'} · **available:** ${data.erp.available ?? '—'}`);
    if (data.erp.price != null) lines.push(`- **ERP price:** ${money(data.erp.price)}`);
  }

  if (data.website) {
    lines.push(`- **Website SKU:** ${data.website.sku}`);
    lines.push(`- **Category:** ${data.website.category || '—'}`);
    if (data.website.price != null) lines.push(`- **Website price:** ${money(data.website.price)}`);
  }

  if (data.stock?.onHand != null) {
    lines.push(`- **Stock on hand:** **${data.stock.onHand}** units`);
  } else {
    lines.push('- **Stock on hand:** not linked');
  }

  if (data.supplier?.name) lines.push(`- **Supplier:** ${data.supplier.name}`);
  if (data.supplier?.department) lines.push(`- **Department:** ${data.supplier.department}`);
  if (data.barcode) lines.push(`- **Barcode:** ${data.barcode}`);

  const missing = (data.notAvailable || []).filter((f) => !['website_listing', 'erp_master'].includes(f));
  if (missing.length) {
    lines.push('', '### Not available', missing.map((f) => `- ${f.replace(/_/g, ' ')}`).join('\n'));
  }

  lines.push('', provenanceFootnote(meta));
  return lines.join('\n');
}
