import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardList, Loader2, Send, User, X } from 'lucide-react';

const ASSIGNED_NAMES = ['Victor', 'George', 'Peter', 'Catherine'];

function lsKey(id) { return `proto_ff_${id}`; }
function loadLocal(id) {
  try { return JSON.parse(localStorage.getItem(lsKey(id)) || 'null'); } catch { return null; }
}
function saveLocal(id, data) {
  try { localStorage.setItem(lsKey(id), JSON.stringify(data)); } catch {}
}

export default function FulfillmentPage() {
  const orderId = new URLSearchParams(window.location.search).get('id');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null); // { type: 'ok'|'err', text }
  const [done, setDone] = useState(false);
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
        }));

        const saved = loadLocal(orderId);
        if (saved?.orderId === orderId && saved.items?.length === rawItems.length) {
          setItems(rawItems.map((it, i) => ({
            ...it,
            finalQty: saved.items[i]?.finalQty ?? it.qty,
            removed: saved.items[i]?.removed ?? false,
          })));
          setAssignedTo(saved.assignedTo || '');
          setNotes(saved.notes || '');
        } else {
          setItems(rawItems);
        }
      })
      .catch((e) => setError(e.message || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [orderId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!assignOpen) return;
    const handler = (e) => {
      if (assignRef.current && !assignRef.current.contains(e.target)) setAssignOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [assignOpen]);

  const persist = (nextItems, nextAssigned, nextNotes) =>
    saveLocal(orderId, { orderId, items: nextItems, assignedTo: nextAssigned, notes: nextNotes });

  const updateItem = (idx, patch) =>
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      persist(next, assignedTo, notes);
      return next;
    });

  const setAssign = (name) => {
    setAssignedTo(name);
    setAssignOpen(false);
    persist(items, name, notes);
  };

  const total = items
    .filter((it) => !it.removed)
    .reduce((s, it) => s + it.finalQty * (it.unitPrice || it.price || 0), 0);
  const hasPrices = items.some((it) => it.unitPrice || it.price);

  const buildFinalItems = () =>
    items
      .filter((it) => !it.removed)
      .map(({ removed, finalQty, ...rest }) => ({ ...rest, qty: finalQty }));

  const doSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const notesStr = [assignedTo ? `Assigned to: ${assignedTo}` : '', notes].filter(Boolean).join('\n\n');
      const res = await fetch('/api/admin-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          final_items: buildFinalItems(),
          status: 'order in progress',
          ...(notesStr ? { notes: notesStr } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setStatusMsg({ type: 'ok', text: 'Saved successfully!' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (e) {
      setStatusMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const doSend = async () => {
    setSending(true);
    setStatusMsg(null);
    try {
      // Save first
      const notesStr = [assignedTo ? `Assigned to: ${assignedTo}` : '', notes].filter(Boolean).join('\n\n');
      const saveRes = await fetch('/api/admin-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          final_items: buildFinalItems(),
          status: 'order in progress',
          ...(notesStr ? { notes: notesStr } : {}),
        }),
      });
      if (!saveRes.ok) throw new Error((await saveRes.json()).error || 'Save failed');

      // Build email items — include originalQty so email can show changes
      const emailItems = items
        .filter((it) => !it.removed)
        .map(({ removed, finalQty, qty, ...rest }) => ({
          ...rest,
          qty: finalQty,
          originalQty: qty,
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
          notes,
          assignedTo,
          total: hasPrices ? total : null,
        }),
      });
      const emailData = await emailRes.json();
      if (!emailRes.ok) throw new Error(emailData.error || 'Email send failed');
      setDone(true);
    } catch (e) {
      setStatusMsg({ type: 'err', text: e.message });
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div style={styles.center}>
      <Loader2 size={36} className="star-spinning" style={{ color: '#15803d' }} />
    </div>
  );

  if (error) return (
    <div style={{ ...styles.center, flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#c40000', fontWeight: 700, fontSize: 15 }}>{error}</div>
      <button onClick={() => window.close()} style={styles.btnSecondary}>Close tab</button>
    </div>
  );

  if (done) return (
    <div style={{ ...styles.center, flexDirection: 'column', gap: 16, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Check size={36} color="#15803d" />
      </div>
      <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: 22 }}>Order sent!</h2>
      <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
        Email delivered to <strong>{order.customers?.email}</strong>
      </p>
      <button onClick={() => window.close()} style={styles.btnPrimary}>Close tab</button>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sticky header */}
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardList size={20} style={{ color: '#4ade80', flexShrink: 0 }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, fontFamily: 'Outfit, sans-serif' }}>Order Fulfillment</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
              {order.order_number || order.id?.slice(0, 8)} · {new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>
        <button onClick={() => window.close()} style={styles.closeBtn}>
          <X size={16} /> Close
        </button>
      </header>

      <div style={styles.body}>
        {/* Customer card */}
        <div style={styles.customerCard}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{order.customers?.name || 'Unknown customer'}</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 3 }}>{order.customers?.email || '—'}</div>
        </div>

        {/* Person assignment */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>Assigned to:</span>
          <div ref={assignRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setAssignOpen((o) => !o)}
              style={{
                ...styles.assignBtn,
                background: assignedTo ? '#0f172a' : '#fff',
                color: assignedTo ? '#fff' : '#374151',
                borderColor: assignedTo ? '#0f172a' : '#e2e8f0',
              }}
            >
              <User size={14} />
              {assignedTo || 'Assign person'}
              <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {assignOpen && (
              <div style={styles.dropdown}>
                {ASSIGNED_NAMES.map((name) => (
                  <button
                    key={name}
                    onClick={() => setAssign(name)}
                    style={{
                      ...styles.dropdownItem,
                      background: assignedTo === name ? '#f0fdf4' : 'transparent',
                      color: assignedTo === name ? '#15803d' : '#374151',
                      fontWeight: assignedTo === name ? 700 : 400,
                    }}
                  >
                    {assignedTo === name && <Check size={13} />} {name}
                  </button>
                ))}
                {assignedTo && (
                  <button onClick={() => setAssign('')} style={{ ...styles.dropdownItem, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Items list */}
        <div style={styles.itemsCard}>
          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: '14px 16px',
                borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                background: item.removed ? '#fff5f5' : 'white',
                transition: 'background 0.15s',
              }}
            >
              {/* Image */}
              <div style={styles.itemImg}>
                {item.image
                  ? <img src={item.image} alt="" style={{ width: 52, height: 52, objectFit: 'contain', mixBlendMode: 'multiply', opacity: item.removed ? 0.3 : 1 }} />
                  : <span style={{ fontSize: 9, color: '#9ca3af' }}>IMG</span>}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#94a3b8', textDecoration: item.removed ? 'line-through' : 'none' }}>
                  {item.code}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: item.removed ? '#9ca3af' : '#0f172a', textDecoration: item.removed ? 'line-through' : 'none', lineHeight: 1.35, marginTop: 2, marginBottom: 8 }}>
                  {item.name}
                </div>

                {/* Qty controls */}
                {!item.removed ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Ordered: <strong>{item.qty}</strong></span>
                    <span style={{ color: '#cbd5e1' }}>→</span>
                    <input
                      type="number"
                      min="0"
                      value={item.finalQty}
                      onChange={(e) => updateItem(idx, { finalQty: Math.max(0, Number(e.target.value)) })}
                      style={{
                        width: 68,
                        padding: '6px 8px',
                        textAlign: 'center',
                        border: `1.5px solid ${item.finalQty !== item.qty ? '#fbbf24' : '#e2e8f0'}`,
                        borderRadius: 7,
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        background: item.finalQty !== item.qty ? '#fffbeb' : '#fff',
                        color: item.finalQty !== item.qty ? '#92400e' : '#0f172a',
                        outline: 'none',
                      }}
                    />
                    {item.finalQty !== item.qty && (
                      <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>
                        Changed
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, letterSpacing: '0.02em' }}>REMOVED</span>
                )}

                {(item.unitPrice || item.price) && !item.removed && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                    R {((item.unitPrice || item.price) * item.finalQty).toFixed(2)}
                    <span style={{ color: '#94a3b8' }}> ({item.finalQty} × R{(item.unitPrice || item.price).toFixed(2)})</span>
                  </div>
                )}
              </div>

              {/* Remove / restore button */}
              <button
                onClick={() => updateItem(idx, { removed: !item.removed })}
                title={item.removed ? 'Restore item' : 'Remove item'}
                style={{
                  flexShrink: 0,
                  width: 34,
                  height: 34,
                  marginTop: 8,
                  borderRadius: 8,
                  border: 'none',
                  background: item.removed ? '#dcfce7' : '#fff0f0',
                  color: item.removed ? '#15803d' : '#dc2626',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                {item.removed ? <Check size={14} /> : <X size={14} />}
              </button>
            </div>
          ))}
        </div>

        {/* Total */}
        {hasPrices && (
          <div style={styles.totalRow}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Total</span>
            <span style={{ fontWeight: 900, fontSize: 22, color: '#0f172a' }}>R {total.toFixed(2)}</span>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); persist(items, assignedTo, e.target.value); }}
              rows={3}
              placeholder="Add fulfillment notes…"
              style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, resize: 'vertical', background: '#fff', outline: 'none', color: '#0f172a' }}
            />
          </label>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: statusMsg.type === 'err' ? '#fef2f2' : '#f0fdf4',
            color: statusMsg.type === 'err' ? '#c40000' : '#15803d',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}>
            {statusMsg.text}
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div style={styles.actionBar}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={doSave} disabled={saving || sending} style={{ ...styles.btnSecondary, opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={15} className="star-spinning" /> : <Check size={15} />}
            Save
          </button>
          <button onClick={doSend} disabled={saving || sending} style={{ ...styles.btnSend, opacity: sending ? 0.7 : 1 }}>
            {sending ? <Loader2 size={15} className="star-spinning" /> : <Send size={15} />}
            {sending ? 'Sending…' : 'Send to customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: '#0f172a',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  body: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '20px 16px 120px',
  },
  customerCard: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 12,
    padding: '14px 16px',
    marginBottom: 16,
  },
  assignBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 14px',
    border: '1.5px solid',
    borderRadius: 9,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    minWidth: 148,
    transition: 'all 0.15s',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 200,
    minWidth: 170,
    overflow: 'hidden',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '12px 16px',
    textAlign: 'left',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'inherit',
    borderBottom: '1px solid #f8fafc',
    transition: 'background 0.1s',
  },
  itemsCard: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  itemImg: {
    width: 52,
    height: 52,
    flexShrink: 0,
    borderRadius: 8,
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  totalRow: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    padding: '14px 18px',
    marginBottom: 16,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#fff',
    borderTop: '1px solid #e2e8f0',
    padding: '12px 20px',
    boxShadow: '0 -4px 16px rgba(0,0,0,0.07)',
    zIndex: 100,
  },
  btnSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '10px 20px',
    background: '#fff',
    color: '#0f172a',
    border: '1.5px solid #e2e8f0',
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnSend: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '10px 24px',
    background: '#15803d',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnPrimary: {
    padding: '10px 28px',
    background: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
  },
};
