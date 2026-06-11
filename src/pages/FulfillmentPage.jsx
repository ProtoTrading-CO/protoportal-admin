import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardList, FileText, Loader2, Lock, Pencil, Search, Send, User, X } from 'lucide-react';
import { fetchAdminProductsPage } from '../lib/products';
import {
  fetchFulfillmentProgress,
  lookupProductCategories,
  saveFulfillmentSection,
} from '../lib/fulfillmentProgress';
import {
  fetchFulfillmentUsers,
  loadActiveUserId,
  saveActiveUserId,
} from '../lib/fulfillmentUsers';
import { isVictorSender, CUSTOMER_SEND_FORBIDDEN } from '../lib/fulfillmentAuth';
import categories from '../data/categories.json';

const CATEGORY_LABELS = Object.fromEntries(categories.map((c) => [c.id, c.label]));
function generatePdfHtml({ order, items, autoNotes, userNotes, assignedTo, total, hasPrices }) {
  const customerName = order.customers?.name || 'Customer';
  const orderNumber = order.order_number || order.id?.slice(0, 8) || '';
  const dateStr = new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

  const itemRows = items.map((item) => {
    const price = item.unitPrice || item.price || 0;
    const qtyChanged = !item.removed && item.finalQty !== item.qty;
    const lineTotal = price && !item.removed ? (item.finalQty * price).toFixed(2) : null;
    if (item.removed) {
      return `<tr style="background:#fff5f5;border-bottom:1px solid #fee2e2">
        <td style="padding:8px 12px">${item.image ? `<img src="${item.image}" alt="" style="width:48px;height:48px;object-fit:contain">` : ''}</td>
        <td style="padding:10px 12px;font-size:12px;text-decoration:line-through">${item.code || ''}</td>
        <td style="padding:10px 12px;font-size:13px;text-decoration:line-through">${item.name || ''}</td>
        <td style="padding:10px 12px;text-align:center;text-decoration:line-through">${item.qty}</td>
        <td style="padding:10px 12px;text-align:center"><span style="color:#dc2626;font-weight:700">OUT OF STOCK</span></td>
        ${hasPrices ? '<td></td>' : ''}
      </tr>`;
    }
    return `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:8px 12px">${item.image ? `<img src="${item.image}" alt="" style="width:48px;height:48px;object-fit:contain">` : ''}</td>
      <td style="padding:10px 12px;font-size:12px">${item.code || ''}</td>
      <td style="padding:10px 12px;font-size:13px">${item.name || ''}</td>
      <td style="padding:10px 12px;text-align:center">${item.qty}</td>
      <td style="padding:10px 12px;text-align:center;font-weight:700">${item.finalQty}</td>
      ${hasPrices ? `<td style="padding:10px 12px;text-align:right">${lineTotal ? `R${lineTotal}` : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  const allNotes = [autoNotes, userNotes].filter(Boolean).join('\n\n');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Order ${orderNumber}</title></head><body style="font-family:Arial,sans-serif;padding:24px">
<h1>Order ${orderNumber}</h1><p>${dateStr} · ${customerName}${assignedTo ? ` · ${assignedTo}` : ''}</p>
<table style="width:100%;border-collapse:collapse">${itemRows}</table>
${hasPrices && total ? `<p style="text-align:right;font-size:20px;font-weight:800">R ${total.toFixed(2)}</p>` : ''}
${allNotes ? `<pre style="white-space:pre-wrap">${allNotes}</pre>` : ''}
</body></html>`;
}

function applyProgress(items, sections = {}) {
  if (!sections || !Object.keys(sections).length) return items;
  const savedByKey = new Map();
  Object.values(sections).forEach((section) => {
    (section.items || []).forEach((saved) => {
      const key = saved.productId || saved.code;
      if (key) savedByKey.set(key, saved);
    });
  });
  return items.map((it) => {
    const key = it.productId || it.code;
    const saved = savedByKey.get(key);
    if (!saved) return it;
    return {
      ...it,
      finalQty: saved.finalQty ?? it.finalQty,
      removed: saved.removed ?? it.removed,
      swapped: saved.swapped ?? it.swapped,
      code: saved.code ?? it.code,
      name: saved.name ?? it.name,
      image: saved.image ?? it.image,
      unitPrice: saved.unitPrice ?? it.unitPrice,
      originalCode: saved.originalCode ?? it.originalCode,
      originalName: saved.originalName ?? it.originalName,
    };
  });
}

function serializeSectionItems(sectionItems) {
  return sectionItems.map(({
    productId, code, name, qty, finalQty, removed, swapped,
    originalCode, originalName, image, unitPrice, price,
  }) => ({
    productId, code, name, qty, finalQty, removed: Boolean(removed),
    swapped: Boolean(swapped), originalCode, originalName, image,
    unitPrice: unitPrice || price || 0,
  }));
}

export default function FulfillmentPage() {
  const orderId = new URLSearchParams(window.location.search).get('id');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [progress, setProgress] = useState({ sections: {} });
  const [users, setUsers] = useState([]);
  const [activeUserId, setActiveUserId] = useState(loadActiveUserId);
  const [userNotes, setUserNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sectionSaving, setSectionSaving] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);
  const [done, setDone] = useState(false);

  const [editingItemIdx, setEditingItemIdx] = useState(null);
  const [swapSearch, setSwapSearch] = useState('');
  const [swapResults, setSwapResults] = useState([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const swapTimerRef = useRef(null);
  const userPickerRef = useRef(null);
  const [userPickerOpen, setUserPickerOpen] = useState(false);

  const activeUser = useMemo(
    () => users.find((u) => u.id === activeUserId) || null,
    [users, activeUserId],
  );

  const canSendToCustomer = isVictorSender(activeUser);

  const assignedCategorySet = useMemo(
    () => new Set(activeUser?.categoryIds || []),
    [activeUser],
  );

  const refreshProgress = useCallback(async () => {
    if (!orderId) return;
    try {
      const data = await fetchFulfillmentProgress(orderId);
      setProgress(data);
      setItems((prev) => applyProgress(prev, data.sections));
    } catch {}
  }, [orderId]);

  useEffect(() => {
    if (!orderId) { setError('No order ID in URL.'); setLoading(false); return; }

    Promise.all([
      fetch(`/api/admin-orders?id=${orderId}`).then((r) => r.json()),
      fetchFulfillmentUsers(),
      fetchFulfillmentProgress(orderId),
    ])
      .then(async ([orderData, userRows, progressData]) => {
        const row = orderData.rows?.[0];
        if (!row) throw new Error('Order not found');
        setOrder(row);
        setUsers(userRows);
        setProgress(progressData);

        const rawItems = (row.original_items || row.items || []).map((it, idx) => ({
          ...it,
          idx,
          finalQty: it.qty,
          removed: false,
          swapped: false,
        }));

        const ids = [...new Set(rawItems.map((i) => i.productId).filter(Boolean))];
        const catMap = await lookupProductCategories(ids);
        const enriched = rawItems.map((it) => ({
          ...it,
          mainCategoryId: catMap[it.productId]?.category || 'uncategorized',
          mainCategoryLabel: catMap[it.productId]?.categoryLabel || CATEGORY_LABELS.uncategorized || 'Other',
        }));

        setItems(applyProgress(enriched, progressData.sections));

        const storedUser = loadActiveUserId();
        if (storedUser && userRows.some((u) => u.id === storedUser)) {
          setActiveUserId(storedUser);
        } else if (userRows[0]?.id) {
          setActiveUserId(userRows[0].id);
          saveActiveUserId(userRows[0].id);
        }
      })
      .catch((e) => setError(e.message || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    if (!orderId || loading) return undefined;
    const iv = setInterval(() => { void refreshProgress(); }, 30000);
    const onFocus = () => { void refreshProgress(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, [orderId, loading, refreshProgress]);

  useEffect(() => {
    if (!userPickerOpen) return undefined;
    const h = (e) => { if (userPickerRef.current && !userPickerRef.current.contains(e.target)) setUserPickerOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [userPickerOpen]);

  const categoryGroups = useMemo(() => {
    const map = new Map();
    items.forEach((item, idx) => {
      const catId = item.mainCategoryId || 'uncategorized';
      if (!map.has(catId)) {
        map.set(catId, {
          id: catId,
          label: item.mainCategoryLabel || CATEGORY_LABELS[catId] || catId,
          items: [],
        });
      }
      map.get(catId).items.push({ ...item, idx });
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const canEditCategory = (categoryId) => assignedCategorySet.has(categoryId);

  const saveCategorySection = async (categoryId, sectionItems) => {
    if (!activeUser || !orderId) return;
    setSectionSaving(categoryId);
    setStatusMsg(null);
    try {
      const data = await saveFulfillmentSection({
        orderId,
        userId: activeUser.id,
        userName: activeUser.name,
        categoryId,
        items: serializeSectionItems(sectionItems),
        complete: true,
      });
      setProgress(data);
      setStatusMsg({ type: 'ok', text: `${CATEGORY_LABELS[categoryId] || 'Section'} saved` });
      setTimeout(() => setStatusMsg(null), 2500);
    } catch (e) {
      setStatusMsg({ type: 'err', text: e.message });
    } finally { setSectionSaving(''); }
  };

  const autoNotes = useMemo(() => {
    const lines = [];
    items.forEach((item) => {
      if (item.removed) lines.push(`• ${item.code} — ${item.name}: Out of stock`);
      else if (item.swapped) lines.push(`• ${item.originalCode} — ${item.originalName}: Substituted with ${item.code}`);
      else if (item.finalQty !== item.qty) lines.push(`• ${item.code} — ${item.name}: Qty ${item.qty} → ${item.finalQty}`);
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
    setItems((prev) => prev.map((it, i) => i !== idx ? it : {
      ...it,
      productId: product.id,
      code: product.code,
      name: product.name,
      image: product.image || '',
      unitPrice: product.price,
      mainCategoryId: product.category || it.mainCategoryId,
      mainCategoryLabel: product.categoryLabel || it.mainCategoryLabel,
      swapped: true,
      originalCode: it.swapped ? it.originalCode : it.code,
      originalName: it.swapped ? it.originalName : it.name,
    }));
    setEditingItemIdx(null);
    setSwapSearch('');
    setSwapResults([]);
  };

  const total = items.filter((it) => !it.removed).reduce((s, it) => s + it.finalQty * (it.unitPrice || it.price || 0), 0);
  const hasPrices = items.some((it) => it.unitPrice || it.price);
  const buildFinalItems = () => items.filter((it) => !it.removed).map(({ removed, finalQty, swapped, originalCode, originalName, idx, mainCategoryId, mainCategoryLabel, ...rest }) => ({ ...rest, qty: finalQty }));
  const combinedNotes = [activeUser ? `Handled by: ${activeUser.name}` : '', autoNotes, userNotes].filter(Boolean).join('\n\n');

  const doSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, final_items: buildFinalItems(), ...(combinedNotes ? { notes: combinedNotes } : {}) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      setStatusMsg({ type: 'ok', text: 'Order saved' });
    } catch (e) { setStatusMsg({ type: 'err', text: e.message }); }
    finally { setSaving(false); }
  };

  const doSend = async () => {
    if (!canSendToCustomer) {
      setStatusMsg({ type: 'err', text: CUSTOMER_SEND_FORBIDDEN });
      return;
    }
    setSending(true);
    try {
      const saveRes = await fetch('/api/admin-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, final_items: buildFinalItems(), ...(combinedNotes ? { notes: combinedNotes } : {}) }),
      });
      if (!saveRes.ok) throw new Error((await saveRes.json()).error || 'Save failed');

      const emailItems = items.map(({ finalQty, qty, removed, swapped, originalCode, originalName, idx, mainCategoryId, mainCategoryLabel, ...rest }) => ({
        ...rest, qty: removed ? qty : finalQty, originalQty: qty, removed: removed || false, swapped: swapped || false, originalCode, originalName,
      }));

      const emailRes = await fetch('/api/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          to: order.customers?.email,
          customerName: order.customers?.name,
          orderNumber: order.order_number || order.id?.slice(0, 8),
          orderDate: order.created_at,
          items: emailItems,
          autoNotes,
          userNotes,
          assignedTo: activeUser?.name || '',
          senderUserId: activeUser?.id || '',
          senderName: activeUser?.name || '',
          total: hasPrices ? total : null,
        }),
      });
      if (!emailRes.ok) throw new Error((await emailRes.json()).error || 'Email failed');
      setDone(true);
    } catch (e) { setStatusMsg({ type: 'err', text: e.message }); }
    finally { setSending(false); }
  };

  const previewPdf = () => {
    const html = generatePdfHtml({ order, items, autoNotes, userNotes, assignedTo: activeUser?.name, total, hasPrices });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const renderItemRow = (item, editable) => {
    const idx = item.idx;
    return (
      <div key={`${item.productId || item.code}-${idx}`}>
        <div className={`ff-item-row${item.removed ? ' ff-item-row--removed' : ''}${!editable ? ' ff-item-row--readonly' : ''}`}>
          <div className="ff-item-img">
            {item.image ? <img src={item.image} alt="" /> : <span>IMG</span>}
          </div>
          <div className="ff-item-body">
            <div className="ff-item-code">{item.code}</div>
            <div className="ff-item-name">{item.name}</div>
            {!item.removed ? (
              <div className="ff-qty-row">
                <span>Ordered: <strong>{item.qty}</strong></span>
                <span className="ff-qty-arrow">→</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={item.finalQty}
                  disabled={!editable}
                  onChange={(e) => updateItem(idx, { finalQty: Math.max(0, Number(e.target.value)) })}
                  className={`ff-qty-input${item.finalQty !== item.qty ? ' ff-qty-input--changed' : ''}`}
                />
              </div>
            ) : <span className="ff-oos">OUT OF STOCK</span>}
          </div>
          {editable && (
            <div className="ff-item-actions">
              <button type="button" className="ff-icon-btn" onClick={() => setEditingItemIdx(editingItemIdx === idx ? null : idx)} title="Replace"><Pencil size={14} /></button>
              <button type="button" className={`ff-icon-btn${item.removed ? ' ff-icon-btn--restore' : ' ff-icon-btn--remove'}`} onClick={() => updateItem(idx, { removed: !item.removed })} title={item.removed ? 'Restore' : 'Out of stock'}>
                {item.removed ? <Check size={14} /> : <X size={14} />}
              </button>
            </div>
          )}
          {!editable && <Lock size={14} className="ff-lock-icon" />}
        </div>
        {editable && editingItemIdx === idx && (
          <div className="ff-swap-panel">
            <div className="ff-swap-search">
              <Search size={14} />
              <input autoFocus value={swapSearch} onChange={(e) => handleSwapSearch(e.target.value)} placeholder="Search replacement…" />
              {swapLoading && <Loader2 size={13} className="star-spinning" />}
            </div>
            {swapResults.map((p) => (
              <button key={p.id} type="button" className="ff-swap-result" onClick={() => swapItem(idx, p)}>
                <span className="ff-swap-code">{p.code}</span>
                <span className="ff-swap-name">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="ff-center"><Loader2 size={36} className="star-spinning" style={{ color: '#15803d' }} /></div>;
  if (error) return <div className="ff-center"><p style={{ color: '#c40000', fontWeight: 700 }}>{error}</p></div>;
  if (done) return (
    <div className="ff-center ff-done">
      <Check size={40} color="#15803d" />
      <h2>Sent to customer</h2>
      <p className="ff-done-sub">Order moved to Pre Sale</p>
      <button type="button" onClick={() => window.close()} className="ff-btn-send">Close tab</button>
    </div>
  );

  return (
    <div className="ff-page">
      <header className="ff-header">
        <div className="ff-header__title">
          <ClipboardList size={20} />
          <div>
            <div className="ff-header__main">Order Fulfillment</div>
            <div className="ff-header__sub">{order.order_number || order.id?.slice(0, 8)} · {new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
        <button type="button" onClick={() => window.close()} className="ff-close-btn"><X size={16} /> Close</button>
      </header>

      <div className="ff-body">
        <div className="ff-customer">
          <strong>{order.customers?.name || 'Unknown'}</strong>
          <span>{order.customers?.email || '—'}</span>
        </div>

        <div className="ff-user-row">
          <span>Working as:</span>
          <div ref={userPickerRef} className="ff-user-picker">
            <button type="button" className="ff-user-btn" onClick={() => setUserPickerOpen((o) => !o)}>
              <User size={14} />{activeUser?.name || 'Select user'} ▾
            </button>
            {userPickerOpen && (
              <div className="ff-user-menu">
                {users.map((u) => (
                  <button key={u.id} type="button" onClick={() => { setActiveUserId(u.id); saveActiveUserId(u.id); setUserPickerOpen(false); }}>
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {activeUser && (
            <span className="ff-user-cats">
              {(activeUser.categoryIds || []).map((id) => CATEGORY_LABELS[id] || id).join(' · ')}
            </span>
          )}
        </div>

        {categoryGroups.map((group) => {
          const section = progress.sections?.[group.id];
          const isComplete = Boolean(section?.complete);
          const savedByOther = section && section.userId !== activeUserId;
          const editable = canEditCategory(group.id) && !savedByOther;
          const canSave = canEditCategory(group.id) && activeUser;

          return (
            <section key={group.id} className={`ff-section${isComplete ? ' ff-section--complete' : ''}`}>
              <div className="ff-section-head">
                <div>
                  <h3>{group.label}</h3>
                  {section && (
                    <span className="ff-section-meta">
                      {isComplete ? `Saved by ${section.userName}` : 'In progress'}
                      {section.savedAt ? ` · ${new Date(section.savedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                  )}
                </div>
                {canSave && (
                  <button
                    type="button"
                    className={`ff-section-save${isComplete && section?.userId === activeUserId ? ' ff-section-save--done' : ''}`}
                    disabled={sectionSaving === group.id}
                    onClick={() => void saveCategorySection(group.id, group.items)}
                    title="Save this section"
                  >
                    {sectionSaving === group.id ? <Loader2 size={18} className="star-spinning" /> : <Check size={18} strokeWidth={3} />}
                  </button>
                )}
              </div>
              <div className="ff-section-items">
                {group.items.map((item) => renderItemRow(item, editable))}
              </div>
            </section>
          );
        })}

        {hasPrices && (
          <div className="ff-total">
            <span>Total</span>
            <strong>R {total.toFixed(2)}</strong>
          </div>
        )}

        <textarea className="ff-notes" value={userNotes} onChange={(e) => setUserNotes(e.target.value)} rows={3} placeholder="Additional notes…" />

        {statusMsg && <div className={`ff-status ff-status--${statusMsg.type}`}>{statusMsg.text}</div>}
      </div>

      <div className="ff-action-bar">
        <button type="button" onClick={doSave} disabled={saving || sending} className="ff-btn-secondary">
          {saving ? <Loader2 size={15} className="star-spinning" /> : <Check size={15} />} Save order
        </button>
        <button type="button" onClick={previewPdf} className="ff-btn-preview"><FileText size={15} /> Preview PDF</button>
        {canSendToCustomer ? (
          <button type="button" onClick={doSend} disabled={saving || sending} className="ff-btn-send">
            {sending ? <Loader2 size={15} className="star-spinning" /> : <Send size={15} />} Send to customer
          </button>
        ) : (
          <div className="ff-btn-victor-gate" title={CUSTOMER_SEND_FORBIDDEN}>
            <Lock size={15} strokeWidth={2.25} />
            <span>Select <strong>Victor</strong> to send to customer</span>
          </div>
        )}
      </div>
    </div>
  );
}
