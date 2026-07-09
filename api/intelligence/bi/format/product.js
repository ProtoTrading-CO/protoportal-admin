import { money, provenanceFootnote, fmtDateTime } from '../shared/format.js';
import { readTrust } from '../shared/trust.js';

function formatEvidenceLine(label, field) {
  if (!field || field.value == null || field.value === '') return null;
  const src = String(field.source || 'unknown').replace(/_/g, ' ');
  const conf = field.confidence != null ? `${Math.round(field.confidence * 100)}%` : '—';
  const at = field.timestamp ? fmtDateTime(field.timestamp) : '—';
  return `- **${label}:** ${field.value} _(${src} · ${conf} · ${at})_`;
}

export function formatProductContext(envelope) {
  const { data, meta } = envelope;
  if (!data) return 'No product code provided.';

  if (data.status?.code === 'not_found' || (!data.erp && !data.website)) {
    return `## Product ${data.code || '—'}\n\nI couldn't find a product with SKU **${data.code || '—'}** in the live ERP.\n\n${provenanceFootnote(meta)}`;
  }

  const lines = [`## Product ${data.code}`, ''];

  if (data.liveErp) {
    lines.push('_Product truth: live BLADERUNNER (erp_sql)_', '');
  } else if (data.erpDataSource === 'stmast_cache') {
    lines.push('_Product truth: stmast_cache fallback — configure SQL bridge for live ERP_', '');
  }

  if (data.imageUrl) {
    lines.push(`![${data.code}](${data.imageUrl})`, '');
  }

  const title = data.website?.title || data.erp?.title || readTrust(data.evidence?.title) || data.code;
  lines.push(`### ${title}`, '');
  lines.push(`- **Status:** ${data.status?.label || '—'}`);

  if (data.erp) {
    const erpLabel = data.erpDataSource === 'erp_sql' ? 'ERP (live BLADERUNNER)' : 'ERP (cache)';
    lines.push(`- **${erpLabel} on hand:** ${data.erp.onhand ?? '—'} · **booked:** ${data.erp.booked ?? '—'} · **available:** ${data.erp.available ?? '—'}`);
    if (data.erp.price != null) lines.push(`- **ERP price:** ${money(data.erp.price)}`);
    if (data.erp.dept) lines.push(`- **ERP department:** ${data.erp.dept}`);
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

  const ev = data.evidence || {};
  const evidenceLines = [
    formatEvidenceLine('Title', ev.title),
    formatEvidenceLine('Price', ev.price),
    formatEvidenceLine('Department', ev.department),
    formatEvidenceLine('On hand (ERP)', ev.onHand),
    formatEvidenceLine('Booked', ev.booked),
    formatEvidenceLine('Available', ev.available),
    formatEvidenceLine('Stock on hand', ev.stockOnHand),
    formatEvidenceLine('Supplier', ev.supplier),
    formatEvidenceLine('Barcode', ev.barcode),
  ].filter(Boolean);

  if (evidenceLines.length) {
    lines.push('', '### Evidence', ...evidenceLines);
  }

  const missing = (data.notAvailable || []).filter((f) => !['website_listing', 'erp_master'].includes(f));
  if (missing.length) {
    lines.push('', '### Not available', missing.map((f) => `- ${f.replace(/_/g, ' ')}`).join('\n'));
  }

  lines.push('', provenanceFootnote(meta));
  return lines.join('\n');
}
