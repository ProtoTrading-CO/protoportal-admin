import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileDown,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { fetchAdminProductsPage } from '../../lib/products';
import {
  buildOrderNoteSections,
  buildEmailItemsFromOrder,
  generateOrderPdfBase64,
  deriveAutoNotesFromItems,
  resolveCustomerOrderPricing,
  base64ToBlob,
} from '../../lib/orderDocuments';
import { displayOrderNumber } from '../../lib/orderNumber';
import { fetchPresaleInvoices, uploadPresaleInvoice } from '../../lib/presaleInvoice';
import {
  fetchConfirmationSent,
  markConfirmationSent,
  fetchPaymentRecords,
  uploadPop,
  setPaymentStatus,
} from '../../lib/orderPayment';
import { deleteOrderAdmin, fetchOrdersPage, updateOrderAdmin, advanceOrderWorkflow } from '../../lib/orders';
import {
  orderMatchesTab,
  normalizeOrderStatus,
  getWorkflowAdvanceOptions,
  isOrderConfirmationSent,
} from '../../lib/orderStatus';
import OrderWorkflowBadge from '../../components/OrderWorkflowBadge';
import { fetchFulfillmentUsers, loadActiveUserId } from '../../lib/fulfillmentUsers';
import { isVictorSender, CUSTOMER_SEND_FORBIDDEN, PAYMENT_RECEIVED_FORBIDDEN } from '../../lib/fulfillmentAuth';
import OrderWhatsappNotify from '../../components/OrderWhatsappNotify';
import AnalyticsHub from '../../components/AnalyticsHub';

const ADMIN_PAGE_SIZE = 50;

function renderNoteSections(noteSections) {
  if (!noteSections.length) return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No notes yet</span>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {noteSections.map((section) => (
        <div key={section.title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{section.title}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {section.lines.map((line, index) => (
              <div key={`${section.title}-${index}`} style={{ fontSize: 13, color: '#374151', lineHeight: 1.55, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function generateOrderChecklistHtml(order) {
  const items = order.original_items || order.items || [];
  const rows = items.map((item, i) => `
    <tr>
      <td style="padding:8px 6px;border:1px solid #ccc;text-align:center">
        <span style="display:inline-block;width:14px;height:14px;border:1.5px solid #555;vertical-align:middle">&nbsp;</span>
      </td>
      <td style="padding:8px 6px;border:1px solid #ccc;color:#666;font-size:12px">${i + 1}</td>
      <td style="padding:8px 6px;border:1px solid #ccc;font-weight:700;font-size:12px">${item.code || ''}</td>
      <td style="padding:8px 6px;border:1px solid #ccc;font-size:13px">${item.name || ''}</td>
      <td style="padding:8px 6px;border:1px solid #ccc;text-align:center;font-weight:700">${item.qty}</td>
      <td style="padding:8px 6px;border:1px solid #ccc;font-size:12px">
        In Stock: <span style="display:inline-block;border-bottom:1px solid #000;width:60px;">&nbsp;</span>
        &nbsp;&nbsp;Qty: <span style="display:inline-block;border-bottom:1px solid #000;width:50px;">&nbsp;</span>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Order ${order.order_number || order.id}</title>
<style>
  body{font-family:Arial,sans-serif;padding:24px;color:#111;max-width:900px;margin:0 auto}
  h1{font-size:20px;margin-bottom:4px}
  .meta{color:#555;font-size:13px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif}
  th{background:#f0f0f0;padding:8px 6px;border:1px solid #ccc;font-size:12px;text-align:left}
  @media print{.no-print{display:none!important}}
</style></head><body>
<h1>Proto Trading — Order Checklist</h1>
<div class="meta">
  <strong>Order:</strong> ${order.order_number || order.id} &nbsp;|&nbsp;
  <strong>Customer:</strong> ${order.customers?.name || 'Unknown'} (${order.customers?.email || ''}) &nbsp;|&nbsp;
  <strong>Date:</strong> ${new Date(order.created_at || Date.now()).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
</div>
<table>
  <thead><tr>
    <th style="width:32px">✓</th>
    <th style="width:28px">#</th>
    <th style="width:120px">Code</th>
    <th>Product</th>
    <th style="width:48px">Qty</th>
    <th style="width:220px">Stock Status</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div style="margin-top:24px;font-size:13px">
  <strong>Notes:</strong><br>
  <span style="display:inline-block;border-bottom:1px solid #aaa;width:100%;margin-top:6px">&nbsp;</span>
  <span style="display:inline-block;border-bottom:1px solid #aaa;width:100%;margin-top:14px">&nbsp;</span>
</div>
<div class="no-print" style="margin-top:20px">
  <div style="padding:9px 20px;background:#f8fafc;color:#334155;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;font-family:Arial;display:inline-block">
    Downloaded order file for reference
  </div>
</div>
</body></html>`;
}

function OrderItemsList({ label, items }) {
  return (
    <div className="adm-subtle-box">
      <strong style={{ fontSize: 12 }}>{label}</strong>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && <span className="adm-muted" style={{ fontSize: 12 }}>—</span>}
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 5, background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {item.image
                ? <img src={item.image} alt="" style={{ width: 40, height: 40, objectFit: 'contain', mixBlendMode: 'multiply' }} />
                : <span style={{ fontSize: 8, color: '#9ca3af' }}>IMG</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: '#374151' }}>{item.code}</div>
              <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.name}</div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>× {item.qty}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} className="adm-btn-ghost" disabled={page <= 1}><ChevronLeft size={15} /> Prev</button>
      <span className="adm-muted">Page {page} of {totalPages}</span>
      <button type="button" onClick={() => onChange(Math.min(totalPages, page + 1))} className="adm-btn-ghost" disabled={page >= totalPages}>Next <ChevronRight size={15} /></button>
    </div>
  );
}

export default function OrdersTab({
  showToast,
  refreshDashboardStats,
  onStatsOrderChange,
  customer: _adminCustomer,
  onOpenFulfillmentSettings,
  initialOrderTab,
  initialFocusOrderId,
  refreshNonce = 0,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');

  const [fulfillmentOrder, setFulfillmentOrder] = useState(null);
  const [fulfillmentItems, setFulfillmentItems] = useState([]);
  const [fulfillmentNotes, setFulfillmentNotes] = useState('');
  const [fulfillmentSaving, setFulfillmentSaving] = useState(false);
  const [editingItemIdx, setEditingItemIdx] = useState(null);
  const [productSwapSearch, setProductSwapSearch] = useState('');
  const [productSwapResults, setProductSwapResults] = useState([]);
  const [productSwapLoading, setProductSwapLoading] = useState(false);
  const swapSearchTimerRef = useRef(null);

  const [orders, setOrders] = useState([]);
  const [orderTab, setOrderTab] = useState(initialOrderTab || 'new');
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderTabCounts, setOrderTabCounts] = useState(null);
  const [orderSearchDebounced, setOrderSearchDebounced] = useState('');
  const [focusOrderId, setFocusOrderId] = useState(initialFocusOrderId || '');
  const [orderSubView, setOrderSubView] = useState('list');
  const [orderSearch, setOrderSearch] = useState('');
  const [fulfillmentUsers, setFulfillmentUsers] = useState([]);
  const [activeFulfillmentUserId, setActiveFulfillmentUserId] = useState(loadActiveUserId);
  const [presaleInvoices, setPresaleInvoices] = useState({});
  const [presaleUploading, setPresaleUploading] = useState('');
  const [confirmationSent, setConfirmationSent] = useState({});
  const [paymentRecords, setPaymentRecords] = useState({});
  const [popUploading, setPopUploading] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setOrderSearchDebounced(orderSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [orderSearch]);

  useEffect(() => { setOrderPage(1); }, [orderTab, orderSearchDebounced]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await fetchOrdersPage({
        page: orderPage,
        pageSize: ADMIN_PAGE_SIZE,
        search: orderSearchDebounced,
        tab: orderTab,
      });
      setOrders(data.rows);
      setOrderTotal(data.total);
      if (data.tabCounts) setOrderTabCounts(data.tabCounts);
    } catch (err) {
      showToast(err.message || 'Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const activeFulfillmentUser = useMemo(
    () => fulfillmentUsers.find((u) => u.id === activeFulfillmentUserId) || null,
    [fulfillmentUsers, activeFulfillmentUserId],
  );
  const victorCanSend = isVictorSender(activeFulfillmentUser);

  const orderListGridCols = orderTab === 'sent' || orderTab === 'paid'
    ? '1.4fr 1.2fr 1fr 2fr 120px 56px'
    : '1.6fr 1.4fr 1.2fr 1fr 160px 80px';

  const confirmationSentIds = useMemo(() => {
    const ids = new Set(Object.keys(confirmationSent).filter((id) => confirmationSent[id]?.sentAt));
    for (const order of orders) {
      if (order.confirmation_sent_at) ids.add(String(order.id));
    }
    return ids;
  }, [confirmationSent, orders]);

  const handlePresaleUpload = async (order, file) => {
    setPresaleUploading(order.id);
    try {
      const meta = await uploadPresaleInvoice(order.id, file);
      setPresaleInvoices((prev) => ({ ...prev, [order.id]: meta }));
      showToast(`Presale invoice uploaded for ${order.order_number || order.id.slice(0, 8)}`);
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setPresaleUploading('');
    }
  };

  const handlePopUpload = async (order, file) => {
    setPopUploading(order.id);
    try {
      const meta = await uploadPop(order.id, file, { paid: paymentRecords[order.id]?.paid !== false });
      setPaymentRecords((prev) => ({ ...prev, [order.id]: meta }));
      showToast(`Proof of payment uploaded for ${order.order_number || order.id.slice(0, 8)}`);
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setPopUploading('');
    }
  };

  const handlePaymentStatus = async (order, paid) => {
    setSaving(`pay-${order.id}`);
    try {
      const meta = await setPaymentStatus(order.id, paid);
      setPaymentRecords((prev) => ({ ...prev, [order.id]: { ...prev[order.id], ...meta } }));
    } catch (err) {
      showToast(err.message || 'Failed to update payment status', 'error');
    } finally {
      setSaving('');
    }
  };

  const sendOrderConfirmation = async (order) => {
    const email = order.customers?.email;
    if (!email) {
      showToast('This customer has no email address on file.', 'error');
      return;
    }
    if (!victorCanSend) {
      showToast(CUSTOMER_SEND_FORBIDDEN, 'error');
      return;
    }
    const invoiceAttached = Boolean(presaleInvoices[order.id]);
    const confirmMsg = invoiceAttached
      ? `Send order confirmation + presale invoice to ${email}?`
      : `Send order confirmation to ${email}? (No presale invoice uploaded yet)`;
    if (!window.confirm(confirmMsg)) return;

    setSaving(`send-${order.id}`);
    try {
      const emailItems = buildEmailItemsFromOrder(order);
      const autoNotes = deriveAutoNotesFromItems(emailItems).join('\n');
      const { hasPrices, total, items: customerItems } = resolveCustomerOrderPricing(emailItems);
      const pdfBase64 = await generateOrderPdfBase64({
        order,
        items: customerItems,
        autoNotes,
        userNotes: order.order_change_notes || '',
        assignedTo: activeFulfillmentUser?.name || '',
        total,
        hasPrices,
      });
      const urlRes = await fetch('/api/order-confirmation-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || 'Could not prepare PDF upload');
      const putRes = await fetch(urlData.signedUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/pdf', 'x-upsert': 'true' },
        body: base64ToBlob(pdfBase64, 'application/pdf'),
      });
      if (!putRes.ok) throw new Error('Could not upload order confirmation PDF');
      const emailRes = await fetch('/api/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          to: email,
          customerName: order.customers?.name,
          orderNumber: displayOrderNumber(order),
          orderDate: order.created_at,
          items: customerItems,
          autoNotes,
          userNotes: order.order_change_notes || '',
          assignedTo: activeFulfillmentUser?.name || '',
          total,
          hasPrices,
          senderUserId: activeFulfillmentUser?.id || '',
          senderName: activeFulfillmentUser?.name || '',
          confirmationStoragePath: urlData.path,
          pdfFilename: `proto-order-confirmation-${displayOrderNumber(order)}.pdf`,
          deliveryMethod: order.delivery_method || '',
          customerNotes: order.customer_notes || '',
        }),
      });
      const emailData = await emailRes.json();
      if (!emailRes.ok) throw new Error(emailData.error || 'Email send failed');
      if (normalizeOrderStatus(order.status) !== 'order sent') {
        await advanceOrderWorkflow(order.id, 'order sent', {
          senderUserId: activeFulfillmentUser?.id,
          senderName: activeFulfillmentUser?.name,
        });
        setOrders((prev) => prev.map((item) => (
          item.id === order.id ? { ...item, status: 'order sent' } : item
        )));
      }
      const sentMeta = await markConfirmationSent(order.id);
      setConfirmationSent((prev) => ({ ...prev, [order.id]: sentMeta }));
      setOrders((prev) => prev.map((item) => (
        item.id === order.id
          ? { ...item, confirmation_sent_at: sentMeta.sentAt || sentMeta.updatedAt }
          : item
      )));
      setOrderTab('paid');
      showToast(`Confirmation sent to ${email}${emailData.presaleIncluded ? ' with presale invoice' : ''} — moved to Payment`);
    } catch (err) {
      showToast(err.message || 'Could not send order confirmation', 'error');
    } finally {
      setSaving('');
    }
  };

  const renderOrderConfirmationActions = (order) => {
    if (normalizeOrderStatus(order.status) !== 'order sent') return null;
    if (isOrderConfirmationSent(order, confirmationSentIds)) return null;
    const invoice = presaleInvoices[order.id];
    const uploading = presaleUploading === order.id;
    const sending = saving === `send-${order.id}`;
    return (
      <div className="adm-oc-col">
        <span className="adm-oc-label">Order Confirmation</span>
        <label className="adm-oc-upload-btn">
          {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
          {invoice ? 'Replace invoice' : 'Upload invoice'}
          <input
            type="file"
            accept=".pdf,application/pdf,image/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handlePresaleUpload(order, file);
            }}
          />
        </label>
        {invoice && <span className="adm-oc-uploaded">✓ {invoice.filename || 'Invoice uploaded'}</span>}
        {victorCanSend ? (
          <button
            type="button"
            className="adm-oc-send-btn"
            disabled={sending}
            onClick={() => void sendOrderConfirmation(order)}
          >
            {sending ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        ) : (
          <span className="adm-oc-victor-gate" title={CUSTOMER_SEND_FORBIDDEN}>Victor only</span>
        )}
      </div>
    );
  };

  const renderPaymentActions = (order) => {
    const key = normalizeOrderStatus(order.status);
    if (key === 'payment received') {
      const pop = paymentRecords[order.id];
      return (
        <div className="adm-oc-col">
          <span className="adm-oc-label adm-oc-label--paid">Paid</span>
          {pop?.filename && <span className="adm-oc-uploaded">✓ {pop.filename}</span>}
        </div>
      );
    }
    if (key !== 'order sent' || !isOrderConfirmationSent(order, confirmationSentIds)) return null;

    const pop = paymentRecords[order.id];
    const uploading = popUploading === order.id;
    const isPaid = pop?.paid === true;

    return (
      <div className="adm-oc-col">
        <span className="adm-oc-label">Awaiting payment</span>
        <div className="adm-pay-toggle">
          <button
            type="button"
            className={`adm-pay-toggle__btn${!isPaid ? ' adm-pay-toggle__btn--on' : ''}`}
            onClick={() => void handlePaymentStatus(order, false)}
          >
            Not paid
          </button>
          <button
            type="button"
            className={`adm-pay-toggle__btn${isPaid ? ' adm-pay-toggle__btn--on' : ''}`}
            onClick={() => void handlePaymentStatus(order, true)}
          >
            Paid
          </button>
        </div>
        <label className="adm-oc-upload-btn">
          {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
          {pop?.filename ? 'Replace POP' : 'Upload POP'}
          <input
            type="file"
            accept=".pdf,application/pdf,image/*"
            hidden
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handlePopUpload(order, file);
            }}
          />
        </label>
        {pop?.filename && <span className="adm-oc-uploaded">✓ {pop.filename}</span>}
        {isPaid && (
          victorCanSend ? (
            <button
              type="button"
              className="adm-presale-pay-btn"
              disabled={saving === `advance-${order.id}`}
              onClick={() => void advanceOrderStatus(order, 'payment received')}
            >
              <Check size={14} strokeWidth={2.5} />
              {saving === `advance-${order.id}` ? 'Updating…' : 'Confirm payment'}
            </button>
          ) : (
            <span className="adm-oc-victor-gate" title={PAYMENT_RECEIVED_FORBIDDEN}>Victor only</span>
          )
        )}
      </div>
    );
  };

  const deleteOrder = async (order) => {
    if (!window.confirm(`Delete order ${order.order_number || order.id}? This cannot be undone.`)) return;
    setSaving(`del-order-${order.id}`);
    try {
      await deleteOrderAdmin(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      onStatsOrderChange((n) => Math.max(0, n - 1));
      void refreshDashboardStats();
    } catch (err) {
      showToast(err.message || 'Failed to delete order', 'error');
    } finally { setSaving(''); }
  };

  const advanceOrderStatus = async (order, targetStatus) => {
    if ((targetStatus === 'payment received' || targetStatus === 'order sent') && !victorCanSend) {
      showToast(
        targetStatus === 'payment received' ? PAYMENT_RECEIVED_FORBIDDEN : CUSTOMER_SEND_FORBIDDEN,
        'error',
      );
      return;
    }
    setSaving(`advance-${order.id}`);
    try {
      const updated = await advanceOrderWorkflow(order.id, targetStatus, {
        senderUserId: activeFulfillmentUser?.id,
        senderName: activeFulfillmentUser?.name,
      });
      setOrders((prev) => prev.map((item) => item.id === order.id ? updated : item));
    } catch (err) {
      showToast(err.message || 'Could not update order status', 'error');
    } finally { setSaving(''); }
  };

  const downloadOrderHtml = (order) => {
    const html = generateOrderChecklistHtml(order);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-${order.order_number || order.id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const closeFulfillment = () => {
    setFulfillmentOrder(null);
    setFulfillmentItems([]);
    setFulfillmentNotes('');
    setEditingItemIdx(null);
    setProductSwapSearch('');
    setProductSwapResults([]);
  };

  const handleSwapSearchChange = (q) => {
    setProductSwapSearch(q);
    clearTimeout(swapSearchTimerRef.current);
    if (!q.trim()) { setProductSwapResults([]); return; }
    swapSearchTimerRef.current = setTimeout(async () => {
      setProductSwapLoading(true);
      try {
        const data = await fetchAdminProductsPage({ page: 1, pageSize: 8, searchQuery: q });
        setProductSwapResults(data.rows);
      } finally { setProductSwapLoading(false); }
    }, 350);
  };

  const swapFulfillmentItem = (idx, product) => {
    setFulfillmentItems((prev) => prev.map((item, i) => i !== idx ? item : {
      ...item,
      productId: product.id,
      code: product.code,
      name: product.name,
      image: product.image || '',
      unitPrice: product.price,
    }));
    setEditingItemIdx(null);
    setProductSwapSearch('');
    setProductSwapResults([]);
  };

  const saveFulfillment = async () => {
    if (!fulfillmentOrder) return;
    setFulfillmentSaving(true);
    try {
      const finalItems = fulfillmentItems.map(({ checked, finalQty, ...rest }) => ({ ...rest, qty: finalQty }));
      await updateOrderAdmin(fulfillmentOrder.id, {
        final_items: finalItems,
        order_change_notes: fulfillmentNotes,
      });
      await advanceOrderWorkflow(fulfillmentOrder.id, 'order sent', {
        senderUserId: activeFulfillmentUser?.id,
        senderName: activeFulfillmentUser?.name,
      });
      await loadOrders();
      closeFulfillment();
      showToast('Order saved and moved to Order Confirmation');
    } catch (err) {
      showToast(err.message || 'Failed to save fulfillment', 'error');
    } finally { setFulfillmentSaving(false); }
  };

  useEffect(() => { void loadOrders(); }, [orderPage, orderTab, orderSearchDebounced]);

  useEffect(() => {
    if (refreshNonce > 0) void loadOrders();
  }, [refreshNonce]);

  useEffect(() => {
    fetchFulfillmentUsers()
      .then((rows) => setFulfillmentUsers(rows))
      .catch(() => {});
    const syncUser = () => setActiveFulfillmentUserId(loadActiveUserId());
    const onUsersChanged = () => { void fetchFulfillmentUsers().then(setFulfillmentUsers); };
    window.addEventListener('storage', syncUser);
    window.addEventListener('focus', syncUser);
    window.addEventListener('proto-fulfillment-users-changed', onUsersChanged);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('focus', syncUser);
      window.removeEventListener('proto-fulfillment-users-changed', onUsersChanged);
    };
  }, []);

  useEffect(() => {
    const ids = orders.filter((o) => normalizeOrderStatus(o.status) === 'order sent').map((o) => o.id);
    if (!ids.length) return;
    fetchConfirmationSent(ids)
      .then((rows) => setConfirmationSent((prev) => ({ ...prev, ...rows })))
      .catch((err) => showToast(err.message || 'Failed to load confirmation status', 'error'));
  }, [orders]);

  useEffect(() => {
    const ids = orders.filter((o) => normalizeOrderStatus(o.status) === 'order sent').map((o) => o.id);
    if (!ids.length) return;
    fetchPresaleInvoices(ids)
      .then((invoices) => setPresaleInvoices((prev) => ({ ...prev, ...invoices })))
      .catch((err) => showToast(err.message || 'Failed to load presale invoices', 'error'));
    fetchConfirmationSent(ids)
      .then((rows) => setConfirmationSent((prev) => ({ ...prev, ...rows })))
      .catch((err) => showToast(err.message || 'Failed to load confirmation status', 'error'));
  }, [orderTab, orders]);

  useEffect(() => {
    if (orderTab !== 'paid') return;
    const ids = orders
      .filter((o) => orderMatchesTab(o, 'paid', { confirmationSentIds }))
      .map((o) => o.id);
    if (!ids.length) return;
    fetchPaymentRecords(ids)
      .then((rows) => setPaymentRecords((prev) => ({ ...prev, ...rows })))
      .catch((err) => showToast(err.message || 'Failed to load payment records', 'error'));
    fetchConfirmationSent(ids)
      .then((rows) => setConfirmationSent((prev) => ({ ...prev, ...rows })))
      .catch((err) => showToast(err.message || 'Failed to load confirmation status', 'error'));
  }, [orderTab, orders, confirmationSentIds]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void loadOrders(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [orderPage, orderTab, orderSearchDebounced]);

  useEffect(() => {
    if (!focusOrderId || !orders.length) return;
    setExpandedOrderId(focusOrderId);
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-order-id="${focusOrderId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusOrderId('');
    }, 300);
    return () => clearTimeout(timer);
  }, [focusOrderId, orders]);

  const orderPages = Math.max(1, Math.ceil(orderTotal / ADMIN_PAGE_SIZE));
  const orderRows = orders;
  const fulfillmentNoteSections = buildOrderNoteSections({ userNotes: fulfillmentNotes });

  return (
    <>
      <div className="adm-panel">
        <div className="adm-section-head">
          <div>
            <h2 className="adm-section-title">Order Requests</h2>
            <p className="adm-section-note">
              {orderSubView === 'analytics'
                ? 'Sales and engagement metrics for the selected time period.'
                : 'Paginated order list with server-side search and tab filters. Click a row to expand details.'}
            </p>
          </div>
          {orderSubView === 'list' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={() => onOpenFulfillmentSettings?.()}
                title="Fulfillment team settings"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}
              >
                <User size={16} /> Team
              </button>
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={() => void loadOrders()}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}
                title="Refresh orders"
              >
                {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                Refresh
              </button>
              <label className="adm-search"><Search size={15} /><input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search orders" className="adm-search-input" /></label>
            </div>
          )}
        </div>

        <div className="adm-customer-tabs" style={{ marginBottom: 16 }}>
          <button type="button" onClick={() => setOrderSubView('list')} className={`adm-tab${orderSubView === 'list' ? ' adm-tab--active' : ''}`}>Orders</button>
          <button type="button" onClick={() => setOrderSubView('analytics')} className={`adm-tab${orderSubView === 'analytics' ? ' adm-tab--active' : ''}`}>
            <BarChart2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Analytics
          </button>
        </div>

        {orderSubView === 'analytics' ? (
          <AnalyticsHub />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'All' },
                { key: 'new', label: 'New' },
                { key: 'handed', label: 'Handed Over' },
                { key: 'progress', label: 'In Progress' },
                { key: 'sent', label: 'Order Confirmation' },
                { key: 'paid', label: 'Payment' },
              ].map(({ key, label }) => {
                const count = orderTabCounts?.[key] ?? (key === 'all'
                  ? orderTabCounts?.all ?? orderTotal
                  : 0);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setOrderTab(key); setOrderPage(1); }}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      background: orderTab === key ? '#0f172a' : '#f1f5f9',
                      color: orderTab === key ? '#fff' : '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {label}
                    {count > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, background: orderTab === key ? 'rgba(255,255,255,0.2)' : '#e2e8f0', color: orderTab === key ? '#fff' : '#64748b', padding: '1px 6px', borderRadius: 999 }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {orderTab === 'paid' && (
              <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
                Payment tab includes sent confirmations awaiting payment.
              </p>
            )}
            <div className="adm-list">
              <div className="adm-list-head" style={{ gridTemplateColumns: orderListGridCols }}>
                <span>Order</span><span>Customer</span><span>Date & Time</span><span>{orderTab === 'sent' ? 'Order Confirmation' : orderTab === 'paid' ? 'Payment' : 'Status'}</span><span>Actions</span><span></span>
              </div>
              {orderRows.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const dt = new Date(order.created_at);
                const dateStr = dt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
                const timeStr = dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
                const isPreSale = normalizeOrderStatus(order.status) === 'order sent';
                return (
                  <div key={order.id}>
                    <div
                      className={`adm-list-row adm-order-row${focusOrderId === order.id ? ' adm-order-row--focus' : ''}`}
                      style={{ gridTemplateColumns: orderListGridCols, cursor: 'pointer' }}
                      data-order-id={order.id}
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{displayOrderNumber(order)}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{order.customers?.name || 'Unknown'}</div>
                        <div className="adm-muted" style={{ fontSize: 11 }}>{order.customers?.email || ''}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{dateStr}</div>
                        <div className="adm-muted" style={{ fontSize: 11 }}>{timeStr}</div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()} className="adm-presale-col">
                        {orderTab === 'sent' && isPreSale ? (
                          renderOrderConfirmationActions(order)
                        ) : orderTab === 'paid' ? (
                          renderPaymentActions(order) || <OrderWorkflowBadge order={order} />
                        ) : (
                          <OrderWorkflowBadge order={order} />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => window.open(`/fulfillment?id=${order.id}`, '_blank', 'noopener,noreferrer')} className="adm-icon-btn" title="Fulfil order (opens in new tab)" style={{ color: '#15803d' }}><ClipboardList size={14} /></button>
                        <button type="button" onClick={() => downloadOrderHtml(order)} className="adm-icon-btn" title="Download order file"><FileDown size={14} /></button>
                        <button type="button" onClick={() => void deleteOrder(order)} className="adm-icon-btn" style={{ color: '#c40000' }} disabled={saving === `del-order-${order.id}`} title="Delete order">
                          {saving === `del-order-${order.id}` ? '…' : <Trash2 size={14} />}
                        </button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <span className="adm-muted" style={{ fontSize: 18, lineHeight: 1 }}>{isExpanded ? '↑' : '↓'}</span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ background: '#f8fafc', borderTop: '1px solid #f1f5f9', padding: '14px 16px' }}>
                        <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <OrderWorkflowBadge order={order} />
                          {getWorkflowAdvanceOptions(order.status).map(({ label, target }) => (
                            <button
                              key={target}
                              type="button"
                              className="adm-btn-ghost"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              disabled={saving === `advance-${order.id}`}
                              onClick={() => void advanceOrderStatus(order, target)}
                            >
                              {saving === `advance-${order.id}` ? 'Updating…' : label}
                            </button>
                          ))}
                        </div>
                        <OrderWhatsappNotify orderId={order.id} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                          <OrderItemsList label="Order placed" items={order.original_items || order.items || []} />
                          <OrderItemsList label="Order final" items={order.final_items || order.items || []} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {loading && orders.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px', color: '#6b7280', fontSize: 13 }}>
                  <Loader2 size={16} className="spin" /> Loading orders…
                </div>
              )}
              {!loading && orderRows.length === 0 && (
                <div style={{ padding: '20px 16px', color: '#6b7280', fontSize: 13 }}>
                  {orderSearch ? 'No orders match your search.' : orderTab === 'all' ? 'No orders yet.' : `No orders in the "${orderTab}" tab.`}
                </div>
              )}
            </div>
            {orderSubView === 'list' && orderPages > 1 && (
              <Pager page={orderPage} totalPages={orderPages} onChange={setOrderPage} />
            )}
          </>
        )}
      </div>

      {fulfillmentOrder && (
        <div className="adm-modal-backdrop">
          <div className="adm-modal" style={{ maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ClipboardList size={20} style={{ color: '#15803d' }} /> Order Fulfillment
                </h3>
                <p className="adm-muted" style={{ marginTop: 4, fontSize: 13 }}>
                  {fulfillmentOrder.order_number || fulfillmentOrder.id.slice(0, 8)} &nbsp;·&nbsp; {new Date(fulfillmentOrder.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button type="button" onClick={closeFulfillment} className="adm-icon-btn"><X size={16} /></button>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{fulfillmentOrder.customers?.name || 'Unknown customer'}</div>
              <div className="adm-muted" style={{ marginTop: 2 }}>{fulfillmentOrder.customers?.email || '—'}</div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '28px 24px 52px 90px 1fr 64px 72px 32px', gap: '0 8px', padding: '6px 8px', background: '#f1f5f9', borderRadius: 6, marginBottom: 4, fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', alignItems: 'center' }}>
                <span>✓</span><span>#</span><span>Img</span><span>Code</span><span>Product</span><span>Ordered</span><span>Final qty</span><span></span>
              </div>
              {fulfillmentItems.map((item, idx) => (
                <div key={idx}>
                  <div style={{ display: 'grid', gridTemplateColumns: '28px 24px 52px 90px 1fr 64px 72px 32px', gap: '0 8px', padding: '8px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', background: item.checked ? '#f0fdf4' : 'white' }}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => setFulfillmentItems((prev) => prev.map((it, i) => i === idx ? { ...it, checked: !it.checked } : it))}
                      style={{ width: 16, height: 16, accentColor: '#15803d', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>{idx + 1}</span>
                    <div style={{ width: 48, height: 48, borderRadius: 6, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {item.image
                        ? <img src={item.image} alt="" style={{ width: 48, height: 48, objectFit: 'contain', mixBlendMode: 'multiply' }} />
                        : <span style={{ fontSize: 9, color: '#9ca3af' }}>IMG</span>}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 12, wordBreak: 'break-all' }}>{item.code || '—'}</span>
                    <span style={{ fontSize: 13 }}>{item.name || '—'}</span>
                    <span style={{ fontSize: 13, color: '#6b7280', textAlign: 'center' }}>× {item.qty}</span>
                    <input
                      type="number"
                      min="0"
                      value={item.finalQty}
                      onChange={(e) => setFulfillmentItems((prev) => prev.map((it, i) => i === idx ? { ...it, finalQty: Math.max(0, Number(e.target.value)) } : it))}
                      className="adm-tiny-input"
                      style={{ width: 64, textAlign: 'center' }}
                    />
                    <button
                      type="button"
                      onClick={() => { setEditingItemIdx(editingItemIdx === idx ? null : idx); setProductSwapSearch(''); setProductSwapResults([]); }}
                      className="adm-icon-btn"
                      title="Swap product"
                      style={{ color: editingItemIdx === idx ? '#8B1A1A' : undefined }}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>

                  {editingItemIdx === idx && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, margin: '4px 0 8px', display: 'grid', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e' }}>Swap product — search by code or name</div>
                      <label className="adm-search" style={{ background: 'white' }}>
                        <Search size={13} />
                        <input
                          value={productSwapSearch}
                          onChange={(e) => handleSwapSearchChange(e.target.value)}
                          placeholder="Type code or product name…"
                          className="adm-search-input"
                          autoFocus
                        />
                        {productSwapLoading && <Loader2 size={13} className="spin" />}
                      </label>
                      {productSwapResults.length > 0 && (
                        <div style={{ display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                          {productSwapResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => swapFulfillmentItem(idx, p)}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
                            >
                              {p.image
                                ? <img src={p.image} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />
                                : <div style={{ width: 36, height: 36, background: '#f3f4f6', borderRadius: 4, flexShrink: 0 }} />}
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>{p.code}</div>
                                <div style={{ color: '#374151' }}>{p.name}</div>
                              </div>
                              <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 12 }}>R{p.price}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {productSwapSearch && !productSwapLoading && productSwapResults.length === 0 && (
                        <div className="adm-muted" style={{ fontSize: 12 }}>No products found.</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ flexShrink: 0, marginBottom: 16 }}>
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Notes</span>
                <textarea
                  value={fulfillmentNotes}
                  onChange={(e) => setFulfillmentNotes(e.target.value)}
                  className="adm-field-input"
                  rows={4}
                  placeholder={'Add clear notes, one point per line…\nExample:\nCustomer approved substitution\nDeliver with next stock run'}
                  style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                />
              </label>
              <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Notes preview</div>
                {renderNoteSections(fulfillmentNoteSections)}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
              <button type="button" onClick={closeFulfillment} className="adm-btn-ghost"><ChevronLeft size={15} /> Cancel</button>
              <button type="button" onClick={() => void saveFulfillment()} className="adm-btn-red" disabled={fulfillmentSaving}>
                {fulfillmentSaving ? 'Saving…' : <><Check size={15} /> Save order</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
