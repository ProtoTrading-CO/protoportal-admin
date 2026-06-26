import { jsPDF } from 'jspdf';
import { displayOrderNumber, buildFulfillmentUrl } from './orderNumber';

/** Customer-facing order confirmation PDF/email — staff preview may still show prices. */
export const SHOW_CUSTOMER_PRICES = false;

export function stripPricesFromOrderItems(items = []) {
  return items.map(({ unitPrice, price, ...rest }) => rest);
}

export function resolveCustomerOrderPricing(items = []) {
  if (!SHOW_CUSTOMER_PRICES) {
    return { hasPrices: false, total: null, items: stripPricesFromOrderItems(items) };
  }
  const hasPrices = items.some((item) => item.unitPrice != null || item.price != null);
  const total = hasPrices
    ? items
      .filter((item) => !item.removed)
      .reduce((sum, item) => sum + (Number(item.unitPrice ?? item.price ?? 0) * (item.qty || 0)), 0)
    : null;
  return { hasPrices, total, items };
}

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

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

// Images render at 44pt in the PDF, so embedding full-resolution source images
// just bloats the file (and used to push the email payload past size limits).
// Downscale to a small JPEG before embedding.
async function loadImageDataUrl(url, maxPx = 160) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (!bitmap) return await blobToDataUrl(blob);

    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.82);
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

const COL = {
  img: { x: 40, w: 48 },
  code: { x: 96, w: 70 },
  name: { x: 170, w: 176 },
  ord: { x: 350, w: 34 },
  conf: { x: 388, w: 34 },
  total: { x: 426, w: 89 },
};

const ROW_LINE = 11;
const ROW_PAD = 14;

export async function generateOrderPdfBase64({
  order,
  items = [],
  autoNotes = '',
  userNotes = '',
  assignedTo = '',
  total = null,
  hasPrices = false,
  includeInternalLink = false,
  fulfillmentUrl = '',
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

  const orderNumber = displayOrderNumber(order);
  const customerName = order?.customers?.name || 'Customer';
  const customerEmail = order?.customers?.email || '';
  const businessName = order?.customers?.business_name || '';
  const dateStr = new Date(order?.created_at || Date.now()).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const linkUrl = includeInternalLink ? (fulfillmentUrl || buildFulfillmentUrl(order?.id)) : '';

  // ── Header band (black bar with Proto logo) ─────────────────────────────
  doc.setFillColor(196, 0, 0);
  doc.rect(0, 0, pageWidth, 5, 'F');
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 5, pageWidth, 105, 'F');

  const logoData = await loadImageDataUrl('/proto-logo.png');
  let brandX = margin;
  if (logoData) {
    try { doc.addImage(logoData, detectImageFormat(logoData), margin, 30, 44, 44); brandX = margin + 56; } catch { brandX = margin; }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('PROTO', brandX, 50);
  const protoW = doc.getTextWidth('PROTO');
  doc.setTextColor(220, 38, 38);
  doc.text(' TRADING', brandX + protoW, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.setCharSpace(1.4);
  doc.text('ORDER CONFIRMATION', brandX, 66);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(orderNumber, pageWidth - margin, 48, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(dateStr, pageWidth - margin, 64, { align: 'right' });
  y = 132;

  // ── Customer details (full sign-up record) ──────────────────────────────
  const c = order?.customers || {};
  const contactName = c.contact_name || c.name || customerName;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(businessName || contactName, margin, y);
  y += 17;

  const detail = (label, value) => {
    if (!value) return;
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const labelText = `${label}:  `;
    doc.text(labelText, margin, y);
    const lw = doc.getTextWidth(labelText);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    const vlines = doc.splitTextToSize(String(value), contentWidth - lw);
    doc.text(vlines, margin + lw, y, { lineHeightFactor: 1.25 });
    y += Math.max(13, vlines.length * 12);
  };

  if (businessName && contactName && businessName !== contactName) detail('Contact', contactName);
  detail('Email', customerEmail);
  detail('Phone', c.phone);
  detail('VAT number', c.vat_number);
  detail('Account code', c.account_code || c.customer_code);
  detail('Business type', c.business_type);
  detail('Location', [c.city, c.province, c.country].filter(Boolean).join(', '));
  detail('Company address', c.company_address);
  detail('Delivery address', c.delivery_address);
  detail('Delivery method', order?.delivery_method);
  y += 8;

  // ── Table header ──────────────────────────────────────────────────────
  ensureSpace(30);
  doc.setFillColor(17, 17, 17);
  doc.rect(margin, y, contentWidth, 22, 'F');
  doc.setFillColor(196, 0, 0);
  doc.rect(COL.conf.x - 4, y, COL.conf.w + 8, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('IMG', COL.img.x + 4, y + 14);
  doc.text('CODE', COL.code.x, y + 14);
  doc.text('PRODUCT', COL.name.x, y + 14);
  doc.text('ORD', COL.ord.x, y + 14);
  doc.text('CONF', COL.conf.x, y + 14);
  if (hasPrices) doc.text('TOTAL', COL.total.x, y + 14);
  y += 28;

  // ── Line items ────────────────────────────────────────────────────────
  for (const item of items) {
    const orderedQty = item.originalQty != null ? item.originalQty : item.qty;
    const confirmedQty = item.removed ? 0 : (item.qty ?? item.finalQty ?? 0);
    const price = Number(item.unitPrice ?? item.price ?? 0);
    const lineTotal = hasPrices && !item.removed ? confirmedQty * price : null;
    const codeText = String(item.code || '—');
    const nameText = String(item.name || '—');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const codeLines = doc.splitTextToSize(codeText, COL.code.w);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const nameLines = doc.splitTextToSize(nameText, COL.name.w).slice(0, 2);
    const textLines = Math.max(1, Math.min(2, codeLines.length), nameLines.length);
    const rowH = Math.max(48, ROW_PAD + textLines * ROW_LINE);

    ensureSpace(rowH + 6);

    if (item.removed) doc.setFillColor(255, 245, 245);
    else if (orderedQty !== confirmedQty) doc.setFillColor(255, 251, 235);
    else doc.setFillColor(255, 255, 255);
    doc.rect(margin, y - 2, contentWidth, rowH, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowH - 2, margin + contentWidth, y + rowH - 2);

    const imgData = await loadImageDataUrl(item.image);
    const imgY = y + (rowH - 44) / 2;
    if (imgData) {
      try {
        doc.addImage(imgData, detectImageFormat(imgData), COL.img.x + 2, imgY, 44, 44);
      } catch {
        doc.setFillColor(243, 244, 246);
        doc.rect(COL.img.x + 2, imgY, 44, 44, 'F');
      }
    } else {
      doc.setFillColor(243, 244, 246);
      doc.rect(COL.img.x + 2, imgY, 44, 44, 'F');
    }

    const textY = y + 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(item.removed ? 148 : 71, item.removed ? 163 : 85, item.removed ? 184 : 105);
    doc.text(codeLines.slice(0, 2), COL.code.x, textY, { maxWidth: COL.code.w, lineHeightFactor: 1.15 });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(item.removed ? 148 : 15, item.removed ? 163 : 23, item.removed ? 184 : 42);
    doc.text(nameLines, COL.name.x, textY, { maxWidth: COL.name.w, lineHeightFactor: 1.15 });

    if (item.removed) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(220, 38, 38);
      doc.text('OUT OF STOCK', COL.name.x, textY + nameLines.length * ROW_LINE + 2);
    } else if (item.swapped) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(37, 99, 235);
      doc.text('SUBSTITUTED', COL.name.x, textY + nameLines.length * ROW_LINE + 2);
    } else if (orderedQty !== confirmedQty) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(146, 64, 14);
      doc.text('QTY CHANGED', COL.name.x, textY + nameLines.length * ROW_LINE + 2);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(String(orderedQty), COL.ord.x, textY + 4, { maxWidth: COL.ord.w });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(item.removed ? 220 : 15, item.removed ? 38 : 23, item.removed ? 38 : 42);
    doc.text(item.removed ? '—' : String(confirmedQty), COL.conf.x, textY + 4, { maxWidth: COL.conf.w });

    if (hasPrices && lineTotal != null) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(money(lineTotal), COL.total.x + COL.total.w, textY + 4, { align: 'right', maxWidth: COL.total.w });
    }

    y += rowH;
  }

  if (hasPrices && total != null) {
    ensureSpace(36);
    y += 8;
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, y, contentWidth, 28, 'F');
    doc.setDrawColor(229, 229, 229);
    doc.rect(margin, y, contentWidth, 28, 'S');
    doc.setFillColor(196, 0, 0);
    doc.rect(margin, y, 4, 28, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(17, 17, 17);
    doc.text('Order total (incl. VAT)', margin + 12, y + 18);
    doc.setTextColor(17, 17, 17);
    doc.text(money(total), margin + contentWidth - 12, y + 18, { align: 'right' });
    y += 40;
  }

  const notes = buildOrderNoteSections({ assignedTo: '', autoNotes, userNotes });
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
        doc.text(ln, margin + 6, y, { maxWidth: contentWidth - 12 });
        y += 14;
      });
    });
    y += 8;
  });

  if (linkUrl) {
    ensureSpace(36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Reopen this order in the fulfilment tab:', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(37, 99, 235);
    const linkLines = doc.splitTextToSize(linkUrl, contentWidth);
    linkLines.forEach((ln) => {
      ensureSpace(12);
      doc.text(ln, margin, y, { maxWidth: contentWidth });
      y += 12;
    });
    y += 8;
  }

  ensureSpace(30);
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  const footer = hasPrices
    ? 'Proto Trading · South Africa · All prices incl. VAT'
    : 'Proto Trading · South Africa';
  doc.text(footer, margin, pageHeight - margin);

  return doc.output('datauristring').split(',')[1];
}

/** Convert a base64 string into a Blob (for direct uploads / object URLs). */
export function base64ToBlob(base64, type = 'application/pdf') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Open a base64 PDF in a new tab (avoids blocked data: URL fetches). */
export function openPdfBase64Preview(pdfBase64, filename = 'proto-order-preview.pdf') {
  const blob = base64ToBlob(pdfBase64, 'application/pdf');
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
