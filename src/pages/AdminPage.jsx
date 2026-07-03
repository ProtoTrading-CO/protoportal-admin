import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  BarChart2,
  Bot,
  MessageCircle,
  Building2,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  CloudDownload,
  DollarSign,
  Eye,
  FileDown,
  Home,
  Plus,
  Globe,
  Grip,
  Image,
  ImagePlus,
  Layout,
  Loader2,
  Lock,
  Megaphone,
  Upload,
  Mail,
  MapPin,
  Menu,
  PackagePlus,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Send,
  Settings,
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
// xlsx is loaded on demand in the export handlers — keeps it out of the main bundle
import {
  bulkArchiveProducts,
  bulkMoveProducts,
  createProduct,
  fetchAdminProductsPage,
  fetchAllProductsAdmin,
  fetchCatalogArchiveCount,
  fetchDistinctCategories,
  fetchReorderProducts,
  applyPathFilter,
  invalidateAdminCache,
  invalidateProductCache,
  saveSortOrder,
  setLiveTaxonomyTree,
  updateProduct,
  uploadDormantImage,
} from '../lib/products';
import {
  categoryLabelFromTree,
  countSubcategoryProducts,
  createCategory,
  createSubcategory,
  deleteTaxonomyNode,
  fetchTaxonomy,
  fetchCategoryProductCounts,
  flattenSubcategories,
  renameTaxonomyNode,
  replaceFullTaxonomy,
  subcategoryOptionsFromTree,
} from '../lib/taxonomyAdmin';
import { approveCustomer, deleteCustomer, fetchCustomersPage, fetchProtoActiveCustomersPage, seedProtoActiveCustomers, updateProtoActiveCustomer, updateCustomerAdmin, deleteProtoActiveCustomer, syncBrevoContacts, pushPortalCustomersToBrevo, sendCustomerEmailBroadcast, fetchCrmContactsPage } from '../lib/customers';
import { BUSINESS_TYPES } from '../lib/businessTypes';
import { supabase } from '../lib/supabase';
import { buildOrderNoteSections, createEmailOrderItems, generateOrderPdfBase64, buildEmailItemsFromOrder, base64ToBlob, resolveCustomerOrderPricing, deriveAutoNotesFromItems } from '../lib/orderDocuments';
import { displayOrderNumber, buildFulfillmentUrl } from '../lib/orderNumber';
import { fetchPresaleInvoices, uploadPresaleInvoice } from '../lib/presaleInvoice';
import { fetchConfirmationSent, markConfirmationSent, fetchPaymentRecords, uploadPop, setPaymentStatus } from '../lib/orderPayment';
import { deleteOrderAdmin, fetchOrdersPage, updateOrderAdmin, advanceOrderWorkflow } from '../lib/orders';
import { orderMatchesTab, normalizeOrderStatus, getWorkflowAdvanceOptions, isOrderConfirmationSent } from '../lib/orderStatus';
import OrderWorkflowBadge from '../components/OrderWorkflowBadge';
import { fetchFulfillmentUsers, loadActiveUserId } from '../lib/fulfillmentUsers';
import { isVictorSender, CUSTOMER_SEND_FORBIDDEN, PAYMENT_RECEIVED_FORBIDDEN } from '../lib/fulfillmentAuth';
import { errorFromJson } from '../lib/apiError';
import { formatWebsitePrice } from '../lib/pricing';
import { fetchSpecials, saveSpecials } from '../lib/specials';
import { fuzzyFilter } from '../lib/fuzzySearch';
import ReorderGrid from '../components/ReorderGrid';
import CategorySidebar, { resolvePathLabels } from '../components/CategorySidebar';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import ComingSoonPanel from '../components/ComingSoonPanel';
import ApprovalPanel from '../components/ApprovalPanel';
import OrderWhatsappNotify from '../components/OrderWhatsappNotify';
import ProductManagerEngine from '../components/ProductManagerEngine';
import GroupedSidebar, { NAV_GROUPS } from '../components/GroupedSidebar';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';

// Section panels — lazy-loaded so the initial admin bundle only ships the
// default section (Product Manager). Each lazy chunk is fetched on demand
// when the admin clicks a nav item.
const AnalyticsHub = lazy(() => import('../components/AnalyticsHub'));
const ApolloPanel = lazy(() => import('../components/ApolloPanel'));
const CostTrackingPanel = lazy(() => import('../components/CostTrackingPanel'));
const ProductLoaderPanel = lazy(() => import('../components/ProductLoaderPanel'));
const CrmPanel = lazy(() => import('../components/CrmPanel'));
const WhatsappPanel = lazy(() => import('../components/WhatsappPanel'));
const BannerPanel = lazy(() => import('../components/BannerPanel'));
const SpecialsPanel = lazy(() => import('../components/SpecialsPanel'));

function SectionSuspenseFallback({ label = 'Loading…' }) {
  return (
    <div className="adm-panel" style={{ padding: 24, color: '#64748b' }} role="status" aria-live="polite">
      {label}
    </div>
  );
}

// Modal-only — chunk downloads the first time the admin opens the dialog.
const CustomerEmailModal = lazy(() => import('../components/CustomerEmailModal'));
const CrmContactsModal = lazy(() => import('../components/CrmContactsModal'));
const FulfillmentSettingsModal = lazy(() => import('../components/FulfillmentSettingsModal'));
import { sortOrderCategoryKey, sortOrderLookupKeys, LEGACY_NAV_ALIASES } from '../lib/taxonomy';
import {
  applySortOrdersToProducts,
  fetchSortOrderStore,
  invalidateSortOrderStore,
  persistSortOrder,
  sortMetaForPath,
  formatSortSavedAt,
  fetchSortMetaForCategory,
} from '../lib/sortOrderStore';
import categories from '../data/categories.json';

/** Merge a reordered visible slice back into the full product list (arrow-key reorder). */
function mergeVisibleReorder(prev, currentVisible, nextVisible) {
  if (nextVisible.length === prev.length) return nextVisible;
  const visibleIdSet = new Set(currentVisible.map((p) => p.id));
  if (nextVisible.length !== currentVisible.length) return prev;
  const result = [];
  let merged = false;
  for (const p of prev) {
    if (visibleIdSet.has(p.id)) {
      if (!merged) {
        result.push(...nextVisible);
        merged = true;
      }
    } else {
      result.push(p);
    }
  }
  if (!merged) result.push(...nextVisible);
  return result;
}

// Legacy flat nav removed — see GroupedSidebar.jsx

function LazySectionFallback({ label = 'Loading section…' }) {
  return (
    <div
      className="adm-panel"
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: '#64748b' }}
      role="status"
      aria-live="polite"
    >
      <Loader2 size={16} className="spin" /> {label}
    </div>
  );
}

const productTypes = ['General product', 'Hot seller', 'New stock', 'Clearance stock'];
const ADMIN_PAGE_SIZE = 50;
const randFormatter = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 4 });

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
const PRODUCT_IMAGE_SLOTS = [
  { key: 'image', label: 'Image 1 (primary)' },
  { key: 'secondaryImage', label: 'Image 2' },
  { key: 'imageThree', label: 'Image 3' },
  { key: 'imageFour', label: 'Image 4' },
];

// The product edit form mirrors the four taxonomy levels stored in the DB
// (category, subcategory_one … subcategory_four). Every `child*Id` is a slug
// `child*Id` is a slug from the taxonomy tree at that level — empty string
// means "no value at this level". Saving collapses these into the
// `categoryPath` array, which the API maps back to the DB columns.
const emptyForm = {
  code: '',
  name: '',
  description: '',
  packDescription: '',
  image: '',
  secondaryImage: '',
  imageThree: '',
  imageFour: '',
  price: '0',
  stockOnHand: '1',
  categoryId: categories[0]?.id || '',
  childOneId: categories[0]?.children?.[0]?.id || '',
  childTwoId: '',
  childThreeId: '',
  childFourId: '',
  productType: 'General product',
};

function categoryLabel(id, tree = categories) {
  return categoryLabelFromTree(tree, id);
}

function subcategoryOptions(categoryId, tree = categories) {
  return subcategoryOptionsFromTree(tree, categoryId);
}

/** Flatten every node in the tree to [{id, label, depth}] for parent-picker dropdowns. */
function allNodesFlat(nodes, depth = 0) {
  return (nodes || []).flatMap((n) => [
    { id: n.id, label: n.label, depth },
    ...allNodesFlat(n.children, depth + 1),
  ]);
}

/** Return array of ancestor IDs from root down to (but not including) targetId. */
function findNodePath(tree, targetId, path = []) {
  for (const node of (tree || [])) {
    if (node.id === targetId) return path;
    if (node.children?.length) {
      const found = findNodePath(node.children, targetId, [...path, node.id]);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Look up the children of a node by id within an arbitrary tree. */
function childrenOf(tree, id) {
  if (!id) return [];
  const stack = [...(tree || [])];
  while (stack.length) {
    const node = stack.shift();
    if (node.id === id) return node.children || [];
    if (node.children?.length) stack.push(...node.children);
  }
  return [];
}

/**
 * If `currentId` is set but not in `options`, prepend a synthetic entry so
 * the user can still see (and replace) a value that no longer maps to a
 * live taxonomy node — e.g. a subcategory that was renamed or deleted.
 */
function withCurrentOption(options, currentId) {
  if (!currentId || options.some((o) => o.id === currentId)) return options;
  return [{ id: currentId, label: `${currentId} (missing)` }, ...options];
}

/** Build the form's category state from a saved product's categoryPath. */
function categoryFormFromPath(categoryPath = [], tree = categories) {
  const categoryId = categoryPath[0] || tree[0]?.id || '';
  return {
    categoryId,
    childOneId: categoryPath[1] || '',
    childTwoId: categoryPath[2] || '',
    childThreeId: categoryPath[3] || '',
    childFourId: categoryPath[4] || '',
  };
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
  return items.map((item) => `${item.code}${item.name ? ` ${item.name}` : ''} × ${item.qty}`).join(', ');
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

function formatStockUnits(qty) {
  const n = qty === null || qty === undefined ? 0 : Number(qty);
  return `${Number.isFinite(n) ? n : 0} units`;
}

function productToForm(product, tree = categories) {
  return {
    code: product.code || '',
    name: product.name || '',
    description: product.description || '',
    packDescription: product.packDescription || '',
    image: product.image || product.images?.[0] || '',
    secondaryImage: product.secondaryImage || product.images?.[1] || '',
    imageThree: product.imageThree || product.images?.[2] || '',
    imageFour: product.imageFour || product.images?.[3] || '',
    price: String(product.price ?? 0),
    stockOnHand: product.stockOnHand != null ? String(product.stockOnHand) : '',
    ...categoryFormFromPath(product.categoryPath, tree),
    productType: getProductType(product),
  };
}

function WhatsappOptIn({ value }) {
  if (value == null) return <span className="adm-muted">—</span>;
  return value
    ? <Check size={16} color="#15803d" strokeWidth={3} aria-label="WhatsApp yes" />
    : <X size={16} color="#dc2626" strokeWidth={3} aria-label="WhatsApp no" />;
}

export default function AdminPage({ customer, onViewPortal, onSignOut }) {
  const [activeSection, setActiveSection] = useState('catalogue');
  // Apollo panel keeps its own state (chat, staged image ops). Track when it
  // was first opened so we can lazily mount it once and then keep it in the
  // DOM via CSS display, matching the pre-lazy behaviour.
  const [apolloEverActive, setApolloEverActive] = useState(false);
  useEffect(() => {
    if (activeSection === 'apollo') setApolloEverActive(true);
  }, [activeSection]);
  const [catalogStatus, setCatalogStatus] = useState('live');
  const [imageFixRequest, setImageFixRequest] = useState(null);
  const [productLoaderCode, setProductLoaderCode] = useState('');
  const { data: dashStats } = useDashboardStats();
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
  const editorImageFileInputRefs = useRef({});
  const [profileCustomer, setProfileCustomer] = useState(null);
  const [profileOrders, setProfileOrders] = useState([]);
  const [profileOrdersLoading, setProfileOrdersLoading] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [contentEditProduct, setContentEditProduct] = useState(null);
  const [contentEditForm, setContentEditForm] = useState({ image: '', description: '', packDescription: '', code: '' });
  const [contentEditSaving, setContentEditSaving] = useState(false);
  const [contentEditError, setContentEditError] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const imageFileInputRef = useRef(null);

  const [imageViewUrl, setImageViewUrl] = useState('');
  const [customerApproveBusy, setCustomerApproveBusy] = useState(false);
  const customerExcelRef = useRef(null);

  const [catalogTotal, setCatalogTotal] = useState(0);
  const [archiveCatalogTotal, setArchiveCatalogTotal] = useState(0);
  const [statsCustomerTotal, setStatsCustomerTotal] = useState(0);
  const [statsOrderTotal, setStatsOrderTotal] = useState(0);

  const [customerTab, setCustomerTab] = useState('regular');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchDebounced, setCustomerSearchDebounced] = useState('');
  const [customerBusinessType, setCustomerBusinessType] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerRows, setCustomerRows] = useState([]);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerEmailOpen, setCustomerEmailOpen] = useState(false);
  const [brevoSyncBusy, setBrevoSyncBusy] = useState(false);
  const [brevoPushBusy, setBrevoPushBusy] = useState(false);
  const [brevoLastSync, setBrevoLastSync] = useState(null);
  const [profileSource, setProfileSource] = useState('portal');
  const [approvalCodes, setApprovalCodes] = useState({});
  const [protoSeedBusy, setProtoSeedBusy] = useState(false);
  const [protoNameSaving, setProtoNameSaving] = useState(null);

  const [pricingCategory, setPricingCategory] = useState(categories[0]?.id || '');
  const [pricingSubcategory, setPricingSubcategory] = useState('all');
  const [pricingProducts, setPricingProducts] = useState([]);
  const [selectedPricing, setSelectedPricing] = useState([]);
  const [priceDelta, setPriceDelta] = useState('-10');

  const [reorderCategoryPath, setReorderCategoryPath] = useState([]);
  const [reorderSearch, setReorderSearch] = useState('');
  const [reorderProducts, setReorderProducts] = useState([]);
  const [reorderDirty, setReorderDirty] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderSortMeta, setReorderSortMeta] = useState({ updatedAt: null, storeUpdatedAt: null });
  const reorderStoreUpdatedAtRef = useRef(null);
  const reorderCacheByMainRef = useRef({});
  const reorderSaveTimerRef = useRef(null);
  const pendingReorderSaveRef = useRef(null);
  const [taxonomyTree, setTaxonomyTree] = useState(categories);
  const [toast, setToast] = useState(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveCategoryId, setMoveCategoryId] = useState('');
  const [moveChild1Id, setMoveChild1Id] = useState('');
  const [moveChild2Id, setMoveChild2Id] = useState('');
  const [moveChild3Id, setMoveChild3Id] = useState('');
  const [moveChild4Id, setMoveChild4Id] = useState('');
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [bulkFieldEditOpen, setBulkFieldEditOpen] = useState(false);
  const [bulkFieldEditType, setBulkFieldEditType] = useState('description');
  const [bulkFieldEditValue, setBulkFieldEditValue] = useState('');
  const [editTaxonomyModal, setEditTaxonomyModal] = useState(null);
  const [newSubModal, setNewSubModal] = useState(null);
  const [newCategoryModal, setNewCategoryModal] = useState(null);
  const [deleteSubModal, setDeleteSubModal] = useState(null);
  const [taxonomySaving, setTaxonomySaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
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
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderTabCounts, setOrderTabCounts] = useState(null);
  const [orderSearchDebounced, setOrderSearchDebounced] = useState('');
  const [focusOrderId, setFocusOrderId] = useState('');
  const [orderSubView, setOrderSubView] = useState('list');
  const [orderSearch, setOrderSearch] = useState('');
  const [fulfillmentSettingsOpen, setFulfillmentSettingsOpen] = useState(false);
  const [fulfillmentUsers, setFulfillmentUsers] = useState([]);
  const [activeFulfillmentUserId, setActiveFulfillmentUserId] = useState(loadActiveUserId);
  const [presaleInvoices, setPresaleInvoices] = useState({});
  const [presaleUploading, setPresaleUploading] = useState('');
  const [confirmationSent, setConfirmationSent] = useState({});
  const [paymentRecords, setPaymentRecords] = useState({});
  const [popUploading, setPopUploading] = useState('');

  // Weekly featured specials — state stays in AdminPage so the Product
  // Manager star toggle can add/remove without cross-tab coupling. The
  // Specials tab reads/writes via SpecialsPanel (see props below).
  const [specials, setSpecials] = useState([]);
  const [specialsSaving, setSpecialsSaving] = useState(false);

  const [crmAllCustomers, setCrmAllCustomers] = useState([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmFilters, setCrmFilters] = useState({ businessTypes: [], joinedStatuses: [] });
  const [crmSearch, setCrmSearch] = useState('');
  const [crmTemplates, setCrmTemplates] = useState([]);
  const [crmTemplatesLoading, setCrmTemplatesLoading] = useState(false);
  const [crmError, setCrmError] = useState('');
  const [crmSelectedTemplate, setCrmSelectedTemplate] = useState('');
  const [crmSending, setCrmSending] = useState(false);
  const [crmSentCount, setCrmSentCount] = useState(null);
  const [crmLastSentTemplate, setCrmLastSentTemplate] = useState('');
  const [crmMeta, setCrmMeta] = useState({ total: 0, totalFiltered: 0, page: 1, pageSize: 25, summary: null });
  const [crmContactsOpen, setCrmContactsOpen] = useState(false);



  const [categoryProductCounts, setCategoryProductCounts] = useState({});

  const mainCategories = useMemo(
    () => taxonomyTree.map((item) => ({ id: item.id, label: item.label })),
    [taxonomyTree],
  );
  const firstMainCategoryId = mainCategories[0]?.id || '';
  const reorderMainId = reorderCategoryPath[0] || mainCategories[0]?.id || '';

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

  useEffect(() => {
    const timer = setTimeout(() => setCustomerSearchDebounced(customerSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);
  useEffect(() => { setCustomerPage(1); }, [customerTab, customerSearchDebounced, customerBusinessType]);
  useEffect(() => {
    const timer = setTimeout(() => setOrderSearchDebounced(orderSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [orderSearch]);
  useEffect(() => { setOrderPage(1); }, [orderTab, orderSearchDebounced]);
  useEffect(() => { if (activeSection === 'crm') void loadCrmCustomers(1); }, [crmFilters.businessTypes.join('|'), crmFilters.joinedStatuses.join('|'), crmSearch]);
  useEffect(() => { if (activeSection === 'crm' && !crmTemplates.length && !crmTemplatesLoading) void loadCrmTemplates(); }, [activeSection, crmTemplates.length, crmTemplatesLoading]);
  // Banner + Specials own their own load effects — see BannerPanel and SpecialsPanel.


  const refreshDashboardStats = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
  };


  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = customerTab === 'proto-active'
        ? await fetchProtoActiveCustomersPage({ page: customerPage, pageSize: ADMIN_PAGE_SIZE, searchQuery: customerSearchDebounced })
        : await fetchCustomersPage({
          page: customerPage,
          pageSize: ADMIN_PAGE_SIZE,
          tab: customerTab,
          searchQuery: customerSearchDebounced,
          businessType: customerBusinessType,
        });
      setCustomerRows(data.rows);
      setCustomerTotal(data.total);
      if (data.migrationRequired && data.message) showToast(data.message, 'warning');
    } catch (err) {
      showToast(err.message || 'Failed to load customers', 'error');
      setCustomerRows([]);
      setCustomerTotal(0);
    } finally { setLoading(false); }
  };

  const importProtoActiveList = async () => {
    setProtoSeedBusy(true);
    try {
      const json = await seedProtoActiveCustomers();
      const dupNote = json.skippedDuplicates ? ` (${json.skippedDuplicates} duplicate emails merged)` : '';
      const nameNote = json.missingNames ? ` · ${json.withNames} with names, ${json.missingNames} still blank (edit inline)` : '';
      showToast(`Imported ${json.upserted} proto active customers${dupNote}${nameNote}`, 'success');
      setCustomerTab('proto-active');
      setCustomerPage(1);
      await loadCustomers();
    } catch (err) {
      showToast(err.message || 'Import failed — check console', 'error');
      console.error('proto active import:', err);
    } finally { setProtoSeedBusy(false); }
  };

  const saveProtoActiveName = async (row, field, value) => {
    const trimmed = String(value || '').trim();
    const current = String(row[field] || '').trim();
    if (trimmed === current) return;
    setProtoNameSaving(`${row.id}-${field}`);
    try {
      const updated = await updateProtoActiveCustomer(row.id, { [field]: trimmed || null });
      setCustomerRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
      if (profileCustomer?.id === row.id) setProfileCustomer((p) => ({ ...p, ...updated }));
      showToast('Saved', 'success');
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setProtoNameSaving(null);
    }
  };

  const handleBrevoSync = async () => {
    setBrevoSyncBusy(true);
    try {
      const json = await syncBrevoContacts();
      setBrevoLastSync(json.syncedAt || new Date().toISOString());
      showToast(`Synced ${json.upserted ?? json.succeeded ?? 0} contacts from Brevo`, 'success');
    } catch (err) {
      showToast(err.message || 'Brevo sync failed', 'error');
    } finally {
      setBrevoSyncBusy(false);
    }
  };

  const handlePushPortalToBrevo = async () => {
    if (!window.confirm('Push all approved + Proto Active customer emails to Brevo contacts?')) return;
    setBrevoPushBusy(true);
    try {
      const json = await pushPortalCustomersToBrevo();
      showToast(`Pushed ${json.pushed} portal emails to Brevo`, 'success');
    } catch (err) {
      showToast(err.message || 'Push to Brevo failed', 'error');
    } finally {
      setBrevoPushBusy(false);
    }
  };

  const removeProtoActiveCustomer = async (row) => {
    if (!window.confirm(`Remove ${row.name || row.email} from Proto Active list?`)) return;
    setSaving(`del-proto-${row.id}`);
    try {
      await deleteProtoActiveCustomer(row.id);
      await loadCustomers();
      if (profileCustomer?.id === row.id) closeCustomerProfile();
      showToast('Proto Active customer removed');
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    } finally {
      setSaving('');
    }
  };

  const loadCategoryWorkingSet = async (categoryId, target) => {
    setLoading(true);
    try {
      if (target === 'pricing') {
        const rows = await fetchReorderProducts({ mainCategory: categoryId });
        setPricingProducts(rows);
      }
      if (target === 'reorder') {
        await loadReorderProducts();
      }
    } catch (err) {
      showToast(err.message || 'Failed to load products', 'error');
    } finally { setLoading(false); }
  };

  const reorderNavPath = reorderCategoryPath;

  const reorderCacheKey = reorderCategoryPath.length ? reorderMainId : '__all__';

  const reorderCategoryKey = sortOrderCategoryKey(reorderNavPath, taxonomyTree);

  const mergeReorderIntoCategoryCache = useCallback((all, visible, categoryPath) => {
    if (!categoryPath?.length) return visible;
    const visibleIds = new Set(visible.map((p) => p.id));
    const merged = [];
    let vi = 0;
    for (const p of all) {
      if (visibleIds.has(p.id)) {
        if (vi < visible.length) merged.push(visible[vi++]);
      } else {
        merged.push(p);
      }
    }
    while (vi < visible.length) merged.push(visible[vi++]);
    return merged;
  }, []);

  const productsForSortSave = useCallback((orderedProducts, groupId) => {
    if (groupId && !reorderCategoryPath.length) {
      return orderedProducts.filter((p) => {
        const main = p.categoryPath?.[0] || p.category || '';
        return main === groupId || LEGACY_NAV_ALIASES[main] === groupId;
      });
    }
    return applyPathFilter(orderedProducts, reorderCategoryPath);
  }, [reorderCategoryPath]);

  const applyReorderView = useCallback(async (allRows) => {
    const store = await fetchSortOrderStore();
    const filtered = applyPathFilter(allRows, reorderNavPath);
    const ordered = applySortOrdersToProducts(filtered, reorderNavPath, taxonomyTree, store);
    if (reorderNavPath.length) {
      const meta = sortMetaForPath(store, reorderNavPath, taxonomyTree);
      setReorderSortMeta({ updatedAt: meta.updatedAt, storeUpdatedAt: store.updatedAt || null });
      reorderStoreUpdatedAtRef.current = store.updatedAt || null;
    }
    setReorderProducts((prev) => {
      if (prev.length === ordered.length && prev.every((p, i) => p.id === ordered[i]?.id)) return prev;
      return ordered;
    });
    return ordered;
  }, [reorderNavPath, taxonomyTree]);

  const loadReorderProducts = async ({ forceCatalog = false, mainId = reorderMainId } = {}) => {
    const loadAll = !reorderCategoryPath.length;
    const cacheKey = loadAll ? '__all__' : mainId;
    if (!loadAll && !mainId) {
      setReorderProducts([]);
      return;
    }
    const cached = reorderCacheByMainRef.current[cacheKey];
    const firstLoad = !cached;
    if (firstLoad || forceCatalog) setLoading(true);
    setLoadingError('');
    try {
      if (!cached || forceCatalog) {
        reorderCacheByMainRef.current[cacheKey] = await fetchReorderProducts({
          mainCategory: loadAll ? 'all' : mainId,
        });
      }
      await applyReorderView(reorderCacheByMainRef.current[cacheKey]);
      setReorderDirty(false);
    } catch (err) {
      setLoadingError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const commitReorderOrder = useCallback(async (orderedProducts, { groupId } = {}) => {
    if (reorderSearch.trim().length > 0) return;

    const navPath = groupId && !reorderCategoryPath.length
      ? [groupId]
      : reorderNavPath;

    if (!navPath.length) {
      showToast('Select a category in the sidebar to save order', 'error');
      return;
    }

    const categoryKey = sortOrderCategoryKey(navPath, taxonomyTree);
    if (!categoryKey) return;

    const slice = productsForSortSave(orderedProducts, groupId);
    const skuOrder = slice.map((p) => p.id);
    if (!skuOrder.length) return;

    setReorderSaving(true);
    try {
      const json = await persistSortOrder({
        categoryKey,
        skuOrder,
        legacyKeys: sortOrderLookupKeys(navPath, taxonomyTree).filter((k) => k !== categoryKey),
        expectedStoreUpdatedAt: reorderStoreUpdatedAtRef.current,
      });
      setReorderSortMeta({ updatedAt: json.updatedAt, storeUpdatedAt: json.storeUpdatedAt || null });
      reorderStoreUpdatedAtRef.current = json.storeUpdatedAt || null;
      setTimeout(() => {
        void fetchSortMetaForCategory(categoryKey).then((meta) => {
          if (!meta?.updatedAt) return;
          setReorderSortMeta({ updatedAt: meta.updatedAt, storeUpdatedAt: meta.storeUpdatedAt || null });
          reorderStoreUpdatedAtRef.current = meta.storeUpdatedAt || null;
        });
      }, 5000);
      setReorderDirty(false);
      if (reorderMainId && reorderCacheByMainRef.current[reorderCacheKey]) {
        const cachePath = reorderCategoryPath.length ? reorderCategoryPath : [reorderMainId];
        reorderCacheByMainRef.current[reorderCacheKey] = mergeReorderIntoCategoryCache(
          reorderCacheByMainRef.current[reorderCacheKey],
          orderedProducts,
          cachePath,
        );
      }
    } catch (err) {
      if (err.status === 409) {
        showToast(err.message || 'Someone else changed this order — refreshing', 'error');
        invalidateSortOrderStore();
        await loadReorderProducts({ forceCatalog: true });
        return;
      }
      showToast(err.message || 'Failed to save order', 'error');
      setReorderDirty(true);
    } finally {
      setReorderSaving(false);
    }
  }, [reorderSearch, reorderCategoryPath, reorderNavPath, reorderMainId, reorderCacheKey, taxonomyTree, productsForSortSave, mergeReorderIntoCategoryCache]);

  const scheduleReorderSave = useCallback((orderedProducts, meta) => {
    pendingReorderSaveRef.current = { orderedProducts, meta };
    if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current);
    reorderSaveTimerRef.current = setTimeout(() => {
      const pending = pendingReorderSaveRef.current;
      pendingReorderSaveRef.current = null;
      if (pending) void commitReorderOrder(pending.orderedProducts, pending.meta);
    }, 600);
  }, [commitReorderOrder]);

  useEffect(() => () => {
    if (reorderSaveTimerRef.current) clearTimeout(reorderSaveTimerRef.current);
  }, []);

  const reorderBrowseAll = !reorderCategoryPath.length;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const reloadTaxonomy = async () => {
    const tree = await fetchTaxonomy();
    setTaxonomyTree(tree);
    setLiveTaxonomyTree(tree);
    try {
      const counts = await fetchCategoryProductCounts();
      setCategoryProductCounts(counts);
    } catch { /* optional */ }
    return tree;
  };

  const handleTaxonomyConflict = async (err) => {
    if (err.status === 409) {
      showToast(err.message || 'Categories were changed by someone else — reloading', 'error');
      await reloadTaxonomy();
      return true;
    }
    return false;
  };

  const handleCategoryReorder = async (newTree) => {
    setTaxonomyTree(newTree);
    setLiveTaxonomyTree(newTree);
    setTaxonomySaving(true);
    try {
      await replaceFullTaxonomy(newTree);
      invalidateAdminCache();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      showToast('Category order saved — live site updates within ~30 seconds', 'success');
    } catch (err) {
      if (await handleTaxonomyConflict(err)) return;
      showToast(err.message || 'Failed to save category order', 'error');
      const reverted = await fetchTaxonomy();
      setTaxonomyTree(reverted);
      setLiveTaxonomyTree(reverted);
    } finally {
      setTaxonomySaving(false);
    }
  };

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
      // Upload the PDF straight to storage via a signed URL so we never hit
      // Vercel's 4.5 MB request-body limit (large PDFs used to 413 on send).
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

  useEffect(() => { if (activeSection === 'customers') void loadCustomers(); }, [activeSection, customerPage, customerTab, customerSearchDebounced, customerBusinessType]);
  useEffect(() => {
    if (activeSection !== 'customers') return;
    void fetchCrmContactsPage({ page: 1, pageSize: 1 })
      .then((data) => { if (data?.lastSyncedAt) setBrevoLastSync(data.lastSyncedAt); })
      .catch(() => {});
  }, [activeSection]);
  useEffect(() => { if (activeSection === 'pricing') void loadCategoryWorkingSet(pricingCategory, 'pricing'); }, [activeSection, pricingCategory]);
  useEffect(() => { void reloadTaxonomy(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get('section');
    const tab = params.get('orderTab');
    const focus = params.get('focusOrder');
    if (section) setActiveSection(section);
    if (tab) setOrderTab(tab);
    if (focus) setFocusOrderId(focus);
    if (section || tab || focus) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!focusOrderId || activeSection !== 'orders' || !orders.length) return;
    setExpandedOrderId(focusOrderId);
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-order-id="${focusOrderId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusOrderId('');
    }, 300);
    return () => clearTimeout(timer);
  }, [focusOrderId, activeSection, orders]);
  const reorderPathKey = reorderCategoryPath.join('/');

  useEffect(() => {
    if (activeSection !== 'reorder') return;
    if (!reorderCategoryPath.length && firstMainCategoryId) {
      setReorderCategoryPath([firstMainCategoryId]);
      return;
    }
    if (!reorderCategoryPath.length) return;

    const cached = reorderCacheByMainRef.current[reorderCacheKey];
    if (cached) {
      void applyReorderView(cached);
      return;
    }
    void loadReorderProducts();
  }, [activeSection, reorderCacheKey, reorderPathKey, firstMainCategoryId]);
  useEffect(() => { if (activeSection === 'orders') void loadOrders(); }, [activeSection, orderPage, orderTab, orderSearchDebounced]);
  useEffect(() => {
    if (activeSection !== 'orders') return undefined;
    fetchFulfillmentUsers()
      .then((rows) => setFulfillmentUsers(rows))
      .catch(() => {});
    const syncUser = () => setActiveFulfillmentUserId(loadActiveUserId());
    window.addEventListener('storage', syncUser);
    window.addEventListener('focus', syncUser);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('focus', syncUser);
    };
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'orders') return;
    const ids = orders.filter((o) => normalizeOrderStatus(o.status) === 'order sent').map((o) => o.id);
    if (!ids.length) return;
    fetchConfirmationSent(ids)
      .then((rows) => setConfirmationSent((prev) => ({ ...prev, ...rows })))
      .catch((err) => showToast(err.message || 'Failed to load confirmation status', 'error'));
  }, [activeSection, orders]);

  useEffect(() => {
    const ids = orders.filter((o) => normalizeOrderStatus(o.status) === 'order sent').map((o) => o.id);
    if (!ids.length) return;
    fetchPresaleInvoices(ids)
      .then((invoices) => setPresaleInvoices((prev) => ({ ...prev, ...invoices })))
      .catch((err) => showToast(err.message || 'Failed to load presale invoices', 'error'));
    fetchConfirmationSent(ids)
      .then((rows) => setConfirmationSent((prev) => ({ ...prev, ...rows })))
      .catch((err) => showToast(err.message || 'Failed to load confirmation status', 'error'));
  }, [activeSection, orderTab, orders]);

  useEffect(() => {
    if (activeSection !== 'orders' || orderTab !== 'paid') return;
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
  }, [activeSection, orderTab, orders, confirmationSentIds]);

  useEffect(() => {
    if (activeSection !== 'orders') return undefined;
    const refresh = () => { if (document.visibilityState === 'visible') void loadOrders(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [activeSection]);
  useEffect(() => { if (activeSection === 'crm' && !crmAllCustomers.length && !crmLoading) void loadCrmCustomers(1); }, [activeSection]);

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

  const uploadEditorImageFile = async (file, slotKey) => {
    if (!file || !file.type.startsWith('image/')) {
      setEditorError('Only image files are supported.');
      return;
    }
    setEditorImageUploading(true);
    setEditorError('');
    try {
      const url = await uploadDormantImage(file);
      setProductForm((current) => ({ ...current, [slotKey]: url }));
    } catch (err) {
      setEditorError(err.message || 'Image upload failed');
    } finally {
      setEditorImageUploading(false);
    }
  };

  const stats = useMemo(() => ({
    products: dashStats?.liveProducts ?? catalogTotal,
    archived: dashStats?.archivedProducts ?? archiveCatalogTotal,
    customers: dashStats?.customers ?? statsCustomerTotal,
    orders: dashStats?.orders ?? statsOrderTotal,
  }), [dashStats, catalogTotal, archiveCatalogTotal, statsCustomerTotal, statsOrderTotal]);

  const activeSectionLabel = useMemo(
    () => NAV_GROUPS.find((item) => item.id === activeSection)?.label || 'Admin',
    [activeSection],
  );

  const orderRows = orders;

  const openNewProduct = () => {
    const firstCategory = taxonomyTree[0]?.id || categories[0]?.id || '';
    const firstChild = subcategoryOptions(firstCategory, taxonomyTree)[0]?.id || '';
    setEditingProduct(null);
    setProductForm({
      ...emptyForm,
      categoryId: firstCategory,
      childOneId: firstChild,
      childTwoId: '',
      childThreeId: '',
      childFourId: '',
    });
    setEditorError('');
    setEditorImageUploading(false);
    setEditorImageDragOver('');
    setEditorOpen(true);
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm(productToForm(product, taxonomyTree));
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

  const swapEditorImageSlots = (index) => {
    setProductForm((current) => {
      const keys = PRODUCT_IMAGE_SLOTS.map((s) => s.key);
      const next = { ...current };
      const a = keys[index];
      const b = keys[index + 1];
      if (!a || !b) return current;
      next[a] = current[b] || '';
      next[b] = current[a] || '';
      return next;
    });
  };

  const clearEditorImage = (slotKey) => {
    setProductForm((current) => ({ ...current, [slotKey]: '' }));
  };

  const openContentEdit = (product) => {
    setContentEditProduct(product);
    setContentEditForm({
      image: product.image || '',
      description: product.description || '',
      packDescription: product.packDescription || '',
      code: product.code || product.barcode || '',
    });
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
        packDescription: contentEditForm.packDescription,
        code: contentEditForm.code?.trim() || '',
      });
      // Update local lists so image/description reflects the change without a full reload
      const patch = {
        image: contentEditForm.image.trim(),
        description: contentEditForm.description,
        packDescription: contentEditForm.packDescription,
        code: contentEditForm.code?.trim() || '',
        barcode: contentEditForm.code.trim(),
      };
      setReorderProducts((prev) => prev.map((p) => p.id === contentEditProduct.id ? { ...p, ...patch } : p));
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      invalidateProductCache();
      closeContentEdit();
    } catch (err) {
      setContentEditError(err.message || 'Save failed');
    } finally {
      setContentEditSaving(false);
    }
  };

  const refreshCurrentSection = async () => {
    if (activeSection === 'customers') return loadCustomers();
    if (activeSection === 'pricing') return loadCategoryWorkingSet(pricingCategory, 'pricing');
    if (activeSection === 'reorder') return loadReorderProducts();
    if (activeSection === 'orders') return loadOrders();
  };

  const saveProduct = async () => {
    const categoryPath = [
      productForm.categoryId,
      productForm.childOneId,
      productForm.childTwoId,
      productForm.childThreeId,
      productForm.childFourId,
    ].filter(Boolean);

    if (!categoryPath.length) {
      setEditorError('Pick a main category before saving — every product needs a category.');
      return;
    }

    const payload = {
      code: productForm.code.trim(),
      name: productForm.name.trim(),
      description: productForm.description,
      packDescription: productForm.packDescription,
      image: productForm.image.trim(),
      secondaryImage: productForm.secondaryImage.trim(),
      imageThree: productForm.imageThree.trim(),
      imageFour: productForm.imageFour.trim(),
      price: Number(productForm.price || 0),
      stockOnHand: Number(productForm.stockOnHand || 0),
      categoryPath,
      ...typePatch(productForm.productType, editingProduct || {}),
    };
    setSaving(editingProduct?.id || 'new-product');
    try {
      await (editingProduct ? updateProduct(editingProduct.id, payload) : createProduct(payload));
      closeEditor();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      invalidateProductCache();
      invalidateAdminCache();
    } catch (err) {
      setEditorError(err.message || 'Save failed');
    } finally { setSaving(''); }
  };



  const loadCrmCustomers = async (page = crmMeta.page || 1) => {
    setCrmLoading(true);
    setCrmError('');
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
    } catch (e) {
      console.error(e);
      setCrmError(e.message || 'Failed to load WhatsApp contacts');
    }
    finally { setCrmLoading(false); }
  };

  const loadCrmTemplates = async () => {
    setCrmTemplatesLoading(true);
    setCrmError('');
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
      setCrmError(e.message || 'Failed to load WhatsApp templates — check WATI_API_TOKEN');
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

  // Banner + Specials editors now live in BannerPanel / SpecialsPanel.



  const reorderSearchActive = reorderSearch.trim().length > 0;

  const visibleReorderProducts = useMemo(() => {
    const q = reorderSearch.trim();
    if (q) return fuzzyFilter(reorderProducts, q);
    return applyPathFilter(reorderProducts, reorderNavPath);
  }, [reorderProducts, reorderNavPath, reorderSearch]);

  const handleReorderProductsChange = useCallback((nextOrFn) => {
    setReorderProducts((prev) => {
      if (typeof nextOrFn === 'function') return nextOrFn(prev);
      const pathFiltered = applyPathFilter(prev, reorderNavPath);
      const q = reorderSearch.trim();
      const currentVisible = q ? fuzzyFilter(pathFiltered, q) : pathFiltered;
      return mergeVisibleReorder(prev, currentVisible, nextOrFn);
    });
    setReorderDirty(true);
  }, [reorderNavPath, reorderSearch]);

  const saveReorderOrder = async () => {
    if (reorderSearchActive) {
      showToast('Clear search before saving sort order', 'error');
      return;
    }
    await commitReorderOrder(reorderProducts);
    showToast('Sort order saved to live site', 'success');
  };

  const toggleSelectAllReorder = () => {
    const ids = visibleReorderProducts.map((p) => p.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(ids));
  };

  const openMoveModal = () => {
    setMoveCategoryId(reorderMainId || mainCategories[0]?.id || '');
    setMoveChild1Id('');
    setMoveChild2Id('');
    setMoveChild3Id('');
    setMoveChild4Id('');
    setMoveModalOpen(true);
  };

  const confirmBulkMove = async () => {
    const categoryPathIds = [
      moveCategoryId,
      moveChild1Id,
      moveChild2Id,
      moveChild3Id,
      moveChild4Id,
    ].filter(Boolean);
    const finalSubId = moveChild4Id || moveChild3Id || moveChild2Id || moveChild1Id;
    if (!selectedIds.size || categoryPathIds.length < 2) {
      showToast('Choose a main category and at least one subcategory', 'error');
      return;
    }
    const destinationLabel = resolvePathLabels(taxonomyTree, categoryPathIds).join(' › ');
    if (!window.confirm(`Move ${selectedIds.size} product(s) to:\n${destinationLabel}?`)) return;
    setSaving('bulk-move');
    const count = selectedIds.size;
    try {
      await bulkMoveProducts({
        skus: [...selectedIds],
        categoryId: moveCategoryId,
        subcategoryId: finalSubId,
        categoryPathIds,
      });
      setMoveModalOpen(false);
      setSelectedIds(new Set());
      setReorderCategoryPath(categoryPathIds);
      invalidateAdminCache();
      invalidateProductCache();
      await loadReorderProducts({ forceCatalog: true, mainId: moveCategoryId });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      void fetchCategoryProductCounts().then(setCategoryProductCounts).catch(() => {});
      showToast(`Moved ${count} product(s) to ${destinationLabel}`);
    } catch (err) {
      if (err.partial && err.result?.moved) {
        setMoveModalOpen(false);
        setSelectedIds(new Set());
        invalidateAdminCache();
        queryClient.invalidateQueries({ queryKey: ['catalog'] });
        void loadReorderProducts({ forceCatalog: true, mainId: moveCategoryId });
      }
      showToast(err.message || 'Move failed', err.partial ? 'warning' : 'error');
    } finally { setSaving(''); }
  };

  const confirmBulkFieldEdit = async () => {
    if (!selectedIds.size || !bulkFieldEditValue.trim()) {
      showToast('Enter a value to apply', 'error');
      return;
    }
    setSaving('bulk-field-edit');
    const skus = [...selectedIds];
    const field = bulkFieldEditType;
    const value = bulkFieldEditValue.trim();
    try {
      await Promise.all(skus.map((sku) => updateProduct(sku, { [field]: value })));
      const patch = { [field]: value };
      setReorderProducts((prev) => prev.map((p) => selectedIds.has(p.id) ? { ...p, ...patch } : p));
      setBulkFieldEditOpen(false);
      setBulkFieldEditValue('');
      showToast(`Updated ${skus.length} product(s)`);
    } catch (err) {
      showToast(err.message || 'Bulk edit failed', 'error');
    } finally { setSaving(''); }
  };

  const confirmBulkArchive = async () => {
    const count = selectedIds.size;
    setSaving('bulk-archive');
    try {
      await bulkArchiveProducts([...selectedIds]);
      invalidateAdminCache();
      invalidateProductCache();
      setArchiveConfirmOpen(false);
      setSelectedIds(new Set());
      await refreshDashboardStats();
      await loadReorderProducts();
      showToast(`Archived ${count} product(s)`);
    } catch (err) {
      showToast(err.message || 'Archive failed', 'error');
    } finally { setSaving(''); }
  };

  const saveTaxonomyRename = async () => {
    if (!editTaxonomyModal?.label?.trim()) return;
    setTaxonomySaving(true);
    try {
      await renameTaxonomyNode(editTaxonomyModal.id, editTaxonomyModal.label.trim());
      await reloadTaxonomy();
      invalidateAdminCache();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      await loadReorderProducts();
      setEditTaxonomyModal(null);
      showToast('Category updated');
    } catch (err) {
      if (await handleTaxonomyConflict(err)) {
        setEditTaxonomyModal(null);
        return;
      }
      showToast(err.message || 'Update failed', 'error');
    } finally { setTaxonomySaving(false); }
  };

  const saveNewSubcategory = async () => {
    if (!newSubModal?.label?.trim() || !newSubModal?.parentId) return;
    setTaxonomySaving(true);
    try {
      const json = await createSubcategory(newSubModal.parentId, newSubModal.label.trim());
      await reloadTaxonomy();
      invalidateAdminCache();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      if (json.node?.id) {
        const parentPath = findNodePath(taxonomyTree, newSubModal.parentId) || [];
        const newId = json.node.id;
        setMoveCategoryId(parentPath[0] || newSubModal.parentId);
        setMoveChild1Id(parentPath.length === 0 ? newId : (parentPath[1] || newSubModal.parentId));
        setMoveChild2Id(parentPath.length === 1 ? newId : (parentPath.length >= 2 ? newSubModal.parentId : ''));
        setMoveChild3Id(parentPath.length === 2 ? newId : (parentPath.length >= 3 ? newSubModal.parentId : ''));
        setMoveChild4Id(parentPath.length >= 3 ? newId : '');
      }
      setNewSubModal(null);
      if (selectedIds.size > 0) setMoveModalOpen(true);
      showToast(json.created ? 'Subcategory created' : 'Subcategory already exists');
    } catch (err) {
      if (await handleTaxonomyConflict(err)) {
        setNewSubModal(null);
        return;
      }
      showToast(err.message || 'Create failed', 'error');
    } finally { setTaxonomySaving(false); }
  };

  const saveNewCategory = async () => {
    if (!newCategoryModal?.label?.trim()) return;
    setTaxonomySaving(true);
    try {
      const json = await createCategory(newCategoryModal.label.trim());
      await reloadTaxonomy();
      invalidateAdminCache();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      setNewCategoryModal(null);
      showToast(json.created ? 'Category created' : 'Category already exists');
    } catch (err) {
      if (await handleTaxonomyConflict(err)) {
        setNewCategoryModal(null);
        return;
      }
      showToast(err.message || 'Create failed', 'error');
    } finally { setTaxonomySaving(false); }
  };

  const openDeleteSubcategory = async (sub) => {
    setTaxonomySaving(true);
    try {
      const productCount = await countSubcategoryProducts(sub.id);
      setDeleteSubModal({ ...sub, productCount });
    } catch (err) {
      // Counting is best-effort — still let the user delete (products are kept).
      setDeleteSubModal({ ...sub, productCount: 0 });
    } finally { setTaxonomySaving(false); }
  };

  const confirmDeleteSubcategory = async () => {
    if (!deleteSubModal?.id) return;
    setTaxonomySaving(true);
    try {
      await deleteTaxonomyNode(deleteSubModal.id);
      await reloadTaxonomy();
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      if (reorderCategoryPath.includes(deleteSubModal.id)) setReorderCategoryPath((prev) => prev.filter((id) => id !== deleteSubModal.id));
      invalidateAdminCache();
      await loadReorderProducts();
      const isCat = deleteSubModal.type === 'category';
      setDeleteSubModal(null);
      showToast(isCat ? 'Category deleted' : 'Subcategory deleted');
    } catch (err) {
      if (await handleTaxonomyConflict(err)) {
        setDeleteSubModal(null);
        return;
      }
      showToast(err.message || 'Delete failed', 'error');
    } finally { setTaxonomySaving(false); }
  };

  const toggleSelectReorder = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };





  const handleCustomerExcelApprove = async (file) => {
    if (!file) return;
    setCustomerApproveBusy(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const emails = rows.flatMap((row) => {
        const val = row.email || row.Email || row.EMAIL || Object.values(row)[0];
        return val ? [String(val).trim().toLowerCase()] : [];
      }).filter(Boolean);
      const res = await fetch('/api/approve-customers-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Bulk approve failed');
      await refreshPendingCount();
      await loadCustomers();
      showToast(`Approved ${json.approved || 0}${json.notFound?.length ? `, ${json.notFound.length} not found` : ''}`);
    } catch (err) {
      showToast(err.message || 'Excel approve failed', 'error');
    } finally {
      setCustomerApproveBusy(false);
    }
  };

  const goHome = () => setActiveSection('orders');



  const moveSelectedToTop = () => {
    if (!selectedIds.size) return;
    setReorderProducts((prev) => {
      const moving = prev.filter((p) => selectedIds.has(p.id));
      const rest = prev.filter((p) => !selectedIds.has(p.id));
      return [...moving, ...rest];
    });
    setReorderDirty(true);
    setSelectedIds(new Set());
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
      const nextSpecials = [...specials];
      const specialsIds = new Set(specials.map((s) => s.productId));
      for (const product of selected) {
        if (specialsIds.has(product.id)) continue;
        if (nextSpecials.length >= 10) break;
        nextSpecials.push({
          productId: product.id,
          productName: product.name,
          productCode: product.code,
          productImage: product.image || '',
          deal: 'none',
          discountPct: 10,
          bogoX: 1,
          bogoY: 1,
        });
        specialsIds.add(product.id);
      }
      if (nextSpecials.length !== specials.length) {
        await saveSpecials(nextSpecials);
        setSpecials(nextSpecials);
      }
      await loadCategoryWorkingSet(pricingCategory, 'pricing');
      showToast(`Updated ${selected.length} product price(s) — added to This Week's Specials`);
    } finally { setSaving(''); }
  };

  const openCustomerProfile = async (person, source = 'portal') => {
    setProfileCustomer(person);
    setProfileSource(source);
    setProfileEditing(false);
    setProfileOrders([]);
    if (source === 'proto-active') return;
    setProfileOrdersLoading(true);
    try {
      const res = await fetch(`/api/admin-orders?customerId=${person.id}&limit=20`);
      const json = await res.json();
      setProfileOrders(json.rows || []);
    } catch { /* silent */ }
    finally { setProfileOrdersLoading(false); }
  };

  const closeCustomerProfile = () => { setProfileCustomer(null); setProfileOrders([]); setProfileEditing(false); setProfileSource('portal'); };

  const SPEND_BANDS = ['R0 – R5,000', 'R5,000 – R10,000', 'R10,000 – R25,000', 'R25,000 – R50,000', 'R50,000+'];
  const startEditProfile = () => {
    setProfileForm({
      name: profileCustomer.name || '',
      email: profileCustomer.email || '',
      phone: profileCustomer.phone || '',
      business_name: profileCustomer.business_name || profileCustomer.name || '',
      business_type: profileCustomer.business_type || '',
      monthly_spend: profileCustomer.monthly_spend || '',
      website: profileCustomer.website || '',
      vat_number: profileCustomer.vat_number || '',
      company_address: profileCustomer.company_address || '',
      delivery_address: profileCustomer.delivery_address || '',
      contact_name: profileCustomer.contact_name || '',
      first_name: profileCustomer.first_name || '',
      account_code: profileCustomer.account_code || profileCustomer.customer_code || '',
    });
    setProfileEditing(true);
  };
  const saveProfileEdit = async () => {
    setSavingProfile(true);
    try {
      if (profileSource === 'proto-active') {
        const row = await updateProtoActiveCustomer(profileCustomer.id, {
          name: profileForm.business_name || profileForm.name,
          email: profileForm.email,
          contact_name: profileForm.contact_name,
          first_name: profileForm.first_name,
          account_code: profileForm.account_code,
        });
        setProfileCustomer(row);
        setProfileEditing(false);
        await loadCustomers();
        showToast('Proto Active customer updated');
      } else {
        const row = await updateCustomerAdmin(profileCustomer.id, profileForm);
        setProfileCustomer(row);
        setProfileEditing(false);
        await loadCustomers();
        showToast('Customer profile updated');
      }
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally { setSavingProfile(false); }
  };
  const setPf = (key) => (e) => setProfileForm((f) => ({ ...f, [key]: e.target.value }));

  const refreshPendingCount = async () => {
    try {
      const data = await fetchCustomersPage({ tab: 'requests', pageSize: 1, searchQuery: '' });
      setPendingCount(data.total || 0);
    } catch {}
  };

  const approveRequest = async (person) => {
    const customerCode = String(approvalCodes[person.id] || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(customerCode)) {
      showToast('Enter a 6-character customer code before approving', 'error');
      return;
    }
    setSaving(person.id);
    try {
      const result = await approveCustomer(person.id, true, { customerCode });
      if (result.watiWelcome === 'failed') {
        showToast('Approved, but WhatsApp welcome message failed to send', 'error');
      }
      setApprovalCodes((prev) => {
        const next = { ...prev };
        delete next[person.id];
        return next;
      });
      await refreshPendingCount();
      await refreshDashboardStats();
      setCustomerTab('regular');
      setCustomerPage(1);
      await loadCustomers();
      closeCustomerProfile();
      showToast(`${person.business_name || person.name || 'Customer'} approved`);
    } catch (err) {
      showToast(err.message || 'Approval failed', 'error');
    } finally { setSaving(''); }
  };

  const removeCustomer = async (person, source = profileSource) => {
    if (!window.confirm(`Delete ${person.name || person.email}? This cannot be undone.`)) return;
    const savingKey = source === 'proto-active' ? `del-proto-${person.id}` : `del-${person.id}`;
    setSaving(savingKey);
    try {
      if (source === 'proto-active') {
        await deleteProtoActiveCustomer(person.id);
      } else {
        await deleteCustomer(person.id);
      }
      await loadCustomers();
      closeCustomerProfile();
      showToast('Customer removed');
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    } finally { setSaving(''); }
  };

  const deactivateCustomer = async (person) => {
    if (!window.confirm(`Deactivate ${person.name || person.email}? They will lose portal access.`)) return;
    setSaving(`deact-${person.id}`);
    try {
      await updateCustomerAdmin(person.id, { is_approved: false });
      await loadCustomers();
      closeCustomerProfile();
      showToast('Customer deactivated');
    } catch (err) {
      showToast(err.message || 'Deactivate failed', 'error');
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

  const deleteOrder = async (order) => {
    if (!window.confirm(`Delete order ${order.order_number || order.id}? This cannot be undone.`)) return;
    setSaving(`del-order-${order.id}`);
    try {
      await deleteOrderAdmin(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      // Keep the top stats bar in sync — drop the count immediately, then
      // reconcile with the server in the background.
      setStatsOrderTotal((n) => Math.max(0, n - 1));
      void refreshDashboardStats();
    } finally { setSaving(''); }
  };

  const updateOrder = async (order, patch) => {
    setSaving(order.id);
    try {
      const updated = await updateOrderAdmin(order.id, patch);
      setOrders((prev) => prev.map((item) => item.id === order.id ? updated : item));
      return updated;
    } catch (err) {
      showToast(err.message || 'Failed to update order', 'error');
      throw err;
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

  const orderPages = Math.max(1, Math.ceil(orderTotal / ADMIN_PAGE_SIZE));

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
              <span className="adm-mobile-section-label">{activeSectionLabel}</span>
            </div>
          </div>
          <div className="adm-header-actions">
            <button type="button" onClick={goHome} className="adm-btn-ghost"><Home size={15} /><span className="adm-btn-text">Home</span></button>
            <button onClick={() => void refreshCurrentSection()} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
            <button onClick={onViewPortal} className="adm-btn-ghost"><ArrowLeftRight size={15} /><span className="adm-btn-text">Portal</span></button>
            {onSignOut && (
              <button type="button" onClick={onSignOut} className="adm-btn-ghost" title={customer?.email || 'Sign out'}>
                <Lock size={15} /><span className="adm-btn-text">Sign out</span>
              </button>
            )}
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
            <GroupedSidebar
              activeSection={activeSection}
              onSelectSection={(id) => {
                if (id === 'team') {
                  setFulfillmentSettingsOpen(true);
                  setSidebarOpen(false);
                  return;
                }
                setActiveSection(id);
                setLoadingError('');
                setSidebarOpen(false);
                if (id === 'catalogue' || id === 'reorder' || id === 'apollo') {
                  window.scrollTo({ top: 0, behavior: 'instant' });
                }
              }}
              pendingCount={pendingCount}
            />
          </aside>

          <main className="adm-main">
            {loadingError && (
              <div style={{ margin: '12px 0', padding: '10px 16px', background: '#fef2f2', borderRadius: 8, color: '#c40000', fontSize: 13, fontWeight: 600 }}>
                Error: {loadingError}
              </div>
            )}

            <div style={{ display: activeSection === 'catalogue' ? 'block' : 'none' }}>
              <ProductManagerEngine
                taxonomyTree={taxonomyTree}
                onShowToast={showToast}
                onRefreshStats={refreshDashboardStats}
                initialStatus={catalogStatus}
                onEditProduct={(item) => openEditProduct(item)}
                onEditCategory={setEditTaxonomyModal}
                onAddCategory={() => setNewCategoryModal({ label: '' })}
                onAddSubcategory={(parentId) => setNewSubModal({ parentId, label: '' })}
                onDeleteSubcategory={(sub) => void openDeleteSubcategory(sub)}
                onDeleteNode={(node) => void openDeleteSubcategory(node)}
                onRefreshTaxonomy={reloadTaxonomy}
                onCategoryReorder={handleCategoryReorder}
                categoryProductCounts={categoryProductCounts}
                onImageFix={(products) => {
                  setImageFixRequest({ id: Date.now(), products });
                  setActiveSection('apollo');
                  window.scrollTo({ top: 0, behavior: 'instant' });
                }}
              />
            </div>

            {activeSection === 'analytics' && (
              <Suspense fallback={<LazySectionFallback label="Loading Analytics…" />}>
                <AnalyticsHub />
              </Suspense>
            )}

            {/* Apollo — keep mounted after first open so chat survives tab switches. */}
            {apolloEverActive && (
              <div style={{ display: activeSection === 'apollo' ? 'block' : 'none' }}>
                <Suspense fallback={<LazySectionFallback label="Loading Apollo…" />}>
                  <ApolloPanel
                    isActive={activeSection === 'apollo'}
                    taxonomyTree={taxonomyTree}
                    onShowToast={showToast}
                    onGoToApproval={() => { setCatalogStatus('approval'); setActiveSection('catalogue'); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                    onGoToProductLoader={(code) => {
                      setProductLoaderCode(String(code || '').trim());
                      setActiveSection('product-loader');
                    }}
                    onRefreshCatalog={() => {
                      window.dispatchEvent(new CustomEvent('proto-approval-refresh'));
                      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
                      refreshDashboardStats();
                    }}
                    imageFixRequest={imageFixRequest}
                    onImageFixRequestHandled={() => setImageFixRequest(null)}
                  />
                </Suspense>
              </div>
            )}

            {activeSection === 'cost-tracking' && (
              <Suspense fallback={<LazySectionFallback label="Loading Cost Tracking…" />}>
                <CostTrackingPanel onShowToast={showToast} />
              </Suspense>
            )}

            {activeSection === 'product-loader' && (
              <Suspense fallback={<LazySectionFallback label="Loading Product Loader…" />}>
                <ProductLoaderPanel
                  taxonomyTree={taxonomyTree}
                  onShowToast={showToast}
                  initialCode={productLoaderCode}
                  onInitialCodeConsumed={() => setProductLoaderCode('')}
                  onGoToApollo={(productsOrSku) => {
                    const products = Array.isArray(productsOrSku)
                      ? productsOrSku
                      : [{
                        id: String(productsOrSku || ''),
                        sku: String(productsOrSku || ''),
                        name: String(productsOrSku || ''),
                        title: String(productsOrSku || ''),
                      }];
                    if (!products[0]?.sku) return;
                    setImageFixRequest({ id: Date.now(), products });
                    setActiveSection('apollo');
                  }}
                />
              </Suspense>
            )}



            {/* SPECIALS */}
            {activeSection === 'specials' && (
              <Suspense fallback={<SectionSuspenseFallback label="Loading Specials…" />}>
                <SpecialsPanel
                  specials={specials}
                  onSpecialsChange={setSpecials}
                  onShowToast={showToast}
                />
              </Suspense>
            )}



            {/* REORDER */}
            {activeSection === 'reorder' && (
              <SectionErrorBoundary name="reorder-grid" title="Reorder Grid crashed" resetKey={reorderCacheKey}>
              <div className="adm-panel adm-panel--reorder">
                <div className="adm-section-head adm-section-head--reorder">
                  <div>
                    <h2 className="adm-section-title">Reorder Grid</h2>
                    <p className="adm-section-note">Matches the live trade portal order (cached). Pick a category in the sidebar — drag to reorder within that category. Changes save automatically after you drop.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {reorderSortMeta.updatedAt && formatSortSavedAt(reorderSortMeta.updatedAt) && (
                      <span className="adm-pill adm-pill--ok">
                        Order saved · {formatSortSavedAt(reorderSortMeta.updatedAt)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void saveReorderOrder()}
                      className="adm-btn-red"
                      disabled={!reorderDirty || reorderSaving || reorderSearchActive}
                    >
                      {reorderSaving ? 'Saving…' : 'Save order'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedIds(new Set());
                        setReorderDirty(false);
                        reorderCacheByMainRef.current = {};
                        invalidateSortOrderStore();
                        invalidateAdminCache();
                        void loadReorderProducts({ forceCatalog: true, mainId: reorderMainId });
                      }}
                      className="adm-btn-ghost"
                      type="button"
                    >
                      <RefreshCw size={14} /> Refresh
                    </button>
                  </div>
                </div>

                <div className="adm-reorder-toolbar">
                  <div className="adm-reorder-toolbar__filters">
                    <label className="adm-search" style={{ minWidth: 220 }}>
                      <Search size={14} />
                      <input
                        value={reorderSearch}
                        onChange={(e) => setReorderSearch(e.target.value)}
                        placeholder="Search name, code, barcode…"
                        className="adm-search-input"
                      />
                      {reorderSearchActive && (
                        <button
                          type="button"
                          className="adm-icon-btn"
                          onClick={() => setReorderSearch('')}
                          title="Clear search"
                          style={{ padding: 2 }}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </label>
                    <span className="adm-reorder-count">
                      {visibleReorderProducts.length} {reorderSearchActive ? `match${visibleReorderProducts.length === 1 ? '' : 'es'}` : 'live products'}
                    </span>
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn--sm"
                      onClick={toggleSelectAllReorder}
                      disabled={!visibleReorderProducts.length}
                    >
                      {visibleReorderProducts.length > 0 && visibleReorderProducts.every((p) => selectedIds.has(p.id))
                        ? 'Deselect all'
                        : `Select all (${visibleReorderProducts.length})`}
                    </button>
                    {reorderDirty && !reorderSearchActive && (
                      <span className="adm-pill adm-pill--warn">Unsaved order</span>
                    )}
                  </div>
                </div>

                {selectedIds.size > 0 && (
                  <div className="adm-bulk-bar" role="region" aria-label="Bulk actions">
                    <div className="adm-bulk-bar__left">
                      <span className="adm-bulk-bar__badge">{selectedIds.size}</span>
                      <span className="adm-bulk-bar__count">selected</span>
                      <button type="button" className="adm-bulk-bar__link" onClick={toggleSelectAllReorder}>
                        {visibleReorderProducts.length > 0 && visibleReorderProducts.every((p) => selectedIds.has(p.id))
                          ? 'Deselect all'
                          : `Select all (${visibleReorderProducts.length})`}
                      </button>
                    </div>
                    <div className="adm-bulk-bar__actions">
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => { setBulkFieldEditType('description'); setBulkFieldEditValue(''); setBulkFieldEditOpen(true); }} disabled={!!saving}>
                        Edit description
                      </button>
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => { setBulkFieldEditType('code'); setBulkFieldEditValue(''); setBulkFieldEditOpen(true); }} disabled={!!saving}>
                        Edit barcode
                      </button>
                      <button type="button" className="adm-btn-red adm-btn--sm" onClick={openMoveModal} disabled={!!saving}>
                        <ArrowLeftRight size={15} /> Move
                      </button>
                      <button type="button" className="adm-btn-ghost adm-btn--sm adm-btn-ghost--danger" onClick={() => setArchiveConfirmOpen(true)} disabled={!!saving}>
                        <Archive size={15} /> Archive
                      </button>
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={moveSelectedToTop} disabled={!!saving}>To top</button>
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
                    </div>
                  </div>
                )}

                <div className="adm-reorder-layout adm-panel-with-sidebar">
                  <aside className="adm-panel-sidebar adm-reorder-tree-sidebar">
                    <div className="adm-reorder-cat-heading">
                      <span>Categories</span>
                      <button
                        type="button"
                        className="adm-taxonomy-add-btn"
                        title="Add subcategory"
                        onClick={() => setNewSubModal({ parentId: reorderMainId, label: '' })}
                      >
                        <Plus size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                    <p className="adm-section-note" style={{ margin: '0 0 10px', fontSize: 12 }}>
                      Drag categories and subcategories by the grip handle. Order saves to the live trade portal automatically.
                    </p>
                    <CategorySidebar
                      tree={taxonomyTree}
                      selectedPath={reorderCategoryPath}
                      onSelectPath={(path) => { setReorderCategoryPath(path); setSelectedIds(new Set()); setReorderSearch(''); }}
                      onAddChild={(parentId) => setNewSubModal({ parentId, label: '' })}
                      onReorder={handleCategoryReorder}
                      productCounts={categoryProductCounts}
                    />
                  </aside>

                  <ReorderGrid
                    products={visibleReorderProducts}
                    onProductsChange={handleReorderProductsChange}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelectReorder}
                    mainCategoryId={reorderMainId}
                    selectedPath={reorderCategoryPath}
                    taxonomyTree={taxonomyTree}
                    loading={loading}
                    dragDisabled={reorderSearchActive || reorderBrowseAll}
                    savingOrder={reorderSaving}
                    emptyHint={reorderBrowseAll ? 'Select a category in the sidebar to load products for reordering.' : undefined}
                    onEditProduct={openContentEdit}
                    onEditSubcategory={setEditTaxonomyModal}
                    onDeleteSubcategory={(sub) => void openDeleteSubcategory(sub)}
                    onOrderCommitted={(next, meta) => scheduleReorderSave(next, meta)}
                  />
                </div>

                {moveModalOpen && (() => {
                  const child1Options = subcategoryOptions(moveCategoryId, taxonomyTree);
                  const child2Options = childrenOf(taxonomyTree, moveChild1Id);
                  const child3Options = childrenOf(taxonomyTree, moveChild2Id);
                  const child4Options = childrenOf(taxonomyTree, moveChild3Id);
                  const deepestId = moveChild4Id || moveChild3Id || moveChild2Id || moveChild1Id;
                  const movePreviewPath = [moveCategoryId, moveChild1Id, moveChild2Id, moveChild3Id, moveChild4Id].filter(Boolean);
                  const movePreviewLabel = movePreviewPath.length >= 2
                    ? resolvePathLabels(taxonomyTree, movePreviewPath).join(' › ')
                    : 'Select a main category and subcategory';
                  return (
                    <div className="adm-modal-backdrop" onClick={() => setMoveModalOpen(false)}>
                      <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
                        <div className="adm-modal-header">
                          <h3 className="adm-modal-title">Move {selectedIds.size} product{selectedIds.size === 1 ? '' : 's'}</h3>
                          <button type="button" className="adm-modal-close" onClick={() => setMoveModalOpen(false)} aria-label="Close"><X size={18} /></button>
                        </div>
                        <p className="adm-modal-note">Choose the destination category for these products.</p>
                        <p className="adm-modal-note" style={{ fontWeight: 700, color: '#334155' }}>
                          Destination: {movePreviewLabel}
                        </p>
                        <div className="adm-modal-body">
                          <label className="adm-field">
                            <span className="adm-field-label">Main category</span>
                            <select
                              value={moveCategoryId}
                              onChange={(e) => { setMoveCategoryId(e.target.value); setMoveChild1Id(''); setMoveChild2Id(''); setMoveChild3Id(''); setMoveChild4Id(''); }}
                              className="adm-select adm-select--enhanced"
                            >
                              {mainCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                          </label>
                          {child1Options.length > 0 && (
                            <label className="adm-field">
                              <span className="adm-field-label">Child category 1</span>
                              <select
                                value={moveChild1Id}
                                onChange={(e) => { setMoveChild1Id(e.target.value); setMoveChild2Id(''); setMoveChild3Id(''); setMoveChild4Id(''); }}
                                className="adm-select adm-select--enhanced"
                              >
                                <option value="">— None —</option>
                                {child1Options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                            </label>
                          )}
                          {moveChild1Id && child2Options.length > 0 && (
                            <label className="adm-field">
                              <span className="adm-field-label">Child category 2</span>
                              <select
                                value={moveChild2Id}
                                onChange={(e) => { setMoveChild2Id(e.target.value); setMoveChild3Id(''); setMoveChild4Id(''); }}
                                className="adm-select adm-select--enhanced"
                              >
                                <option value="">— None —</option>
                                {child2Options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                            </label>
                          )}
                          {moveChild2Id && child3Options.length > 0 && (
                            <label className="adm-field">
                              <span className="adm-field-label">Child category 3</span>
                              <select
                                value={moveChild3Id}
                                onChange={(e) => { setMoveChild3Id(e.target.value); setMoveChild4Id(''); }}
                                className="adm-select adm-select--enhanced"
                              >
                                <option value="">— None —</option>
                                {child3Options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                            </label>
                          )}
                          {moveChild3Id && child4Options.length > 0 && (
                            <label className="adm-field">
                              <span className="adm-field-label">Child category 4</span>
                              <select
                                value={moveChild4Id}
                                onChange={(e) => setMoveChild4Id(e.target.value)}
                                className="adm-select adm-select--enhanced"
                              >
                                <option value="">— None —</option>
                                {child4Options.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                            </label>
                          )}
                        </div>
                        <div className="adm-modal-footer">
                          <button
                            type="button"
                            className="adm-modal-link-btn adm-modal-link-btn--add"
                            onClick={() => { setMoveModalOpen(false); setNewSubModal({ parentId: deepestId || moveCategoryId, label: '' }); }}
                          >
                            <Plus size={15} strokeWidth={2.5} /> New subcategory
                          </button>
                          <div className="adm-modal-footer__actions">
                            <button type="button" className="adm-btn-ghost" onClick={() => setMoveModalOpen(false)}>Cancel</button>
                            <button type="button" className="adm-btn-red" onClick={() => void confirmBulkMove()} disabled={saving === 'bulk-move'}>
                              {saving === 'bulk-move' ? 'Moving…' : 'Confirm move'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {archiveConfirmOpen && (
                  <div className="adm-modal-backdrop" onClick={() => setArchiveConfirmOpen(false)}>
                    <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
                      <div className="adm-modal-header">
                        <h3 className="adm-modal-title">Archive {selectedIds.size} product{selectedIds.size === 1 ? '' : 's'}?</h3>
                        <button type="button" className="adm-modal-close" onClick={() => setArchiveConfirmOpen(false)} aria-label="Close"><X size={18} /></button>
                      </div>
                      <p className="adm-modal-note">Products leave the active grid but are not deleted. Restore them anytime from Archive.</p>
                      <div className="adm-modal-footer adm-modal-footer--end">
                        <div className="adm-modal-footer__actions">
                          <button type="button" className="adm-btn-ghost" onClick={() => setArchiveConfirmOpen(false)}>Cancel</button>
                          <button type="button" className="adm-btn-red" onClick={() => void confirmBulkArchive()} disabled={saving === 'bulk-archive'}>
                            {saving === 'bulk-archive' ? 'Archiving…' : 'Archive'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {bulkFieldEditOpen && (
                  <div className="adm-modal-backdrop" onClick={() => setBulkFieldEditOpen(false)}>
                    <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
                      <div className="adm-modal-header">
                        <h3 className="adm-modal-title">
                          Edit {bulkFieldEditType === 'description' ? 'description' : 'barcode'} for {selectedIds.size} product{selectedIds.size === 1 ? '' : 's'}
                        </h3>
                        <button type="button" className="adm-modal-close" onClick={() => setBulkFieldEditOpen(false)} aria-label="Close"><X size={18} /></button>
                      </div>
                      <p className="adm-modal-note">This value will overwrite the existing {bulkFieldEditType === 'description' ? 'description' : 'barcode'} on every selected product.</p>
                      <div className="adm-modal-body">
                        <label className="adm-field">
                          <span className="adm-field-label">{bulkFieldEditType === 'description' ? 'Description' : 'Barcode'}</span>
                          {bulkFieldEditType === 'description' ? (
                            <textarea
                              value={bulkFieldEditValue}
                              onChange={(e) => setBulkFieldEditValue(e.target.value)}
                              className="adm-field-input"
                              rows={4}
                              style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                              autoFocus
                              placeholder="New description for all selected products…"
                            />
                          ) : (
                            <input
                              value={bulkFieldEditValue}
                              onChange={(e) => setBulkFieldEditValue(e.target.value)}
                              className="adm-field-input"
                              autoFocus
                              placeholder="New barcode / code for all selected products…"
                            />
                          )}
                        </label>
                      </div>
                      <div className="adm-modal-footer adm-modal-footer--end">
                        <div className="adm-modal-footer__actions">
                          <button type="button" className="adm-btn-ghost" onClick={() => setBulkFieldEditOpen(false)}>Cancel</button>
                          <button type="button" className="adm-btn-red" onClick={() => void confirmBulkFieldEdit()} disabled={saving === 'bulk-field-edit'}>
                            {saving === 'bulk-field-edit' ? 'Saving…' : 'Apply to all'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {editTaxonomyModal && (
                  <div className="adm-modal-backdrop" onClick={() => setEditTaxonomyModal(null)}>
                    <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
                      <div className="adm-modal-header">
                        <h3 className="adm-modal-title">Rename {editTaxonomyModal.type === 'category' ? 'category' : 'subcategory'}</h3>
                        <button type="button" className="adm-modal-close" onClick={() => setEditTaxonomyModal(null)} aria-label="Close"><X size={18} /></button>
                      </div>
                      <p className="adm-modal-note">The ID stays the same — only the display name and database labels update.</p>
                      <div className="adm-modal-body">
                        <label className="adm-field">
                          <span className="adm-field-label">Name</span>
                          <input
                            value={editTaxonomyModal.label}
                            onChange={(e) => setEditTaxonomyModal((m) => ({ ...m, label: e.target.value }))}
                            className="adm-field-input"
                            autoFocus
                          />
                        </label>
                      </div>
                      <div className="adm-modal-footer adm-modal-footer--end">
                        <div className="adm-modal-footer__actions">
                          <button type="button" className="adm-btn-ghost" onClick={() => setEditTaxonomyModal(null)}>Cancel</button>
                          <button type="button" className="adm-btn-red" onClick={() => void saveTaxonomyRename()} disabled={taxonomySaving}>
                            {taxonomySaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {deleteSubModal && (
                  <div className="adm-modal-backdrop" onClick={() => setDeleteSubModal(null)}>
                    <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
                      <div className="adm-modal-header">
                        <h3 className="adm-modal-title">Delete {deleteSubModal.type === 'category' ? 'category' : 'subcategory'}?</h3>
                        <button type="button" className="adm-modal-close" onClick={() => setDeleteSubModal(null)} aria-label="Close"><X size={18} /></button>
                      </div>
                      <p className="adm-modal-note">
                        Remove <strong>{deleteSubModal.label}</strong> from the catalogue structure.
                        {deleteSubModal.productCount > 0
                          ? ` ${deleteSubModal.productCount} product(s) will stay but become uncategorised.`
                          : ' No products are assigned to it.'}
                      </p>
                      <div className="adm-modal-footer adm-modal-footer--end">
                        <div className="adm-modal-footer__actions">
                          <button type="button" className="adm-btn-ghost" onClick={() => setDeleteSubModal(null)}>Cancel</button>
                          <button
                            type="button"
                            className="adm-btn-red"
                            onClick={() => void confirmDeleteSubcategory()}
                            disabled={taxonomySaving}
                          >
                            {taxonomySaving ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {toast && (
                  <div className={`adm-toast adm-toast--${toast.type}`}>{toast.message}</div>
                )}
              </div>
              </SectionErrorBoundary>
            )}

            {/* CUSTOMERS */}
            {activeSection === 'customers' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Customer Management</h2>
                    <p className="adm-section-note">
                      Manage trade requests, approved customers, and Proto Active accounts. Sync with Brevo CRM, push portal emails to Brevo, and send email campaigns to any list.
                      {brevoLastSync && ` Brevo last synced: ${new Date(brevoLastSync).toLocaleString('en-ZA')}.`}
                    </p>
                  </div>
                  <div className="adm-customer-actions">
                    <button type="button" className="adm-btn-red" onClick={() => setCustomerEmailOpen(true)}>
                      <Mail size={14} /> Send email
                    </button>
                    <button type="button" className="adm-btn-ghost" disabled={brevoSyncBusy} onClick={() => void handleBrevoSync()}>
                      {brevoSyncBusy ? <><Loader2 size={14} className="spin" /> Syncing…</> : <><CloudDownload size={14} /> Sync from Brevo</>}
                    </button>
                    <button type="button" className="adm-btn-ghost" disabled={brevoPushBusy} onClick={() => void handlePushPortalToBrevo()}>
                      {brevoPushBusy ? 'Pushing…' : <><Upload size={14} /> Push portal → Brevo</>}
                    </button>
                    <button type="button" className="adm-btn-ghost" disabled={protoSeedBusy} onClick={() => void importProtoActiveList()}>
                      {protoSeedBusy ? 'Importing…' : <><Upload size={14} /> Sync proto active list</>}
                    </button>
                    <input ref={customerExcelRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) void handleCustomerExcelApprove(e.target.files[0]); e.target.value = ''; }} />
                    <button type="button" className="adm-btn-ghost" disabled={customerApproveBusy} onClick={() => customerExcelRef.current?.click()}>
                      {customerApproveBusy ? 'Importing…' : <><Upload size={14} /> Approve from Excel</>}
                    </button>
                  </div>
                </div>

                <div className="adm-customer-tabs">
                  <button onClick={() => setCustomerTab('requests')} className={`adm-tab${customerTab === 'requests' ? ' adm-tab--active' : ''}`}>Trade Requests</button>
                  <button onClick={() => setCustomerTab('regular')} className={`adm-tab${customerTab === 'regular' ? ' adm-tab--active' : ''}`}>Approved</button>
                  <button onClick={() => setCustomerTab('proto-active')} className={`adm-tab${customerTab === 'proto-active' ? ' adm-tab--active' : ''}`}>Proto Active</button>
                  <label className="adm-search adm-search--inline"><Search size={14} /><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search…" className="adm-search-input" /></label>
                  {customerTab !== 'proto-active' && (
                    <select
                      className="adm-select"
                      value={customerBusinessType}
                      onChange={(e) => setCustomerBusinessType(e.target.value)}
                      aria-label="Filter by business type"
                    >
                      <option value="">All business types</option>
                      <option value="__unspecified__">Unspecified</option>
                      {BUSINESS_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  )}
                </div>

                {customerTab === 'proto-active' ? (
                  <div className="adm-list">
                    <div className="adm-list-head" style={{ gridTemplateColumns: '80px 1.2fr 110px 90px 1.1fr 100px 80px 100px 120px' }}>
                      <span>Code</span><span>Business</span><span>Contact</span><span>First name</span><span>Email</span><span>12mo Sales</span><span>Invoices</span><span>Last purchase</span><span>Actions</span>
                    </div>
                    {customerRows.length === 0 && !loading && (
                      <div className="adm-empty" style={{ padding: '24px 0' }}>
                        No proto active customers loaded. Click <strong>Sync proto active list</strong> to import from the master file.
                      </div>
                    )}
                    {customerRows.map((row) => (
                      <div key={row.id || row.email} className="adm-list-row" style={{ gridTemplateColumns: '80px 1.2fr 110px 90px 1.1fr 100px 80px 100px 120px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontFamily: 'monospace' }}>{row.account_code}</span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</span>
                        <input
                          type="text"
                          className="adm-tiny-input"
                          defaultValue={row.contact_name || ''}
                          placeholder="Contact name"
                          disabled={protoNameSaving === `${row.id}-contact_name`}
                          onBlur={(e) => void saveProtoActiveName(row, 'contact_name', e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                          style={{ width: '100%', fontSize: 12, borderColor: row.contact_name ? undefined : '#fca5a5' }}
                          aria-label={`Contact name for ${row.email}`}
                        />
                        <input
                          type="text"
                          className="adm-tiny-input"
                          defaultValue={row.first_name || ''}
                          placeholder="First name"
                          disabled={protoNameSaving === `${row.id}-first_name`}
                          onBlur={(e) => void saveProtoActiveName(row, 'first_name', e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                          style={{ width: '100%', fontSize: 12, fontWeight: 600, borderColor: row.first_name ? undefined : '#fca5a5' }}
                          aria-label={`First name for ${row.email}`}
                        />
                        <span style={{ fontSize: 12 }}>{row.email}</span>
                        <span style={{ fontSize: 12 }}>R{Number(row.sales_last_12_months || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                        <span style={{ fontSize: 12 }}>{row.invoice_count ?? '—'}</span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{row.last_purchase_date ? new Date(row.last_purchase_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button type="button" className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }} onClick={() => openCustomerProfile(row, 'proto-active')}>Edit</button>
                          <button type="button" className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 7px', color: '#c40000' }} disabled={saving === `del-proto-${row.id}`} onClick={() => void removeProtoActiveCustomer(row)}>
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : customerTab === 'requests' ? (
                  <div className="adm-list">
                    <div className="adm-list-head" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 1.3fr 0.8fr 90px 200px' }}>
                      <span>Business Name</span><span>Location</span><span>Date Applied</span><span>Email / Phone</span><span>Whatsapp</span><span>Code</span><span>Actions</span>
                    </div>
                    {customerRows.length === 0 && !loading && (
                      <div className="adm-empty" style={{ padding: '24px 0' }}>No pending trade requests.</div>
                    )}
                    {customerRows.map((person) => (
                      <div key={person.id} className="adm-list-row" style={{ gridTemplateColumns: '1.4fr 1fr 0.9fr 1.3fr 0.8fr 90px 200px', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {person.business_name || person.name || 'Unknown'}
                            {person.accept_whatsapp === true && (
                              <Check size={14} color="#15803d" strokeWidth={3} aria-label="WhatsApp opted in" />
                            )}
                          </div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>{person.name}{person.business_type ? ` · ${person.business_type}` : ''}</div>
                        </div>
                        <div style={{ fontSize: 12 }}>{[person.city, person.province, person.country].filter(Boolean).join(', ') || '—'}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{new Date(person.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        <div>
                          <div style={{ fontSize: 12 }}>{person.email}</div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>{person.phone || '—'}</div>
                        </div>
                        <div><WhatsappOptIn value={person.accept_whatsapp} /></div>
                        <div>
                          <input
                            type="text"
                            className="adm-tiny-input"
                            placeholder="6-digit"
                            maxLength={6}
                            value={approvalCodes[person.id] || ''}
                            onChange={(e) => setApprovalCodes((prev) => ({
                              ...prev,
                              [person.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                            }))}
                            style={{ width: '72px', fontFamily: 'monospace', fontWeight: 700 }}
                            aria-label={`Customer code for ${person.email}`}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <button onClick={() => void openCustomerProfile(person)} className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }}>Edit</button>
                          <button
                            onClick={() => void approveRequest(person)}
                            className="adm-btn-green adm-btn-sm"
                            disabled={saving === person.id || !/^[A-Z0-9]{6}$/.test(approvalCodes[person.id] || '')}
                          >
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
                    <div className="adm-list-head" style={{ gridTemplateColumns: '80px 1.1fr 1.1fr 1fr 80px 70px 90px' }}>
                      <span>Code</span><span>Name</span><span>Email</span><span>Phone</span><span>WhatsApp</span><span>Orders</span><span></span>
                    </div>
                    {customerRows.length === 0 && !loading && (
                      <div className="adm-empty" style={{ padding: '24px 0' }}>No approved customers yet.</div>
                    )}
                    {customerRows.map((person) => (
                      <div key={person.id} className="adm-list-row" style={{ gridTemplateColumns: '80px 1.1fr 1.1fr 1fr 80px 70px 90px' }}>
                        <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 12 }}>{person.customer_code || '—'}</span>
                        <div>
                          <span style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {person.name || person.business_name || 'Unnamed'}
                            {person.accept_whatsapp === true && (
                              <Check size={14} color="#15803d" strokeWidth={3} aria-label="WhatsApp opted in" />
                            )}
                          </span>
                          {(person.first_name || person.contact_name) && (
                            <div className="adm-muted" style={{ fontSize: 11 }}>
                              {[person.first_name, person.contact_name && person.contact_name !== person.name ? person.contact_name : null].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 13 }}>{person.email}</span>
                        <span style={{ fontSize: 13 }}>{person.phone || '—'}</span>
                        <span><WhatsappOptIn value={person.accept_whatsapp} /></span>
                        <span>{person.orderCount}</span>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button onClick={() => void openCustomerProfile(person)} className="adm-btn-ghost adm-btn-sm" style={{ padding: '4px 9px', fontSize: 11 }}>Edit</button>
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
                    <h2 className="adm-section-title">Pricing</h2>
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
                    <label key={product.id} className={`adm-checkbox-row${selectedPricing.includes(product.id) ? ' adm-checkbox-row--pricing-selected' : ''}`}>
                      <input type="checkbox" checked={selectedPricing.includes(product.id)} onChange={(e) => setSelectedPricing((prev) => e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id))} />
                      <span style={{ fontWeight: 700 }}>{product.name}</span>
                      <small className="adm-muted">{product.code}{product.price > 0 ? ` · R${Number(product.price).toFixed(2)}` : ''}</small>
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
                        onClick={() => setFulfillmentSettingsOpen(true)}
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
            )}

            {/* BREVO CRM */}
            {activeSection === 'brevo' && (
              <div className="adm-panel">
                <Suspense fallback={<LazySectionFallback label="Loading Brevo CRM…" />}>
                  <CrmPanel onShowToast={showToast} />
                </Suspense>
              </div>
            )}

            {/* WHATSAPP */}
            {activeSection === 'crm' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">WhatsApp</h2>
                    <p className="adm-section-note">Pick a template, preview the message, filter your audience, and send.</p>
                  </div>
                </div>

                {crmError && (
                  <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
                    {crmError}
                  </div>
                )}

                <Suspense fallback={<LazySectionFallback label="Loading WhatsApp…" />}>
                  <WhatsappPanel
                    summary={crmMeta.summary}
                    totalFiltered={crmMeta.totalFiltered}
                    search={crmSearch}
                    onSearchChange={setCrmSearch}
                    filters={crmFilters}
                    onFiltersChange={setCrmFilters}
                    businessTypeOptions={crmBusinessTypeOptions}
                    joinStatusOptions={crmJoinStatusOptions}
                    templates={crmTemplates}
                    templatesLoading={crmTemplatesLoading}
                    selectedTemplate={crmSelectedTemplate}
                    onSelectTemplate={setCrmSelectedTemplate}
                    onSend={(overrides) => void sendCrmEmail(overrides)}
                    sending={crmSending}
                    sentCount={crmSentCount}
                    lastSentTemplate={crmLastSentTemplate}
                    onViewContacts={() => setCrmContactsOpen(true)}
                    onRefresh={() => { void loadCrmCustomers(crmMeta.page || 1); void loadCrmTemplates(); }}
                  />
                </Suspense>
              </div>
            )}

            {/* BANNER EDITOR */}
            {activeSection === 'banner' && (
              <Suspense fallback={<SectionSuspenseFallback label="Loading Banner Editor…" />}>
                <BannerPanel onShowToast={showToast} />
              </Suspense>
            )}

            {/* POPUP SPECIALS — merged into Specials tab */}


          </main>
        </div>
      </div>

      {/* Customer profile drawer */}
      {profileCustomer && (
        <div className="adm-drawer-backdrop" onClick={closeCustomerProfile}>
          <div className="adm-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="adm-drawer-head">
              <h3>Customer Profile</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!profileEditing && (
                  <button onClick={startEditProfile} className="adm-btn-ghost adm-btn-sm">Edit</button>
                )}
                <button onClick={closeCustomerProfile} className="adm-icon-btn"><X size={16} /></button>
              </div>
            </div>
            <div className="adm-drawer-body">
              <div className="adm-drawer-avatar">{(profileCustomer.business_name || profileCustomer.name || '?')[0].toUpperCase()}</div>
              <h2 className="adm-drawer-biz">{profileCustomer.business_name || profileCustomer.name}</h2>

              {profileEditing ? (
                <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
                  {profileSource === 'proto-active' ? (
                    <>
                      {[
                        ['Account code', 'account_code', 'text'],
                        ['Business name', 'business_name', 'text'],
                        ['Email', 'email', 'email'],
                        ['Contact name', 'contact_name', 'text'],
                        ['First name', 'first_name', 'text'],
                      ].map(([label, key, type]) => (
                        <div key={key}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</label>
                          <input className="adm-field-input" type={type} value={profileForm[key] || ''} onChange={setPf(key)} style={{ width: '100%' }} />
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {[
                        ['Contact person', 'name', 'text'],
                        ['Email', 'email', 'email'],
                        ['Phone', 'phone', 'tel'],
                        ['Business name', 'business_name', 'text'],
                        ['Business type', 'business_type', 'text'],
                        ['VAT number', 'vat_number', 'text'],
                        ['Website / social', 'website', 'text'],
                      ].map(([label, key, type]) => (
                        <div key={key}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</label>
                          <input className="adm-field-input" type={type} value={profileForm[key] || ''} onChange={setPf(key)} style={{ width: '100%' }} />
                        </div>
                      ))}
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Monthly spend</label>
                        <select className="adm-field-input" value={profileForm.monthly_spend || ''} onChange={setPf('monthly_spend')} style={{ width: '100%' }}>
                          <option value="">—</option>
                          {SPEND_BANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      {[['Company address', 'company_address'], ['Delivery address', 'delivery_address']].map(([label, key]) => (
                        <div key={key}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</label>
                          <textarea className="adm-field-input" rows={2} value={profileForm[key] || ''} onChange={setPf(key)} style={{ width: '100%', resize: 'vertical' }} />
                        </div>
                      ))}
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button className="adm-btn-green" onClick={() => void saveProfileEdit()} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</button>
                    <button className="adm-btn-ghost" onClick={() => setProfileEditing(false)} disabled={savingProfile}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="adm-drawer-fields">
                  <DrawerField icon={User} label="Contact person" value={profileCustomer.contact_name || profileCustomer.name} />
                  <DrawerField icon={Mail} label="Email" value={profileCustomer.email} />
                  {profileSource !== 'proto-active' && <DrawerField icon={Phone} label="Phone" value={profileCustomer.phone} />}
                  {profileSource !== 'proto-active' && <DrawerField icon={Store} label="Business type" value={profileCustomer.business_type} />}
                  {profileSource !== 'proto-active' && <DrawerField icon={Store} label="Monthly spend" value={profileCustomer.monthly_spend} />}
                  {profileSource !== 'proto-active' && <DrawerField icon={Globe} label="Website / social" value={profileCustomer.website} />}
                  {profileSource !== 'proto-active' && (
                    <DrawerField icon={Shield} label="Accept WhatsApp" value={profileCustomer.accept_whatsapp == null ? null : profileCustomer.accept_whatsapp ? 'Yes' : 'No'} />
                  )}
                  <DrawerField icon={Building2} label="Customer code" value={profileCustomer.customer_code || profileCustomer.account_code} />
                  {profileCustomer.first_name && <DrawerField icon={User} label="First name" value={profileCustomer.first_name} />}
                  {profileCustomer.vat_number && <DrawerField icon={Shield} label="VAT number" value={profileCustomer.vat_number} />}
                  {profileCustomer.company_address && <DrawerField icon={MapPin} label="Company address" value={profileCustomer.company_address} />}
                  {profileCustomer.delivery_address && <DrawerField icon={MapPin} label="Delivery address" value={profileCustomer.delivery_address} />}
                  {profileCustomer.sales_last_12_months != null && (
                    <DrawerField icon={Store} label="12mo sales" value={`R${Number(profileCustomer.sales_last_12_months).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} />
                  )}
                  {profileCustomer.invoice_count != null && (
                    <DrawerField icon={Store} label="Invoices (12mo)" value={String(profileCustomer.invoice_count)} />
                  )}
                  {profileCustomer.last_purchase_date && (
                    <DrawerField icon={Building2} label="Last purchase" value={new Date(profileCustomer.last_purchase_date).toLocaleDateString('en-ZA')} />
                  )}
                  {profileSource !== 'proto-active' && profileCustomer.created_at && (
                    <DrawerField icon={Building2} label="Applied" value={new Date(profileCustomer.created_at).toLocaleString('en-ZA')} />
                  )}
                </div>
              )}

              {profileSource !== 'proto-active' && (
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
              )}
            </div>
            <div className="adm-drawer-footer">
              <button onClick={closeCustomerProfile} className="adm-btn-ghost">Close</button>
              {profileSource !== 'proto-active' && !profileCustomer.is_approved && (
                <>
                  <input
                    type="text"
                    className="adm-tiny-input"
                    placeholder="6-digit code"
                    maxLength={6}
                    value={approvalCodes[profileCustomer.id] || ''}
                    onChange={(e) => setApprovalCodes((prev) => ({
                      ...prev,
                      [profileCustomer.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                    }))}
                    style={{ width: 88, fontFamily: 'monospace', fontWeight: 700 }}
                  />
                  <button
                    onClick={() => void approveRequest(profileCustomer)}
                    className="adm-btn-green"
                    disabled={saving === profileCustomer.id || !/^[A-Z0-9]{6}$/.test(approvalCodes[profileCustomer.id] || '')}
                  >
                    {saving === profileCustomer.id ? 'Approving…' : <><Check size={15} /> Approve</>}
                  </button>
                </>
              )}
              {profileSource !== 'proto-active' && (
                <button onClick={() => void deactivateCustomer(profileCustomer)} className="adm-btn-ghost" disabled={saving === `deact-${profileCustomer.id}`}>
                  {saving === `deact-${profileCustomer.id}` ? '…' : 'Deactivate'}
                </button>
              )}
              <button
                onClick={() => void removeCustomer(profileCustomer, profileSource)}
                className="adm-btn-ghost"
                style={{ color: '#c40000' }}
                disabled={saving === (profileSource === 'proto-active' ? `del-proto-${profileCustomer.id}` : `del-${profileCustomer.id}`)}
              >
                {saving === (profileSource === 'proto-active' ? `del-proto-${profileCustomer.id}` : `del-${profileCustomer.id}`) ? '…' : <><Trash2 size={14} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {customerEmailOpen && (
        <Suspense fallback={null}>
          <CustomerEmailModal
            open={customerEmailOpen}
            onClose={() => setCustomerEmailOpen(false)}
            customerTab={customerTab}
            onSend={sendCustomerEmailBroadcast}
            onShowToast={showToast}
            adminEmail={customer?.email || ''}
          />
        </Suspense>
      )}

      {/* Taxonomy modals — used by Product Manager reorder + category sidebar */}
      {editTaxonomyModal && (
        <div className="adm-modal-backdrop" onClick={() => setEditTaxonomyModal(null)}>
          <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3 className="adm-modal-title">Rename {editTaxonomyModal.type === 'category' ? 'category' : 'subcategory'}</h3>
              <button type="button" className="adm-modal-close" onClick={() => setEditTaxonomyModal(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="adm-modal-note">The ID stays the same — only the display name and database labels update.</p>
            <div className="adm-modal-body">
              <label className="adm-field">
                <span className="adm-field-label">Name</span>
                <input
                  value={editTaxonomyModal.label}
                  onChange={(e) => setEditTaxonomyModal((m) => ({ ...m, label: e.target.value }))}
                  className="adm-field-input"
                  autoFocus
                />
              </label>
            </div>
            <div className="adm-modal-footer adm-modal-footer--end">
              <div className="adm-modal-footer__actions">
                <button type="button" className="adm-btn-ghost" onClick={() => setEditTaxonomyModal(null)}>Cancel</button>
                <button type="button" className="adm-btn-red" onClick={() => void saveTaxonomyRename()} disabled={taxonomySaving}>
                  {taxonomySaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteSubModal && (
        <div className="adm-modal-backdrop" onClick={() => setDeleteSubModal(null)}>
          <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3 className="adm-modal-title">Delete {deleteSubModal.type === 'category' ? 'category' : 'subcategory'}?</h3>
              <button type="button" className="adm-modal-close" onClick={() => setDeleteSubModal(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <p className="adm-modal-note">
              Remove <strong>{deleteSubModal.label}</strong> from the catalogue structure.
              {deleteSubModal.productCount > 0
                ? ` ${deleteSubModal.productCount} product(s) will stay but become uncategorised.`
                : ' No products are assigned to it.'}
            </p>
            <div className="adm-modal-footer adm-modal-footer--end">
              <div className="adm-modal-footer__actions">
                <button type="button" className="adm-btn-ghost" onClick={() => setDeleteSubModal(null)}>Cancel</button>
                <button
                  type="button"
                  className="adm-btn-red"
                  onClick={() => void confirmDeleteSubcategory()}
                  disabled={taxonomySaving}
                >
                  {taxonomySaving ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {newSubModal && (
        <div className="adm-modal-backdrop" onClick={() => setNewSubModal(null)}>
          <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3 className="adm-modal-title">Add child category</h3>
              <button type="button" className="adm-modal-close" onClick={() => setNewSubModal(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="adm-modal-body">
              <label className="adm-field">
                <span className="adm-field-label">Under</span>
                <select
                  value={newSubModal.parentId}
                  onChange={(e) => setNewSubModal((m) => ({ ...m, parentId: e.target.value }))}
                  className="adm-field-input"
                >
                  {allNodesFlat(taxonomyTree).map(({ id, label, depth }) => (
                    <option key={id} value={id}>{'  '.repeat(depth * 2)}{depth > 0 ? '└ ' : ''}{label}</option>
                  ))}
                </select>
              </label>
              <label className="adm-field">
                <span className="adm-field-label">Subcategory name</span>
                <input
                  value={newSubModal.label}
                  onChange={(e) => setNewSubModal((m) => ({ ...m, label: e.target.value }))}
                  className="adm-field-input"
                  placeholder="e.g. Seasonal Items"
                  autoFocus
                />
              </label>
            </div>
            <div className="adm-modal-footer adm-modal-footer--end">
              <div className="adm-modal-footer__actions">
                <button type="button" className="adm-btn-ghost" onClick={() => setNewSubModal(null)}>Cancel</button>
                <button type="button" className="adm-btn-red" onClick={() => void saveNewSubcategory()} disabled={taxonomySaving}>
                  {taxonomySaving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {newCategoryModal && (
        <div className="adm-modal-backdrop" onClick={() => setNewCategoryModal(null)}>
          <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3 className="adm-modal-title">New category</h3>
              <button type="button" className="adm-modal-close" onClick={() => setNewCategoryModal(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="adm-modal-body">
              <label className="adm-field">
                <span className="adm-field-label">Category name</span>
                <input
                  value={newCategoryModal.label}
                  onChange={(e) => setNewCategoryModal((m) => ({ ...m, label: e.target.value }))}
                  className="adm-field-input"
                  placeholder="e.g. Outdoor & Camping"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveNewCategory(); }}
                />
              </label>
            </div>
            <div className="adm-modal-footer adm-modal-footer--end">
              <div className="adm-modal-footer__actions">
                <button type="button" className="adm-btn-ghost" onClick={() => setNewCategoryModal(null)}>Cancel</button>
                <button type="button" className="adm-btn-red" onClick={() => void saveNewCategory()} disabled={taxonomySaving}>
                  {taxonomySaving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content quick-edit modal (image drag-drop + description) */}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Website SKU (WSK)</span>
                <input
                  value={contentEditProduct?.websiteSku || ''}
                  readOnly
                  className="adm-field-input"
                  style={{ fontSize: 12, background: '#f8fafc', color: '#64748b', cursor: 'default' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 5 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Barcode (BC)</span>
                <input
                  value={contentEditForm.code || ''}
                  onChange={(e) => setContentEditForm((f) => ({ ...f, code: e.target.value }))}
                  className="adm-field-input"
                  placeholder="Product barcode"
                  style={{ fontSize: 12 }}
                />
              </label>
            </div>

            {/* Description */}
            <label style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
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

            <label style={{ display: 'grid', gap: 6, marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Pack Description</span>
              <textarea
                value={contentEditForm.packDescription || ''}
                onChange={(e) => setContentEditForm((f) => ({ ...f, packDescription: e.target.value }))}
                className="adm-field-input"
                rows={2}
                placeholder="Pack / carton description…"
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
              <button onClick={() => void saveFulfillment()} className="adm-btn-red" disabled={fulfillmentSaving}>
                {fulfillmentSaving ? 'Saving…' : <><Check size={15} /> Save order</>}
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
          <div className="adm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 22, fontFamily: 'Outfit, sans-serif' }}>{editingProduct ? 'Edit product' : 'Add product'}</h3>
                <p className="adm-muted" style={{ marginTop: 4 }}>Fill in the details and assign a category.</p>
              </div>
              <button onClick={closeEditor} className="adm-icon-btn"><X size={16} /></button>
            </div>

            <div style={{ overflowY: 'auto', paddingRight: 4, flex: 1, minHeight: 0 }}>

            {PRODUCT_IMAGE_SLOTS.map((slot) => (
              <input
                key={`file-${slot.key}`}
                ref={(el) => { editorImageFileInputRefs.current[slot.key] = el; }}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadEditorImageFile(file, slot.key);
                  e.target.value = '';
                }}
              />
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              <AdminField label="Product code"><input value={productForm.code} onChange={(e) => setProductForm((p) => ({ ...p, code: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Product type">
                <select value={productForm.productType} onChange={(e) => setProductForm((p) => ({ ...p, productType: e.target.value }))} className="adm-field-input">
                  {productTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </AdminField>
              <AdminField label="Product name" full><input value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Description" full>
                <textarea value={productForm.description} onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))} className="adm-field-input" rows={3} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} placeholder="Product description shown to customers…" />
              </AdminField>
              <AdminField label="Pack Description" full>
                <textarea value={productForm.packDescription} onChange={(e) => setProductForm((p) => ({ ...p, packDescription: e.target.value }))} className="adm-field-input" rows={2} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} placeholder="Pack / carton description…" />
              </AdminField>

              <AdminField label="Product images (up to 4)" full>
                <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                  Best size: 800×800 px square, white background, product centred — matches your resize script and catalog cards.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {PRODUCT_IMAGE_SLOTS.map((slot, slotIndex) => {
                    const value = productForm[slot.key];
                    const isDragOver = editorImageDragOver === slot.key;
                    const nextKey = PRODUCT_IMAGE_SLOTS[slotIndex + 1]?.key;
                    return (
                      <div key={slot.key} style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{slot.label}</span>
                          {nextKey && (
                            <button
                              type="button"
                              onClick={() => swapEditorImageSlots(slotIndex)}
                              className="adm-btn-ghost"
                              style={{ padding: '6px 10px', fontSize: 12 }}
                              disabled={!productForm[slot.key] && !productForm[nextKey]}
                            >
                              Swap {slotIndex + 1} ↔ {slotIndex + 2}
                            </button>
                          )}
                        </div>
                        <div
                          onClick={() => !editorImageUploading && editorImageFileInputRefs.current[slot.key]?.click()}
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
                            border: `2px dashed ${isDragOver ? '#8B1A1A' : value ? '#d1d5db' : '#cbd5e1'}`,
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
                          ) : value ? (
                            <>
                              <img src={value} alt={`${slot.label} preview`} style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain' }} />
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
                              <div style={{ fontWeight: 700, fontSize: 15 }}>Drag & drop image here</div>
                              <div style={{ fontSize: 12 }}>or click to browse and upload it to Supabase</div>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => editorImageFileInputRefs.current[slot.key]?.click()} className="adm-btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} disabled={editorImageUploading}>
                            Upload
                          </button>
                          {value && (
                            <button type="button" onClick={() => clearEditorImage(slot.key)} className="adm-btn-ghost" style={{ padding: '8px 12px', fontSize: 12 }} disabled={editorImageUploading}>
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AdminField>

              {PRODUCT_IMAGE_SLOTS.map((slot) => (
                <AdminField key={`url-${slot.key}`} label={`${slot.label} URL`} full>
                  <input
                    value={productForm[slot.key]}
                    onChange={(e) => setProductForm((p) => ({ ...p, [slot.key]: e.target.value }))}
                    className="adm-field-input"
                  />
                </AdminField>
              ))}
              <AdminField label="Price"><input value={productForm.price} onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))} className="adm-field-input" /></AdminField>
              <AdminField label="Stock on hand"><input value={productForm.stockOnHand} onChange={(e) => setProductForm((p) => ({ ...p, stockOnHand: e.target.value }))} className="adm-field-input" /></AdminField>
              {/*
                Cascading category pickers — Main → Child 1 → Child 2 → Child 3 → Child 4.
                Each deeper level only shows up when its parent has children
                in the live taxonomy. We always reset deeper levels when a
                shallower one changes so the saved categoryPath stays
                consistent with the tree.
              */}
              <AdminField label="Main category" full>
                <select
                  value={productForm.categoryId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const firstChild = subcategoryOptions(nextId, taxonomyTree)[0]?.id || '';
                    setProductForm((p) => ({
                      ...p,
                      categoryId: nextId,
                      childOneId: firstChild,
                      childTwoId: '',
                      childThreeId: '',
                      childFourId: '',
                    }));
                  }}
                  className="adm-field-input"
                >
                  {mainCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </AdminField>

              {(() => {
                const rawOptions = subcategoryOptions(productForm.categoryId, taxonomyTree);
                const childOneOptions = withCurrentOption(rawOptions, productForm.childOneId);
                if (!childOneOptions.length) return null;
                return (
                  <AdminField label="Child category 1">
                    <select
                      value={productForm.childOneId}
                      onChange={(e) => setProductForm((p) => ({
                        ...p,
                        childOneId: e.target.value,
                        childTwoId: '',
                        childThreeId: '',
                        childFourId: '',
                      }))}
                      className="adm-field-input"
                    >
                      <option value="">— None —</option>
                      {childOneOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </AdminField>
                );
              })()}

              {(() => {
                const rawOptions = childrenOf(taxonomyTree, productForm.childOneId);
                const childTwoOptions = withCurrentOption(rawOptions, productForm.childTwoId);
                if (!productForm.childOneId || !childTwoOptions.length) return null;
                return (
                  <AdminField label="Child category 2">
                    <select
                      value={productForm.childTwoId}
                      onChange={(e) => setProductForm((p) => ({
                        ...p,
                        childTwoId: e.target.value,
                        childThreeId: '',
                        childFourId: '',
                      }))}
                      className="adm-field-input"
                    >
                      <option value="">— None —</option>
                      {childTwoOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </AdminField>
                );
              })()}

              {(() => {
                const rawOptions = childrenOf(taxonomyTree, productForm.childTwoId);
                const childThreeOptions = withCurrentOption(rawOptions, productForm.childThreeId);
                if (!productForm.childTwoId) return null;
                if (!childThreeOptions.length && !productForm.childThreeId) return null;
                return (
                  <AdminField label="Child category 3">
                    <select
                      value={productForm.childThreeId}
                      onChange={(e) => setProductForm((p) => ({ ...p, childThreeId: e.target.value, childFourId: '' }))}
                      className="adm-field-input"
                    >
                      <option value="">— None —</option>
                      {childThreeOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </AdminField>
                );
              })()}

              {(() => {
                const rawOptions = childrenOf(taxonomyTree, productForm.childThreeId);
                const childFourOptions = withCurrentOption(rawOptions, productForm.childFourId);
                if (!productForm.childThreeId) return null;
                if (!childFourOptions.length && !productForm.childFourId) return null;
                return (
                  <AdminField label="Child category 4">
                    <select
                      value={productForm.childFourId}
                      onChange={(e) => setProductForm((p) => ({ ...p, childFourId: e.target.value }))}
                      className="adm-field-input"
                    >
                      <option value="">— None —</option>
                      {childFourOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </AdminField>
                );
              })()}
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

      {crmContactsOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {fulfillmentSettingsOpen && (
        <Suspense fallback={null}>
          <FulfillmentSettingsModal
            open={fulfillmentSettingsOpen}
            taxonomyTree={taxonomyTree}
            onClose={(saved) => {
              setFulfillmentSettingsOpen(false);
              if (saved) void fetchFulfillmentUsers().then(setFulfillmentUsers);
            }}
          />
        </Suspense>
      )}

      {toast && (
        <div className={`adm-toast adm-toast--${toast.type}`} role="status">{toast.message}</div>
      )}
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
  const display = typeof value === 'object' ? '—' : value;
  return (
    <div className={`adm-stat${accent ? ' adm-stat--accent' : ''}`}>
      <div className="adm-stat-value">{display}</div>
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
