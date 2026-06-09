import { jsPDF } from 'jspdf';

export function buildOrderNoteSections({ assignedTo = '', autoNotes = '', userNotes = '' } = {}) {
  const autoLines = String(autoNotes || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const userLines = String(userNotes || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return [
    assignedTo ? { title: 'Handled by', lines: [assignedTo] } : null,
    autoLines.length ? { title: 'Order changes', lines: autoLines } : null,
    userLines.length ? { title: 'Additional notes', lines: userLines } : null,
  ].filter(Boolean);
}

export function buildCombinedNotes(payload = {}) {
  return buildOrderNoteSections(payload)
    .map((section) => `${section.title}:\n${section.lines.map((line) => `• ${line}`).join('\n')}`)
    .join('\n\n');
}

export function createEmailOrderItems(items = []) {
  return items.map(({ finalQty, qty, removed, swapped, originalCode, originalName, ...rest }) => ({
    ...rest,
    qty: removed ? qty : finalQty,
    originalQty: qty,
    removed: removed || false,
    swapped: swapped || false,
    originalCode,
    originalName,
  }));
}

export async function generateOrderPdfBase64({ order, items = [], autoNotes = '', userNotes = '', assignedTo = '', total = null, hasPrices = false }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed = 24) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const writeWrapped = (text, x, maxWidth, lineHeight = 14) => {
    const lines = doc.splitTextToSize(String(text || ''), maxWidth);
    lines.forEach((line) => {
      ensureSpace(lineHeight + 2);
      doc.text(line, x, y);
      y += lineHeight;
    });
  };

  const orderNumber = order?.order_number || order?.id?.slice?.(0, 8) || '';
  const customerName = order?.customers?.name || 'Customer';
  const customerEmail = order?.customers?.email || '';
  const dateStr = new Date(order?.created_at || Date.now()).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  const notes = buildOrderNoteSections({ assignedTo, autoNotes, userNotes });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 96, 'F');
  doc.setTextColor(74, 222, 128);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PROTO TRADING', margin, 30);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('Order Confirmation', margin, 56);
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${orderNumber}  •  ${dateStr}`, margin, 76);
  y = 124;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(customerName, margin, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (customerEmail) {
    doc.text(customerEmail, margin, y);
    y += 14;
  }
  if (order?.customers?.business_name && order.customers.business_name !== customerName) {
    doc.text(order.customers.business_name, margin, y);
    y += 14;
  }
  y += 10;

  items.forEach((item, index) => {
    const price = item.unitPrice || item.price || 0;
    const qtyChanged = item.originalQty != null ? item.qty !== item.originalQty : item.finalQty !== item.qty;
    const orderedQty = item.originalQty != null ? item.originalQty : item.qty;
    const confirmedQty = item.removed ? 0 : (item.finalQty ?? item.qty);
    const lineParts = [
      `${index + 1}. ${item.code || ''} — ${item.name || ''}`,
      item.removed ? `OUT OF STOCK · ordered ${orderedQty}` : `ordered ${orderedQty} · confirmed ${confirmedQty}`,
      item.swapped ? `substituted from ${item.originalCode || ''} ${item.originalName || ''}`.trim() : '',
      qtyChanged && !item.removed ? 'quantity changed' : '',
      hasPrices && !item.removed && price ? `line total ${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format((confirmedQty || 0) * price)}` : '',
    ].filter(Boolean).join(' | ');
    ensureSpace(36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    writeWrapped(lineParts, margin, contentWidth, 14);
    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
  });

  if (hasPrices && total != null) {
    ensureSpace(26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Total: ${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(total)}`, margin, y);
    y += 24;
  }

  notes.forEach((section) => {
    ensureSpace(32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(section.title, margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    section.lines.forEach((line) => writeWrapped(`• ${line}`, margin + 8, contentWidth - 8, 14));
    y += 8;
  });

  return doc.output('datauristring').split(',')[1];
}
