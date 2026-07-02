import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  archiveProduct,
  applyDormantLive,
  bulkArchiveProducts,
  bulkDeleteProducts,
  bulkMoveProducts,
  bulkUnarchiveProducts,
  createProduct,
  deleteProduct,
  fetchAdminProductsPage,
  fetchAllProductsAdmin,
  fetchCatalogArchiveCount,
  fetchUncategorizedCount,
  fetchDistinctCategories,
  fetchDormantProducts,
  fetchReorderProducts,
  applyPathFilter,
  invalidateAdminCache,
  invalidateProductCache,
  recycleProduct,
  restoreRecycledProduct,
  saveSortOrder,
  setNewArrival,
  setLiveTaxonomyTree,
  updateProduct,
  uploadDormantImage,
  uploadDormantImageWithBase64,
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
import { supabase } from '../lib/supabase';
import { errorFromJson } from '../lib/apiError';
import { formatWebsitePrice } from '../lib/pricing';
import { fetchSpecials, saveSpecials } from '../lib/specials';
import { fetchBanner, saveBanner, uploadBannerImage } from '../lib/banner';
import { fetchCheckoutPromo, saveCheckoutPromo } from '../lib/checkoutPromo';
import { BANNER_LABEL, BANNER_ASPECT_CSS } from '../lib/bannerSpec';
import { fetchPopupSpecial, savePopupSpecial, uploadPopupImage } from '../lib/popupSpecial';
import CrmContactsModal from '../components/CrmContactsModal';
import WhatsappPanel from '../components/WhatsappPanel';
import { fuzzyFilter } from '../lib/fuzzySearch';
import ReorderGrid from '../components/ReorderGrid';
import CategorySidebar, { resolvePathLabels } from '../components/CategorySidebar';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import OrdersTab from './admin/OrdersTab';
import CustomersTab from './admin/CustomersTab';
import SyncStatusBadge from '../components/SyncStatusBadge';
import ComingSoonPanel from '../components/ComingSoonPanel';
import ApprovalPanel from '../components/ApprovalPanel';
import FulfillmentSettingsModal from '../components/FulfillmentSettingsModal';
import AnalyticsHub from '../components/AnalyticsHub';
import ProductManagerEngine from '../components/ProductManagerEngine';
import GroupedSidebar, { NAV_GROUPS } from '../components/GroupedSidebar';
import CrmPanel from '../components/CrmPanel';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import ApolloPanel from '../components/ApolloPanel';
import CostTrackingPanel from '../components/CostTrackingPanel';
import ProductLoaderPanel from '../components/ProductLoaderPanel';
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


export default function AdminPage({ customer, onViewPortal, onSignOut }) {
  const [activeSection, setActiveSection] = useState('catalogue');
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
  const [contentEditProduct, setContentEditProduct] = useState(null);
  const [contentEditForm, setContentEditForm] = useState({ image: '', description: '', packDescription: '', code: '' });
  const [contentEditSaving, setContentEditSaving] = useState(false);
  const [contentEditError, setContentEditError] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const imageFileInputRef = useRef(null);

  const [dormantRows, setDormantRows] = useState([]);
  const [dormantSearch, setDormantSearch] = useState('');
  const [dormantSelected, setDormantSelected] = useState(new Set());
  const [imageViewUrl, setImageViewUrl] = useState('');
  const [uploadQueue, setUploadQueue] = useState([]);
  const [reprocessBusy, setReprocessBusy] = useState(false);
  const singleImageRef = useRef(null);
  const folderImageRef = useRef(null);
  const reprocessAbortRef = useRef(null);
  const [productSearchInput, setProductSearchInput] = useState('');
  const [productSearchDebounced, setProductSearchDebounced] = useState('');
  const [productCategoryPath, setProductCategoryPath] = useState([]);
  const [productPageSize, setProductPageSize] = useState(50);
  const [productPage, setProductPage] = useState(1);
  const [productRows, setProductRows] = useState([]);
  const [productTotal, setProductTotal] = useState(0);

  const [catalogTotal, setCatalogTotal] = useState(0);
  const [archiveCatalogTotal, setArchiveCatalogTotal] = useState(0);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [statsCustomerTotal, setStatsCustomerTotal] = useState(0);
  const [statsOrderTotal, setStatsOrderTotal] = useState(0);

  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveCategoryPath, setArchiveCategoryPath] = useState([]);
  const [archivePage, setArchivePage] = useState(1);
  const [archiveRows, setArchiveRows] = useState([]);
  const [archiveTotal, setArchiveTotal] = useState(0);

  const [recycleSearch, setRecycleSearch] = useState('');
  const [recyclePage, setRecyclePage] = useState(1);
  const [recycleRows, setRecycleRows] = useState([]);
  const [recycleTotal, setRecycleTotal] = useState(0);
  const [recycleCatalogTotal, setRecycleCatalogTotal] = useState(0);

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
  const [productSelectedIds, setProductSelectedIds] = useState(new Set());
  const lastProductClickIdxRef = useRef(null);
  const [productArchiveConfirmOpen, setProductArchiveConfirmOpen] = useState(false);
  const [productDeleteConfirmOpen, setProductDeleteConfirmOpen] = useState(false);
  const [archiveSelectedIds, setArchiveSelectedIds] = useState(new Set());
  const [archiveDeleteConfirmOpen, setArchiveDeleteConfirmOpen] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [fulfillmentSettingsOpen, setFulfillmentSettingsOpen] = useState(false);
  const [ordersUrlState, setOrdersUrlState] = useState({ tab: null, focus: null });
  const [sectionRefreshNonce, setSectionRefreshNonce] = useState(0);
  const [specials, setSpecials] = useState([]); // [{productId, productName, productCode, productImage, deal, discountPct, bogoX, bogoY}]
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

  const [bannerForm, setBannerForm] = useState({ imageUrl: '' });
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);

  const [popupForm, setPopupForm] = useState({ active: false, imageUrl: '', title: '' });
  const [checkoutPromo, setCheckoutPromo] = useState({ active: true, code: 'PROTO75', percent: 7.5, label: '7.5% off your order' });
  const [checkoutPromoSaving, setCheckoutPromoSaving] = useState(false);
  const [popupSaving, setPopupSaving] = useState(false);
  const [popupUploading, setPopupUploading] = useState(false);

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
    const timer = setTimeout(() => setProductSearchDebounced(productSearchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [productSearchInput]);
  useEffect(() => { setProductPage(1); }, [productSearchDebounced, productCategoryPath.join('|'), productPageSize]);
  useEffect(() => { setArchivePage(1); }, [archiveSearch, archiveCategoryPath.join('|')]);
  useEffect(() => { setRecyclePage(1); }, [recycleSearch]);
  useEffect(() => { if (activeSection === 'crm') void loadCrmCustomers(1); }, [crmFilters.businessTypes.join('|'), crmFilters.joinedStatuses.join('|'), crmSearch]);
  useEffect(() => { if (activeSection === 'crm' && !crmTemplates.length && !crmTemplatesLoading) void loadCrmTemplates(); }, [activeSection, crmTemplates.length, crmTemplatesLoading]);
  useEffect(() => { if (activeSection === 'banner') void loadBannerEditor(); }, [activeSection]);
  useEffect(() => {
    if (activeSection === 'specials') {
      void loadPopupEditor();
      void loadCheckoutPromoEditor();
    }
  }, [activeSection]);

  const processUploadFiles = async (files) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!imageFiles.length) return;

    const initial = imageFiles.map((f) => ({ name: f.name, status: 'pending', message: '', cost: null }));
    setUploadQueue(initial);

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const sku = file.name.replace(/\.[^.]+$/, '');

      // Step 1: compress + upload (compression also produces the base64 we reuse for Gemini)
      setUploadQueue((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'transforming', message: 'Uploading…' } : item));
      let imageUrl = '', uploadedBase64 = '';
      try {
        // compressImage returns a Blob; we need both the URL and the base64 for Gemini
        const { url, base64 } = await uploadDormantImageWithBase64(file, {});
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
      const data = await fetchAdminProductsPage({
        page: productPage,
        pageSize: productPageSize,
        searchQuery: productSearchDebounced,
        categoryPathFilter: productCategoryPath,
        onProgress: setLoadingProgress,
      });
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
      const data = await fetchAdminProductsPage({
        page: archivePage,
        pageSize: ADMIN_PAGE_SIZE,
        searchQuery: archiveSearch,
        archived: true,
        categoryPathFilter: archiveCategoryPath,
        onProgress: setLoadingProgress,
      });
      setArchiveRows(data.rows);
      setArchiveTotal(data.total);
    } catch (err) {
      setLoadingError(err.message || 'Failed to load archive');
    } finally { setLoadingProgress(null); }
  };

  const loadRecycle = async () => {
    setLoadingProgress(0);
    setLoadingError('');
    try {
      const data = await fetchAdminProductsPage({ page: recyclePage, pageSize: ADMIN_PAGE_SIZE, searchQuery: recycleSearch, recycled: true, onProgress: setLoadingProgress });
      setRecycleRows(data.rows);
      setRecycleTotal(data.total);
      setRecycleCatalogTotal(data.total);
    } catch (err) {
      setLoadingError(err.message || 'Failed to load recycle bin');
    } finally { setLoadingProgress(null); }
  };

  const refreshDashboardStats = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats() });
  };

  const refreshRecycleCatalogCount = async () => {
    try {
      const data = await fetchAdminProductsPage({ page: 1, pageSize: 1, recycled: true });
      setRecycleCatalogTotal(data.total);
    } catch {}
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
      showToast(err.message || 'Failed to save category order', 'error');
      const reverted = await fetchTaxonomy();
      setTaxonomyTree(reverted);
      setLiveTaxonomyTree(reverted);
    } finally {
      setTaxonomySaving(false);
    }
  };


  useEffect(() => { if (activeSection === 'new-items') void loadDormant(); }, [activeSection, dormantSearch]);
  useEffect(() => { if (activeSection === 'products') void loadProducts(); }, [activeSection, productPage, productSearchDebounced, productCategoryPath.join('|'), productPageSize]);
  useEffect(() => { setProductSelectedIds(new Set()); }, [productPage, productSearchDebounced, productCategoryPath.join('|')]);
  useEffect(() => { if (activeSection === 'archive') void loadArchive(); }, [activeSection, archivePage, archiveSearch, archiveCategoryPath.join('|')]);
  useEffect(() => { setArchiveSelectedIds(new Set()); }, [archivePage, archiveSearch, activeSection]);
  useEffect(() => { if (activeSection === 'recycle') void loadRecycle(); }, [activeSection, recyclePage, recycleSearch]);
  useEffect(() => {
    void refreshRecycleCatalogCount();
  }, []);
  useEffect(() => {
    if (activeSection === 'products' || activeSection === 'archive' || activeSection === 'recycle') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [productPage, archivePage, recyclePage, activeSection]);
  useEffect(() => { if (activeSection === 'pricing') void loadCategoryWorkingSet(pricingCategory, 'pricing'); }, [activeSection, pricingCategory]);
  useEffect(() => { void reloadTaxonomy(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get('section');
    const tab = params.get('orderTab');
    const focus = params.get('focusOrder');
    if (section) setActiveSection(section);
    if (tab || focus) setOrdersUrlState({ tab: tab || null, focus: focus || null });
    if (section || tab || focus) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
  useEffect(() => { if (activeSection === 'crm' && !crmAllCustomers.length && !crmLoading) void loadCrmCustomers(1); }, [activeSection]);

  // Load specials on mount
  useEffect(() => {
    fetchSpecials().then((data) => setSpecials(data?.items || [])).catch(() => {});
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
      setProductRows((prev) => prev.map((p) => p.id === contentEditProduct.id ? { ...p, ...patch } : p));
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
    if (activeSection === 'products' || activeSection === 'archive' || activeSection === 'recycle') invalidateAdminCache();
    if (activeSection === 'products') return loadProducts();
    if (activeSection === 'archive') return loadArchive();
    if (activeSection === 'recycle') return loadRecycle();
    if (activeSection === 'customers' || activeSection === 'orders') {
      setSectionRefreshNonce((n) => n + 1);
      return;
    }
    if (activeSection === 'pricing') return loadCategoryWorkingSet(pricingCategory, 'pricing');
    if (activeSection === 'reorder') return loadReorderProducts();
    if (activeSection === 'new-items') return loadDormant();
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
      await loadProducts();
    } catch (err) {
      setEditorError(err.message || 'Save failed');
    } finally { setSaving(''); }
  };

  const goLive = async (product) => {
    setSaving(product.id);
    try {
      await applyDormantLive(product.id);
      setDormantRows((prev) => prev.filter((p) => p.id !== product.id));
      setDormantSelected((prev) => { const next = new Set(prev); next.delete(product.id); return next; });
      invalidateProductCache();
      invalidateAdminCache();
      await loadProducts();
      showToast(product.stillLive ? `"${product.name}" live image updated` : `"${product.name}" is now live`);
    } catch (err) {
      alert(err.message || 'Failed to go live');
    } finally { setSaving(''); }
  };

  const goLiveSelected = async () => {
    if (!dormantSelected.size) return;
    const ids = [...dormantSelected];
    setSaving('bulk-live');
    const errors = [];
    let ok = 0;
    const succeeded = new Set();
    try {
      for (const id of ids) {
        try {
          await applyDormantLive(id);
          ok += 1;
          succeeded.add(id);
        } catch (err) {
          errors.push(`${id}: ${err.message}`);
        }
      }
      setDormantRows((prev) => prev.filter((p) => !succeeded.has(p.id)));
      setDormantSelected(new Set(ids.filter((id) => !succeeded.has(id))));
      invalidateProductCache();
      invalidateAdminCache();
      await loadProducts();
      await loadDormant();
      if (errors.length) {
        alert(`Set live: ${ok} succeeded, ${errors.length} failed:\n\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? '\n…' : ''}`);
      } else {
        showToast(`${ok} product${ok === 1 ? '' : 's'} updated on site`);
      }
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
    if (!window.confirm(`Move "${product.name}" to the Recycle Bin? You can restore it later or delete permanently from there.`)) return;
    setSaving(`del-live-${product.id}`);
    try {
      await recycleProduct(product.id);
      await loadProducts();
      await refreshDashboardStats();
      await refreshRecycleCatalogCount();
      invalidateProductCache();
      invalidateAdminCache();
      showToast(`"${product.name}" moved to Recycle Bin`);
    } catch (err) {
      alert(err.message || 'Failed to move to Recycle Bin');
    } finally { setSaving(''); }
  };

  const restoreFromRecycle = async (product) => {
    if (!window.confirm(`Restore "${product.name}" to the live catalogue?`)) return;
    setSaving(product.id);
    try {
      await restoreRecycledProduct(product.id);
      invalidateAdminCache();
      invalidateProductCache();
      await loadRecycle();
      await refreshDashboardStats();
      await refreshRecycleCatalogCount();
      showToast(`"${product.name}" restored`);
    } catch (err) {
      alert(err.message || 'Failed to restore');
    } finally { setSaving(''); }
  };

  const permanentlyDeleteRecycled = async (product) => {
    if (!window.confirm(`Permanently delete "${product.name}"? This cannot be undone.`)) return;
    setSaving(`perm-del-${product.id}`);
    try {
      await deleteProduct(product.id);
      await loadRecycle();
      await refreshRecycleCatalogCount();
      invalidateProductCache();
      invalidateAdminCache();
      showToast(`"${product.name}" permanently deleted`);
    } catch (err) {
      alert(err.message || 'Failed to delete');
    } finally { setSaving(''); }
  };

  const toggleArchive = async (product) => {
    const archiving = !product.isArchived;
    setSaving(product.id);
    try {
      await archiveProduct(product.id, archiving);
      invalidateAdminCache();
      invalidateProductCache();
      await refreshDashboardStats();
      if (activeSection === 'products') await loadProducts();
      else if (activeSection === 'archive') await loadArchive();
    } catch (err) {
      alert(err.message || 'Failed to update archive status');
      await refreshCurrentSection();
    } finally { setSaving(''); }
  };

  const toggleNewArrival = async (product) => {
    const next = !product.isNew;
    setSaving(`new-${product.id}`);
    try {
      await setNewArrival(product.id, next);
      await refreshDashboardStats();
      if (activeSection === 'products') await loadProducts();
      else if (activeSection === 'archive') await loadArchive();
      showToast(next ? 'Added to New Arrivals' : 'Removed from New Arrivals');
    } catch (err) {
      showToast(err.message || 'Could not update New Arrivals', 'error');
    } finally { setSaving(''); }
  };

  const toXlsxRow = (p) => ({
    Name: p.name,
    Barcode: p.barcode || p.code,
    'Website SKU': p.websiteSku || '',
    'Parent SKU': p.parentSku || '',
    Category: p.category || '',
    'Price (incl. VAT)': p.price,
    'Stock Qty': p.stockQty,
  });

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

  const loadBannerEditor = async () => {
    try {
      const data = await fetchBanner({ force: true });
      setBannerForm({ imageUrl: data.imageUrl || '' });
    } catch (e) { alert(e.message || 'Failed to load banner'); }
  };

  const handleBannerImage = async (file) => {
    if (!file) return;
    setBannerUploading(true);
    try {
      const { url } = await uploadBannerImage(file);
      const next = { ...bannerForm, imageUrl: url };
      setBannerForm(next);
      setBannerSaving(true);
      try {
        const saved = await saveBanner(next);
        setBannerForm({ imageUrl: saved.imageUrl || url });
        showToast('Banner uploaded and saved — refresh the trade portal to see it.');
      } catch (e) {
        showToast(e.message || 'Uploaded but save failed — click Save banner', 'error');
      } finally {
        setBannerSaving(false);
      }
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

  const loadCheckoutPromoEditor = async () => {
    try {
      const data = await fetchCheckoutPromo({ force: true });
      setCheckoutPromo({
        active: !!data.active,
        code: data.code || 'PROTO75',
        percent: Number(data.percent) || 7.5,
        label: data.label || '7.5% off your order',
      });
    } catch { /* ignore */ }
  };

  const saveCheckoutPromoEditor = async () => {
    setCheckoutPromoSaving(true);
    try {
      await saveCheckoutPromo(checkoutPromo);
      showToast('Checkout promo saved — applies on trade portal cart');
    } catch (e) {
      showToast(e.message || 'Failed to save checkout promo', 'error');
    } finally {
      setCheckoutPromoSaving(false);
    }
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

  const exportLiveXlsx = async () => {
    setSaving('export-live');
    try {
      const XLSX = await import('xlsx');
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
      const XLSX = await import('xlsx');
      const data = await fetchAdminProductsPage({ page: 1, pageSize: 999999, searchQuery: archiveSearch, archived: true });
      const ws = XLSX.utils.json_to_sheet(data.rows.map(toXlsxRow));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Archive 0 Stock');
      XLSX.writeFile(wb, 'proto-archive-products.xlsx');
    } finally { setSaving(''); }
  };

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

  const toggleSelectProduct = (id, idx, shiftKey = false) => {
    setProductSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastProductClickIdxRef.current !== null && idx !== lastProductClickIdxRef.current) {
        const start = Math.min(lastProductClickIdxRef.current, idx);
        const end = Math.max(lastProductClickIdxRef.current, idx);
        const rangeIds = productRows.slice(start, end + 1).map((p) => p.id);
        const allSelected = rangeIds.every((rid) => next.has(rid));
        rangeIds.forEach((rid) => (allSelected ? next.delete(rid) : next.add(rid)));
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    lastProductClickIdxRef.current = idx ?? null;
  };

  const toggleSelectAllProducts = () => {
    const ids = productRows.map((p) => p.id);
    const allSelected = ids.length > 0 && ids.every((id) => productSelectedIds.has(id));
    setProductSelectedIds(allSelected ? new Set() : new Set(ids));
  };

  const confirmBulkArchiveProducts = async () => {
    const count = productSelectedIds.size;
    const ids = [...productSelectedIds];
    setSaving('bulk-archive-pm');
    try {
      await bulkArchiveProducts(ids);
      invalidateAdminCache();
      invalidateProductCache();
      setProductArchiveConfirmOpen(false);
      setProductSelectedIds(new Set());
      await refreshDashboardStats();
      await loadProducts();
      showToast(`Archived ${count} product(s)`);
    } catch (err) {
      showToast(err.message || 'Archive failed', 'error');
    } finally { setSaving(''); }
  };

  // Permanently delete the products selected in Product Manager. Unlike
  // archive/recycle this skips the Recycle Bin and removes rows from both
  // `website_stock` and `archived_products`, so we gate it behind an
  // explicit confirmation modal.
  const confirmBulkDeleteProducts = async () => {
    const count = productSelectedIds.size;
    const ids = [...productSelectedIds];
    setSaving('bulk-delete-pm');
    try {
      await bulkDeleteProducts(ids);
      invalidateAdminCache();
      invalidateProductCache();
      setProductDeleteConfirmOpen(false);
      setProductSelectedIds(new Set());
      await refreshDashboardStats();
      await refreshRecycleCatalogCount();
      await loadProducts();
      showToast(`Deleted ${count} product(s)`);
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    } finally { setSaving(''); }
  };

  const confirmBulkRestoreArchive = async () => {
    const count = archiveSelectedIds.size;
    const ids = [...archiveSelectedIds];
    setSaving('bulk-restore-archive');
    try {
      const json = await bulkUnarchiveProducts(ids);
      invalidateAdminCache();
      invalidateProductCache();
      setArchiveSelectedIds(new Set());
      await refreshDashboardStats();
      await loadArchive();
      await loadProducts();
      const failed = json.failed?.length || 0;
      showToast(failed ? `Restored ${json.restored || 0}, ${failed} failed` : `Restored ${count} product${count === 1 ? '' : 's'}`);
    } catch (err) {
      showToast(err.message || 'Restore failed', 'error');
    } finally { setSaving(''); }
  };


  const goHome = () => setActiveSection('orders');

  // Archive bulk-select handlers — mirror the Product Manager bulk bar so
  // admins can multi-select archived rows and either restore or permanently
  // delete them in one click.
  const toggleSelectArchive = (id) => {
    setArchiveSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllArchive = () => {
    const ids = archiveRows.map((p) => p.id);
    const allSelected = ids.length > 0 && ids.every((id) => archiveSelectedIds.has(id));
    setArchiveSelectedIds(allSelected ? new Set() : new Set(ids));
  };

  const confirmBulkDeleteArchive = async () => {
    const count = archiveSelectedIds.size;
    const ids = [...archiveSelectedIds];
    setSaving('bulk-delete-archive');
    try {
      await bulkDeleteProducts(ids);
      invalidateAdminCache();
      invalidateProductCache();
      setArchiveDeleteConfirmOpen(false);
      setArchiveSelectedIds(new Set());
      await refreshDashboardStats();
      await loadArchive();
      showToast(`Deleted ${count} archived product(s)`);
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    } finally { setSaving(''); }
  };

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



  const productPages = Math.max(1, Math.ceil(productTotal / productPageSize));

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
          <SyncStatusBadge />
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

            <SectionErrorBoundary name="catalogue" title="Product Manager crashed" resetKey={activeSection}>
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
            </SectionErrorBoundary>

            {activeSection === 'analytics' && (
              <SectionErrorBoundary name="analytics" title="Analytics crashed" resetKey={activeSection}>
                <AnalyticsHub />
              </SectionErrorBoundary>
            )}

            {/* Apollo — keep mounted so chat survives tab switches */}
            <SectionErrorBoundary name="apollo" title="Apollo crashed" resetKey={activeSection}>
            <div style={{ display: activeSection === 'apollo' ? 'block' : 'none' }}>
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
            </div>
            </SectionErrorBoundary>

            {activeSection === 'cost-tracking' && (
              <SectionErrorBoundary name="cost-tracking" title="Cost Tracking crashed" resetKey={activeSection}>
                <CostTrackingPanel onShowToast={showToast} />
              </SectionErrorBoundary>
            )}

            {activeSection === 'product-loader' && (
              <SectionErrorBoundary name="product-loader" title="Product Loader crashed" resetKey={activeSection}>
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
              </SectionErrorBoundary>
            )}

            {false && activeSection === 'approval' && (
              <ApprovalPanel
                onShowToast={showToast}
                onRefreshStats={() => {
                  invalidateAdminCache();
                  void refreshDashboardStats();
                  void loadProducts();
                }}
              />
            )}

            {/* PRODUCTS */}
            {false && activeSection === 'products' && (
              <div className="adm-panel adm-panel-with-sidebar">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Product Manager</h2>
                    <p className="adm-section-note">In-stock products are live on the site automatically. Out-of-stock items auto-archive unless you pin them to stay live (📌).</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={goHome} className="adm-btn-ghost"><Home size={15} /> Home</button>
                    <button onClick={openNewProduct} className="adm-btn-red"><PackagePlus size={15} /> Add product</button>
                    <button onClick={() => void exportLiveXlsx()} className="adm-btn-ghost">{saving === 'export-live' ? 'Exporting…' : 'Export Excel'}</button>
                  </div>
                </div>

                <div className="adm-panel-split">
                  <CategorySidebar
                    tree={taxonomyTree}
                    selectedPath={productCategoryPath}
                    onSelectPath={setProductCategoryPath}
                    showUncategorized
                    uncategorizedCount={uncategorizedCount}
                    onReorder={handleCategoryReorder}
                  />
                  <div className="adm-panel-main">
                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <label className="adm-search"><Search size={15} /><input value={productSearchInput} onChange={(e) => setProductSearchInput(e.target.value)} placeholder="Search SKU, barcode, title, category…" className="adm-search-input" /></label>
                  <select value={productPageSize} onChange={(e) => setProductPageSize(Number(e.target.value))} className="adm-select adm-select--enhanced" style={{ width: 90 }}>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>

                {uncategorizedCount > 0 && productCategoryPath[0] !== '__uncategorized__' && (
                  <div
                    role="alert"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', margin: '0 0 12px',
                      background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
                      fontSize: 13, color: '#9a3412',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>⚠️ {uncategorizedCount} product{uncategorizedCount === 1 ? '' : 's'} have no category.</span>
                    <span style={{ flex: 1 }}>They are hidden from the live website until a main category is assigned.</span>
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn--sm"
                      onClick={() => { setProductCategoryPath(['__uncategorized__']); }}
                    >
                      Show them
                    </button>
                  </div>
                )}

                {productSearchInput.trim() && productSearchInput.trim() !== productSearchDebounced && (
                  <p className="adm-muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Searching…</p>
                )}
                {productSearchDebounced && productRows.length === 0 && loadingProgress === null && (
                  <div className="adm-empty" style={{ padding: '24px 0', textAlign: 'center' }}>
                    No products match &ldquo;{productSearchDebounced}&rdquo;.
                  </div>
                )}

                {productSelectedIds.size > 0 && (
                  <div className="adm-bulk-bar" role="region" aria-label="Bulk product actions">
                    <div className="adm-bulk-bar__left">
                      <span className="adm-bulk-bar__badge">{productSelectedIds.size}</span>
                      <span className="adm-bulk-bar__count">selected</span>
                      <button type="button" className="adm-bulk-bar__link" onClick={toggleSelectAllProducts}>
                        {productRows.length > 0 && productRows.every((p) => productSelectedIds.has(p.id))
                          ? 'Deselect all'
                          : `Select all on page (${productRows.length})`}
                      </button>
                    </div>
                    <div className="adm-bulk-bar__actions">
                      <button
                        type="button"
                        className="adm-btn-ghost adm-btn--sm adm-btn-ghost--danger"
                        onClick={() => setProductArchiveConfirmOpen(true)}
                        disabled={!!saving}
                      >
                        <Archive size={15} /> Archive
                      </button>
                      <button
                        type="button"
                        className="adm-btn-ghost adm-btn--sm adm-btn-ghost--danger"
                        onClick={() => setProductDeleteConfirmOpen(true)}
                        disabled={!!saving}
                        style={{ color: '#c40000', borderColor: '#fecaca' }}
                      >
                        <Trash2 size={15} /> Delete Selected
                      </button>
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => setProductSelectedIds(new Set())}>Clear</button>
                    </div>
                  </div>
                )}

                <div className="adm-list">
                  <div className="adm-list-head" style={{ gridTemplateColumns: '32px 80px 2fr 180px 120px' }}>
                    <span>
                      <input
                        type="checkbox"
                        checked={productRows.length > 0 && productRows.every((p) => productSelectedIds.has(p.id))}
                        onChange={toggleSelectAllProducts}
                        style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
                        aria-label="Select all products on this page"
                      />
                    </span>
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
                      <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '32px 80px 2fr 180px 120px' }}>
                        <div>
                          <input
                            type="checkbox"
                            checked={productSelectedIds.has(product.id)}
                            onChange={(e) => toggleSelectProduct(product.id, i, e.nativeEvent.shiftKey)}
                            style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
                            aria-label={`Select ${product.name}`}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {product.image
                            ? <img src={product.image} alt="" className="adm-product-thumb" />
                            : <div className="adm-product-thumb adm-product-thumb--placeholder">IMG</div>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {product.name}
                            {!product.image && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 5px' }}>No image</span>}
                            {specialsSet.has(product.id) && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#8B1A1A', borderRadius: 4, padding: '1px 5px' }}>Special</span>}
                            {product.isNew && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#0f766e', borderRadius: 4, padding: '1px 5px' }}>New arrival</span>}
                          </div>
                          <div className="adm-muted" style={{ fontSize: 11 }}>
                            <span title="Barcode (customer code)">BC: {product.barcode || product.code}</span>
                            {product.websiteSku && <span title="Website SKU" style={{ marginLeft: 8 }}>WSK: {product.websiteSku}</span>}
                            {product.parentSku && <span title="Parent SKU" style={{ marginLeft: 8 }}>PSK: {product.parentSku}</span>}
                            {product.price > 0 && <span title="Price incl. VAT" style={{ marginLeft: 8, fontWeight: 700, color: '#374151' }}>R{formatWebsitePrice(product.price)}</span>}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700, color: product.stockQty < 0 ? '#b91c1c' : undefined }}>{formatStockUnits(product.stockQty)}</span>
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
                          <button
                            onClick={() => void toggleNewArrival(product)}
                            className="adm-icon-btn"
                            title={product.isNew ? 'Remove from New Arrivals' : 'Add to New Arrivals'}
                            disabled={saving === `new-${product.id}`}
                            style={{ color: product.isNew ? '#0f766e' : undefined }}
                          >
                            <Sparkles size={14} />
                          </button>
                          <button onClick={() => openEditProduct(product)} className="adm-icon-btn" title="Edit product details"><Pencil size={14} /></button>
                          <button onClick={() => void toggleArchive(product)} className="adm-icon-btn">{product.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
                          <button
                            onClick={() => void removeManagedProduct(product)}
                            className="adm-icon-btn"
                            title="Move to Recycle Bin"
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

                {productArchiveConfirmOpen && (
                  <div className="adm-modal-backdrop" onClick={() => setProductArchiveConfirmOpen(false)}>
                    <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
                      <div className="adm-modal-header">
                        <h3 className="adm-modal-title">Archive {productSelectedIds.size} product{productSelectedIds.size === 1 ? '' : 's'}?</h3>
                        <button type="button" className="adm-modal-close" onClick={() => setProductArchiveConfirmOpen(false)} aria-label="Close"><X size={18} /></button>
                      </div>
                      <p className="adm-modal-note">Products leave the live catalogue but are not deleted. Restore them anytime from Archive.</p>
                      <div className="adm-modal-footer adm-modal-footer--end">
                        <div className="adm-modal-footer__actions">
                          <button type="button" className="adm-btn-ghost" onClick={() => setProductArchiveConfirmOpen(false)}>Cancel</button>
                          <button type="button" className="adm-btn-red" onClick={() => void confirmBulkArchiveProducts()} disabled={saving === 'bulk-archive-pm'}>
                            {saving === 'bulk-archive-pm' ? 'Archiving…' : 'Archive'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {productDeleteConfirmOpen && (
                  <div className="adm-modal-backdrop" onClick={() => setProductDeleteConfirmOpen(false)}>
                    <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
                      <div className="adm-modal-header">
                        <h3 className="adm-modal-title">Permanently delete {productSelectedIds.size} product{productSelectedIds.size === 1 ? '' : 's'}?</h3>
                        <button type="button" className="adm-modal-close" onClick={() => setProductDeleteConfirmOpen(false)} aria-label="Close"><X size={18} /></button>
                      </div>
                      <p className="adm-modal-note" style={{ color: '#7f1d1d' }}>
                        This removes them from the live catalogue AND from the archive. The action cannot be undone — there is no Recycle Bin step.
                      </p>
                      <div className="adm-modal-footer adm-modal-footer--end">
                        <div className="adm-modal-footer__actions">
                          <button type="button" className="adm-btn-ghost" onClick={() => setProductDeleteConfirmOpen(false)}>Cancel</button>
                          <button type="button" className="adm-btn-red" onClick={() => void confirmBulkDeleteProducts()} disabled={saving === 'bulk-delete-pm'}>
                            {saving === 'bulk-delete-pm' ? 'Deleting…' : <><Trash2 size={14} /> Delete permanently</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                  </div>
                </div>
              </div>
            )}

            {/* SPECIALS */}
            {activeSection === 'specials' && (
              <SectionErrorBoundary name="specials" title="Specials crashed" resetKey={activeSection}>
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Star size={20} style={{ color: '#f59e0b' }} /> Specials
                    </h2>
                    <p className="adm-section-note">Weekly featured products and login popup promo. Star a product in Product Manager to add it here.</p>
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

                <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
                <div className="adm-section-head">
                  <div>
                    <h3 className="adm-subtitle"><DollarSign size={16} /> PROTO75 — Cart checkout discount</h3>
                    <p className="adm-section-note">Amount deducted at cart checkout on site.proto.co.za when customers enter the promo code.</p>
                  </div>
                  <button type="button" onClick={() => void loadCheckoutPromoEditor()} className="adm-btn-ghost"><RefreshCw size={15} /></button>
                </div>
                <div className="adm-responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720, marginBottom: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600 }}>
                    <input type="checkbox" checked={checkoutPromo.active} onChange={(e) => setCheckoutPromo((p) => ({ ...p, active: e.target.checked }))} style={{ accentColor: '#dc2626' }} />
                    Active at checkout
                  </label>
                  <label>
                    <span className="adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Promo code</span>
                    <input className="adm-field-input" style={{ width: '100%' }} value={checkoutPromo.code} onChange={(e) => setCheckoutPromo((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
                  </label>
                  <label>
                    <span className="adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Discount %</span>
                    <input className="adm-field-input" type="number" min="0" max="50" step="0.5" style={{ width: '100%' }} value={checkoutPromo.percent} onChange={(e) => setCheckoutPromo((p) => ({ ...p, percent: Number(e.target.value) }))} />
                  </label>
                  <label>
                    <span className="adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Cart label</span>
                    <input className="adm-field-input" style={{ width: '100%' }} value={checkoutPromo.label} onChange={(e) => setCheckoutPromo((p) => ({ ...p, label: e.target.value }))} />
                  </label>
                </div>
                <button type="button" className="adm-btn-red" disabled={checkoutPromoSaving} onClick={() => void saveCheckoutPromoEditor()} style={{ marginBottom: 24 }}>
                  {checkoutPromoSaving ? 'Saving…' : 'Save PROTO75 checkout promo'}
                </button>

                <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
                <div className="adm-section-head">
                  <div>
                    <h3 className="adm-subtitle"><Megaphone size={16} /> Popup / Banner Promo</h3>
                    <p className="adm-section-note">Flyer popup shown once per customer when they log in (while active).</p>
                  </div>
                  <button type="button" onClick={() => void loadPopupEditor()} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
                </div>
                <div className="adm-responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
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
              </SectionErrorBoundary>
            )}

            {/* ARCHIVE */}
            {false && activeSection === 'archive' && (
              <div className="adm-panel adm-panel-with-sidebar">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Archive — 0 Stock</h2>
                    <p className="adm-section-note">Products hidden from customers when stock hits 0. Restore or edit directly from here.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={goHome} className="adm-btn-ghost"><Home size={15} /> Home</button>
                    <button onClick={() => void exportArchiveXlsx()} className="adm-btn-ghost">{saving === 'export-archive' ? 'Exporting…' : 'Export Excel'}</button>
                    <span className="adm-pill" style={{ fontSize: 13, padding: '6px 14px' }}>{archiveTotal} products</span>
                  </div>
                </div>

                <div className="adm-panel-split">
                  <CategorySidebar
                    tree={taxonomyTree}
                    selectedPath={archiveCategoryPath}
                    onSelectPath={setArchiveCategoryPath}
                  />
                  <div className="adm-panel-main">
                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr' }}>
                  <label className="adm-search"><Search size={15} /><input value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} placeholder="Search SKU, barcode, title, category…" className="adm-search-input" /></label>
                </div>

                {archiveRows.length === 0 && loadingProgress === null && (
                  <div className="adm-empty" style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                    No products with 0 stock right now.
                  </div>
                )}

                {/* Archive bulk action bar — only renders when at least one row is selected. */}
                {archiveSelectedIds.size > 0 && (
                  <div className="adm-bulk-bar" role="region" aria-label="Bulk archive actions">
                    <div className="adm-bulk-bar__left">
                      <span className="adm-bulk-bar__badge">{archiveSelectedIds.size}</span>
                      <span className="adm-bulk-bar__count">selected</span>
                      <button type="button" className="adm-bulk-bar__link" onClick={toggleSelectAllArchive}>
                        {archiveRows.length > 0 && archiveRows.every((p) => archiveSelectedIds.has(p.id))
                          ? 'Deselect all'
                          : `Select all on page (${archiveRows.length})`}
                      </button>
                    </div>
                    <div className="adm-bulk-bar__actions">
                      <button
                        type="button"
                        className="adm-btn-ghost adm-btn--sm"
                        onClick={() => void confirmBulkRestoreArchive()}
                        disabled={!!saving || saving === 'bulk-restore-archive'}
                      >
                        <ArchiveRestore size={15} /> Make Live
                      </button>
                      <button
                        type="button"
                        className="adm-btn-ghost adm-btn--sm adm-btn-ghost--danger"
                        onClick={() => setArchiveDeleteConfirmOpen(true)}
                        disabled={!!saving}
                        style={{ color: '#c40000', borderColor: '#fecaca' }}
                      >
                        <Trash2 size={15} /> Delete Selected
                      </button>
                      <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => setArchiveSelectedIds(new Set())}>Clear</button>
                    </div>
                  </div>
                )}

                <div className="adm-list">
                  {archiveRows.length > 0 && (
                    <div className="adm-list-head" style={{ gridTemplateColumns: '32px 36px 2fr 180px 120px' }}>
                      <span>
                        <input
                          type="checkbox"
                          checked={archiveRows.length > 0 && archiveRows.every((p) => archiveSelectedIds.has(p.id))}
                          onChange={toggleSelectAllArchive}
                          style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
                          aria-label="Select all archived products on this page"
                        />
                      </span>
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
                      <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '32px 36px 2fr 180px 120px' }}>
                        <div>
                          <input
                            type="checkbox"
                            checked={archiveSelectedIds.has(product.id)}
                            onChange={() => toggleSelectArchive(product.id)}
                            style={{ accentColor: '#8B1A1A', cursor: 'pointer' }}
                            aria-label={`Select ${product.name}`}
                          />
                        </div>
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
                          <span style={{ fontWeight: 900, fontSize: 15, color: product.stockQty < 0 ? '#b91c1c' : '#8B1A1A' }}>{formatStockUnits(product.stockQty)}</span>
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

                {archiveDeleteConfirmOpen && (
                  <div className="adm-modal-backdrop" onClick={() => setArchiveDeleteConfirmOpen(false)}>
                    <div className="adm-modal adm-modal--form" onClick={(e) => e.stopPropagation()}>
                      <div className="adm-modal-header">
                        <h3 className="adm-modal-title">Permanently delete {archiveSelectedIds.size} archived product{archiveSelectedIds.size === 1 ? '' : 's'}?</h3>
                        <button type="button" className="adm-modal-close" onClick={() => setArchiveDeleteConfirmOpen(false)} aria-label="Close"><X size={18} /></button>
                      </div>
                      <p className="adm-modal-note" style={{ color: '#7f1d1d' }}>
                        These rows will be removed from `archived_products` (and `website_stock` if still present). This cannot be undone.
                      </p>
                      <div className="adm-modal-footer adm-modal-footer--end">
                        <div className="adm-modal-footer__actions">
                          <button type="button" className="adm-btn-ghost" onClick={() => setArchiveDeleteConfirmOpen(false)}>Cancel</button>
                          <button type="button" className="adm-btn-red" onClick={() => void confirmBulkDeleteArchive()} disabled={saving === 'bulk-delete-archive'}>
                            {saving === 'bulk-delete-archive' ? 'Deleting…' : <><Trash2 size={14} /> Delete permanently</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                  </div>
                </div>
              </div>
            )}

            {/* RECYCLE BIN */}
            {false && activeSection === 'recycle' && (
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Recycle Bin</h2>
                    <p className="adm-section-note">Deleted products are kept here until restored or permanently removed.</p>
                  </div>
                  <span className="adm-pill" style={{ fontSize: 13, padding: '6px 14px' }}>{recycleCatalogTotal} products</span>
                </div>

                <div className="adm-toolbar" style={{ gridTemplateColumns: '1fr' }}>
                  <label className="adm-search"><Search size={15} /><input value={recycleSearch} onChange={(e) => setRecycleSearch(e.target.value)} placeholder="Search recycled products" className="adm-search-input" /></label>
                </div>

                {recycleRows.length === 0 && loadingProgress === null && (
                  <div className="adm-empty" style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                    Recycle Bin is empty.
                  </div>
                )}

                <div className="adm-list">
                  {recycleRows.length > 0 && (
                    <div className="adm-list-head" style={{ gridTemplateColumns: '80px 2fr 180px 140px' }}>
                      <span></span><span>Product</span><span>Stock</span><span>Actions</span>
                    </div>
                  )}
                  {recycleRows.map((product) => (
                    <div key={product.id} className="adm-list-row" style={{ gridTemplateColumns: '80px 2fr 180px 140px' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {product.image
                          ? <img src={product.image} alt="" className="adm-product-thumb" />
                          : <div className="adm-product-thumb adm-product-thumb--placeholder">IMG</div>}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{product.name}</div>
                        <div className="adm-muted" style={{ fontSize: 11 }}>
                          <span title="Barcode">BC: {product.barcode || product.code}</span>
                          {product.websiteSku && <span title="Website SKU" style={{ marginLeft: 8 }}>WSK: {product.websiteSku}</span>}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontWeight: 700, color: product.stockQty < 0 ? '#b91c1c' : undefined }}>{formatStockUnits(product.stockQty)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => void restoreFromRecycle(product)} className="adm-icon-btn" title="Restore to live catalogue" disabled={saving === product.id}>
                          <ArchiveRestore size={14} />
                        </button>
                        <button
                          onClick={() => void permanentlyDeleteRecycled(product)}
                          className="adm-icon-btn"
                          title="Delete permanently"
                          disabled={saving === `perm-del-${product.id}`}
                          style={{ color: '#c40000' }}
                        >
                          {saving === `perm-del-${product.id}` ? '…' : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Pager page={recyclePage} totalPages={Math.max(1, Math.ceil(recycleTotal / ADMIN_PAGE_SIZE))} onChange={setRecyclePage} />
              </div>
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
              <SectionErrorBoundary name="customers" title="Customer Management crashed" resetKey={activeSection}>
                <CustomersTab
                  showToast={showToast}
                  refreshDashboardStats={refreshDashboardStats}
                  onPendingCountChange={setPendingCount}
                  customer={customer}
                  refreshNonce={sectionRefreshNonce}
                />
              </SectionErrorBoundary>
            )}

            {/* PRICING */}
            {activeSection === 'pricing' && (
              <SectionErrorBoundary name="pricing" title="Pricing crashed" resetKey={activeSection}>
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
              </SectionErrorBoundary>
            )}

            {/* ORDERS */}
            {activeSection === 'orders' && (
              <SectionErrorBoundary name="orders" title="Order Requests crashed" resetKey={activeSection}>
                <OrdersTab
                  showToast={showToast}
                  refreshDashboardStats={refreshDashboardStats}
                  onStatsOrderChange={setStatsOrderTotal}
                  customer={customer}
                  onOpenFulfillmentSettings={() => setFulfillmentSettingsOpen(true)}
                  initialOrderTab={ordersUrlState.tab}
                  initialFocusOrderId={ordersUrlState.focus}
                  refreshNonce={sectionRefreshNonce}
                />
              </SectionErrorBoundary>
            )}

            {/* BREVO CRM */}
            {activeSection === 'brevo' && (
              <SectionErrorBoundary name="brevo" title="Brevo CRM crashed" resetKey={activeSection}>
              <div className="adm-panel">
                <CrmPanel onShowToast={showToast} />
              </div>
              </SectionErrorBoundary>
            )}

            {/* WHATSAPP */}
            {activeSection === 'crm' && (
              <SectionErrorBoundary name="crm" title="WhatsApp crashed" resetKey={activeSection}>
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
              </div>
              </SectionErrorBoundary>
            )}

            {/* BANNER EDITOR */}
            {activeSection === 'banner' && (
              <SectionErrorBoundary name="banner" title="Banner Editor crashed" resetKey={activeSection}>
              <div className="adm-panel">
                <div className="adm-section-head">
                  <div>
                    <h2 className="adm-section-title">Banner Editor</h2>
                    <p className="adm-section-note">
                      Products page banner — upload a <strong>{BANNER_LABEL}</strong> image. It fills the full banner area on the trade portal.
                      With no image uploaded, the site shows an empty space until you add one.
                    </p>
                  </div>
                  <button type="button" onClick={() => void loadBannerEditor()} className="adm-btn-ghost"><RefreshCw size={15} /><span className="adm-btn-text">Refresh</span></button>
                </div>
                <div className="adm-responsive-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <label className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Banner image — {BANNER_LABEL}</label>
                      <label className="adm-btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <ImagePlus size={15} /> {bannerUploading ? 'Uploading…' : `Upload banner (${BANNER_LABEL})`}
                        <input type="file" accept="image/*" hidden onChange={(e) => { void handleBannerImage(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    </div>
                    {bannerForm.imageUrl && (
                      <button
                        type="button"
                        className="adm-btn-ghost"
                        disabled={bannerSaving}
                        onClick={() => {
                          setBannerForm({ imageUrl: '' });
                          void saveBanner({ imageUrl: '' }).then(() => showToast('Banner removed — trade portal will show empty space.')).catch((e) => showToast(e.message || 'Failed to remove banner', 'error'));
                        }}
                      >
                        Remove banner
                      </button>
                    )}
                  </div>
                  <div>
                    <span className="adm-muted" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Trade portal preview</span>
                    <div className="adm-banner-preview-wrap">
                      <div className="adm-banner-preview-chrome">
                        <span>site.proto.co.za — Products</span>
                      </div>
                      <div className="catalog-page adm-banner-preview-page">
                        <div className="site-hero-banner adm-banner-preview-hero">
                          {bannerForm.imageUrl
                            ? <img src={bannerForm.imageUrl} alt="Banner preview" />
                            : <div className="adm-banner-preview-empty">No banner — empty space on live site</div>}
                        </div>
                        <div className="adm-banner-preview-grid">
                          <div /><div /><div /><div />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </SectionErrorBoundary>
            )}

            {/* POPUP SPECIALS — merged into Specials tab */}

            {false && activeSection === 'dormant-products' && (
              <ComingSoonPanel taxonomyTree={taxonomyTree} />
            )}

          </main>
        </div>
      </div>


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

      <FulfillmentSettingsModal
        open={fulfillmentSettingsOpen}
        taxonomyTree={taxonomyTree}
        onClose={(saved) => {
          setFulfillmentSettingsOpen(false);
          if (saved) window.dispatchEvent(new CustomEvent('proto-fulfillment-users-changed'));
        }}
      />

      {toast && (
        <div className={`adm-toast adm-toast--${toast.type}`} role="status">{toast.message}</div>
      )}
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
