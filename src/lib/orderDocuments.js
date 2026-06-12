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

/** Compare original vs final order rows for email/PDF when sending from the admin list. */
export function buildEmailItemsFromOrder(order) {
  const original = Array.isArray(order?.original_items) ? order.original_items : (Array.isArray(order?.items) ? order.items : []);
  const final = Array.isArray(order?.final_items) ? order.final_items : original;
  const finalByKey = new Map(final.map((it) => [it.productId || it.code, it]));

  const rows = original.map((orig) => {
    const key = orig.productId || orig.code;
    const fin = finalByKey.get(key);
    const removed = !fin;
    return {
      ...orig,
      qty: removed ? orig.qty : (fin.qty ?? orig.qty),
      finalQty: removed ? 0 : (fin.qty ?? orig.qty),
      originalQty: orig.qty,
      removed,
      swapped: Boolean(fin?.swapped),
      originalCode: fin?.originalCode,
      originalName: fin?.originalName,
      unitPrice: fin?.unitPrice ?? fin?.price ?? orig.unitPrice ?? orig.price ?? 0,
      image: fin?.image ?? orig.image ?? '',
    };
  });

  final.forEach((fin) => {
    const key = fin.productId || fin.code;
    if (!original.some((o) => (o.productId || o.code) === key)) {
      rows.push({
        ...fin,
        qty: fin.qty,
        finalQty: fin.qty,
        originalQty: fin.qty,
        removed: false,
        swapped: true,
        unitPrice: fin.unitPrice ?? fin.price ?? 0,
      });
    }
  });

  return rows;
}

function money(value) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value || 0));
}

async function loadImageDataUrl(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function detectImageFormat(dataUrl) {
  if (!dataUrl) return 'JPEG';
  if (dataUrl.includes('image/png')) return 'PNG';
  if (dataUrl.includes('image/webp')) return 'WEBP';
  return 'JPEG';
}

export async function generateOrderPdfBase64({
  order,
  items = [],
  autoNotes = '',
  userNotes = '',
  assignedTo = '',
  total = null,
  hasPrices = false,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed = 24) => {
    if (y + needed <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const orderNumber = order?.order_number || order?.id?.slice?.(0, 8) || '';
  const customerName = order?.customers?.name || 'Customer';
  const customerEmail = order?.customers?.email || '';
  const businessName = order?.customers?.business_name || '';
  const dateStr = new Date(order?.created_at || Date.now()).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const notes = buildOrderNoteSections({ assignedTo, autoNotes, userNotes });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 98, 'F');
  doc.setTextColor(74, 222, 128);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PROTO TRADING', margin, 28);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('Order Confirmation', margin, 52);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(180, 190, 204);
  doc.text(`${orderNumber}  •  ${dateStr}`, margin, 72);
  y = 118;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(customerName, margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  if (customerEmail) { doc.text(customerEmail, margin, y); y += 14; }
  if (businessName && businessName !== customerName) { doc.text(businessName, margin, y); y += 14; }
  y += 8;

  const colImg = margin;
  const colCode = margin + 54;
  const colName = margin + 130;
  const colOrd = margin + 330;
  const colConf = margin + 380;
  const colTotal = margin + 440;
  const rowH = 58;

  ensureSpace(36);
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('IMG', colImg + 4, y + 14);
  doc.text('CODE', colCode, y + 14);
  doc.text('PRODUCT', colName, y + 14);
  doc.text('ORD', colOrd, y + 14);
  doc.text('CONF', colConf, y + 14);
  if (hasPrices) doc.text('TOTAL', colTotal, y + 14);
  y += 26;

  for (const item of items) {
    ensureSpace(rowH + 8);
    const orderedQty = item.originalQty != null ? item.originalQty : item.qty;
    const confirmedQty = item.removed ? 0 : (item.qty ?? item.finalQty ?? 0);
    const price = item.unitPrice || item.price || 0;
    const lineTotal = hasPrices && !item.removed && price ? confirmedQty * price : null;

    if (item.removed) doc.setFillColor(255, 245, 245);
    else if (orderedQty !== confirmedQty) doc.setFillColor(255, 251, 235);
    else doc.setFillColor(255, 255, 255);
    doc.rect(margin, y - 2, contentWidth, rowH, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowH - 2, margin + contentWidth, y + rowH - 2);

    const imgData = await loadImageDataUrl(item.image);
    if (imgData) {
      try {
        doc.addImage(imgData, detectImageFormat(imgData), colImg + 2, y + 6, 44, 44);
      } catch {
        doc.setFillColor(243, 244, 246);
        doc.rect(colImg + 2, y + 6, 44, 44, 'F');
      }
    } else {
      doc.setFillColor(243, 244, 246);
      doc.rect(colImg + 2, y + 6, 44, 44, 'F');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('—', colImg + 22, y + 30, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(item.removed ? 148 : 71, item.removed ? 163 : 85, item.removed ? 184 : 105);
    const codeLines = doc.splitTextToSize(String(item.code || '—'), 88);
    doc.text(codeLines[0] || '—', colCode, y + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(item.removed ? 148 : 15, item.removed ? 163 : 23, item.removed ? 184 : 42);
    const nameLines = doc.splitTextToSize(String(item.name || '—'), 190);
    doc.text(nameLines.slice(0, 2).join(' '), colName, y + 16);

    if (item.removed) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(220, 38, 38);
      doc.text('OUT OF STOCK', colName, y + 36);
    } else if (item.swapped) {
      doc.setFontSize(7);
      doc.setTextColor(37, 99, 235);
      doc.text('SUBSTITUTED', colName, y + 36);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(String(orderedQty), colOrd, y + 22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(item.removed ? 220 : 15, item.removed ? 38 : 23, item.removed ? 38 : 42);
    doc.text(item.removed ? '—' : String(confirmedQty), colConf, y + 22);

    if (hasPrices && lineTotal != null) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(money(lineTotal), colTotal, y + 22);
    }

    y += rowH;
  }

  if (hasPrices && total != null) {
    ensureSpace(34);
    y += 8;
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 28, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text('Order total (excl. VAT)', margin + 12, y + 18);
    doc.text(money(total), margin + contentWidth - 12, y + 18, { align: 'right' });
    y += 40;
  }

  notes.forEach((section) => {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(section.title, margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    section.lines.forEach((line) => {
      const lines = doc.splitTextToSize(`• ${line}`, contentWidth - 8);
      lines.forEach((ln) => {
        ensureSpace(14);
        doc.text(ln, margin + 6, y);
        y += 14;
      });
    });
    y += 8;
  });

  ensureSpace(40);
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text('Proto Trading · South Africa · Prices excl. VAT unless stated otherwise', margin, pageHeight - margin);

  return doc.output('datauristring').split(',')[1];
}
