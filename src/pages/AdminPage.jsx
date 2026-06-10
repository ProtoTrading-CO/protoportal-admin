import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  BarChart2,
  MessageCircle,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileDown,
  Globe,
  Grip,
  Image,
  ImagePlus,
  Layout,
  Loader2,
  Megaphone,
  Upload,
  LogOut,
  Mail,
  MapPin,
  Menu,
  PackagePlus,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Trash2,
  TrendingUp,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  archiveProduct,
  createProduct,
  deleteProduct,
  fetchAdminProductsPage,
  fetchDistinctCategories,
  fetchDormantProducts,
  fetchProductsByMainCategory,
  invalidateAdminCache,
  invalidateProductCache,
  moveProductsToCategory,
  saveSortOrder,
  updateProduct,
  uploadDormantImage,
  uploadDormantImageWithBase64,
} from '../lib/products';
import { approveCustomer, deleteCustomer, fetchAllCustomers, fetchCustomersPage, updateCustomerAdmin } from '../lib/customers';
import { supabase } from '../lib/supabase';
import { buildOrderNoteSections, createEmailOrderItems, generateOrderPdfBase64 } from '../lib/orderDocuments';
import { deleteOrderAdmin, fetchAllOrdersAdmin, updateOrderAdmin } from '../lib/orders';
import { fetchSpecials, saveSpecials } from '../lib/specials';
import { fetchBanner, saveBanner, uploadBannerImage } from '../lib/banner';
import { fetchPopupSpecial, savePopupSpecial, uploadPopupImage } from '../lib/popupSpecial';
import CrmContactsModal from '../components/CrmContactsModal';
import BroadcastCalendar from '../components/BroadcastCalendar';
import categories from '../data/categories.json';
import { buildImageCandidates } from '../lib/imageUrl';

// Thumbnail that encodes the image URL and falls back through candidates on
// error, so reorder-grid images with spaces/special chars in the path display.
function ReorderThumb({ src, alt }) {
  const candidates = buildImageCandidates(src);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [src]);
  if (!candidates.length || !candidates[idx]) {
    return <span className="adm-muted" style={{ fontSize: 10 }}>No image</span>;
  }
  return (
    <img
      draggable={false}
      src={candidates[idx]}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', mixBlendMode: 'multiply', pointerEvents: 'none' }}
    />
  );
}

// ─── Reorder sort order — stored in localStorage, applied client-side ─────────
const SORT_STORE_KEY = 'proto_sort_v1';

function saveCategoryOrder(category, ids) {
  try {
    const all = JSON.parse(localStorage.getItem(SORT_STORE_KEY) || '{}');
    all[category] = ids;
    localStorage.setItem(SORT_STORE_KEY, JSON.stringify(all));
  } catch {}
}

function loadCategoryOrder(category) {
  try {
    const all = JSON.parse(localStorage.getItem(SORT_STORE_KEY) || '{}');
    return Array.isArray(all[category]) ? all[category] : null;
  } catch { return null; }
}

function applySavedOrder(products, category) {
  const saved = loadCategoryOrder(category);
  if (!saved || !saved.length) return products;
  const orderMap = new Map(saved.map((id, i) => [id, i]));
  return [...products].sort((a, b) => (orderMap.get(a.id) ?? 999999) - (orderMap.get(b.id) ?? 999999));
}

const sections = [
  { id: 'new-products', label: 'New Products', icon: Sparkles },
  { id: 'products', label: 'Product Manager', icon: PackagePlus },
  { id: 'specials', label: "This Week's Specials", icon: Star },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'reorder', label: 'Reorder Grid', icon: Grip },
  { id: 'customers', label: 'Customer Management', icon: Users },
  { id: 'crm', label: 'WhatsApp', icon: MessageCircle },
  { id: 'banner', label: 'Banner Editor', icon: Layout },
  { id: 'popup-specials', label: 'Popup Specials', icon: Megaphone },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'pricing', label: 'Pricing & Returns', icon: SlidersHorizontal },
  { id: 'orders', label: 'Order Requests', icon: ShoppingBag },
];

const orderStatuses = ['pending', 'viewed', 'order in progress', 'awaiting payment', 'paid', 'delivered', 'returned'];
const productTypes = ['General product', 'Hot seller', 'New stock', 'Clearance stock'];
const ADMIN_PAGE_SIZE = 50;
const randFormatter = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 4 });

function isNewOrderStatus(status) {
  return !status || status === 'pending' || status === 'viewed';
}

function formatRandAmount(value) {
  const amount = Number(value || 0);
  return randFormatter.format(amount);
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatRelativeDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatJoinStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Pending';
  if (raw === 'joined') return 'Joined';
  if (raw === 'not joined' || raw === 'no thanks') return 'No thanks';
  return raw.replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

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
const CATEGORY_WORK_SIZE = 400;

const emptyForm = {
  code: '',
  name: '',
  image: '',
  secondaryImage: '',
  price: '0',
  stockOnHand: '1',
  categoryId: categories[0]?.id || '',
  subcategoryId: categories[0]?.children?.[0]?.id || '',
  productType: 'General product',
};

function categoryLabel(id) {
  return categories.find((item) => item.id === id)?.label || id;
}

function subcategoryOptions(categoryId) {
  return categories.find((item) => item.id === categoryId)?.children || [];
}

function groupBySubcategory(products, mainCategoryId) {
  const subs = subcategoryOptions(mainCategoryId);
  const subLabelMap = new Map(subs.map((s) => [s.id, s.label]));
  const groups = new Map();
  products.forEach((p) => {
    const key = p.categoryPath?.[1] || '__other__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return [...groups.entries()].map(([key, prods]) => ({
    id: key,
    label: subLabelMap.get(key) || 'Other',
    products: prods,
  }));
}

function getProductType(product) {
  const badges = product.badges || [];
  if (badges.includes('Hot seller')) return 'Hot seller';
  if (product.isNew) return 'New stock';
  if (badges.includes('Clearance stock') || product.isSpecial) return 'Clearance stock';
  return 'General product';
}

function typePatch(type, product = {}) {
  const cleanBadges = (product.badges || []).filter((item) => !['Hot seller', 'Clearance stock'].includes(item));
  if (type === 'Hot seller') return { badges: [...cleanBadges, 'Hot seller'], isNew: false, isSpecial: false };
  if (type === 'New stock') return { badges: cleanBadges, isNew: true, isSpecial: false };
  if (type === 'Clearance stock') return { badges: [...cleanBadges, 'Clearance stock'], isNew: false, isSpecial: true, specialVisibility: 'all' };
  return { badges: cleanBadges, isNew: false, isSpecial: false };
}

function compactItems(items = []) {
  return items.map((item) => `${item.code} × ${item.qty}`).join(', ');
}

function csvDownload(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => JSON.stringify(row[key] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function productToForm(product) {
  return {
    code: product.code || '',
    name: product.name || '',
    image: product.image || '',
    secondaryImage: product.secondaryImage || product.images?.[1] || '',
    price: String(product.price ?? 0),
    stockOnHand: String(product.stockOnHand ?? 1),
    categoryId: product.categoryPath?.[0] || categories[0]?.id || '',
    subcategoryId: product.categoryPath?.[1] || subcategoryOptions(product.categoryPath?.[0] || categories[0]?.id || '')[0]?.id || '',
    productType: getProductType(product),
  };
}

export default function AdminPage({ customer, onLogout, onViewPortal }) {
  const [activeSection, setActiveSection] = useState('new-products');
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [loadingError, setLoadingError] = useState('');
  const [liveCategories, setLiveCategories] = useState([]);
  const [saving, setSaving] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(emptyForm);
  const [editorError, setEditorError] = useState('');
  const [editorImageUploading, setEditorImageUploading] = useState(false);
  const [editorImageDragOver, setEditorImageDragOver] = useState('');
  const editorPrimaryImageFileInputRef = useRef(null);
  const editorSecondaryImageFileInputRef = useRef(null);
  const [profileCustomer, setProfileCustomer] = useState(null);
  const [profileOrders, setProfileOrders] = useState([]);
  const [profileOrdersLoading, setProfileOrdersLoading] = useState(false);

  const [contentEditProduct, setContentEditProduct] = useState(null);
  const [contentEditForm, setContentEditForm] = useState({ image: '', description: '' });
  const [contentEditSaving, setContentEditSaving] = useState(false);
  const [contentEditError, setContentEditError] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const imageFileInputRef = useRef(null);

  const [dormantRows, setDormantRows] = useState([]);
  const [dormantSearch, setDormantSearch] = useState('');
  const [dormantSelected, setDormantSelected] = useState(new Set());
  const [imageViewUrl, setImageViewUrl] = useState('');
  const [uploadQueue, setUploadQueue] = useState([]); // [{name, status, message, cost}]
  const [costLog, setCostLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('proto_image_gen_costs') || '[]'); } catch { return []; }
  });
  const [newProductsTab, setNewProductsTab] = useState('products'); // 'products' | 'costs'
  const singleImageRef = useRef(null);
  const folderImageRef = useRef(null);

  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('all');
  const [productSubcategory, setProductSubcategory] = useState('all');
  const [productPageSize, setProductPageSize] = useState(50);
  const [productPage, setProductPage] = useState(1);
  const [productRows, setProductRows] = useState([]);
  const [productTotal, setProductTotal] = useState(0);

  const [archiveSearch, setArchiveSearch] = useState('');
  const [archivePage, setArchivePage] = useState(1);
  const [archiveRows, setArchiveRows] = useState([]);
  const [archiveTotal, setArchiveTotal] = useState(0);

  const [customerTab, setCustomerTab] = useState('requests');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerRows, setCustomerRows] = useState([]);
  const [customerTotal, setCustomerTotal] = useState(0);

  const [pricingCategory, setPricingCategory] = useState(categories[0]?.id || '');
  const [pricingSubcategory, setPricingSubcategory] = useState('all');
  const [pricingProducts, setPricingProducts] = useState([]);
  const [selectedPricing, setSelectedPricing] = useState([]);
  const [priceDelta, setPriceDelta] = useState('-10');

  const [reorderCategory, setReorderCategory] = useState(categories[0]?.id || '');
  const [reorderProducts, setReorderProducts] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const touchDragRef = useRef(null);
  const reorderScrollRef = useRef(null);

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveDept, setMoveDept] = useState('');
  const [moveSub, setMoveSub] = useState('');
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [expandedOrderId, setExpandedOrderId] = useState(null);

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
  const [orderTab, setOrderTab] = useState('new');
  const [orderSearch, setOrderSearch] = useState('');

  const [specials, setSpecials] = useState([]); // [{productId, productName, productCode, productImage, deal, discountPct, bogoX, bogoY}]
  const [specialsSaving, setSpecialsSaving] = useState(false);

  const [crmAllCustomers, setCrmAllCustomers] = useState([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmFilters, setCrmFilters] = useState({ businessTypes: [], joinedStatuses: [] });
  const [crmSearch, setCrmSearch] = useState('');
  const [crmTemplates, setCrmTemplates] = useState([]);
  const [crmTemplatesLoading, setCrmTemplatesLoading] = useState(false);
  const [crmSelectedTemplate, setCrmSelectedTemplate] = useState('');
  const [crmSending, setCrmSending] = useState(false);
  const [crmSentCount, setCrmSentCount] = useState(null);
  const [crmLastSentTemplate, setCrmLastSentTemplate] = useState('');
  const [crmMeta, setCrmMeta] = useState({ total: 0, totalFiltered: 0, page: 1, pageSize: 25, summary: null });
  const [crmContactsOpen, setCrmContactsOpen] = useState(false);

  const [bannerForm, setBannerForm] = useState({ title: '', body: '', imageUrl: '' });
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  const [popupForm, setPopupForm] = useState({ active: false, imageUrl: '', title: '' });
  const [popupSaving, setPopupSaving] = useState(false);
  const [popupUploading, setPopupUploading] = useState(false);

  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  const mainCategories = categories.map((item) => ({ id: item.id, label: item.label }));

  const crmBusinessTypeOptions = useMemo(() => (
    [...new Set(crmAllCustomers.map((c) => c.businessType).filter(Boolean))].sort()
  ), [crmAllCustomers]);

  const crmJoinStatusOptions = useMemo(() => (
    [...new Set(crmAllCustomers.map((c) => c.joinedStatus).filter(Boolean))]
  ), [crmAllCustomers]);

  const crmFilteredCustomers = useMemo(() => crmAllCustomers, [crmAllCustomers]);
  const crmSelectedTemplateData = useMemo(() => (
    crmTemplates.find((template) => template.name === crmSelectedTemplate) || null
  ), [crmTemplates, crmSelectedTemplate]);

  useEffect(() => {
    fetchDistinctCategories().then(setLiveCategories).catch(() => {});
  }, []);

  useEffect(() => { setProductPage(1); }, [productSearch, productCategory, productSubcategory, productPageSize]);
  useEffect(() => { setArchivePage(1); }, [archiveSearch]);
  useEffect(() => { setCustomerPage(1); }, [customerTab, customerSearch]);
  useEffect(() => { if (activeSection === 'crm') void loadCrmCustomers(1); }, [crmFilters.businessTypes.join('|'), crmFilters.joinedStatuses.join('|'), crmSearch]);
  useEffect(() => { if (activeSection === 'crm' && !crmTemplates.length && !crmTemplatesLoading) void loadCrmTemplates(); }, [activeSection, crmTemplates.length, crmTemplatesLoading]);
  useEffect(() => { if (activeSection === 'banner') void loadBannerEditor(); }, [activeSection]);
  useEffect(() => { if (activeSection === 'popup-specials') void loadPopupEditor(); }, [activeSection]);

  const processUploadFiles = async (files) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const initial = imageFiles.map((f) => ({ name: f.name, status: 'pending', message: '', cost: null }));
    setUploadQueue(initial);

    const newEntries = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const sku = file.name.replace(/\.[^.]+$/, '');

      // Step 1: compress + upload (compression also produces the base64 we reuse for Gemini)
      setUploadQueue((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'transforming', message: 'Uploading…' } : item));
      let imageUrl = '', uploadedBase64 = '';
      try {
        // compressImage returns a Blob; we need both the URL and the base64 for Gemini
        const { url, base64 } = await uploadDormantImageWithBase64(file);
        imageUrl = url;
        uploadedBase64 = base64;
      } catch (err) {
        setUploadQueue((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'error', message: err.message } : item));
        continue;
      }

      // Step 2: Gemini 2.5 Flash analysis for metadata (non-fatal)
      setUploadQueue((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'transforming', message: 'Gemini analysing…' } : item));
      let title = sku, category = '', description = '', cost = 0, costZar = 0, usdToZar = 0, model = '';
      if (uploadedBase64) {
        try {
          const analyseRes = await fetch('/api/analyze-product-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentType: 'image/jpeg', base64: uploadedBase64 }),
          });
          const analyseJson = await analyseRes.json();
          if (analyseRes.ok) {
            title       = analyseJson.title       || sku;
            category    = analyseJson.category    || '';
            description = analyseJson.description || '';
            cost        = analyseJson.costUsd ?? analyseJson.cost ?? 0;
            costZar     = analyseJson.costZar ?? 0;
            usdToZar    = analyseJson.usdToZar ?? 0;
            model       = analyseJson.model       || '';
            newEntries.push({
              sku, title, cost, costUsd: cost, costZar, usdToZar, model,
              tokensIn: analyseJson.tokensIn || 0,
              tokensOut: analyseJson.tokensOut || 0,
              processingMs: analyseJson.processingMs || 0,
              timestamp: Date.now(),
            });
          }
        } catch { /* non-fatal */ }
      }

      // Step 3: save dormant
      setUploadQueue((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'saving', message: 'Saving dormant…' } : item));
      try {
        const saveRes = await fetch('/api/save-dormant-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ websiteSku: sku, title, imageUrl, category, description }),
        });
        const saveJson = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveJson.error || 'Save failed');
        const costLabel = costZar === 0 ? 'free' : formatRandAmount(costZar);
        setUploadQueue((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'done', message: `Saved ✓  ·  ${costLabel}`, cost: costZar } : item));
      } catch (err) {
        setUploadQueue((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'error', message: err.message } : item));
      }
    }

    // Persist cost log
    if (newEntries.length) {
      setCostLog((prev) => {
        const next = [...newEntries, ...prev].slice(0, 500); // keep last 500
        try { localStorage.setItem('proto_image_gen_costs', JSON.stringify(next)); } catch {}
        return next;
      });
    }

    invalidateAdminCache();
    void loadDormant();
  };

  const loadDormant = async () => {
    setLoadingProgress(0);
    setLoadingError('');
    try {
      const rows = await fetchDormantProducts({ searchQuery: dormantSearch });
      setDormantRows(rows);
    } catch (err) {
      setLoadingError(err.message || 'Failed to load dormant products');
    } finally { setLoadingProgress(null); }
  };

  const loadProducts = async () => {
    setLoadingProgress(0);
    setLoadingError('');
    try {
      const catFilter = productSubcategory !== 'all' ? productSubcategory : productCategory;
      const data = await fetchAdminProductsPage({ page: productPage, pageSize: productPageSize, searchQuery: productSearch, categoryFilter: catFilter, onProgress: setLoadingProgress });
      setProductRows(data.rows);
      setProductTotal(data.total);
    } catch (err) {
      setLoadingError(err.message || 'Failed to load products');
    } finally { setLoadingProgress(null); }
  };

  const loadArchive = async () => {
    setLoadingProgress(0);
    setLoadingError('');
    try {
      const data = await fetchAdminProductsPage({ page: archivePage, pageSize: ADMIN_PAGE_SIZE, searchQuery: archiveSearch, zeroStockOnly: true, onProgress: setLoadingProgress });
      setArchiveRows(data.rows);
      setArchiveTotal(data.total);
    } catch (err) {
      setLoadingError(err.message || 'Failed to load archive');
    } finally { setLoadingProgress(null); }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await fetchCustomersPage({ page: customerPage, pageSize: ADMIN_PAGE_SIZE, tab: customerTab, searchQuery: customerSearch });
      setCustomerRows(data.rows);
      setCustomerTotal(data.total);
    } finally { setLoading(false); }
  };

  const loadCategoryWorkingSet = async (categoryId, target) => {
    setLoading(true);
    try {
      const rows = await fetchProductsByMainCategory(categoryId, { limit: CATEGORY_WORK_SIZE });
      if (target === 'pricing') setPricingProducts(rows);
      // Reorder shows the live site order (sort_order from DB) — no localStorage override
      if (target === 'reorder') setReorderProducts(rows);
    } finally { setLoading(false); }
  };

  const loadOrders = async () => {
    setLoading(true);
    try { setOrders(await fetchAllOrdersAdmin(150)); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (activeSection === 'new-products') void loadDormant(); }, [activeSection, dormantSearch]);
  useEffect(() => { if (activeSection === 'products') void loadProducts(); }, [activeSection, productPage, productSearch, productCategory, productSubcategory]);
  useEffect(() => { if (activeSection === 'archive') void loadArchive(); }, [activeSection, archivePage, archiveSearch]);
  useEffect(() => { if (activeSection === 'customers') void loadCustomers(); }, [activeSection, customerPage, customerTab, customerSearch]);
  useEffect(() => { if (activeSection === 'pricing') void loadCategoryWorkingSet(pricingCategory, 'pricing'); }, [activeSection, pricingCategory]);
  useEffect(() => { if (activeSection === 'reorder') void loadCategoryWorkingSet(reorderCategory, 'reorder'); }, [activeSection, reorderCategory]);
  useEffect(() => { if (activeSection === 'orders' && orders.length === 0) void loadOrders(); }, [activeSection]);
  useEffect(() => { if (activeSection === 'crm' && !crmAllCustomers.length && !crmLoading) void loadCrmCustomers(1); }, [activeSection]);
  useEffect(() => { if (activeSection === 'analytics' && !analyticsData && !analyticsLoading && !analyticsError) void loadAnalytics(); }, [activeSection]);

  // Load specials on mount
  useEffect(() => {
    fetchSpecials().then((data) => setSpecials(data?.items || [])).catch(() => {});
  }, []);

  // Poll pending trade request count for nav badge
  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchCustomersPage({ tab: 'requests', pageSize: 1, searchQuery: '' });
        setPendingCount(data.total || 0);
      } catch {}
    };
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  const specialsSet = new Set(specials.map((s) => s.productId));

  const toggleSpecial = async (product) => {
    let next;
    if (specialsSet.has(product.id)) {
      next = specials.filter((s) => s.productId !== product.id);
    } else {
      if (specials.length >= 10) { alert('Maximum 10 specials allowed. Remove one first.'); return; }
      next = [...specials, { productId: product.id, productName: product.name, productCode: product.code, productImage: product.image || '', deal: 'none', discountPct: 10, bogoX: 1, bogoY: 1 }];
    }
    setSpecials(next);
    setSpecialsSaving(true);
    try { await saveSpecials(next); } catch { /* silent */ } finally { setSpecialsSaving(false); }
  };

  const updateSpecialDeal = async (productId, patch) => {
    const next = specials.map((s) => s.productId === productId ? { ...s, ...patch } : s);
    setSpecials(next);
    setSpecialsSaving(true);
    try { await saveSpecials(next); } catch { /* silent */ } finally { setSpecialsSaving(false); }
  };

  const clearAllSpecials = async () => {
    if (!window.confirm('Remove all specials?')) return;
    setSpecials([]);
    setSpecialsSaving(true);
    try { await saveSpecials([]); } catch { /* silent */ } finally { setSpecialsSaving(false); }
  };

  const uploadImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setContentEditError('Only image files are supported.');
      return;
    }
    setImageUploading(true);
    setContentEditError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/upload-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, base64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setContentEditForm((f) => ({ ...f, image: json.url }));
    } catch (err) {
      setContentEditError(err.message || 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
  };

  const uploadEditorImageFile = async (file, slot = 'primary') => {
    if (!file || !file.type.startsWith('image/')) {
      setEditorError('Only image files are supported.');
      return;
    }
    setEditorImageUploading(true);
    setEditorError('');
    try {
      const url = await uploadDormantImage(file);
      setProductForm((current) => ({
        ...current,
        image: slot === 'primary' ? url : current.image,
        secondaryImage: slot === 'secondary' ? url : current.secondaryImage,
      }));
    } catch (err) {
      setEditorError(err.message || 'Image upload failed');
    } finally {
      setEditorImageUploading(false);
    }
  };

  const stats = useMemo(() => ({
    products: productTotal,
    archived: archiveTotal,
    customers: customerTotal,
    premiumVisible: customerRows.filter((item) => item.tier === 'premium').length,
    orders: orders.length,
  }), [productTotal, archiveTotal, customerTotal, customerRows, orders]);

  const orderRows = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    const filtered = orders.filter((order) => !q || [order.order_number, order.customers?.name, order.customers?.email, compactItems(order.original_items || order.items || [])].join(' ').toLowerCase().includes(q));
    if (orderTab === 'new') return filtered.filter((o) => isNewOrderStatus(o.status));
    if (orderTab === 'sent') return filtered.filter((o) => o.status === 'order in progress' || o.status === 'awaiting payment');
    if (orderTab === 'paid') return filtered.filter((o) => o.status === 'paid');
    if (orderTab === 'fulfilled') return filtered.filter((o) => o.status === 'delivered');
    if (orderTab === 'returned') return filtered.filter((o) => o.status === 'returned');
    return filtered;
  }, [orders, orderSearch, orderTab]);

  const openNewProduct = () => {
    const firstCategory = categories[0]?.id || '';
    setEditingProduct(null);
    setProductForm({ ...emptyForm, categoryId: firstCategory, subcategoryId: subcategoryOptions(firstCategory)[0]?.id || '' });
    setEditorError('');
    setEditorImageUploading(false);
    setEditorImageDragOver('');
    setEditorOpen(true);
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm(productToForm(product));
    setEditorError('');
    setEditorImageUploading(false);
    setEditorImageDragOver('');
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingProduct(null);
    setEditorError('');
    setEditorImageUploading(false);
    setEditorImageDragOver('');
  };

  const swapEditorImages = () => {
    setProductForm((current) => ({
      ...current,
      image: current.secondaryImage || '',
      secondaryImage: current.image || '',
    }));
  };

  const clearEditorImage = (slot) => {
    setProductForm((current) => ({
      ...current,
      image: slot === 'primary' ? '' : current.image,
      secondaryImage: slot === 'secondary' ? '' : current.secondaryImage,
    }));
  };

  const openContentEdit = (product) => {
    setContentEditProduct(product);
    setContentEditForm({ image: product.image || '', description: product.description || '' });
    setContentEditError('');
  };

  const closeContentEdit = () => { setContentEditProduct(null); setContentEditError(''); };

  const saveContentEdit = async () => {
    if (!contentEditProduct) return;
    setContentEditSaving(true);
    setContentEditError('');
    try {
      await updateProduct(contentEditProduct.id, {
        image: contentEditForm.image.trim(),
        description: contentEditForm.description,
      });
      // Update local lists so image/description reflects the change without a full reload
      const patch = { image: contentEditForm.image.trim(), description: contentEditForm.description };
      setProductRows((prev) => prev.map((p) => p.id === contentEditProduct.id ? { ...p, ...patch } : p));
      setReorderProducts((prev) => prev.map((p) => p.id === contentEditProduct.id ? { ...p, ...patch } : p));
      closeContentEdit();
    } catch (err) {
      setContentEditError(err.message || 'Save failed');
    } finally {
      setContentEditSaving(false);
    }
  };

  const refreshCurrentSection = async () => {
    if (activeSection === 'products' || activeSection === 'archive') invalidateAdminCache();
    if (activeSection === 'products') return loadProducts();
    if (activeSection === 'archive') return loadArchive();
    if (activeSection === 'customers') return loadCustomers();
    if (activeSection === 'pricing') return loadCategoryWorkingSet(pricingCategory, 'pricing');
    if (activeSection === 'reorder') return loadCategoryWorkingSet(reorderCategory, 'reorder');
    if (activeSection === 'orders') return loadOrders();
  };

  const saveProduct = async () => {
    const payload = {
      code: productForm.code.trim(),
      name: productForm.name.trim(),
      image: productForm.image.trim(),
      secondaryImage: productForm.secondaryImage.trim(),
      price: Number(productForm.price || 0),
      stockOnHand: Number(productForm.stockOnHand || 0),
      categoryPath: [productForm.categoryId, productForm.subcategoryId].filter(Boolean),
      ...typePatch(productForm.productType, editingProduct || {}),
    };
    setSaving(editingProduct?.id || 'new-product');
    try {
      await (editingProduct ? updateProduct(editingProduct.id, payload) : createProduct(payload));
      closeEditor();
      await loadProducts();
    } finally { setSaving(''); }
  };

  const goLive = async (product) => {
    setSaving(product.id);
    try {
      await archiveProduct(product.id, false); // false = not archived = live
      setDormantRows((prev) => prev.filter((p) => p.id !== product.id));
      setDormantSelected((prev) => { const next = new Set(prev); next.delete(product.id); return next; });
    } catch (err) {
      alert(err.message || 'Failed to go live');
    } finally { setSaving(''); }
  };

  const goLiveSelected = async () => {
    if (!dormantSelected.size) return;
    const ids = [...dormantSelected];
    setSaving('bulk-live');
    try {
      await Promise.all(ids.map((id) => archiveProduct(id, false)));
      setDormantRows((prev) => prev.filter((p) => !dormantSelected.has(p.id)));
      setDormantSelected(new Set());
    } catch (err) {
      alert(err.message || 'Failed to go live');
    } finally { setSaving(''); }
  };

  const removeDormantProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    setSaving(`del-dormant-${product.id}`);
    try {
      await deleteProduct(product.id);
      setDormantRows((prev) => prev.filter((p) => p.id !== product.id));
      setDormantSelected((prev) => { const next = new Set(prev); next.delete(product.id); return next; });
    } catch (err) {
      alert(err.message || 'Failed to delete');
    } finally { setSaving(''); }
  };

  const removeManagedProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}" from Product Manager? This cannot be undone.`)) return;
    setSaving(`del-live-${product.id}`);
    try {
      await deleteProduct(product.id);
      await loadProducts();
      invalidateProductCache();
      invalidateAdminCache();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    } finally { setSaving(''); }
  };

  const toggleArchive = async (product) => {
    setSaving(product.id);
    try {
      await archiveProduct(product.id, !product.isArchived);
      invalidateAdminCache();
      await refreshCurrentSection();
    } catch (err) {
      alert(err.message || 'Failed to update archive status');
    } finally { setSaving(''); }
  };

  const toXlsxRow = (p) => ({
    Name: p.name,
    Barcode: p.barcode || p.code,
    'Website SKU': p.websiteSku || '',
    'Parent SKU': p.parentSku || '',
    Category: p.category || '',
    'Price (excl. VAT)': p.price,
    'Stock Qty': p.stockQty,
  });

  const loadCrmCustomers = async (page = crmMeta.page || 1) => {
    setCrmLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(crmMeta.pageSize || 25), search: crmSearch.trim() });
      crmFilters.businessTypes.forEach((value) => params.append('businessType', value));
      crmFilters.joinedStatuses.forEach((value) => params.append('joinedStatus', value));
      const res = await fetch(`/api/whatsapp-contacts?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load WhatsApp contacts');
      setCrmAllCustomers(json.contacts || []);
      setCrmMeta({
        total: json.total || 0,
        totalFiltered: json.totalFiltered || 0,
        page: json.page || page,
        pageSize: json.pageSize || 25,
        summary: json.summary || null,
      });
    } catch (e) { console.error(e); }
    finally { setCrmLoading(false); }
  };

  const loadCrmTemplates = async () => {
    setCrmTemplatesLoading(true);
    try {
      const res = await fetch('/api/whatsapp-templates');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load WhatsApp templates');
      const templates = json.templates || [];
      setCrmTemplates(templates);
      setCrmSelectedTemplate((current) => current && templates.some((template) => template.name === current)
        ? current
        : (templates[0]?.name || ''));
    } catch (e) {
      console.error(e);
    } finally {
      setCrmTemplatesLoading(false);
    }
  };

  const sendCrmEmail = async (overrides = {}) => {
    const templateName = overrides.templateName || crmSelectedTemplate;
    const businessTypes = overrides.businessTypes ?? crmFilters.businessTypes;
    const joinedStatuses = overrides.joinedStatuses ?? crmFilters.joinedStatuses;
    if (!templateName) return;
    if (!window.confirm(`Send the ${templateName} WhatsApp broadcast now?`)) return;
    setCrmSending(true); setCrmSentCount(null);
    try {
      const res = await fetch('/api/send-whatsapp-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName,
          broadcastName: templateName,
          search: crmSearch.trim(),
          businessTypes,
          joinedStatuses,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Broadcast failed');
      setCrmSentCount(json.sent ?? 0);
      setCrmLastSentTemplate(json.broadcastName || templateName);
      await loadCrmCustomers(crmMeta.page || 1);
    } catch (e) { alert('Error: ' + e.message); }
    finally { setCrmSending(false); }
  };

  const loadBannerEditor = async () => {
    try {
      const data = await fetchBanner();
      setBannerForm({ title: data.title || '', body: data.body || '', imageUrl: data.imageUrl || '' });
    } catch (e) { alert(e.message || 'Failed to load banner'); }
  };

  const saveBannerEditor = async () => {
    setBannerSaving(true);
    try {
      await saveBanner(bannerForm);
      alert('Banner saved');
    } catch (e) { alert(e.message || 'Failed to save banner'); }
    finally { setBannerSaving(false); }
  };

  const handleBannerImage = async (file) => {
    if (!file) return;
    setBannerUploading(true);
    try {
      const { url } = await uploadBannerImage(file);
      setBannerForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (e) { alert(e.message || 'Failed to upload image'); }
    finally { setBannerUploading(false); }
  };

  const loadPopupEditor = async () => {
    try {
      const data = await fetchPopupSpecial();
      setPopupForm({ active: Boolean(data.active), imageUrl: data.imageUrl || '', title: data.title || '' });
    } catch (e) { alert(e.message || 'Failed to load popup'); }
  };

  const savePopupEditor = async () => {
    setPopupSaving(true);
    try {
      await savePopupSpecial(popupForm);
      alert('Popup special saved');
    } catch (e) { alert(e.message || 'Failed to save popup'); }
    finally { setPopupSaving(false); }
  };

  const handlePopupImage = async (file) => {
    if (!file) return;
    setPopupUploading(true);
    try {
      const { url } = await uploadPopupImage(file);
      setPopupForm((prev) => ({ ...prev, imageUrl: url }));
    } catch (e) { alert(e.message || 'Failed to upload image'); }
    finally { setPopupUploading(false); }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch('/api/analytics');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `API error ${res.status}`);
      setAnalyticsData(json);
    } catch (e) {
      setAnalyticsError(e.message);
    } finally { setAnalyticsLoading(false); }
  };

  const exportLiveXlsx = async () => {
    setSaving('export-live');
    try {
      const data = await fetchAdminProductsPage({ page: 1, pageSize: 999999, searchQuery: '', categoryFilter: 'all' });
      const all = data.rows;
      const wb = XLSX.utils.book_new();

      // Build sheet per main category
      categories.forEach((cat) => {
        const catProducts = all.filter((p) => p.category === cat.id || p.categoryPath?.[0] === cat.id);
        if (!catProducts.length) return;

        const rows = [];
        const subMap = new Map((cat.children || []).map((s) => [s.id, s.label]));

        // Group by subcategory (categoryPath[1]) — falls back to 'General'
        const subGroups = new Map();
        catProducts.forEach((p) => {
          const subId = p.categoryPath?.[1] || '__general__';
          if (!subGroups.has(subId)) subGroups.set(subId, []);
          subGroups.get(subId).push(p);
        });

        subGroups.forEach((prods, subId) => {
          const subLabel = subId === '__general__' ? '' : (subMap.get(subId) || subId);
          if (subLabel) {
            rows.push({ Subcategory: `── ${subLabel} ──`, Code: '', Name: '', Price: '', Stock: '', SKU: '', 'Parent SKU': '' });
          }
          prods.forEach((p) => {
            rows.push({
              Subcategory: subLabel,
              Code: p.barcode || p.code,
              Name: p.name,
              Price: p.price,
              Stock: p.stockQty,
              SKU: p.websiteSku || '',
              'Parent SKU': p.parentSku || '',
            });
          });
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        // Truncate sheet name to 31 chars (Excel limit)
        const sheetName = cat.label.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      // Fallback: uncategorised products
      const uncatProducts = all.filter((p) => !p.category || !categories.find((c) => c.id === p.category));
      if (uncatProducts.length) {
        const ws = XLSX.utils.json_to_sheet(uncatProducts.map(toXlsxRow));
        XLSX.utils.book_append_sheet(wb, ws, 'Uncategorised');
      }

      XLSX.writeFile(wb, 'proto-live-products.xlsx');
    } finally { setSaving(''); }
  };

  const exportArchiveXlsx = async () => {
    setSaving('export-archive');
    try {
      const data = await fetchAdminProductsPage({ page: 1, pageSize: 999999, searchQuery: archiveSearch, zeroStockOnly: true });
      const ws = XLSX.utils.json_to_sheet(data.rows.map(toXlsxRow));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Archive 0 Stock');
      XLSX.writeFile(wb, 'proto-archive-products.xlsx');
    } finally { setSaving(''); }
  };

  const toggleSelectReorder = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const persistOrder = (next) => {
    const updates = next.map((p, i) => ({ websiteSku: p.id, sortOrder: i + 1 }));
    saveSortOrder(updates).catch(console.error);
  };

  const moveSelectedToTop = () => {
    if (!selectedIds.size) return;
    setReorderProducts((prev) => {
      const moving = prev.filter((p) => selectedIds.has(p.id));
      const rest = prev.filter((p) => !selectedIds.has(p.id));
      const next = [...moving, ...rest];
      persistOrder(next);
      return next;
    });
    setSelectedIds(new Set());
  };

  const openMoveModal = () => {
    if (!selectedIds.size) return;
    setMoveError('');
    const dept = reorderCategory || categories[0]?.id || '';
    setMoveDept(dept);
    setMoveSub(subcategoryOptions(dept)[0]?.id || '');
    setMoveModalOpen(true);
  };

  const applyMoveToCategory = async () => {
    if (!selectedIds.size || !moveDept) return;
    setMoveSaving(true);
    setMoveError('');
    const movingIds = new Set(selectedIds);
    try {
      const deptLabel = categories.find((c) => c.id === moveDept)?.label || moveDept;
      await moveProductsToCategory([...movingIds], { category: deptLabel, subcategory: moveSub || '' });
      // Reflect the move immediately rather than waiting for the edge-cached
      // /api/products to revalidate (which can lag up to a minute).
      setReorderProducts((prev) => {
        if (moveDept !== reorderCategory) {
          // Moved out of the department currently in view — remove them.
          return prev.filter((p) => !movingIds.has(p.id));
        }
        // Same department (possibly new subcategory) — regroup in place.
        return prev.map((p) => movingIds.has(p.id)
          ? { ...p, category: moveDept, categoryPath: moveSub ? [moveDept, moveSub] : [moveDept] }
          : p);
      });
      setMoveModalOpen(false);
      setSelectedIds(new Set());
      invalidateAdminCache();
      invalidateProductCache();
    } catch (err) {
      setMoveError(err.message || 'Move failed');
    } finally {
      setMoveSaving(false);
    }
  };

  const dropToTop = () => {
    setDragOverId(null);
    if (!dragId) return;
    setReorderProducts((prev) => {
      const toMove = selectedIds.has(dragId) ? selectedIds : new Set([dragId]);
      const moving = prev.filter((p) => toMove.has(p.id));
      const rest = prev.filter((p) => !toMove.has(p.id));
      const next = [...moving, ...rest];
      persistOrder(next);
      return next;
    });
    setDragId(null);
  };

  const swapReorder = (targetId) => {
    setDragOverId(null);
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    setReorderProducts((prev) => {
      const toMove = selectedIds.has(dragId) ? selectedIds : new Set([dragId]);
      if (toMove.has(targetId)) return prev;
      const moving = prev.filter((p) => toMove.has(p.id));
      const rest = prev.filter((p) => !toMove.has(p.id));
      const insertAt = rest.findIndex((p) => p.id === targetId);
      if (insertAt < 0) return prev;
      const next = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];
      persistOrder(next);
      return next;
    });
    setDragId(null);
  };

  // Auto-scroll the reorder list when dragging a card near its top/bottom edge,
  // so products can be dragged across long lists without manual scrolling.
  const handleReorderDragScroll = (e) => {
    const el = reorderScrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const EDGE = 60;
    const y = e.clientY;
    if (y < rect.top + EDGE) {
      el.scrollTop -= Math.max(6, (rect.top + EDGE - y) / 3);
    } else if (y > rect.bottom - EDGE) {
      el.scrollTop += Math.max(6, (y - (rect.bottom - EDGE)) / 3);
    }
  };

  const handleTouchStart = (e, productId) => {
    touchDragRef.current = { id: productId };
    setDragId(productId);
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = el?.closest('[data-reorder-id]');
    if (card) {
      const overId = card.dataset.reorderId;
      if (overId !== touchDragRef.current?.id) setDragOverId(overId);
    }
  };

  const handleTouchEnd = () => {
    if (touchDragRef.current) {
      if (dragOverId === '__top__') dropToTop();
      else if (dragOverId) swapReorder(dragOverId);
    }
    setDragId(null);
    setDragOverId(null);
    touchDragRef.current = null;
  };

  const toggleSelectAllPricing = () => {
    if (selectedPricing.length === pricingProducts.length) return setSelectedPricing([]);
    setSelectedPricing(pricingProducts.map((item) => item.id));
  };

  const applyPricing = async () => {
    const delta = Number(priceDelta || 0);
    setSaving('pricing');
    try {
      const selected = pricingProducts.filter((product) => selectedPricing.includes(product.id));
      await Promise.all(selected.map((product) => updateProduct(product.id, { price: Number(((product.price || 0) * (1 + delta / 100)).toFixed(2)) })));
      await loadCategoryWorkingSet(pricingCategory, 'pricing');
    } finally { setSaving(''); }
  };

  const openCustomerProfile = async (person) => {
    setProfileCustomer(person);
    setProfileOrders([]);
    setProfileOrdersLoading(true);
    try {
      const res = await fetch(`/api/admin-orders?customerId=${person.id}&limit=20`);
      const json = await res.json();
      setProfileOrders(json.rows || []);
    } catch { /* silent */ }
    finally { setProfileOrdersLoading(false); }
  };

  const closeCustomerProfile = () => { setProfileCustomer(null); setProfileOrders([]); };

  const approveRequest = async (person) => {
    setSaving(person.id);
    try { await approveCustomer(person.id, true); await loadCustomers(); closeCustomerProfile(); }
    finally { setSaving(''); }
  };

  const removeCustomer = async (person) => {
    if (!window.confirm(`Delete ${person.name || person.email}? This cannot be undone.`)) return;
    setSaving(`del-${person.id}`);
    try { await deleteCustomer(person.id); await loadCustomers(); closeCustomerProfile(); }
    finally { setSaving(''); }
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

  const deleteOrder = async (order) => {
    if (!window.confirm(`Delete order ${order.order_number || order.id}? This cannot be undone.`)) return;
    setSaving(`del-order-${order.id}`);
    try {
      await deleteOrderAdmin(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } finally { setSaving(''); }
  };

  const updateOrder = async (order, patch) => {
    setSaving(order.id);
    try {
      const updated = await updateOrderAdmin(order.id, patch);
      setOrders((prev) => prev.map((item) => item.id === order.id ? updated : item));
    } finally { setSaving(''); }
  };

  const openFulfillment = (order) => {
    const items = (order.original_items || order.items || []).map((item) => ({
      ...item,
      checked: false,
      finalQty: item.qty,
    }));
    setFulfillmentOrder(order);
    setFulfillmentItems(items);
    setFulfillmentNotes(order.order_change_notes || '');
    setEditingItemIdx(null);
    setProductSwapSearch('');
    setProductSwapResults([]);
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

  const saveFulfillment = async (andSend = false) => {
    if (!fulfillmentOrder) return;
    setFulfillmentSaving(true);
    try {
      const finalItems = fulfillmentItems.map(({ checked, finalQty, ...rest }) => ({ ...rest, qty: finalQty }));
      await updateOrder(fulfillmentOrder, {
        final_items: finalItems,
        status: 'order in progress',
        order_change_notes: fulfillmentNotes,
      });
      if (andSend) {
        const emailItems = createEmailOrderItems(fulfillmentItems);
        const pdfBase64 = await generateOrderPdfBase64({
          order: fulfillmentOrder,
          items: emailItems,
          autoNotes: '',
          userNotes: fulfillmentNotes,
          assignedTo: '',
          total: emailItems.some((item) => item.unitPrice || item.price)
            ? emailItems.filter((item) => !item.removed).reduce((sum, item) => sum + ((item.unitPrice || item.price || 0) * (item.qty || 0)), 0)
            : null,
          hasPrices: emailItems.some((item) => item.unitPrice || item.price),
        });
        const emailRes = await fetch('/api/send-order-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: fulfillmentOrder.customers?.email,
            customerName: fulfillmentOrder.customers?.name,
            orderNumber: fulfillmentOrder.order_number || fulfillmentOrder.id?.slice(0, 8),
            orderDate: fulfillmentOrder.created_at,
            items: emailItems,
            userNotes: fulfillmentNotes,
            pdfBase64,
            pdfFilename: `proto-order-${fulfillmentOrder.order_number || fulfillmentOrder.id?.slice(0, 8) || 'order'}.pdf`,
          }),
        });
        const emailData = await emailRes.json();
        if (!emailRes.ok) throw new Error(emailData.error || 'Email send failed');
      }
      closeFulfillment();
    } finally { setFulfillmentSaving(false); }
  };

  const productPages = Math.max(1, Math.ceil(productTotal / productPageSize));
  const customerPages = Math.max(1, Math.ceil(customerTotal / ADMIN_PAGE_SIZE));
  const fulfillmentNoteSections = buildOrderNoteSections({ userNotes: fulfillmentNotes });

  return (
    <div className="adm-shell">
      {/* Fixed top loading indicator — doesn't disturb layout */}
      {(loadingProgress !== null || loading) && (
        <div className="adm-top-progress">
          <div className="adm-top-progress-fill" style={{ width: loadingProgress !== null ? `${loadingProgress}%` : '60%' }} />
        </div>
      )}
      <header className="adm-header">
        <div className="adm-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setSidebarOpen((s) => !s)} className="adm-hamburger" aria-label="Toggle menu">
              <Menu size={20} />
            </button>
            <div className="adm-brand">
              <strong>PROTO <span style={{ color: '#dc2626' }}>ADMIN</span></strong>
            </div>
          </div>
          <div className="adm-header-actions">
            <button onClick={() => void refreshCurrentSection()} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
            <button onClick={onViewPortal} className="adm-btn-ghost"><ArrowLeftRight size={15} /><span className="adm-btn-text">Portal</span></button>
            <button onClick={onLogout} className="adm-btn-dark"><LogOut size={15} /><span className="adm-btn-text">Log out</span></button>
          </div>
        </div>
      </header>

      <div className="adm-body">
        <div className="adm-stats-bar">
          <AdminStat label="Live Products" value={stats.products} />
          <AdminStat label="Archived" value={stats.archived} />
          <AdminStat label="Customers" value={stats.customers} />
          <AdminStat label="Orders" value={stats.orders} />
        </div>

        <div className="adm-layout">
          {sidebarOpen && <div className="adm-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
          <aside className={`adm-sidebar${sidebarOpen ? ' adm-sidebar--open' : ''}`}>
            {sections.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  onClick={() => { setActiveSection(section.id); setSidebarOpen(false); }}
                  className={`adm-nav-btn${active ? ' adm-nav-btn--active' : ''}`}
                >
                  <Icon size={17} /> {section.label}
                  {section.id === 'customers' && pendingCount > 0 && (
                    <span className="adm-nav-badge">{pendingCount}</span>
                  )}
                </button>
              );
            })}
          </aside>

          <main className="adm-main">
            {loadingError && (
              <div style={{ margin: '12px 0', padding: '10px 16px', background: '#fef2f2', borderRadius: 8, color: '#c40000', fontSize: 13, fontWeight: 600 }}>
                Error: {loadingError}
              </div>
            )}

            {/* NEW PRODUCTS */}
            {activeSection === 'new-products' && (
              <div className="adm-panel">
                {/* Hidden file inputs */}
                <input
                  ref={singleImageRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files?.length) void processUploadFiles(e.target.files); e.target.value = ''; }}
                />
                <input
                  ref={folderImageRef}
                  type="file"
                  accept="image/*"
                  multiple
                  // @ts-ignore
                  webkitdirectory=""
                  style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files?.length) void processUploadFiles(e.target.files); e.target.value = ''; }}
                />

                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Sparkles size={20} style={{ color: '#8B1A1A' }} /> New Products
                    </h2>
                    <p className="adm-section-note">Upload one image or a whole folder. Each filename becomes the product code, enhances the image, and saves the product dormant until you set it live.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => singleImageRef.current?.click()} className="adm-btn-red">
                      <ImagePlus size={14} /> Upload single image
                    </button>
                    <button onClick={() => folderImageRef.current?.click()} className="adm-btn-ghost">
                      <Upload size={14} /> Upload image folder
                    </button>
                    {dormantSelected.size > 0 && (
                      <>
                        <span className="adm-pill">{dormantSelected.size} selected</span>
                        <button
                          onClick={() => void goLiveSelected()}
                          className="adm-btn-dark"
                          disabled={saving === 'bulk-live'}
                          style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', height: 36, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          <Zap size={14} /> {saving === 'bulk-live' ? 'Going live…' : 'Set selected live'}
                        </button>
                        <button onClick={() => setDormantSelected(new Set())} className="adm-btn-ghost">Clear</button>
                      </>
                    )}
                    {dormantRows.length > 0 && (
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Delete all ${dormantRows.length} dormant products? This cannot be undone.`)) return;
                          setSaving('delete-all-dormant');
                          try {
                            await Promise.all(dormantRows.map((p) => deleteProduct(p.id)));
                            setDormantRows([]);
                            setDormantSelected(new Set());
                          } catch (err) { alert(err.message || 'Delete failed'); }
                          finally { setSaving(''); }
                        }}
                        className="adm-btn-ghost"
                        disabled={saving === 'delete-all-dormant'}
                        style={{ color: '#c40000' }}
                      >
                        <Trash2 size={14} /> {saving === 'delete-all-dormant' ? 'Deleting…' : 'Delete all'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Upload progress */}
                {uploadQueue.length > 0 && (
                  <div style={{ marginBottom: 20, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Upload progress</span>
                      <button onClick={() => setUploadQueue([])} className="adm-icon-btn"><X size={13} /></button>
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {uploadQueue.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: i < uploadQueue.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: item.status === 'done' ? '#16a34a' : item.status === 'error' ? '#dc2626' : item.status === 'pending' ? '#d1d5db' : '#f59e0b',
                          }} />
                          <span style={{ fontWeight: 700, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          <span style={{ fontSize: 11, color: item.status === 'error' ? '#dc2626' : '#64748b', whiteSpace: 'nowrap' }}>
                            {item.status === 'pending' ? 'Waiting…' : item.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
                  {[{ id: 'products', label: 'Dormant Products' }, { id: 'costs', label: `Cost Tracker  ${costLog.length ? `(${costLog.length})` : ''}` }].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setNewProductsTab(t.id)}
                      style={{
                        padding: '9px 18px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: newProductsTab === t.id ? '2px solid #8B1A1A' : '2px solid transparent',
                        color: newProductsTab === t.id ? '#0f172a' : '#64748b',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        marginBottom: -1,
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {newProductsTab === 'products' && (
                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr' }}>
                  <label className="adm-search">
                    <Search size={15} />
                    <input
                      value={dormantSearch}
                      onChange={(e) => setDormantSearch(e.target.value)}
                      placeholder="Search dormant products by SKU or title"
                      className="adm-search-input"
                    />
                  </label>
                </div>
                )}

                {newProductsTab === 'products' && dormantRows.length === 0 && loadingProgress === null && (
                  <div className="adm-empty" style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
                    <Sparkles size={36} style={{ color: '#d1d5db', marginBottom: 12 }} />
                    <p style={{ margin: 0 }}>No dormant products. All products are live.</p>
                  </div>
                )}

                {newProductsTab === 'products' && <div className="adm-list">
                  {dormantRows.length > 0 && (
                    <div className="adm-list-head" style={{ gridTemplateColumns: '32px 44px 2fr 160px 180px' }}>
                      <span>
                        <input
                          type="checkbox"
                          checked={dormantSelected.size === dormantRows.length && dormantRows.length > 0}
                          onChange={() => setDormantSelected(dormantSelected.size === dormantRows.length ? new Set() : new Set(dormantRows.map((p) => p.id)))}
                          style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
                        />
                      </span>
                      <span></span>
                      <span>Product</span>
                      <span>Category</span>
                      <span>Actions</span>
                    </div>
                  )}
                  {dormantRows.map((product) => (
                    <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '32px 44px 2fr 160px 180px', alignItems: 'center' }}>
                      <div>
                        <input
                          type="checkbox"
                          checked={dormantSelected.has(product.id)}
                          onChange={() => setDormantSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(product.id)) next.delete(product.id);
                            else next.add(product.id);
                            return next;
                          })}
                          style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
                        />
                      </div>
                      <div>
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            onClick={() => setImageViewUrl(product.image)}
                            style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, background: '#f3f4f6', mixBlendMode: 'multiply', cursor: 'zoom-in' }}
                            title="Click to view"
                          />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 4, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#9ca3af' }}>IMG</div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{product.name}</div>
                        <div className="adm-muted" style={{ fontSize: 11 }}>
                          <span title="Barcode">BC: {product.barcode || product.code}</span>
                          {product.websiteSku && <span title="Website SKU" style={{ marginLeft: 8 }}>WSK: {product.websiteSku}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: '#475569' }}>
                        {product.category ? product.category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {product.image && (
                          <button
                            onClick={() => setImageViewUrl(product.image)}
                            className="adm-icon-btn"
                            title="View image"
                          >
                            <Eye size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => void goLive(product)}
                          disabled={saving === product.id}
                          style={{
                            padding: '5px 12px',
                            background: saving === product.id ? '#e2e8f0' : '#0f172a',
                            color: saving === product.id ? '#94a3b8' : '#fff',
                            border: 'none',
                            borderRadius: 7,
                            fontWeight: 800,
                            fontSize: 12,
                            cursor: saving === product.id ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontFamily: 'inherit',
                          }}
                        >
                          <Zap size={12} />
                          {saving === product.id ? '…' : 'Go live'}
                        </button>
                        <button
                          onClick={() => void removeDormantProduct(product)}
                          className="adm-icon-btn"
                          title="Delete product"
                          disabled={saving === `del-dormant-${product.id}`}
                          style={{ color: '#c40000' }}
                        >
                          {saving === `del-dormant-${product.id}` ? '…' : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>}

                {/* COST TRACKER TAB */}
                {newProductsTab === 'costs' && (() => {
                  const totalCost = costLog.reduce((s, e) => s + (e.costZar ?? e.cost ?? 0), 0);
                  const avgCost   = costLog.length ? totalCost / costLog.length : 0;
                  const freeCount = costLog.filter((e) => (e.costZar ?? e.cost ?? 0) === 0).length;
                  return (
                    <div>
                      {/* Summary stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                        {[
                          { label: 'Images processed', value: costLog.length },
                          { label: 'Free tier', value: freeCount },
                          { label: 'Total cost', value: formatRandAmount(totalCost) },
                          { label: 'Avg per image', value: formatRandAmount(avgCost) },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#0f172a' }}>{value}</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          </div>
                        ))}
                      </div>

                      {costLog.length === 0 ? (
                        <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                          No images processed yet. Upload some products to see cost tracking here.
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                            <button
                              onClick={() => {
                                setCostLog([]);
                                try { localStorage.removeItem('proto_image_gen_costs'); } catch {}
                              }}
                              className="adm-btn-ghost"
                              style={{ fontSize: 12, color: '#c40000' }}
                            >
                              Clear history
                            </button>
                          </div>
                          <div className="adm-list">
                            <div className="adm-list-head" style={{ gridTemplateColumns: '2fr 1.2fr 80px 80px 120px 120px' }}>
                              <span>SKU / Title</span><span>Model</span><span>Tokens in</span><span>Tokens out</span><span>Cost (R)</span><span>Time</span>
                            </div>
                            {costLog.map((entry, i) => {
                              const entryCost = entry.costZar ?? entry.cost ?? 0;
                              return (
                              <div key={i} className="adm-list-row" style={{ gridTemplateColumns: '2fr 1.2fr 80px 80px 120px 120px' }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13 }}>{entry.title || entry.sku}</div>
                                  <div className="adm-muted" style={{ fontSize: 11 }}>{entry.sku}</div>
                                </div>
                                <div style={{ fontSize: 11, color: entry.model?.includes('free') ? '#16a34a' : '#475569', fontWeight: 600 }}>
                                  {entry.model?.includes('free') ? '✓ free' : entry.model?.replace('google/', '') || '—'}
                                </div>
                                <div style={{ fontSize: 12 }}>{entry.tokensIn || '—'}</div>
                                <div style={{ fontSize: 12 }}>{entry.tokensOut || '—'}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: entryCost === 0 ? '#16a34a' : '#0f172a' }}>
                                  {entryCost === 0 ? 'free' : formatRandAmount(entryCost)}
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  {new Date(entry.timestamp).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            );})}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* PRODUCTS */}
            {activeSection === 'products' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Product Manager</h2>
                    <p className="adm-section-note">Server-side paging — search and category filters load only what you need.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={openNewProduct} className="adm-btn-red"><PackagePlus size={15} /> Add product</button>
                    <button onClick={() => void exportLiveXlsx()} className="adm-btn-ghost">{saving === 'export-live' ? 'Exporting…' : 'Export Excel'}</button>
                  </div>
                </div>

                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr auto auto auto auto' }}>
                  <label className="adm-search"><Search size={15} /><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search by SKU or product name" className="adm-search-input" /></label>
                  <select value={productCategory} onChange={(e) => { setProductCategory(e.target.value); setProductSubcategory('all'); }} className="adm-select">
                    <option value="all">All categories</option>
                    {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  {productCategory !== 'all' && (
                    <select value={productSubcategory} onChange={(e) => setProductSubcategory(e.target.value)} className="adm-select">
                      <option value="all">All subcategories</option>
                      {subcategoryOptions(productCategory).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  )}
                  <select value={productPageSize} onChange={(e) => setProductPageSize(Number(e.target.value))} className="adm-select" style={{ width: 90 }}>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>

                <div className="adm-list">
                  <div className="adm-list-head" style={{ gridTemplateColumns: '36px 2fr 180px 120px' }}>
                    <span></span><span>Product</span><span>Stock</span><span>Actions</span>
                  </div>
                  {productRows.reduce((acc, product, i) => {
                    const cat = product.category || 'Uncategorized';
                    const prevCat = i > 0 ? (productRows[i - 1].category || 'Uncategorized') : null;
                    if (cat !== prevCat) {
                      acc.push(
                        <div key={`cat-${cat}`} className="adm-category-header">{categoryLabel(cat) || cat}</div>
                      );
                    }
                    acc.push(
                      <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '36px 2fr 180px 120px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {product.image
                            ? <img src={product.image} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, background: '#f3f4f6', mixBlendMode: 'multiply' }} />
                            : <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#9ca3af' }}>IMG</div>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {product.name}
                            {!product.image && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>No image</span>}
                            {specialsSet.has(product.id) && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#8B1A1A', borderRadius: 4, padding: '1px 5px' }}>Special</span>}
                          </div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>
                            <span title="Barcode (customer code)">BC: {product.barcode || product.code}</span>
                            {product.websiteSku && <span title="Website SKU" style={{ marginLeft: 8 }}>WSK: {product.websiteSku}</span>}
                            {product.parentSku && <span title="Parent SKU" style={{ marginLeft: 8 }}>PSK: {product.parentSku}</span>}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700 }}>{product.stockQty != null ? `${product.stockQty} units` : '—'}</span>
                          {product.supplier && <div className="adm-muted" style={{ fontSize: 11 }}>{product.supplier}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => void toggleSpecial(product)}
                            className="adm-icon-btn"
                            title={specialsSet.has(product.id) ? 'Remove from specials' : 'Add to specials'}
                          >
                            <Star size={14} className={specialsSet.has(product.id) ? 'star-spinning' : ''} style={{ color: specialsSet.has(product.id) ? '#f59e0b' : undefined }} />
                          </button>
                          <button onClick={() => openEditProduct(product)} className="adm-icon-btn" title="Edit product details"><Pencil size={14} /></button>
                          <button onClick={() => void toggleArchive(product)} className="adm-icon-btn">{product.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
                          <button
                            onClick={() => void removeManagedProduct(product)}
                            className="adm-icon-btn"
                            title="Delete product"
                            disabled={saving === `del-live-${product.id}`}
                            style={{ color: '#c40000' }}
                          >
                            {saving === `del-live-${product.id}` ? '…' : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                    );
                    return acc;
                  }, [])}
                </div>
                <Pager page={productPage} totalPages={productPages} onChange={setProductPage} />
              </div>
            )}

            {/* THIS WEEK'S SPECIALS */}
            {activeSection === 'specials' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Star size={20} style={{ color: '#f59e0b' }} /> This Week's Specials
                    </h2>
                    <p className="adm-section-note">Max 10 specials. Star a product in Product Manager to add it here. Configure the deal type for each.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {specialsSaving && <span className="adm-muted" style={{ fontSize: 12 }}>Saving…</span>}
                    {specials.length > 0 && (
                      <button onClick={() => void clearAllSpecials()} className="adm-btn-ghost" style={{ color: '#c40000' }}>
                        Clear all
                      </button>
                    )}
                    <span className="adm-pill">{specials.length} / 10</span>
                  </div>
                </div>

                {specials.length === 0 && (
                  <div className="adm-empty" style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
                    <Star size={36} style={{ color: '#d1d5db', marginBottom: 12 }} />
                    <p style={{ margin: 0 }}>No specials yet. Go to <strong>Product Manager</strong> and click the ☆ star on any product to add it here.</p>
                  </div>
                )}

                {specials.length > 0 && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {specials.map((item) => (
                      <div key={item.productId} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start', padding: '16px', background: '#fafafa', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Star size={14} className="star-spinning" />
                            {item.productName}
                          </div>
                          <div className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>{item.productCode}</div>

                          {/* Deal selector */}
                          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                              <span style={{ fontWeight: 600 }}>Deal:</span>
                              <select
                                value={item.deal || 'none'}
                                onChange={(e) => void updateSpecialDeal(item.productId, { deal: e.target.value })}
                                className="adm-select"
                                style={{ fontSize: 12, padding: '4px 8px' }}
                              >
                                <option value="none">No deal — just featured</option>
                                <option value="discount">Discount %</option>
                                <option value="bogo">Buy X Get Y Free</option>
                              </select>
                            </label>

                            {item.deal === 'discount' && (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <span style={{ fontWeight: 600 }}>Discount:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="99"
                                  value={item.discountPct || 10}
                                  onChange={(e) => void updateSpecialDeal(item.productId, { discountPct: Number(e.target.value) })}
                                  className="adm-tiny-input"
                                  style={{ width: 56 }}
                                />
                                <span className="adm-muted">%</span>
                              </label>
                            )}

                            {item.deal === 'bogo' && (
                              <>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                  <span style={{ fontWeight: 600 }}>Buy</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={item.bogoX || 1}
                                    onChange={(e) => void updateSpecialDeal(item.productId, { bogoX: Number(e.target.value) })}
                                    className="adm-tiny-input"
                                    style={{ width: 48 }}
                                  />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                  <span style={{ fontWeight: 600 }}>Get</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={item.bogoY || 1}
                                    onChange={(e) => void updateSpecialDeal(item.productId, { bogoY: Number(e.target.value) })}
                                    className="adm-tiny-input"
                                    style={{ width: 48 }}
                                  />
                                  <span style={{ fontWeight: 600 }}>Free</span>
                                </label>
                              </>
                            )}

                            {/* Preview badge */}
                            <span style={{ marginLeft: 'auto', background: '#8B1A1A', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {item.deal === 'discount' ? `${item.discountPct || 10}% OFF`
                                : item.deal === 'bogo' ? `Buy ${item.bogoX || 1} Get ${item.bogoY || 1} Free`
                                : "This Week's Special"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => void toggleSpecial({ id: item.productId, name: item.productName, code: item.productCode, image: item.productImage })}
                          className="adm-icon-btn"
                          title="Remove from specials"
                          style={{ color: '#c40000', marginTop: 2 }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ARCHIVE */}
            {activeSection === 'archive' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Archive — 0 Stock</h2>
                    <p className="adm-section-note">Products hidden from customers when stock hits 0. Restore or edit directly from here.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => void exportArchiveXlsx()} className="adm-btn-ghost">{saving === 'export-archive' ? 'Exporting…' : 'Export Excel'}</button>
                    <span className="adm-pill" style={{ fontSize: 13, padding: '6px 14px' }}>{archiveTotal} products</span>
                  </div>
                </div>

                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr' }}>
                  <label className="adm-search"><Search size={15} /><input value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} placeholder="Search archived products" className="adm-search-input" /></label>
                </div>

                {archiveRows.length === 0 && loadingProgress === null && (
                  <div className="adm-empty" style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                    No products with 0 stock right now.
                  </div>
                )}

                <div className="adm-list">
                  {archiveRows.length > 0 && (
                    <div className="adm-list-head" style={{ gridTemplateColumns: '36px 2fr 180px 120px' }}>
                      <span></span><span>Product</span><span>Stock</span><span>Actions</span>
                    </div>
                  )}
                  {archiveRows.reduce((acc, product, i) => {
                    const cat = product.category || 'Uncategorized';
                    const prevCat = i > 0 ? (archiveRows[i - 1].category || 'Uncategorized') : null;
                    if (cat !== prevCat) {
                      acc.push(<div key={`cat-${cat}`} className="adm-category-header">{categoryLabel(cat) || cat}</div>);
                    }
                    acc.push(
                      <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '36px 2fr 180px 120px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {product.image
                            ? <img src={product.image} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 4, background: '#f3f4f6', mixBlendMode: 'multiply' }} />
                            : <div style={{ width: 32, height: 32, borderRadius: 4, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#9ca3af' }}>IMG</div>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {product.name}
                            {!product.image && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>No image</span>}
                          </div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>
                            <span title="Barcode">BC: {product.barcode || product.code}</span>
                            {product.websiteSku && <span title="Website SKU" style={{ marginLeft: 8 }}>WSK: {product.websiteSku}</span>}
                            {product.parentSku && <span title="Parent SKU" style={{ marginLeft: 8 }}>PSK: {product.parentSku}</span>}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontWeight: 900, color: '#8B1A1A', fontSize: 15 }}>0</span>
                          <span className="adm-muted" style={{ fontSize: 11, marginLeft: 4 }}>units</span>
                          {product.supplier && <div className="adm-muted" style={{ fontSize: 11 }}>{product.supplier}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEditProduct(product)} className="adm-icon-btn" title="Edit product"><Pencil size={14} /></button>
                          <button onClick={() => void toggleArchive(product)} className="adm-icon-btn" title="Restore from archive"><ArchiveRestore size={14} /></button>
                        </div>
                      </div>
                    );
                    return acc;
                  }, [])}
                </div>
                <Pager page={archivePage} totalPages={Math.max(1, Math.ceil(archiveTotal / ADMIN_PAGE_SIZE))} onChange={setArchivePage} />
              </div>
            )}

            {/* REORDER */}
            {activeSection === 'reorder' && (
              <div className="adm-panel adm-panel--reorder">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Reorder Grid</h2>
                    <p className="adm-section-note">Drag products to reorder — saves to the database immediately.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {selectedIds.size > 0 && (
                      <>
                        <span className="adm-pill">{selectedIds.size} selected</span>
                        <button onClick={moveSelectedToTop} className="adm-btn-red">Move to top</button>
                        <button onClick={openMoveModal} className="adm-btn-red"><ArrowLeftRight size={14} /> Move to category</button>
                        <button onClick={() => setSelectedIds(new Set())} className="adm-btn-ghost">Clear</button>
                      </>
                    )}
                    <button
                      onClick={() => { setSelectedIds(new Set()); invalidateAdminCache(); void loadCategoryWorkingSet(reorderCategory, 'reorder'); }}
                      className="adm-btn-ghost"
                    >
                      <RefreshCw size={14} /> Refresh
                    </button>
                  </div>
                </div>

                <div className="adm-reorder-layout">
                  {/* Category sidebar */}
                  <div className="adm-reorder-cat-sidebar">
                    <div className="adm-reorder-cat-heading">Categories</div>
                    {mainCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => { setSelectedIds(new Set()); setReorderCategory(cat.id); }}
                        className={`adm-reorder-cat-item${reorderCategory === cat.id ? ' adm-reorder-cat-item--active' : ''}`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Product grid */}
                  <div
                    className="adm-reorder-content"
                    ref={reorderScrollRef}
                    onDragOver={(e) => { if (dragId) handleReorderDragScroll(e); }}
                  >
                    <div
                      onDragEnter={(e) => { e.preventDefault(); setDragOverId('__top__'); }}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null); }}
                      onDrop={(e) => { e.preventDefault(); dropToTop(); }}
                      className={`adm-reorder-top-zone${dragId ? ' adm-reorder-top-zone--visible' : ''}${dragOverId === '__top__' ? ' adm-reorder-top-zone--over' : ''}`}
                    >
                      ↑ Drop here to move to top
                    </div>

                    <div className="adm-reorder-grid">
                      {groupBySubcategory(reorderProducts, reorderCategory).map((group) => (
                        <>
                          <div key={`hdr-${group.id}`} className="adm-reorder-group-header">{group.label}</div>
                          {group.products.map((product) => {
                            const isDragging = dragId === product.id;
                            const isOver = dragOverId === product.id && !isDragging;
                            const isSelected = selectedIds.has(product.id);
                            return (
                              <div
                                key={product.id}
                                data-reorder-id={product.id}
                                draggable
                                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', product.id); setDragId(product.id); }}
                                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                                onDragEnter={(e) => { e.preventDefault(); if (product.id !== dragId) setDragOverId(product.id); }}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null); }}
                                onDrop={(e) => { e.preventDefault(); swapReorder(product.id); }}
                                onTouchStart={(e) => handleTouchStart(e, product.id)}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                className={`adm-reorder-card${isDragging ? ' adm-reorder-card--dragging' : ''}${isOver ? ' adm-reorder-card--over' : ''}${isSelected ? ' adm-reorder-card--selected' : ''}`}
                                style={{ padding: '6px', cursor: 'grab' }}
                              >
                                <div className="adm-reorder-handle" style={{ marginBottom: 4 }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectReorder(product.id)}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ width: 12, height: 12, flexShrink: 0, cursor: 'pointer', accentColor: '#8B1A1A' }}
                                  />
                                  <Grip size={11} />
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openContentEdit(product); }}
                                    className="adm-icon-btn"
                                    title="Edit image"
                                    style={{ marginLeft: 'auto', padding: '2px' }}
                                  >
                                    <ImagePlus size={11} />
                                  </button>
                                </div>
                                <div className="adm-thumb" style={{ height: 70 }}>
                                  <ReorderThumb src={product.image} alt={product.name} />
                                </div>
                                <div style={{ fontWeight: 700, fontSize: 10, marginTop: 4, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.name}</div>
                                <div className="adm-muted" style={{ fontSize: 9 }}>{product.code}</div>
                              </div>
                            );
                          })}
                        </>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CUSTOMERS */}
            {activeSection === 'customers' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Customer Management</h2>
                    <p className="adm-section-note">Trade requests and approved customers.</p>
                  </div>
                </div>

                <div className="adm-customer-tabs">
                  <button onClick={() => setCustomerTab('requests')} className={`adm-tab${customerTab === 'requests' ? ' adm-tab--active' : ''}`}>Trade Requests</button>
                  <button onClick={() => setCustomerTab('regular')} className={`adm-tab${customerTab === 'regular' ? ' adm-tab--active' : ''}`}>Approved</button>
                  <label className="adm-search adm-search--inline"><Search size={14} /><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search…" className="adm-search-input" /></label>
                </div>

                {customerTab === 'requests' ? (
                  <div className="adm-list">
                    <div className="adm-list-head" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 1.3fr 0.8fr 180px' }}>
                      <span>Business Name</span><span>Location</span><span>Date Applied</span><span>Email / Phone</span><span>Whatsapp</span><span>Actions</span>
                    </div>
                    {customerRows.length === 0 && !loading && (
                      <div className="adm-empty" style={{ padding: '24px 0' }}>No pending trade requests.</div>
                    )}
                    {customerRows.map((person) => (
                      <div key={person.id} className="adm-list-row" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 1.3fr 0.8fr 180px', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{person.business_name || person.name || 'Unknown'}</div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>{person.name}{person.business_type ? ` · ${person.business_type}` : ''}</div>
                        </div>
                        <div style={{ fontSize: 12 }}>{[person.city, person.province, person.country].filter(Boolean).join(', ') || '—'}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{new Date(person.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        <div>
                          <div style={{ fontSize: 12 }}>{person.email}</div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>{person.phone || '—'}</div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: person.accept_whatsapp ? '#15803d' : '#6b7280' }}>
                          {person.accept_whatsapp == null ? '—' : person.accept_whatsapp ? 'Yes' : 'No'}
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <button onClick={() => void openCustomerProfile(person)} className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }}>View Profile</button>
                          <button onClick={() => void approveRequest(person)} className="adm-btn-green adm-btn-sm" disabled={saving === person.id}>
                            {saving === person.id ? '…' : <><Check size={12} /> Approve</>}
                          </button>
                          <button onClick={() => void removeCustomer(person)} className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 7px', color: '#c40000' }} disabled={saving === `del-${person.id}`}>
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="adm-list">
                    <div className="adm-list-head" style={{ gridTemplateColumns: '1.4fr 1.3fr 1fr 80px 80px' }}>
                      <span>Name</span><span>Email</span><span>Phone</span><span>Orders</span><span></span>
                    </div>
                    {customerRows.map((person) => (
                      <div key={person.id} className="adm-list-row" style={{ gridTemplateColumns: '1.4fr 1.3fr 1fr 80px 80px' }}>
                        <span style={{ fontWeight: 700 }}>{person.name || 'Unnamed'}</span>
                        <span style={{ fontSize: 13 }}>{person.email}</span>
                        <span style={{ fontSize: 13 }}>{person.phone || '—'}</span>
                        <span>{person.orderCount}</span>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button onClick={() => void openCustomerProfile(person)} className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }}>View Profile</button>
                          <button onClick={() => void removeCustomer(person)} className="adm-btn-ghost adm-btn-sm" disabled={saving === `del-${person.id}`} style={{ color: '#c40000', padding: '4px 8px' }}>
                            {saving === `del-${person.id}` ? '…' : <X size={14} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Pager page={customerPage} totalPages={customerPages} onChange={setCustomerPage} />
              </div>
            )}

            {/* PRICING */}
            {activeSection === 'pricing' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Pricing & Returns</h2>
                    <p className="adm-section-note">Select products and apply a percentage price adjustment.</p>
                  </div>
                </div>
                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
                  <select value={pricingCategory} onChange={(e) => { setPricingCategory(e.target.value); setPricingSubcategory('all'); setSelectedPricing([]); }} className="adm-select">
                    {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <select value={pricingSubcategory} onChange={(e) => { setPricingSubcategory(e.target.value); setSelectedPricing([]); }} className="adm-select">
                    <option value="all">All subcategories</option>
                    {subcategoryOptions(pricingCategory).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <button onClick={toggleSelectAllPricing} className="adm-btn-ghost">{selectedPricing.length === pricingProducts.length ? 'Clear all' : 'Select all'}</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={priceDelta} onChange={(e) => setPriceDelta(e.target.value)} className="adm-tiny-input" placeholder="-10" />
                    <button onClick={() => void applyPricing()} className="adm-btn-red">{saving === 'pricing' ? 'Applying…' : 'Apply %'}</button>
                  </div>
                </div>
                <div className="adm-checkbox-list">
                  {(pricingSubcategory === 'all' ? pricingProducts : pricingProducts.filter((p) => p.categoryPath?.[1] === pricingSubcategory)).map((product) => (
                    <label key={product.id} className="adm-checkbox-row">
                      <input type="checkbox" checked={selectedPricing.includes(product.id)} onChange={(e) => setSelectedPricing((prev) => e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id))} />
                      <span style={{ fontWeight: 700 }}>{product.name}</span>
                      <small className="adm-muted">{product.code}</small>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ORDERS */}
            {activeSection === 'orders' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Order Requests</h2>
                    <p className="adm-section-note">Most recent 150 orders. Click a row to expand details.</p>
                  </div>
                  <label className="adm-search"><Search size={15} /><input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Search orders" className="adm-search-input" /></label>
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {[
                    { key: 'new', label: 'New Orders' },
                    { key: 'sent', label: 'Sent' },
                    { key: 'paid', label: 'Paid' },
                    { key: 'fulfilled', label: 'Fulfilled' },
                    { key: 'returned', label: 'Returned' },
                  ].map(({ key, label }) => {
                    const count = (() => {
                      if (key === 'new') return orders.filter((o) => isNewOrderStatus(o.status)).length;
                      if (key === 'sent') return orders.filter((o) => o.status === 'order in progress' || o.status === 'awaiting payment').length;
                      if (key === 'paid') return orders.filter((o) => o.status === 'paid').length;
                      if (key === 'fulfilled') return orders.filter((o) => o.status === 'delivered').length;
                      if (key === 'returned') return orders.filter((o) => o.status === 'returned').length;
                      return 0;
                    })();
                    return (
                      <button
                        key={key}
                        onClick={() => setOrderTab(key)}
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
                <div className="adm-list">
                  <div className="adm-list-head" style={{ gridTemplateColumns: '1.6fr 1.4fr 1.2fr 1fr 160px 80px' }}>
                    <span>Order</span><span>Customer</span><span>Date & Time</span><span>Status</span><span>Actions</span><span></span>
                  </div>
                  {orderRows.map((order) => {
                    const isExpanded = expandedOrderId === order.id;
                    const dt = new Date(order.created_at);
                    const dateStr = dt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
                    const timeStr = dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={order.id}>
                        <div
                          className="adm-list-row adm-order-row"
                          style={{ gridTemplateColumns: '1.6fr 1.4fr 1.2fr 1fr 160px 80px', cursor: 'pointer' }}
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        >
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 13 }}>{order.order_number || order.id.slice(0, 8)}</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{order.customers?.name || 'Unknown'}</div>
                            <div className="adm-muted" style={{ fontSize: 11 }}>{order.customers?.email || ''}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{dateStr}</div>
                            <div className="adm-muted" style={{ fontSize: 11 }}>{timeStr}</div>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <select value={order.status || 'pending'} onChange={(e) => void updateOrder(order, { status: e.target.value })} className="adm-select" style={{ fontSize: 12, padding: '4px 8px', minHeight: 32 }}>
                              {orderStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => window.open(`/fulfillment?id=${order.id}`, '_blank', 'noopener,noreferrer')} className="adm-icon-btn" title="Fulfil order (opens in new tab)" style={{ color: '#15803d' }}><ClipboardList size={14} /></button>
                            <button onClick={() => downloadOrderHtml(order)} className="adm-icon-btn" title="Download order file"><FileDown size={14} /></button>
                            <button onClick={() => void deleteOrder(order)} className="adm-icon-btn" style={{ color: '#c40000' }} disabled={saving === `del-order-${order.id}`} title="Delete order">
                              {saving === `del-order-${order.id}` ? '…' : <Trash2 size={14} />}
                            </button>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <span className="adm-muted" style={{ fontSize: 18, lineHeight: 1 }}>{isExpanded ? '↑' : '↓'}</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ background: '#f8fafc', borderTop: '1px solid #f1f5f9', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <OrderItemsList label="Order placed" items={order.original_items || order.items || []} />
                            <OrderItemsList label="Order final" items={order.final_items || order.items || []} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WHATSAPP */}
            {activeSection === 'crm' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">WhatsApp</h2>
                    <p className="adm-section-note">View contacts, plan broadcasts on the calendar, and target customer groups from onboarding.</p>
                  </div>
                  <button onClick={() => { void loadCrmCustomers(crmMeta.page || 1); void loadCrmTemplates(); }} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
                </div>

                {crmMeta.summary && (
                  <div className="adm-analytics-grid" style={{ marginBottom: 18 }}>
                    <div className="adm-analytics-card" style={{ position: 'relative' }}>
                      <div className="adm-analytics-value">{crmMeta.summary.totalContacts}</div>
                      <div className="adm-analytics-label">Total WhatsApp Contacts</div>
                      <button type="button" className="adm-btn-ghost" style={{ marginTop: 8, fontSize: 12, padding: '4px 10px' }} onClick={() => setCrmContactsOpen(true)}>
                        <Eye size={13} /> View
                      </button>
                    </div>
                    <div className="adm-analytics-card adm-analytics-card--accent"><div className="adm-analytics-value">{crmMeta.summary.joinedCount}</div><div className="adm-analytics-label">Joined</div></div>
                    <div className="adm-analytics-card"><div className="adm-analytics-value">{crmMeta.summary.notJoinedCount}</div><div className="adm-analytics-label">No Thanks</div></div>
                    <div className="adm-analytics-card adm-analytics-card--accent"><div className="adm-analytics-value">{crmMeta.summary.engaged30d}</div><div className="adm-analytics-label">Engaged (30d)</div></div>
                    <div className="adm-analytics-card"><div className="adm-analytics-value">{crmMeta.summary.broadcastReadyCount}</div><div className="adm-analytics-label">Broadcast Ready</div></div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, alignItems: 'start' }}>
                  <div className="adm-crm-filters">
                    <label className="adm-search" style={{ marginBottom: 14 }}><Search size={14} /><input value={crmSearch} onChange={(e) => setCrmSearch(e.target.value)} placeholder="Search contact, phone, email…" className="adm-search-input" /></label>

                    <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, color: '#6b7280' }}>Business Type</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                      <input type="checkbox" checked={crmFilters.businessTypes.length === 0} onChange={() => setCrmFilters((prev) => ({ ...prev, businessTypes: [] }))} style={{ accentColor: '#dc2626' }} />
                      <span style={{ flex: 1 }}>All business types</span>
                    </label>
                    {crmBusinessTypeOptions.map((type) => (
                      <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>
                        <input
                          type="checkbox"
                          checked={crmFilters.businessTypes.includes(type)}
                          onChange={(e) => setCrmFilters((prev) => ({
                            ...prev,
                            businessTypes: e.target.checked ? [...prev.businessTypes, type] : prev.businessTypes.filter((t) => t !== type),
                          }))}
                          style={{ accentColor: '#dc2626' }}
                        />
                        <span style={{ flex: 1 }}>{type}</span>
                      </label>
                    ))}

                    <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '18px 0 10px', color: '#6b7280' }}>Joined Status</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                      <input type="checkbox" checked={crmFilters.joinedStatuses.length === 0} onChange={() => setCrmFilters((prev) => ({ ...prev, joinedStatuses: [] }))} style={{ accentColor: '#dc2626' }} />
                      <span style={{ flex: 1 }}>All statuses</span>
                    </label>
                    {crmJoinStatusOptions.map((status) => (
                      <label key={status} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>
                        <input
                          type="checkbox"
                          checked={crmFilters.joinedStatuses.includes(status)}
                          onChange={(e) => setCrmFilters((prev) => ({
                            ...prev,
                            joinedStatuses: e.target.checked ? [...prev.joinedStatuses, status] : prev.joinedStatuses.filter((t) => t !== status),
                          }))}
                          style={{ accentColor: '#dc2626' }}
                        />
                        <span style={{ flex: 1 }}>{formatJoinStatus(status)}</span>
                      </label>
                    ))}

                    <div style={{ marginTop: 16, padding: '10px 14px', background: crmMeta.totalFiltered ? '#f0fdf4' : '#f9fafb', border: `1px solid ${crmMeta.totalFiltered ? '#d1fae5' : '#e5e7eb'}` }}>
                      <strong style={{ color: crmMeta.totalFiltered ? '#15803d' : '#6b7280', fontSize: 20 }}>{crmMeta.totalFiltered}</strong>
                      <span className="adm-muted" style={{ fontSize: 13, marginLeft: 6 }}>contacts matched</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 18 }}>
                    {crmSentCount !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #d1fae5', fontSize: 13 }}>
                        <Check size={14} style={{ color: '#15803d', flexShrink: 0 }} />
                        <span>Broadcast <strong>{crmLastSentTemplate}</strong> sent to <strong>{crmSentCount}</strong> contacts</span>
                      </div>
                    )}
                    <BroadcastCalendar
                      templates={crmTemplates}
                      templatesLoading={crmTemplatesLoading}
                      filters={crmFilters}
                      onSendNow={(overrides) => void sendCrmEmail(overrides)}
                      sending={crmSending}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* BANNER EDITOR */}
            {activeSection === 'banner' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Banner Editor</h2>
                    <p className="adm-section-note">Edit the logged-in portal hero banner. Image is resized to 1774 × 887 px on upload.</p>
                  </div>
                  <button type="button" onClick={() => void loadBannerEditor()} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Title</label>
                      <input className="adm-field-input" style={{ width: '100%' }} value={bannerForm.title} onChange={(e) => setBannerForm((p) => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div>
                      <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Body text</label>
                      <textarea className="adm-field-input" style={{ width: '100%', minHeight: 120 }} value={bannerForm.body} onChange={(e) => setBannerForm((p) => ({ ...p, body: e.target.value }))} />
                    </div>
                    <div>
                      <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Banner image</label>
                      <label className="adm-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <ImagePlus size={15} /> {bannerUploading ? 'Uploading…' : 'Upload image (1774×887)'}
                        <input type="file" accept="image/*" hidden onChange={(e) => { void handleBannerImage(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    </div>
                    <button type="button" className="adm-btn-red" disabled={bannerSaving} onClick={() => void saveBannerEditor()}>{bannerSaving ? 'Saving…' : 'Save banner'}</button>
                  </div>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', background: '#050505' }}>
                    <div style={{ padding: 24 }}>
                      <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>Established 1987 | Wholesale supply</span>
                      <h3 style={{ color: '#fff', margin: '12px 0', fontSize: 22, lineHeight: 1.2 }}>{bannerForm.title || 'Banner title'}</h3>
                      <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.5 }}>{bannerForm.body || 'Banner body text'}</p>
                    </div>
                    {bannerForm.imageUrl && (
                      <img src={bannerForm.imageUrl} alt="Banner preview" style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* POPUP SPECIALS */}
            {activeSection === 'popup-specials' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Popup Specials</h2>
                    <p className="adm-section-note">Upload a flyer popup shown once per customer when they log in (while active).</p>
                  </div>
                  <button type="button" onClick={() => void loadPopupEditor()} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                      <input type="checkbox" checked={popupForm.active} onChange={(e) => setPopupForm((p) => ({ ...p, active: e.target.checked }))} style={{ accentColor: '#dc2626' }} />
                      Active — show popup to logged-in customers
                    </label>
                    <div>
                      <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Admin label (optional)</label>
                      <input className="adm-field-input" style={{ width: '100%' }} value={popupForm.title} onChange={(e) => setPopupForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. June clearance flyer" />
                    </div>
                    <div>
                      <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Flyer image</label>
                      <label className="adm-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <ImagePlus size={15} /> {popupUploading ? 'Uploading…' : 'Upload flyer'}
                        <input type="file" accept="image/*" hidden onChange={(e) => { void handlePopupImage(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    </div>
                    <button type="button" className="adm-btn-red" disabled={popupSaving} onClick={() => void savePopupEditor()}>{popupSaving ? 'Saving…' : 'Save popup'}</button>
                  </div>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, background: '#f9fafb', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {popupForm.imageUrl
                      ? <img src={popupForm.imageUrl} alt="Popup preview" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8 }} />
                      : <span className="adm-muted">No image uploaded</span>}
                  </div>
                </div>
              </div>
            )}

            {/* ANALYTICS */}
            {activeSection === 'analytics' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Analytics</h2>
                    <p className="adm-section-note">Business metrics overview.</p>
                  </div>
                  <button onClick={() => void loadAnalytics()} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
                </div>
                {analyticsLoading && <div className="adm-muted" style={{ padding: '24px 0', fontSize: 13 }}>Loading analytics…</div>}
                {analyticsError && (
                  <div style={{ margin: '16px 0', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#c40000', fontSize: 13 }}>
                    Error: {analyticsError}
                  </div>
                )}
                {analyticsData && (
                  <div className="adm-analytics-grid">
                    <div className="adm-analytics-card">
                      <div className="adm-analytics-value">{analyticsData.totalCustomers}</div>
                      <div className="adm-analytics-label">Total Customers</div>
                    </div>
                    <div className="adm-analytics-card adm-analytics-card--accent">
                      <div className="adm-analytics-value">{analyticsData.newSignups30d}</div>
                      <div className="adm-analytics-label">New Sign-ups (30d)</div>
                    </div>
                    {analyticsData.whatsappCustomers !== null && (
                      <div className="adm-analytics-card">
                        <div className="adm-analytics-value">{analyticsData.whatsappCustomers}</div>
                        <div className="adm-analytics-label">WhatsApp Customers</div>
                      </div>
                    )}
                    <div className="adm-analytics-card">
                      <div className="adm-analytics-value">{analyticsData.totalOrders}</div>
                      <div className="adm-analytics-label">Total Orders</div>
                    </div>
                    <div className="adm-analytics-card adm-analytics-card--accent">
                      <div className="adm-analytics-value">R {analyticsData.totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      <div className="adm-analytics-label">Order Revenue</div>
                    </div>
                    <div className="adm-analytics-card">
                      <div className="adm-analytics-value">R {analyticsData.avgOrderSize.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      <div className="adm-analytics-label">Avg Order Size</div>
                    </div>
                    <div className="adm-analytics-card adm-analytics-card--muted">
                      <div className="adm-analytics-value" style={{ fontSize: 18, color: '#9ca3af' }}>—</div>
                      <div className="adm-analytics-label">Website Traffic</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Connect Vercel Analytics</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Customer profile drawer */}
      {profileCustomer && (
        <div className="adm-drawer-backdrop" onClick={closeCustomerProfile}>
          <div className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <h3>Customer Profile</h3>
              <button onClick={closeCustomerProfile} className="adm-icon-btn"><X size={16} /></button>
            </div>
            <div className="adm-drawer-body">
              <div className="adm-drawer-avatar">{(profileCustomer.business_name || profileCustomer.name || '?')[0].toUpperCase()}</div>
              <h2 className="adm-drawer-biz">{profileCustomer.business_name || profileCustomer.name}</h2>

              <div className="adm-drawer-fields">
                <DrawerField icon={User} label="Contact person" value={profileCustomer.name} />
                <DrawerField icon={Mail} label="Email" value={profileCustomer.email} />
                <DrawerField icon={Phone} label="Phone" value={profileCustomer.phone} />
                <DrawerField icon={Store} label="Business type" value={profileCustomer.business_type} />
                <DrawerField icon={Globe} label="Country" value={profileCustomer.country} />
                <DrawerField icon={MapPin} label="Province" value={profileCustomer.province} />
                <DrawerField icon={MapPin} label="City" value={profileCustomer.city} />
                <DrawerField icon={Shield} label="Accept WhatsApp" value={profileCustomer.accept_whatsapp == null ? null : profileCustomer.accept_whatsapp ? 'Yes' : 'No'} />
                <DrawerField icon={Building2} label="Applied" value={new Date(profileCustomer.created_at).toLocaleString('en-ZA')} />
              </div>

              {/* Order history */}
              <div style={{ marginTop: 24 }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, fontFamily: 'Outfit, sans-serif' }}>Order History</div>
                {profileOrdersLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}>
                    <Loader2 size={14} className="spin" /> Loading orders…
                  </div>
                )}
                {!profileOrdersLoading && profileOrders.length === 0 && (
                  <div className="adm-muted" style={{ fontSize: 13 }}>No orders found.</div>
                )}
                {!profileOrdersLoading && profileOrders.length > 0 && (
                  <div className="adm-profile-orders">
                    {profileOrders.map((order) => (
                      <div key={order.id} className="adm-profile-order">
                        <div className="adm-profile-order-head">
                          <span>{order.order_number || order.id.slice(0, 8)}</span>
                          <span className="adm-pill" style={{ fontSize: 10, padding: '2px 8px' }}>{order.status || 'pending'}</span>
                          <span className="adm-muted">{new Date(order.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        <div className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>
                          {compactItems(order.original_items || order.items || [])}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="adm-drawer-footer">
              <button onClick={closeCustomerProfile} className="adm-btn-ghost">Close</button>
              {!profileCustomer.is_approved && (
                <button onClick={() => void approveRequest(profileCustomer)} className="adm-btn-green" disabled={saving === profileCustomer.id}>
                  {saving === profileCustomer.id ? 'Approving…' : <><Check size={15} /> Approve</>}
                </button>
              )}
              <button onClick={() => void removeCustomer(profileCustomer)} className="adm-btn-ghost" style={{ color: '#c40000' }} disabled={saving === `del-${profileCustomer.id}`}>
                {saving === `del-${profileCustomer.id}` ? '…' : <><Trash2 size={14} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content quick-edit modal (image drag-drop + description) */}
      {moveModalOpen && (
        <div className="adm-modal-backdrop">
          <div className="adm-modal" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'Outfit, sans-serif' }}>Move to category</h3>
                <p className="adm-muted" style={{ marginTop: 4, fontSize: 13 }}>{selectedIds.size} product{selectedIds.size === 1 ? '' : 's'} selected</p>
              </div>
              <button onClick={() => setMoveModalOpen(false)} className="adm-icon-btn"><X size={16} /></button>
            </div>

            <label className="adm-field-label" style={{ display: 'block', marginBottom: 6 }}>Department</label>
            <select
              value={moveDept}
              onChange={(e) => { setMoveDept(e.target.value); setMoveSub(subcategoryOptions(e.target.value)[0]?.id || ''); }}
              className="adm-field-input"
              style={{ width: '100%', marginBottom: 16 }}
            >
              {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>

            <label className="adm-field-label" style={{ display: 'block', marginBottom: 6 }}>Subcategory</label>
            <select
              value={moveSub}
              onChange={(e) => setMoveSub(e.target.value)}
              className="adm-field-input"
              style={{ width: '100%', marginBottom: 20 }}
            >
              <option value="">— None (department only) —</option>
              {subcategoryOptions(moveDept).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>

            {moveError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{moveError}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setMoveModalOpen(false)} className="adm-btn-ghost" disabled={moveSaving}>Cancel</button>
              <button onClick={applyMoveToCategory} className="adm-btn-red" disabled={moveSaving}>
                {moveSaving ? <><Loader2 size={14} className="spin" /> Moving…</> : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {contentEditProduct && (
        <div className="adm-modal-backdrop">
          <div className="adm-modal" style={{ maxWidth: 580 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'Outfit, sans-serif' }}>Edit image & description</h3>
                <p className="adm-muted" style={{ marginTop: 4, fontSize: 13 }}>{contentEditProduct.name}</p>
              </div>
              <button onClick={closeContentEdit} className="adm-icon-btn"><X size={16} /></button>
            </div>

            {/* Hidden file input */}
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImageFile(f); e.target.value = ''; }}
            />

            {/* Drop zone / preview */}
            <div
              onClick={() => !imageUploading && imageFileInputRef.current?.click()}
              onDragEnter={(e) => { e.preventDefault(); setImageDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setImageDragOver(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setImageDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void uploadImageFile(file);
              }}
              style={{
                position: 'relative',
                marginBottom: 12,
                borderRadius: 10,
                border: `2px dashed ${imageDragOver ? '#8B1A1A' : contentEditForm.image ? '#d1d5db' : '#cbd5e1'}`,
                background: imageDragOver ? '#fff5f5' : contentEditForm.image ? '#f8f8f8' : '#f8fafc',
                height: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: imageUploading ? 'wait' : 'pointer',
                overflow: 'hidden',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {imageUploading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#8B1A1A' }}>
                  <Loader2 size={32} className="spin" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Uploading…</span>
                </div>
              ) : contentEditForm.image ? (
                <>
                  <img
                    src={contentEditForm.image}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                    display: imageDragOver ? 'flex' : 'none',
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#fff',
                  }}>
                    <Upload size={28} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Drop to replace</span>
                  </div>
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '6px 10px', background: 'rgba(0,0,0,0.5)',
                    color: '#fff', fontSize: 11, textAlign: 'center',
                    display: imageDragOver ? 'none' : 'block',
                  }}>
                    Click or drag a new image to replace
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: imageDragOver ? '#8B1A1A' : '#94a3b8', pointerEvents: 'none' }}>
                  <Upload size={32} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Drag & drop an image here</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>or click to browse files</div>
                  </div>
                </div>
              )}
            </div>

            {/* Manual URL input */}
            <label style={{ display: 'grid', gap: 5, marginBottom: 18 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or paste image URL</span>
              <input
                value={contentEditForm.image}
                onChange={(e) => setContentEditForm((f) => ({ ...f, image: e.target.value }))}
                className="adm-field-input"
                placeholder="https://example.com/product.jpg"
                style={{ fontSize: 12 }}
              />
            </label>

            {/* Description */}
            <label style={{ display: 'grid', gap: 6, marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Description</span>
              <textarea
                value={contentEditForm.description}
                onChange={(e) => setContentEditForm((f) => ({ ...f, description: e.target.value }))}
                className="adm-field-input"
                rows={4}
                placeholder="Product description shown to customers…"
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </label>

            {contentEditError && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6, color: '#c40000', fontSize: 13 }}>
                {contentEditError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={closeContentEdit} className="adm-btn-ghost"><ChevronLeft size={15} /> Cancel</button>
              <button onClick={() => void saveContentEdit()} className="adm-btn-red" disabled={contentEditSaving || imageUploading}>
                {contentEditSaving ? 'Saving…' : <><Check size={15} /> Save to Supabase</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fulfillment modal */}
      {fulfillmentOrder && (
        <div className="adm-modal-backdrop">
          <div className="adm-modal" style={{ maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ClipboardList size={20} style={{ color: '#15803d' }} /> Order Fulfillment
                </h3>
                <p className="adm-muted" style={{ marginTop: 4, fontSize: 13 }}>
                  {fulfillmentOrder.order_number || fulfillmentOrder.id.slice(0, 8)} &nbsp;·&nbsp; {new Date(fulfillmentOrder.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button onClick={closeFulfillment} className="adm-icon-btn"><X size={16} /></button>
            </div>

            {/* Customer details */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, flexShrink: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{fulfillmentOrder.customers?.name || 'Unknown customer'}</div>
              <div className="adm-muted" style={{ marginTop: 2 }}>{fulfillmentOrder.customers?.email || '—'}</div>
            </div>

            {/* Items table */}
            <div style={{ overflowY: 'auto', flex: 1, marginBottom: 14 }}>
              {/* Table header */}
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
                      onClick={() => { setEditingItemIdx(editingItemIdx === idx ? null : idx); setProductSwapSearch(''); setProductSwapResults([]); }}
                      className="adm-icon-btn"
                      title="Swap product"
                      style={{ color: editingItemIdx === idx ? '#8B1A1A' : undefined }}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>

                  {/* Inline product swap */}
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

            {/* Notes */}
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

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
              <button onClick={closeFulfillment} className="adm-btn-ghost"><ChevronLeft size={15} /> Cancel</button>
              <button onClick={() => void saveFulfillment(false)} className="adm-btn-ghost" disabled={fulfillmentSaving}>
                {fulfillmentSaving ? 'Saving…' : <><Check size={15} /> Save final order</>}
              </button>
              <button
                onClick={() => void saveFulfillment(true)}
                disabled={fulfillmentSaving}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#15803d', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: fulfillmentSaving ? 'not-allowed' : 'pointer', opacity: fulfillmentSaving ? 0.7 : 1 }}
              >
                <Send size={15} /> Send order to customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {imageViewUrl && (
        <div
          onClick={() => setImageViewUrl('')}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={imageViewUrl}
            alt="Product"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setImageViewUrl('')}
            style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Product editor modal */}
      {editorOpen && (
        <div className="adm-modal-backdrop" onClick={closeEditor}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontFamily: 'Outfit, sans-serif' }}>{editingProduct ? 'Edit product' : 'Add product'}</h3>
                <p className="adm-muted" style={{ marginTop: 4 }}>Fill in the details and assign a category.</p>
              </div>
              <button onClick={closeEditor} className="adm-icon-btn"><X size={16} /></button>
            </div>

            <div style={{ overflowY: 'auto', paddingRight: 4, flex: 1, minHeight: 0 }}>

            <input
              ref={editorPrimaryImageFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadEditorImageFile(file, 'primary');
                e.target.value = '';
              }}
            />

            <input
              ref={editorSecondaryImageFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadEditorImageFile(file, 'secondary');
                e.target.value = '';
              }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <AdminField label="Product code"><input value={productForm.code} onChange={(e) => setProductForm((p) => ({ ...p, code: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Product type">
                <select value={productForm.productType} onChange={(e) => setProductForm((p) => ({ ...p, productType: e.target.value }))} className="adm-field-input">
                  {productTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </AdminField>
              <AdminField label="Product name" full><input value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} className="adm-field-input" /></AdminField>

              <AdminField label="Product images" full>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {[
                    { key: 'primary', label: 'Primary image', value: productForm.image, ref: editorPrimaryImageFileInputRef },
                    { key: 'secondary', label: 'Secondary image', value: productForm.secondaryImage, ref: editorSecondaryImageFileInputRef },
                  ].map((slot) => {
                    const isDragOver = editorImageDragOver === slot.key;
                    return (
                      <div key={slot.key} style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{slot.label}</span>
                          {slot.key === 'secondary' && productForm.secondaryImage && productForm.image && (
                            <button
                              type="button"
                              onClick={swapEditorImages}
                              className="adm-btn-ghost"
                              style={{ padding: '6px 10px', fontSize: 12 }}
                            >
                              Make secondary the primary
                            </button>
                          )}
                        </div>
                        <div
                          onClick={() => !editorImageUploading && slot.ref.current?.click()}
                          onDragEnter={(e) => { e.preventDefault(); setEditorImageDragOver(slot.key); }}
                          onDragOver={(e) => { e.preventDefault(); setEditorImageDragOver(slot.key); }}
                          onDragLeave={(e) => { e.preventDefault(); if (editorImageDragOver === slot.key) setEditorImageDragOver(''); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setEditorImageDragOver('');
                            const file = e.dataTransfer.files?.[0];
                            if (file) void uploadEditorImageFile(file, slot.key);
                          }}
                          style={{
                            position: 'relative',
                            minHeight: 160,
                            borderRadius: 16,
                            border: `2px dashed ${isDragOver ? '#8B1A1A' : slot.value ? '#d1d5db' : '#cbd5e1'}`,
                            background: isDragOver ? '#fff5f5' : '#f8fafc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: editorImageUploading ? 'wait' : 'pointer',
                            overflow: 'hidden',
                            transition: 'border-color 0.15s, background 0.15s',
                          }}
                        >
                          {editorImageUploading && isDragOver ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#8B1A1A' }}>
                              <Loader2 size={32} className="spin" />
                              <span style={{ fontSize: 13, fontWeight: 600 }}>Uploading image…</span>
                            </div>
                          ) : slot.value ? (
                            <>
                              <img src={slot.value} alt={`${slot.label} preview`} style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain' }} />
                              <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)', display: isDragOver ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#fff' }}>
                                <Upload size={28} />
                                <span style={{ fontSize: 13, fontWeight: 600 }}>Drop to replace image</span>
                              </div>
                              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 12px', background: 'rgba(15, 23, 42, 0.55)', color: '#fff', fontSize: 12, textAlign: 'center' }}>
                                Click or drag a new image here to replace it
                              </div>
                            </>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: isDragOver ? '#8B1A1A' : '#64748b', pointerEvents: 'none', textAlign: 'center', padding: 20 }}>
                              <Upload size={32} />
                              <div style={{ fontWeight: 700, fontSize: 15 }}>Drag & drop {slot.key} image here</div>
                              <div style={{ fontSize: 12 }}>or click to browse and upload it to Supabase</div>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => slot.ref.current?.click()} className="adm-btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} disabled={editorImageUploading}>
                            Upload {slot.key} image
                          </button>
                          {slot.value && (
                            <button type="button" onClick={() => clearEditorImage(slot.key)} className="adm-btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} disabled={editorImageUploading}>
                              Remove {slot.key} image
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AdminField>

              <AdminField label="Primary image URL" full><input value={productForm.image} onChange={(e) => setProductForm((p) => ({ ...p, image: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Secondary image URL" full><input value={productForm.secondaryImage} onChange={(e) => setProductForm((p) => ({ ...p, secondaryImage: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Price"><input value={productForm.price} onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Stock on hand"><input value={productForm.stockOnHand} onChange={(e) => setProductForm((p) => ({ ...p, stockOnHand: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Main category">
                <select value={productForm.categoryId} onChange={(e) => setProductForm((p) => ({ ...p, categoryId: e.target.value, subcategoryId: subcategoryOptions(e.target.value)[0]?.id || '' }))} className="adm-field-input">
                  {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </AdminField>
              <AdminField label="Subcategory">
                <select value={productForm.subcategoryId} onChange={(e) => setProductForm((p) => ({ ...p, subcategoryId: e.target.value }))} className="adm-field-input">
                  {subcategoryOptions(productForm.categoryId).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </AdminField>
            </div>
            </div>
            {editorError && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 6, color: '#c40000', fontSize: 13, flexShrink: 0 }}>
                {editorError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
              <button onClick={closeEditor} className="adm-btn-ghost"><ChevronLeft size={15} /> Cancel</button>
              <button onClick={() => void saveProduct()} className="adm-btn-red" disabled={editorImageUploading}>
                {saving === 'new-product' || saving === editingProduct?.id ? 'Saving…' : <><Check size={15} /> Save product</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <CrmContactsModal
        open={crmContactsOpen}
        onClose={() => setCrmContactsOpen(false)}
        contacts={crmFilteredCustomers}
        loading={crmLoading}
        search={crmSearch}
        onSearchChange={setCrmSearch}
        meta={crmMeta}
        onPageChange={(page) => void loadCrmCustomers(page)}
        onRefresh={() => void loadCrmCustomers(crmMeta.page || 1)}
        formatJoinStatus={formatJoinStatus}
        formatRelativeDate={formatRelativeDate}
        formatDateTime={formatDateTime}
      />
    </div>
  );
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

function AdminField({ label, children, full = false }) {
  return (
    <label style={{ display: 'grid', gap: 6, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
      {children}
    </label>
  );
}

function DrawerField({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="adm-drawer-field">
      <Icon size={14} className="adm-drawer-field-icon" />
      <div>
        <div className="adm-drawer-field-label">{label}</div>
        <div className="adm-drawer-field-value">{value}</div>
      </div>
    </div>
  );
}

function AdminStat({ label, value, accent }) {
  return (
    <div className={`adm-stat${accent ? ' adm-stat--accent' : ''}`}>
      <div className="adm-stat-value">{value}</div>
      <div className="adm-stat-label">{label}</div>
    </div>
  );
}

function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
      <button onClick={() => onChange(Math.max(1, page - 1))} className="adm-btn-ghost" disabled={page <= 1}><ChevronLeft size={15} /> Prev</button>
      <span className="adm-muted">Page {page} of {totalPages}</span>
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} className="adm-btn-ghost" disabled={page >= totalPages}>Next <ChevronRight size={15} /></button>
    </div>
  );
}
