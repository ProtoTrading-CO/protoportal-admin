import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardList, FileText, Loader2, Pencil, Search, Send, User, X } from 'lucide-react';
import { fetchAdminProductsPage } from '../lib/products';

const ASSIGNED_NAMES = ['Victor', 'George', 'Peter', 'Catherine'];

function lsKey(id) { return `proto_ff_${id}`; }
function loadLocal(id) {
  try { return JSON.parse(localStorage.getItem(lsKey(id)) || 'null'); } catch { return null; }
}
function saveLocal(id, data) {
  try { localStorage.setItem(lsKey(id), JSON.stringify(data)); } catch {}
}

function generatePdfHtml({ order, items, autoNotes, userNotes, assignedTo, total, hasPrices }) {
  const customerName = order.customers?.name || 'Customer';
  const customerEmail = order.customers?.email || '';
  const orderNumber = order.order_number || order.id?.slice(0, 8) || '';
  const dateStr = new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

  const itemRows = items.map((item) => {
    const price = item.unitPrice || item.price || 0;
    const qtyChanged = !item.removed && item.finalQty !== item.qty;
    const lineTotal = price && !item.removed ? (item.finalQty * price).toFixed(2) : null;

    if (item.removed) {
      return `<tr style="background:#fff5f5;border-bottom:1px solid #fee2e2">
        <td style="padding:8px 12px">
          ${item.image ? `<img src="${item.image}" alt="" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:#f3f4f6;mix-blend-mode:multiply">` : '<div style="width:48px;height:48px;background:#f3f4f6;border-radius:6px"></div>'}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:#94a3b8;font-weight:700;text-decoration:line-through">${item.code || ''}</td>
        <td style="padding:10px 12px;font-size:13px;color:#94a3b8;text-decoration:line-through">${item.name || ''}</td>
        <td style="padding:10px 12px;text-align:center;font-size:13px;color:#94a3b8;text-decoration:line-through">${item.qty}</td>
        <td style="padding:10px 12px;text-align:center"><span style="font-size:11px;color:#dc2626;font-weight:700;background:#fee2e2;padding:3px 8px;border-radius:4px">OUT OF STOCK</span></td>
        ${hasPrices ? '<td style="padding:10px 12px;text-align:right;color:#94a3b8">—</td>' : ''}
      </tr>`;
    }

    return `<tr style="background:${qtyChanged ? '#fffbeb' : 'white'};border-bottom:1px solid #f1f5f9">
      <td style="padding:8px 12px">
        ${item.image ? `<img src="${item.image}" alt="" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:#f3f4f6;mix-blend-mode:multiply">` : '<div style="width:48px;height:48px;background:#f3f4f6;border-radius:6px"></div>'}
      </td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;font-weight:700">${item.code || ''}</td>
      <td style="padding:10px 12px;font-size:13px">
        ${item.name || ''}
        ${item.swapped ? `<span style="margin-left:8px;font-size:10px;color:#2563eb;background:#dbeafe;padding:2px 6px;border-radius:4px;font-weight:700">SUBSTITUTED</span>` : ''}
        ${qtyChanged ? `<span style="margin-left:8px;font-size:10px;color:#92400e;background:#fef3c7;padding:2px 6px;border-radius:4px;font-weight:700">QTY CHANGED</span>` : ''}
      </td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;color:#64748b">${item.qty}</td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;font-weight:700;color:${qtyChanged ? '#92400e' : '#0f172a'}">${item.finalQty}</td>
      ${hasPrices ? `<td style="padding:10px 12px;text-align:right;font-size:13px">${lineTotal ? `R${lineTotal}` : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  const allNotes = [autoNotes, userNotes].filter(Boolean).join('\n\n');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order ${orderNumber} — Proto Trading</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;max-width:820px;margin:0 auto;padding:32px 24px;color:#111;background:#f8fafc}
  @media print{.no-print{display:none!important}body{background:#fff}}
</style></head><body>
<div style="background:#0f172a;padding:24px 28px;border-radius:10px;margin-bottom:24px">
  <div style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">Proto Trading</div>
  <h1 style="color:#fff;margin:0;font-size:20px;font-weight:800">Order Confirmation</h1>
  <div style="color:#94a3b8;font-size:13px;margin-top:4px">${orderNumber} &nbsp;·&nbsp; ${dateStr}</div>
</div>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:20px">
  <div style="font-weight:800;font-size:15px;margin-bottom:8px">${customerName}${order.customers?.business_name && order.customers.business_name !== customerName ? ` — ${order.customers.business_name}` : ''}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;color:#374151">
    ${customerEmail ? `<div>📧 ${customerEmail}</div>` : ''}
    ${order.customers?.phone ? `<div>📞 ${order.customers.phone}</div>` : ''}
    ${order.customers?.business_type ? `<div>🏪 ${order.customers.business_type}</div>` : ''}
    ${(order.customers?.city || order.customers?.province || order.customers?.country) ? `<div>📍 ${[order.customers.city, order.customers.province, order.customers.country].filter(Boolean).join(', ')}</div>` : ''}
    ${assignedTo ? `<div>👤 Handled by: <strong>${assignedTo}</strong></div>` : ''}
  </div>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
  <thead><tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
    <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;width:60px">Img</th>
    <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Code</th>
    <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Product</th>
    <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Ordered</th>
    <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Confirmed</th>
    ${hasPrices ? '<th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Line Total</th>' : ''}
  </tr></thead>
  <tbody>${itemRows}</tbody>
</table>

${hasPrices && total ? `<div style="text-align:right;padding:14px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px">
  <span style="font-size:14px;font-weight:700;color:#374151;margin-right:20px">Total</span>
  <span style="font-size:22px;font-weight:900;color:#0f172a">R ${total.toFixed(2)}</span>
</div>` : ''}

${allNotes ? `<div style="background:#fff;border:1px solid #e2e8f0;border-left:3px solid #0f172a;border-radius:8px;padding:14px 16px;margin-bottom:20px">
  <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Order Notes</div>
  <div style="font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.7">${allNotes}</div>
</div>` : ''}

<div class="no-print" style="margin-top:28px;display:flex;gap:10px">
  <button onclick="window.print()" style="padding:10px 24px;background:#0f172a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:Arial">
    Print / Save as PDF
  </button>
  <button onclick="window.close()" style="padding:10px 24px;background:#fff;color:#374151;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:Arial">
    Close
  </button>
</div>
</body></html>`;
}

export default function FulfillmentPage() {
  const orderId = new URLSearchParams(window.location.search).get('id');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [userNotes, setUserNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [done, setDone] = useState(false);

  // Product swap state
  const [editingItemIdx, setEditingItemIdx] = useState(null);
  const [swapSearch, setSwapSearch] = useState('');
  const [swapResults, setSwapResults] = useState([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const swapTimerRef = useRef(null);
  const assignRef = useRef(null);

  useEffect(() => {
    if (!orderId) { setError('No order ID in URL.'); setLoading(false); return; }
    fetch(`/api/admin-orders?id=${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        const row = data.rows?.[0];
        if (!row) { setError('Order not found.'); return; }
        setOrder(row);

        const rawItems = (row.original_items || row.items || []).map((it) => ({
          ...it,
          finalQty: it.qty,
          removed: false,
          swapped: false,
        }));

        const saved = loadLocal(orderId);
        if (saved?.orderId === orderId && saved.items?.length === rawItems.length) {
          setItems(rawItems.map((it, i) => ({
            ...it,
            finalQty: saved.items[i]?.finalQty ?? it.qty,
            removed: saved.items[i]?.removed ?? false,
            swapped: saved.items[i]?.swapped ?? false,
            code: saved.items[i]?.code ?? it.code,
            name: saved.items[i]?.name ?? it.name,
            image: saved.items[i]?.image ?? it.image,
            unitPrice: saved.items[i]?.unitPrice ?? it.unitPrice,
            originalCode: saved.items[i]?.originalCode,
            originalName: saved.items[i]?.originalName,
          })));
          setAssignedTo(saved.assignedTo || '');
          setUserNotes(saved.userNotes || '');
        } else {
          setItems(rawItems);
        }
      })
      .catch((e) => setError(e.message || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    if (!assignOpen) return;
    const h = (e) => { if (assignRef.current && !assignRef.current.contains(e.target)) setAssignOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [assignOpen]);

  const persist = (nextItems, nextAssigned, nextUserNotes) =>
    saveLocal(orderId, { orderId, items: nextItems, assignedTo: nextAssigned, userNotes: nextUserNotes });

  const updateItem = (idx, patch) =>
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      persist(next, assignedTo, userNotes);
      return next;
    });

  const setAssign = (name) => {
    setAssignedTo(name);
    setAssignOpen(false);
    persist(items, name, userNotes);
  };

  // Auto-generated order summary based on item changes
  const autoNotes = useMemo(() => {
    const lines = [];
    items.forEach((item) => {
      if (item.removed) {
        lines.push(`• ${item.code} — ${item.name}: Out of stock`);
      } else if (item.swapped) {
        lines.push(`• ${item.originalCode} — ${item.originalName}: Substituted with ${item.code} — ${item.name}`);
      } else if (item.finalQty !== item.qty) {
        lines.push(`• ${item.code} — ${item.name}: Qty changed from ${item.qty} to ${item.finalQty}`);
      }
    });
    return lines.join('\n');
  }, [items]);

  const handleSwapSearch = (q) => {
    setSwapSearch(q);
    clearTimeout(swapTimerRef.current);
    if (!q.trim()) { setSwapResults([]); return; }
    swapTimerRef.current = setTimeout(async () => {
      setSwapLoading(true);
      try {
        const data = await fetchAdminProductsPage({ page: 1, pageSize: 8, searchQuery: q });
        setSwapResults(data.rows || []);
      } finally { setSwapLoading(false); }
    }, 350);
  };

  const swapItem = (idx, product) => {
    setItems((prev) => {
      const next = prev.map((it, i) => i !== idx ? it : {
        ...it,
        productId: product.id,
        code: product.code,
        name: product.name,
        image: product.image || '',
        unitPrice: product.price,
        swapped: true,
        originalCode: it.swapped ? it.originalCode : it.code,
        originalName: it.swapped ? it.originalName : it.name,
      });
      persist(next, assignedTo, userNotes);
      return next;
    });
    setEditingItemIdx(null);
    setSwapSearch('');
    setSwapResults([]);
  };

  const openSwap = (idx) => {
    setEditingItemIdx(editingItemIdx === idx ? null : idx);
    setSwapSearch('');
    setSwapResults([]);
  };

  const total = items
    .filter((it) => !it.removed)
    .reduce((s, it) => s + it.finalQty * (it.unitPrice || it.price || 0), 0);
  const hasPrices = items.some((it) => it.unitPrice || it.price);

  const buildFinalItems = () =>
    items.filter((it) => !it.removed).map(({ removed, finalQty, swapped, originalCode, originalName, ...rest }) => ({ ...rest, qty: finalQty }));

  const combinedNotes = [assignedTo ? `Assigned to: ${assignedTo}` : '', autoNotes, userNotes].filter(Boolean).join('\n\n');

  const doSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          final_items: buildFinalItems(),
          status: 'order in progress',
          ...(combinedNotes ? { notes: combinedNotes } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setStatusMsg({ type: 'ok', text: 'Saved!' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (e) {
      setStatusMsg({ type: 'err', text: e.message });
    } finally { setSaving(false); }
  };

  const doSend = async () => {
    setSending(true);
    setStatusMsg(null);
    try {
      const saveRes = await fetch('/api/admin-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          final_items: buildFinalItems(),
          status: 'order in progress',
          ...(combinedNotes ? { notes: combinedNotes } : {}),
        }),
      });
      if (!saveRes.ok) throw new Error((await saveRes.json()).error || 'Save failed');

      // Include ALL items (removed ones too, with removed flag)
      const emailItems = items.map(({ finalQty, qty, removed, swapped, originalCode, originalName, ...rest }) => ({
        ...rest,
        qty: removed ? qty : finalQty,
        originalQty: qty,
        removed: removed || false,
        swapped: swapped || false,
        originalCode,
        originalName,
      }));

      const emailRes = await fetch('/api/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: order.customers?.email,
          customerName: order.customers?.name,
          orderNumber: order.order_number || order.id?.slice(0, 8),
          orderDate: order.created_at,
          items: emailItems,
          autoNotes,
          userNotes,
          assignedTo,
          total: hasPrices ? total : null,
        }),
      });
      const emailData = await emailRes.json();
      if (!emailRes.ok) throw new Error(emailData.error || 'Email send failed');
      setDone(true);
    } catch (e) {
      setStatusMsg({ type: 'err', text: e.message });
    } finally { setSending(false); }
  };

  const previewPdf = () => {
    if (!order) return;
    const html = generatePdfHtml({ order, items, autoNotes, userNotes, assignedTo, total, hasPrices });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  if (loading) return <div style={S.center}><Loader2 size={36} className="star-spinning" style={{ color: '#15803d' }} /></div>;
  if (error) return (
    <div style={{ ...S.center, flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#c40000', fontWeight: 700 }}>{error}</div>
      <button onClick={() => window.close()} style={S.btnSecondary}>Close tab</button>
    </div>
  );
  if (done) return (
    <div style={{ ...S.center, flexDirection: 'column', gap: 16, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Check size={36} color="#15803d" />
      </div>
      <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 22 }}>Order sent!</h2>
      <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Email delivered to <strong>{order.customers?.email}</strong></p>
      <button onClick={() => window.close()} style={S.btnPrimary}>Close tab</button>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardList size={20} style={{ color: '#4ade80', flexShrink: 0 }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, fontFamily: 'Outfit, sans-serif' }}>Order Fulfillment</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
              {order.order_number || order.id?.slice(0, 8)} · {new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
        <button onClick={() => window.close()} style={S.closeBtn}><X size={16} /> Close</button>
      </header>

      <div style={S.body}>
        {/* Customer */}
        <div style={S.customerCard}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{order.customers?.name || 'Unknown'}</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 3 }}>{order.customers?.email || '—'}</div>
        </div>

        {/* Assignment */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>Assigned to:</span>
          <div ref={assignRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setAssignOpen((o) => !o)}
              style={{ ...S.assignBtn, background: assignedTo ? '#0f172a' : '#fff', color: assignedTo ? '#fff' : '#374151', borderColor: assignedTo ? '#0f172a' : '#e2e8f0' }}
            >
              <User size={14} />{assignedTo || 'Assign person'}<span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {assignOpen && (
              <div style={S.dropdown}>
                {ASSIGNED_NAMES.map((name) => (
                  <button key={name} onClick={() => setAssign(name)} style={{ ...S.dropdownItem, background: assignedTo === name ? '#f0fdf4' : 'transparent', color: assignedTo === name ? '#15803d' : '#374151', fontWeight: assignedTo === name ? 700 : 400 }}>
                    {assignedTo === name && <Check size={13} />} {name}
                  </button>
                ))}
                {assignedTo && <button onClick={() => setAssign('')} style={{ ...S.dropdownItem, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>Clear</button>}
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div style={S.itemsCard}>
          {items.map((item, idx) => (
            <div key={idx}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderBottom: idx < items.length - 1 || editingItemIdx === idx ? '1px solid #f1f5f9' : 'none', background: item.removed ? '#fff5f5' : 'white', transition: 'background 0.15s' }}>
                {/* Image */}
                <div style={S.itemImg}>
                  {item.image
                    ? <img src={item.image} alt="" style={{ width: 52, height: 52, objectFit: 'contain', mixBlendMode: 'multiply', opacity: item.removed ? 0.3 : 1 }} />
                    : <span style={{ fontSize: 9, color: '#9ca3af' }}>IMG</span>}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 11, color: '#94a3b8', textDecoration: item.removed ? 'line-through' : 'none' }}>{item.code}</span>
                    {item.swapped && <span style={{ fontSize: 10, color: '#2563eb', background: '#dbeafe', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>SUBSTITUTED</span>}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: item.removed ? '#9ca3af' : '#0f172a', textDecoration: item.removed ? 'line-through' : 'none', lineHeight: 1.35, marginBottom: 8 }}>
                    {item.name}
                  </div>

                  {!item.removed ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Ordered: <strong>{item.qty}</strong></span>
                      <span style={{ color: '#cbd5e1' }}>→</span>
                      <input
                        type="number"
                        min="0"
                        value={item.finalQty}
                        onChange={(e) => updateItem(idx, { finalQty: Math.max(0, Number(e.target.value)) })}
                        style={{ width: 68, padding: '6px 8px', textAlign: 'center', border: `1.5px solid ${item.finalQty !== item.qty ? '#fbbf24' : '#e2e8f0'}`, borderRadius: 7, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', background: item.finalQty !== item.qty ? '#fffbeb' : '#fff', color: item.finalQty !== item.qty ? '#92400e' : '#0f172a', outline: 'none' }}
                      />
                      {item.finalQty !== item.qty && (
                        <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>Qty changed</span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>OUT OF STOCK</span>
                  )}

                  {(item.unitPrice || item.price) && !item.removed && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                      R {((item.unitPrice || item.price) * item.finalQty).toFixed(2)}
                      <span style={{ color: '#94a3b8' }}> ({item.finalQty} × R{(item.unitPrice || item.price).toFixed(2)})</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, marginTop: 6 }}>
                  {/* Swap / Edit button */}
                  <button
                    onClick={() => openSwap(idx)}
                    title="Replace product"
                    style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: editingItemIdx === idx ? '#0f172a' : '#f1f5f9', color: editingItemIdx === idx ? '#fff' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                  >
                    <Pencil size={13} />
                  </button>
                  {/* Remove / restore button */}
                  <button
                    onClick={() => updateItem(idx, { removed: !item.removed })}
                    title={item.removed ? 'Restore item' : 'Mark out of stock'}
                    style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: item.removed ? '#dcfce7' : '#fff0f0', color: item.removed ? '#15803d' : '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
                  >
                    {item.removed ? <Check size={14} /> : <X size={14} />}
                  </button>
                </div>
              </div>

              {/* Inline product swap panel */}
              {editingItemIdx === idx && (
                <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 16px', display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Replace product — search by code or name</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 12px' }}>
                    <Search size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input
                      autoFocus
                      value={swapSearch}
                      onChange={(e) => handleSwapSearch(e.target.value)}
                      placeholder="Type code or product name…"
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'inherit', background: 'transparent' }}
                    />
                    {swapLoading && <Loader2 size={13} className="star-spinning" />}
                  </div>
                  {swapResults.length > 0 && (
                    <div style={{ display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                      {swapResults.map((p) => (
                        <button key={p.id} onClick={() => swapItem(idx, p)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'inherit' }}>
                          {p.image
                            ? <img src={p.image} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, flexShrink: 0, mixBlendMode: 'multiply' }} />
                            : <div style={{ width: 36, height: 36, background: '#f3f4f6', borderRadius: 4, flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, color: '#64748b' }}>{p.code}</div>
                            <div style={{ color: '#374151', fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
                          </div>
                          <span style={{ color: '#64748b', fontSize: 12, flexShrink: 0 }}>R{p.price}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {swapSearch && !swapLoading && swapResults.length === 0 && (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>No products found.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Total */}
        {hasPrices && (
          <div style={S.totalRow}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Total</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: '#0f172a' }}>R {total.toFixed(2)}</span>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: 16, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>Notes</div>

          {/* Auto-generated summary */}
          <div style={{ background: autoNotes ? '#f0fdf4' : '#f8fafc', border: `1px solid ${autoNotes ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Auto summary</div>
            <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6, minHeight: 20 }}>
              {autoNotes || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No changes yet</span>}
            </div>
          </div>

          {/* User additional notes */}
          <textarea
            value={userNotes}
            onChange={(e) => { setUserNotes(e.target.value); persist(items, assignedTo, e.target.value); }}
            rows={3}
            placeholder="Add additional notes…"
            style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, resize: 'vertical', background: '#fff', outline: 'none', color: '#0f172a' }}
          />
        </div>

        {statusMsg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: statusMsg.type === 'err' ? '#fef2f2' : '#f0fdf4', color: statusMsg.type === 'err' ? '#c40000' : '#15803d', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            {statusMsg.text}
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div style={S.actionBar}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={doSave} disabled={saving || sending} style={{ ...S.btnSecondary, opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={15} className="star-spinning" /> : <Check size={15} />} Save
          </button>
          <button onClick={previewPdf} style={S.btnPreview}>
            <FileText size={15} /> Preview PDF
          </button>
          <button onClick={doSend} disabled={saving || sending} style={{ ...S.btnSend, opacity: sending ? 0.7 : 1 }}>
            {sending ? <Loader2 size={15} className="star-spinning" /> : <Send size={15} />}
            {sending ? 'Sending…' : 'Send to customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Inter, sans-serif' },
  header: { position: 'sticky', top: 0, zIndex: 100, background: '#0f172a', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  closeBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  body: { maxWidth: 720, margin: '0 auto', padding: '20px 16px 120px' },
  customerCard: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', marginBottom: 16 },
  assignBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', border: '1.5px solid', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minWidth: 148, transition: 'all 0.15s' },
  dropdown: { position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, minWidth: 170, overflow: 'hidden' },
  dropdownItem: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '12px 16px', textAlign: 'left', border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', borderBottom: '1px solid #f8fafc', transition: 'background 0.1s' },
  itemsCard: { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16 },
  itemImg: { width: 52, height: 52, flexShrink: 0, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  totalRow: { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  actionBar: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 20px', boxShadow: '0 -4px 16px rgba(0,0,0,0.07)', zIndex: 100 },
  btnSecondary: { display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#fff', color: '#0f172a', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnPreview: { display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#fff', color: '#2563eb', border: '1.5px solid #bfdbfe', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnSend: { display: 'flex', alignItems: 'center', gap: 7, padding: '10px 24px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary: { padding: '10px 28px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 },
};
