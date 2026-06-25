import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FolderOpen,
  ImagePlus,
  Loader2,
  PackagePlus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import categories from '../data/categories.json';
import { isImageFile } from '../lib/parseIntakeFilename.js';

function displayTitle(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      const inner = candidate.title ?? candidate.DESCR ?? candidate.descr ?? candidate.name;
      if (typeof inner === 'string' && inner.trim()) return inner.trim();
    }
  }
  return '';
}

// Maps Gemini's category labels to taxonomy IDs
const GEMINI_CATEGORY_MAP = {
  'Arts Crafts & Stationery': 'arts-crafts-stationery',
  'Beads Jewellery & Accessories': 'beads-jewellery-accessories',
  'Beauty & Personal Care': 'beauty-personal-care',
  'Events & Parties': 'events-parties',
  'Fashion & Accessories': 'fashion-accessories',
  'Food & Drinks': 'food-drinks',
  'Hardware': 'hardware',
  'Homeware & Kitchen': 'homeware-kitchen',
  'Packaging': 'packaging',
  'Textiles': 'textiles',
  'Toys Games & Kids': 'toys-games-kids',
};

const SLOT_FIELDS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];

function categoryLabelsFromIds(tree, categoryId, sub1Id, sub2Id, sub3Id = '', sub4Id = '') {
  const catNode = findNode(tree, categoryId);
  const sub1Node = findNode(tree, sub1Id);
  const sub2Node = findNode(tree, sub2Id);
  const sub3Node = findNode(tree, sub3Id);
  const sub4Node = findNode(tree, sub4Id);
  return {
    category: catNode?.label || '',
    subcategoryOne: sub1Node?.label || catNode?.label || '',
    subcategoryTwo: sub2Node?.label || null,
    subcategoryThree: sub3Node?.label || null,
    subcategoryFour: sub4Node?.label || null,
  };
}

function normalizeRowLabel(label) {
  return String(label || '').trim().toLowerCase();
}

function idsFromRowLabels(tree, row) {
  const out = { categoryId: '', sub1Id: '', sub2Id: '', sub3Id: '', sub4Id: '' };
  const cat = tree.find((c) => normalizeRowLabel(c.label) === normalizeRowLabel(row.category));
  if (!cat) return out;
  out.categoryId = cat.id;

  const labels = [
    row.subcategoryOne ?? row.subcategory_one,
    row.subcategoryTwo ?? row.subcategory_two,
    row.subcategoryThree ?? row.subcategory_three,
    row.subcategoryFour ?? row.subcategory_four,
  ].filter(Boolean);

  let children = cat.children || [];
  const keys = ['sub1Id', 'sub2Id', 'sub3Id', 'sub4Id'];
  for (let i = 0; i < labels.length && i < keys.length; i += 1) {
    const child = children.find((c) => normalizeRowLabel(c.label) === normalizeRowLabel(labels[i]));
    if (!child) break;
    out[keys[i]] = child.id;
    children = child.children || [];
  }
  return out;
}

async function dormantApi(body) {
  const res = await fetch('/api/product-loader-dormant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Dormant request failed');
  return json;
}

function findNode(tree, id) {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
}

function childrenOf(tree, id) {
  return findNode(tree, id)?.children || [];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function WarnBanner({ msg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
      {msg}
    </div>
  );
}

function SectionHead({ title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h3>
      {action}
    </div>
  );
}

export default function ProductLoaderPanel({
  taxonomyTree = categories,
  onShowToast,
  initialCode = '',
  onInitialCodeConsumed,
}) {
  const fileRef = useRef(null);
  const folderRef = useRef(null);

  const [batchItems, setBatchItems] = useState([]);
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, current: '' });
  const [batchDefaultCategoryId, setBatchDefaultCategoryId] = useState('');
  const [batchDefaultSub1Id, setBatchDefaultSub1Id] = useState('');
  const [batchOverwrite, setBatchOverwrite] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [sqlLiveStatus, setSqlLiveStatus] = useState(null);

  const [dormantRows, setDormantRows] = useState([]);
  const [dormantEdits, setDormantEdits] = useState({});
  const [dormantLoading, setDormantLoading] = useState(false);
  const [dormantSaving, setDormantSaving] = useState('');
  const singleProductRef = useRef(null);

  const loadDormant = async () => {
    setDormantLoading(true);
    try {
      const res = await fetch('/api/product-loader-dormant');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load dormant queue');
      const rows = json.rows || [];
      setDormantRows(rows);
      const edits = {};
      for (const row of rows) {
        edits[row.sku] = idsFromRowLabels(taxonomyTree, row);
      }
      setDormantEdits(edits);
    } catch (err) {
      onShowToast?.(err.message || 'Failed to load dormant products', 'error');
    } finally {
      setDormantLoading(false);
    }
  };

  useEffect(() => {
    void loadDormant();
  }, [taxonomyTree]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/product-loader-diag?code=8626100145')
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setSqlLiveStatus(json); })
      .catch(() => { if (!cancelled) setSqlLiveStatus(null); });
    return () => { cancelled = true; };
  }, []);

  const [code, setCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupData, setLookupData] = useState(null);
  const [matchedBy, setMatchedBy] = useState(null); // 'code' | 'barcode' | null
  const [lookupError, setLookupError] = useState('');

  const [fileObj, setFileObj] = useState(null);
  const [fileBase64, setFileBase64] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageSource, setImageSource] = useState('');
  const [imageSlot, setImageSlot] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [categoryId, setCategoryId] = useState('');
  const [sub1Id, setSub1Id] = useState('');
  const [sub2Id, setSub2Id] = useState('');
  const [sub3Id, setSub3Id] = useState('');
  const [sub4Id, setSub4Id] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [categorySource, setCategorySource] = useState('manual');

  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [priceZeroConfirmed, setPriceZeroConfirmed] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [publishError, setPublishError] = useState('');

  const resetLookupDependents = () => {
    setFileObj(null);
    setFileBase64('');
    setImageUrl('');
    setImageSource('');
    setImageSlot(1);
    setCategoryId('');
    setSub1Id('');
    setSub2Id('');
    setSub3Id('');
    setSub4Id('');
    setCategorySource('manual');
    setOverwriteConfirmed(false);
    setPriceZeroConfirmed(false);
    setPublishResult(null);
    setPublishError('');
  };

  const handleFolderSelect = async (fileList) => {
    const files = [...(fileList || [])].filter(isImageFile);
    if (!files.length) {
      setBatchError('No image files found in that folder.');
      return;
    }

    setBatchScanning(true);
    setBatchError('');
    setBatchItems([]);

    try {
      const res = await fetch('/api/product-loader-batch-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: files.map((f) => f.name) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Folder scan failed');

      const fileByName = new Map(files.map((f) => [f.name, f]));
      const merged = (json.items || []).map((item) => ({
        ...item,
        file: fileByName.get(item.filename) || null,
        status: item.warnings?.includes('not_in_catalog') ? 'unmatched' : 'ready',
        processError: '',
      }));

      setBatchItems(merged);
      onShowToast?.(`Matched ${json.summary?.matched ?? 0} of ${json.summary?.total ?? merged.length} images`, 'success');
    } catch (err) {
      setBatchError(err.message || 'Folder scan failed');
    } finally {
      setBatchScanning(false);
    }
  };

  const handleBatchPublish = async () => {
    const ready = batchItems.filter((i) => i.status === 'ready' && i.file && i.code);
    if (!ready.length) return;

    const needsCategory = ready.some((i) => !i.websiteRow?.category);
    if (needsCategory && !batchDefaultCategoryId) {
      setBatchError('Pick a default category for products not already on the website.');
      return;
    }

    setBatchProcessing(true);
    setBatchError('');
    setBatchProgress({ done: 0, total: ready.length, current: '' });

    let ok = 0;
    let failed = 0;

    for (let idx = 0; idx < ready.length; idx += 1) {
      const item = ready[idx];
      setBatchProgress({ done: idx, total: ready.length, current: item.filename });
      setBatchItems((prev) => prev.map((row) => (
        row.filename === item.filename ? { ...row, status: 'processing' } : row
      )));

      try {
        const b64 = await fileToBase64(item.file);
        const uploadRes = await fetch('/api/upload-product-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.filename,
            contentType: item.file.type || 'image/jpeg',
            base64: b64,
            sku: item.code,
            imageSlot: item.imageSlot,
          }),
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.error || 'Upload failed');

        const catId = item.websiteRow?.category
          ? (taxonomyTree.find((c) => c.label === item.websiteRow.category)?.id || batchDefaultCategoryId)
          : batchDefaultCategoryId;
        const sub1IdForItem = item.websiteRow?.subcategory_one
          ? ((findNode(taxonomyTree, catId)?.children || []).find((c) => c.label === item.websiteRow.subcategory_one)?.id || batchDefaultSub1Id)
          : batchDefaultSub1Id;

        const catNode = findNode(taxonomyTree, catId);
        const sub1Node = findNode(taxonomyTree, sub1IdForItem);
        const categoryLabel = catNode?.label || item.websiteRow?.category || '';
        const sub1Label = sub1Node?.label || item.websiteRow?.subcategory_one || categoryLabel;

        if (!categoryLabel) throw new Error('No category available');

        const publishRes = await fetch('/api/product-loader-publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: item.code,
            title: item.title || item.sqlRow?.title || item.code,
            price: item.price ?? item.sqlRow?.price ?? 0,
            barcode: item.barcode || item.websiteRow?.barcode || item.code,
            imageUrl: uploadJson.url,
            imageSlot: item.imageSlot,
            imageSource: 'upload',
            overwriteImage: batchOverwrite || item.warnings?.includes('image_exists'),
            category: categoryLabel,
            subcategoryOne: sub1Label,
            subcategoryTwo: item.websiteRow?.subcategory_two || null,
            description: item.websiteRow?.original_description || item.sqlRow?.title || '',
            categoryConfidence: item.websiteRow ? 1 : 0.5,
            publishMode: 'direct',
          }),
        });
        const publishJson = await publishRes.json();
        if (!publishRes.ok) throw new Error(publishJson.error || 'Publish failed');

        ok += 1;
        setBatchItems((prev) => prev.map((row) => (
          row.filename === item.filename ? { ...row, status: 'done', processError: '' } : row
        )));
      } catch (err) {
        failed += 1;
        setBatchItems((prev) => prev.map((row) => (
          row.filename === item.filename ? { ...row, status: 'error', processError: err.message } : row
        )));
      }
    }

    setBatchProgress({ done: ready.length, total: ready.length, current: '' });
    setBatchProcessing(false);
    onShowToast?.(`Folder done: ${ok} published${failed ? `, ${failed} failed` : ''}`, failed ? 'error' : 'success');
  };

  const removeBatchItem = (filename) => {
    setBatchItems((prev) => prev.filter((row) => row.filename !== filename));
  };

  const clearBatchList = () => {
    setBatchItems([]);
    setBatchError('');
  };

  const saveLookupToDormant = async () => {
    if (!lookupData || !categoryId || !sub1Id) {
      setPublishError('Pick a category and subcategory before saving to dormant.');
      return;
    }
    const labels = categoryLabelsFromIds(taxonomyTree, categoryId, sub1Id, sub2Id, sub3Id, sub4Id);
    setDormantSaving('single');
    setPublishError('');
    try {
      await dormantApi({
        action: 'save',
        code: websiteRow?.sku || code,
        title: sqlRow?.title || websiteRow?.title || code,
        price: sqlRow?.price ?? websiteRow?.price ?? 0,
        description: websiteRow?.original_description || sqlRow?.title || '',
        ...labels,
      });
      await loadDormant();
      onShowToast?.(`Saved ${websiteRow?.sku || code} to dormant queue`, 'success');
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setDormantSaving('');
    }
  };

  const saveBatchToDormant = async () => {
    const ready = batchItems.filter((i) => i.status === 'ready' && i.code);
    if (!ready.length) return;
    if (!batchDefaultCategoryId || !batchDefaultSub1Id) {
      setBatchError('Pick a default category and subcategory for dormant queue.');
      return;
    }
    const labels = categoryLabelsFromIds(taxonomyTree, batchDefaultCategoryId, batchDefaultSub1Id, '');
    setDormantSaving('batch');
    setBatchError('');
    let ok = 0;
    try {
      for (const item of ready) {
        await dormantApi({
          action: 'save',
          code: item.code,
          title: item.title || item.sqlRow?.title || item.code,
          price: item.price ?? item.sqlRow?.price ?? 0,
          description: item.websiteRow?.original_description || item.sqlRow?.title || '',
          category: item.websiteRow?.category || labels.category,
          subcategoryOne: item.websiteRow?.subcategory_one || labels.subcategoryOne,
          subcategoryTwo: item.websiteRow?.subcategory_two || null,
        });
        ok += 1;
      }
      await loadDormant();
      onShowToast?.(`Added ${ok} product${ok === 1 ? '' : 's'} to dormant queue`, 'success');
    } catch (err) {
      setBatchError(err.message);
    } finally {
      setDormantSaving('');
    }
  };

  const removeDormantRow = async (sku) => {
    if (!window.confirm(`Remove ${sku} from dormant queue?`)) return;
    setDormantSaving(`rm-${sku}`);
    try {
      await dormantApi({ action: 'remove', code: sku });
      setDormantRows((prev) => prev.filter((r) => r.sku !== sku));
      onShowToast?.(`Removed ${sku} from dormant queue`, 'success');
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setDormantSaving('');
    }
  };

  const saveDormantCategories = async (sku) => {
    const edit = dormantEdits[sku];
    if (!edit?.categoryId || !edit?.sub1Id) {
      onShowToast?.('Category and subcategory are required', 'error');
      return;
    }
    const labels = categoryLabelsFromIds(taxonomyTree, edit.categoryId, edit.sub1Id, edit.sub2Id, edit.sub3Id, edit.sub4Id);
    setDormantSaving(`cat-${sku}`);
    try {
      await dormantApi({ action: 'updateCategories', code: sku, ...labels });
      await loadDormant();
      onShowToast?.(`Updated categories for ${sku}`, 'success');
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setDormantSaving('');
    }
  };

  const sendDormantToImageGen = async (row) => {
    const sku = row.sku;
    setCode(sku);
    setLookupData(null);
    setLookupError('');
    resetLookupDependents();

    const edit = dormantEdits[sku] || idsFromRowLabels(taxonomyTree, row);
    setCategoryId(edit.categoryId || '');
    setSub1Id(edit.sub1Id || '');
    setSub2Id(edit.sub2Id || '');
    setSub3Id(edit.sub3Id || '');
    setSub4Id(edit.sub4Id || '');
    setCategorySource('existing');

    setLookingUp(true);
    try {
      const res = await fetch(`/api/product-loader-lookup?code=${encodeURIComponent(sku)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lookup failed');
      setLookupData(json);
      setMatchedBy(json.matchedBy || null);
      if (json.websiteRow) {
        const ws = json.websiteRow;
        if (!edit.categoryId) {
          setCategoryId(taxonomyTree.find((c) => c.label === ws.category)?.id || '');
        }
        if (json.existingImages.length) {
          setImageUrl(json.existingImages[0]);
          setImageSource('existing');
        }
      }
      singleProductRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onShowToast?.(`${sku} ready — upload or generate an image below`, 'success');
    } catch (err) {
      setLookupError(err.message || 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  const resolveLookupCode = (codeOverride) => {
    if (typeof codeOverride === 'string' || typeof codeOverride === 'number') {
      return String(codeOverride).trim();
    }
    return String(code || '').trim();
  };

  const handleLookup = async (codeOverride) => {
    const c = resolveLookupCode(codeOverride);
    if (!c || c === '[object Object]') return;
    if (typeof codeOverride === 'string' || typeof codeOverride === 'number') setCode(c);
    setLookingUp(true);
    setLookupError('');
    setLookupData(null);
    setMatchedBy(null);
    resetLookupDependents();

    try {
      const res = await fetch(`/api/product-loader-lookup?code=${encodeURIComponent(c)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lookup failed');
      setLookupData(json);
      setMatchedBy(json.matchedBy || null);

      // Pre-fill from existing website row
      if (json.websiteRow) {
        const ws = json.websiteRow;
        const resolved = idsFromRowLabels(taxonomyTree, {
          category: ws.category,
          subcategory_one: ws.subcategory_one,
          subcategory_two: ws.subcategory_two,
          subcategory_three: ws.subcategory_three,
          subcategory_four: ws.subcategory_four,
        });
        setCategoryId(resolved.categoryId || '');
        setSub1Id(resolved.sub1Id || '');
        setSub2Id(resolved.sub2Id || '');
        setSub3Id(resolved.sub3Id || '');
        setSub4Id(resolved.sub4Id || '');
        setCategorySource('existing');
        const firstEmpty = SLOT_FIELDS.findIndex((f) => !ws[f]);
        const targetSlot = firstEmpty >= 0 ? firstEmpty + 1 : 1;
        setImageSlot(targetSlot);
        if (json.existingImages.length) {
          setImageUrl(json.existingImages[0]);
          setImageSource('existing');
        }
      }
      if (codeOverride) {
        singleProductRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      setLookupError(err.message || 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  useEffect(() => {
    const c = String(initialCode || '').trim();
    if (!c) return;
    void handleLookup(c).finally(() => onInitialCodeConsumed?.());
  }, [initialCode]);

  const handleFileSelect = async (file) => {
    if (!file?.type.startsWith('image/')) return;
    setFileObj(file);
    const b64 = await fileToBase64(file);
    setFileBase64(b64);
    setImageUrl('');
    setImageSource('');
    setPublishError('');
  };

  const handleUpload = async () => {
    if (!fileObj || !fileBase64) return;
    setUploading(true);
    setPublishError('');
    try {
      const res = await fetch('/api/upload-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fileObj.name, contentType: fileObj.type, base64: fileBase64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setImageUrl(json.url);
      setImageSource('upload');
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTransform = async () => {
    if (!fileBase64 || !fileObj) return;
    setTransforming(true);
    setPublishError('');
    try {
      const transformRes = await fetch('/api/transform-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fileObj.name, contentType: fileObj.type, base64: fileBase64 }),
      });
      const transformJson = await transformRes.json();
      if (!transformRes.ok) throw new Error(transformJson.error || 'Transform failed');

      // Upload transformed result to get a permanent (non-staging) URL
      const uploadRes = await fetch('/api/upload-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `${code}-bg-removed.jpg`, contentType: 'image/jpeg', base64: transformJson.base64 }),
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error || 'Upload failed');

      setImageUrl(uploadJson.url);
      setImageSource('upload_transformed');
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setTransforming(false);
    }
  };

  const handleAnalyze = async () => {
    const hasImage = imageUrl || fileBase64;
    if (!hasImage) return;
    setAnalyzing(true);
    setPublishError('');
    try {
      let b64 = fileBase64;
      let contentType = fileObj?.type || 'image/jpeg';

      if (!b64 && imageUrl) {
        const imgRes = await fetch(imageUrl);
        const blob = await imgRes.blob();
        b64 = await blobToBase64(blob);
        contentType = blob.type || 'image/jpeg';
      }

      const res = await fetch('/api/analyze-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `${code}.jpg`, contentType, base64: b64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Analysis failed');

      const suggestedId = GEMINI_CATEGORY_MAP[json.category] || '';
      if (suggestedId) {
        const node = findNode(taxonomyTree, suggestedId);
        setCategoryId(suggestedId);
        setSub1Id(node?.children?.[0]?.id || '');
        setSub2Id('');
        setSub3Id('');
        setSub4Id('');
        setCategorySource('gemini');
      }
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const { sqlRow, websiteRow, existingImages = [], warnings = [] } = lookupData || {};
  const targetField = SLOT_FIELDS[imageSlot - 1];
  const isOverwritingFilledSlot = Boolean(websiteRow?.[targetField]) && imageSource !== 'existing';

  const canPublish = Boolean(
    lookupData
    && imageUrl
    && categoryId
    && sub1Id
    && (!warnings.includes('price_zero') || priceZeroConfirmed)
    && (!isOverwritingFilledSlot || overwriteConfirmed)
    && !publishing
    && !uploading
    && !transforming,
  );

  const handlePublish = async () => {
    if (!canPublish) return;
    const title = sqlRow?.title || websiteRow?.title || code;
    const price = sqlRow?.price ?? websiteRow?.price ?? 0;
    const catNode = findNode(taxonomyTree, categoryId);
    const sub1Node = findNode(taxonomyTree, sub1Id);
    const sub2Node = findNode(taxonomyTree, sub2Id);
    const sub3Node = findNode(taxonomyTree, sub3Id);
    const sub4Node = findNode(taxonomyTree, sub4Id);

    setPublishing(true);
    setPublishError('');
    try {
      const res = await fetch('/api/product-loader-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          title,
          price,
          barcode: websiteRow?.barcode || sqlRow?.barcode || code,
          imageUrl,
          imageSlot,
          imageSource,
          overwriteImage: isOverwritingFilledSlot ? overwriteConfirmed : false,
          category: catNode?.label || categoryId,
          subcategoryOne: sub1Node?.label || sub1Id || catNode?.label || categoryId,
          subcategoryTwo: sub2Node?.label || sub2Id || null,
          subcategoryThree: sub3Node?.label || sub3Id || null,
          subcategoryFour: sub4Node?.label || sub4Id || null,
          description: websiteRow?.original_description || sqlRow?.title || '',
          categoryConfidence: categorySource === 'gemini' ? 0.85 : 1.0,
          publishMode: 'direct',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Publish failed');
      setPublishResult(json);
      if (dormantRows.some((r) => r.sku === json.sku)) {
        await dormantApi({ action: 'remove', code: json.sku }).catch(() => {});
        setDormantRows((prev) => prev.filter((r) => r.sku !== json.sku));
      }
      onShowToast?.(
        `${json.action === 'create' ? 'Published' : 'Updated'} ${code} successfully`,
        'success',
      );
    } catch (err) {
      setPublishError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  const resetAll = () => {
    setCode('');
    setLookupData(null);
    setLookupError('');
    resetLookupDependents();
  };

  const sub1Options = categoryId ? childrenOf(taxonomyTree, categoryId) : [];
  const sub2Options = sub1Id ? childrenOf(taxonomyTree, sub1Id) : [];
  const sub3Options = sub2Id ? childrenOf(taxonomyTree, sub2Id) : [];
  const sub4Options = sub3Id ? childrenOf(taxonomyTree, sub3Id) : [];
  const batchSub1Options = batchDefaultCategoryId ? childrenOf(taxonomyTree, batchDefaultCategoryId) : [];
  const batchReadyCount = batchItems.filter((i) => i.status === 'ready').length;
  const batchUnmatchedCount = batchItems.filter((i) => i.status === 'unmatched').length;

  if (publishResult) {
    return (
      <div className="adm-panel" style={{ maxWidth: 640 }}>
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <CheckCircle size={52} color="#16a34a" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
            {publishResult.action === 'create' ? 'Product Published' : 'Product Updated'}
          </h2>
          <p style={{ color: '#6b7280', marginBottom: 28, fontSize: 15 }}>
            <strong style={{ color: '#111827' }}>{publishResult.sku}</strong> is now live on the website.
          </p>
          <button type="button" className="adm-btn-red" onClick={resetAll}>
            <PackagePlus size={15} /> Load Another Product
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-panel" style={{ maxWidth: 920 }}>
      {/* Header */}
      <div className="adm-section-head" style={{ marginBottom: 24 }}>
        <div>
          <h2 className="adm-section-title">Product Loader</h2>
          <p className="adm-section-note">Publish products from Positill — one at a time or upload a whole image folder.</p>
          {sqlLiveStatus?.bridgeConfigured && (
            <p style={{ fontSize: 12, marginTop: 6, fontWeight: 700, color: sqlLiveStatus.sqlConnectionTest ? '#15803d' : '#c2410c' }}>
              {sqlLiveStatus.sqlConnectionTest
                ? '● Live Positill SQL connected'
                : '● Live SQL configured but bridge unreachable — check Cloudflare tunnel on BLADERUNNER'}
            </p>
          )}
        </div>
      </div>

      {/* Folder batch */}
      <section style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        <SectionHead title="Image folder" />
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>
          Name each file with the product code — e.g. <code>8626100145.jpg</code> or <code>ME039-2-1.jpg</code> (code + image slot).
          Lookups use {sqlLiveStatus?.bridgeConfigured ? 'live Positill SQL' : 'the master catalogue (~39k items)'} for title, price and stock.
        </p>

        <div
          role="button"
          tabIndex={0}
          style={{
            border: '2px dashed #cbd5e1', borderRadius: 10, padding: '18px 16px', textAlign: 'center',
            cursor: batchScanning || batchProcessing ? 'wait' : 'pointer', background: '#f8fafc', marginBottom: 12,
          }}
          onClick={() => !batchScanning && !batchProcessing && folderRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && folderRef.current?.click()}
        >
          <input
            ref={folderRef}
            type="file"
            accept="image/*"
            multiple
            webkitdirectory=""
            directory=""
            hidden
            onChange={(e) => {
              void handleFolderSelect(e.target.files);
              e.target.value = '';
            }}
          />
          {batchScanning ? (
            <span style={{ fontSize: 13, color: '#64748b' }}><Loader2 size={16} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />Scanning folder…</span>
          ) : (
            <span style={{ fontSize: 13, color: '#475569' }}><FolderOpen size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Choose image folder</span>
          )}
        </div>

        {batchError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{batchError}</div>}

        {batchItems.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
              <strong>{batchReadyCount}</strong> ready
              {batchUnmatchedCount > 0 && <> · <span style={{ color: '#dc2626' }}>{batchUnmatchedCount} not in catalogue</span></>}
            </div>

            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>File</th>
                    <th style={{ padding: '8px 10px' }}>Code</th>
                    <th style={{ padding: '8px 10px' }}>Product</th>
                    <th style={{ padding: '8px 10px' }}>Slot</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px', width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {batchItems.map((row) => (
                    <tr key={row.filename} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 10px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.filename}</td>
                      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{row.code || '—'}</td>
                      <td style={{ padding: '7px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={displayTitle(row.title, row.sqlRow?.title)}>{displayTitle(row.title, row.sqlRow?.title) || '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{row.imageSlot}</td>
                      <td style={{ padding: '7px 10px', color: row.status === 'done' ? '#16a34a' : row.status === 'error' || row.status === 'unmatched' ? '#dc2626' : '#64748b' }}>
                        {row.status === 'processing' ? '…' : row.status}
                        {row.processError && ` — ${row.processError}`}
                      </td>
                      <td style={{ padding: '7px 6px' }}>
                        <button
                          type="button"
                          className="adm-icon-btn"
                          title="Remove from list"
                          disabled={batchProcessing}
                          onClick={() => removeBatchItem(row.filename)}
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Default category (for new products)</label>
                <select
                  className="adm-select adm-select--enhanced"
                  style={{ width: '100%' }}
                  value={batchDefaultCategoryId}
                  onChange={(e) => { setBatchDefaultCategoryId(e.target.value); setBatchDefaultSub1Id(''); }}
                >
                  <option value="">— Select if needed —</option>
                  {taxonomyTree.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
              {batchSub1Options.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Default subcategory (required for dormant)</label>
                  <select
                    className="adm-select adm-select--enhanced"
                    style={{ width: '100%' }}
                    value={batchDefaultSub1Id}
                    onChange={(e) => setBatchDefaultSub1Id(e.target.value)}
                  >
                    <option value="">— Optional —</option>
                    {batchSub1Options.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={batchOverwrite} onChange={(e) => setBatchOverwrite(e.target.checked)} />
                Replace images if slot already filled
              </label>
            </div>

            {batchProcessing && (
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                Processing {batchProgress.done + 1}/{batchProgress.total}
                {batchProgress.current ? ` — ${batchProgress.current}` : ''}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="adm-btn-red"
                onClick={() => void handleBatchPublish()}
                disabled={batchProcessing || batchScanning || batchReadyCount === 0}
              >
                {batchProcessing ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
                {batchProcessing ? 'Publishing folder…' : `Upload & publish ${batchReadyCount} image${batchReadyCount === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={() => void saveBatchToDormant()}
                disabled={batchProcessing || batchScanning || batchReadyCount === 0 || dormantSaving === 'batch'}
              >
                {dormantSaving === 'batch' ? <Loader2 size={15} className="spin" /> : <PackagePlus size={15} />}
                Add {batchReadyCount} to dormant
              </button>
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={clearBatchList}
                disabled={batchProcessing || batchScanning}
              >
                Clear list
              </button>
            </div>
          </>
        )}
      </section>

      {/* Dormant queue */}
      <section style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        <SectionHead
          title={`Dormant products (${dormantRows.length})`}
          action={(
            <button type="button" className="adm-btn-ghost adm-btn-sm" onClick={() => void loadDormant()} disabled={dormantLoading}>
              {dormantLoading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
          )}
        />
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>
          Products waiting for images — assign categories here, then send to image generation when ready.
        </p>

        {dormantLoading && !dormantRows.length && (
          <p style={{ fontSize: 13, color: '#94a3b8' }}><Loader2 size={14} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />Loading…</p>
        )}

        {!dormantLoading && dormantRows.length === 0 && (
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No dormant products yet. Look up a code and use “Save to dormant” or add from a folder batch.</p>
        )}

        {dormantRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dormantRows.map((row) => {
              const edit = dormantEdits[row.sku] || { categoryId: '', sub1Id: '', sub2Id: '', sub3Id: '', sub4Id: '' };
              const rowSub1Options = edit.categoryId ? childrenOf(taxonomyTree, edit.categoryId) : [];
              const rowSub2Options = edit.sub1Id ? childrenOf(taxonomyTree, edit.sub1Id) : [];
              const rowSub3Options = edit.sub2Id ? childrenOf(taxonomyTree, edit.sub2Id) : [];
              const rowSub4Options = edit.sub3Id ? childrenOf(taxonomyTree, edit.sub3Id) : [];
              const busy = dormantSaving === `rm-${row.sku}` || dormantSaving === `cat-${row.sku}`;

              return (
                <div
                  key={row.sku}
                  style={{
                    border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px',
                    background: '#fafafa', display: 'grid', gap: 10,
                    gridTemplateColumns: '1fr auto',
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#111827', marginBottom: 2 }}>{displayTitle(row.title, row.sqlRow?.title) || row.sku}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                      <strong>{row.sku}</strong>
                      {row.price > 0 && <> · R{Number(row.price).toFixed(2)}</>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                      <select
                        className="adm-select adm-select--enhanced"
                        value={edit.categoryId}
                        disabled={busy}
                        onChange={(e) => {
                          const categoryId = e.target.value;
                          setDormantEdits((prev) => ({
                            ...prev,
                            [row.sku]: { categoryId, sub1Id: '', sub2Id: '', sub3Id: '', sub4Id: '' },
                          }));
                        }}
                      >
                        <option value="">Category</option>
                        {taxonomyTree.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                      </select>
                      {rowSub1Options.length > 0 && (
                        <select
                          className="adm-select adm-select--enhanced"
                          value={edit.sub1Id}
                          disabled={busy}
                          onChange={(e) => {
                            const sub1Id = e.target.value;
                            setDormantEdits((prev) => ({
                              ...prev,
                              [row.sku]: { ...prev[row.sku], sub1Id, sub2Id: '', sub3Id: '', sub4Id: '' },
                            }));
                          }}
                        >
                          <option value="">Subcategory</option>
                          {rowSub1Options.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                      {rowSub2Options.length > 0 && (
                        <select
                          className="adm-select adm-select--enhanced"
                          value={edit.sub2Id}
                          disabled={busy}
                          onChange={(e) => {
                            const sub2Id = e.target.value;
                            setDormantEdits((prev) => ({
                              ...prev,
                              [row.sku]: { ...prev[row.sku], sub2Id, sub3Id: '', sub4Id: '' },
                            }));
                          }}
                        >
                          <option value="">Subcategory 2</option>
                          {rowSub2Options.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                      {rowSub3Options.length > 0 && (
                        <select
                          className="adm-select adm-select--enhanced"
                          value={edit.sub3Id}
                          disabled={busy}
                          onChange={(e) => {
                            const sub3Id = e.target.value;
                            setDormantEdits((prev) => ({
                              ...prev,
                              [row.sku]: { ...prev[row.sku], sub3Id, sub4Id: '' },
                            }));
                          }}
                        >
                          <option value="">Subcategory 3</option>
                          {rowSub3Options.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                      {rowSub4Options.length > 0 && (
                        <select
                          className="adm-select adm-select--enhanced"
                          value={edit.sub4Id}
                          disabled={busy}
                          onChange={(e) => {
                            const sub4Id = e.target.value;
                            setDormantEdits((prev) => ({
                              ...prev,
                              [row.sku]: { ...prev[row.sku], sub4Id },
                            }));
                          }}
                        >
                          <option value="">Subcategory 4</option>
                          {rowSub4Options.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn-sm"
                      style={{ marginTop: 8 }}
                      disabled={busy}
                      onClick={() => void saveDormantCategories(row.sku)}
                    >
                      Save categories
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <button
                      type="button"
                      className="adm-btn-red adm-btn-sm"
                      disabled={busy}
                      onClick={() => void sendDormantToImageGen(row)}
                    >
                      <ImagePlus size={14} /> Image gen
                    </button>
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn-sm"
                      disabled={busy}
                      onClick={() => void removeDormantRow(row.sku)}
                      style={{ color: '#dc2626' }}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div ref={singleProductRef}>
      <SectionHead title="Single product" />

      {/* Code lookup */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          style={{ flex: 1, border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 600, outline: 'none', letterSpacing: '0.04em' }}
          placeholder="Positill code (e.g. 8626100145, MM007-6, 233B)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !lookingUp && handleLookup()}
          disabled={lookingUp}
        />
        <button
          type="button"
          className="adm-btn-red"
          onClick={() => void handleLookup()}
          disabled={lookingUp || !code.trim()}
        >
          {lookingUp ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          {lookingUp ? 'Looking up…' : 'Look up'}
        </button>
      </div>

      {lookupError && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{lookupError}</div>
      )}


      {lookupData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 8 }}>

          {/* Product info card */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>
                Code: <strong style={{ color: '#475569' }}>{websiteRow?.sku || code}</strong>
                {matchedBy === 'barcode' && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#fef9c3', color: '#854d0e' }}>matched via barcode</span>
                )}
              </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                  {displayTitle(sqlRow?.title, websiteRow?.title) || '—'}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#475569', flexWrap: 'wrap' }}>
                  <span>Price: <strong>R{Number(sqlRow?.price ?? websiteRow?.price ?? 0).toFixed(2)}</strong></span>
                  {sqlRow?.available !== undefined && (
                    <span>Available: <strong>{sqlRow.available} units</strong></span>
                  )}
                  {sqlRow?.dept && <span>Dept: <strong>{sqlRow.dept}</strong></span>}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: websiteRow ? '#dcfce7' : '#fff7ed', color: websiteRow ? '#15803d' : '#c2410c', flexShrink: 0 }}>
                {websiteRow ? 'On website' : 'New product'}
              </span>
            </div>
          </div>

          {/* Warnings */}
          {(warnings.includes('price_zero') || warnings.includes('low_stock')) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {warnings.includes('price_zero') && (
                <WarnBanner msg="Price is R0.00 — confirm before publishing." />
              )}
              {warnings.includes('low_stock') && (
                <WarnBanner msg="Stock on hand is 0 — product will show as out of stock on the website." />
              )}
            </div>
          )}

          {/* Category — assign before dormant save or publish */}
          <section>
            <SectionHead
              title="Category"
              action={imageUrl ? (
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn-sm"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  title="Ask Gemini to suggest a category based on the product image"
                >
                  {analyzing ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                  {analyzing ? 'Analysing…' : 'Suggest from image'}
                </button>
              ) : null}
            />

            {categorySource === 'gemini' && (
              <div style={{ fontSize: 12, color: '#7c3aed', marginBottom: 8, fontWeight: 600 }}>
                ✦ Gemini suggestion — adjust if needed
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Category *</label>
                <select
                  className="adm-select adm-select--enhanced"
                  style={{ width: '100%' }}
                  value={categoryId}
                  onChange={(e) => { setCategoryId(e.target.value); setSub1Id(''); setSub2Id(''); setSub3Id(''); setSub4Id(''); setCategorySource('manual'); }}
                >
                  <option value="">— Select category —</option>
                  {taxonomyTree.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {sub1Options.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Subcategory *</label>
                  <select
                    className="adm-select adm-select--enhanced"
                    style={{ width: '100%' }}
                    value={sub1Id}
                    onChange={(e) => { setSub1Id(e.target.value); setSub2Id(''); setSub3Id(''); setSub4Id(''); }}
                  >
                    <option value="">— Select subcategory —</option>
                    {sub1Options.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {sub2Options.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Subcategory 2 <span style={{ color: '#94a3b8' }}>(optional)</span></label>
                  <select
                    className="adm-select adm-select--enhanced"
                    style={{ width: '100%' }}
                    value={sub2Id}
                    onChange={(e) => { setSub2Id(e.target.value); setSub3Id(''); setSub4Id(''); }}
                  >
                    <option value="">— None —</option>
                    {sub2Options.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {sub3Options.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Subcategory 3 <span style={{ color: '#94a3b8' }}>(optional)</span></label>
                  <select
                    className="adm-select adm-select--enhanced"
                    style={{ width: '100%' }}
                    value={sub3Id}
                    onChange={(e) => { setSub3Id(e.target.value); setSub4Id(''); }}
                  >
                    <option value="">— None —</option>
                    {sub3Options.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {sub4Options.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Subcategory 4 <span style={{ color: '#94a3b8' }}>(optional)</span></label>
                  <select
                    className="adm-select adm-select--enhanced"
                    style={{ width: '100%' }}
                    value={sub4Id}
                    onChange={(e) => setSub4Id(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {sub4Options.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {categoryId && sub1Id && (
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => void saveLookupToDormant()}
                  disabled={dormantSaving === 'single'}
                >
                  {dormantSaving === 'single' ? <Loader2 size={14} className="spin" /> : <PackagePlus size={14} />}
                  Save to dormant queue
                </button>
              )}
            </div>
          </section>

          {/* Image section */}
          <section>
            <SectionHead title="Image" />

            {/* Existing image thumbnails */}
            {existingImages.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {existingImages.map((url, i) => {
                  const slotNum = i + 1;
                  const isSelected = imageUrl === url && imageSource === 'existing';
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => { setImageUrl(url); setImageSource('existing'); setImageSlot(slotNum); setFileObj(null); setFileBase64(''); }}
                      style={{
                        width: 80, height: 80, padding: 0, cursor: 'pointer', position: 'relative',
                        border: `2px solid ${isSelected ? '#8B1A1A' : '#e2e8f0'}`,
                        borderRadius: 10, overflow: 'hidden', background: 'none',
                        transition: 'border-color 0.15s',
                      }}
                      title={`Use Image ${slotNum}`}
                    >
                      <img src={url} alt={`Image ${slotNum}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, textAlign: 'center', padding: '2px 0', fontWeight: 600 }}>
                        Img {slotNum}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Slot selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#64748b' }}>Target slot:</span>
              <select
                className="adm-select adm-select--enhanced adm-select--compact"
                value={imageSlot}
                onChange={(e) => {
                  const slot = Number(e.target.value);
                  setImageSlot(slot);
                  const slotUrl = websiteRow?.[SLOT_FIELDS[slot - 1]];
                  if (slotUrl && imageSource === 'existing') {
                    setImageUrl(slotUrl);
                  }
                }}
              >
                {[1, 2, 3, 4].map((s) => {
                  const filled = Boolean(websiteRow?.[SLOT_FIELDS[s - 1]]);
                  return (
                    <option key={s} value={s}>
                      Image {s} {filled ? '(filled)' : '(empty)'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Upload drop zone */}
            <div
              role="button"
              tabIndex={0}
              style={{
                border: `2px dashed ${dragOver ? '#8B1A1A' : fileObj ? '#16a34a' : '#cbd5e1'}`,
                borderRadius: 10, padding: '20px 16px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#fff5f5' : fileObj ? '#f0fdf4' : '#f8fafc',
                transition: 'all 0.15s', marginBottom: fileObj ? 10 : 0,
              }}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
              />
              <Upload size={16} style={{ marginRight: 6, verticalAlign: 'middle', color: fileObj ? '#16a34a' : '#94a3b8' }} />
              <span style={{ fontSize: 13, color: fileObj ? '#15803d' : '#9ca3af' }}>
                {fileObj ? fileObj.name : 'Click or drag an image to upload'}
              </span>
            </div>

            {/* Upload / transform buttons */}
            {fileObj && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="adm-btn-red" onClick={handleUpload} disabled={uploading || transforming}>
                  {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
                  {uploading ? 'Uploading…' : 'Upload as-is'}
                </button>
                <button type="button" className="adm-btn-ghost" onClick={handleTransform} disabled={uploading || transforming}>
                  {transforming ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                  {transforming ? 'Processing…' : 'Remove background + Upload'}
                </button>
              </div>
            )}

            {/* Image preview */}
            {imageUrl && (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <img
                  src={imageUrl}
                  alt="Selected"
                  style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0', flexShrink: 0 }}
                />
                <div style={{ fontSize: 12, color: '#64748b', paddingTop: 4, lineHeight: 1.8 }}>
                  <div>Source: <strong style={{ color: '#374151' }}>
                    {imageSource === 'existing' ? 'Existing website image' : imageSource === 'upload_transformed' ? 'Uploaded (BG removed)' : 'Uploaded'}
                  </strong></div>
                  <div>Target: <strong style={{ color: '#374151' }}>Image {imageSlot}</strong></div>
                  {isOverwritingFilledSlot && (
                    <div style={{ color: '#dc2626', fontWeight: 600 }}>Will replace existing image in slot {imageSlot}</div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Confirmations + Publish */}
          {imageUrl && categoryId && sub1Id && (
            <section>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {warnings.includes('price_zero') && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#92400e', userSelect: 'none' }}>
                    <input type="checkbox" checked={priceZeroConfirmed} onChange={(e) => setPriceZeroConfirmed(e.target.checked)} />
                    I confirm publishing with R0.00 price
                  </label>
                )}
                {isOverwritingFilledSlot && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#dc2626', userSelect: 'none' }}>
                    <input type="checkbox" checked={overwriteConfirmed} onChange={(e) => setOverwriteConfirmed(e.target.checked)} />
                    Replace the existing image in slot {imageSlot}
                  </label>
                )}
              </div>

              {/* Summary */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#475569', marginBottom: 16, lineHeight: 1.9 }}>
                <strong style={{ color: '#111827' }}>Publishing:</strong>{' '}
                {displayTitle(sqlRow?.title, websiteRow?.title, code) || code} ·{' '}
                {findNode(taxonomyTree, categoryId)?.label || categoryId}
                {sub1Id ? ` › ${findNode(taxonomyTree, sub1Id)?.label || sub1Id}` : ''}
                {sub2Id ? ` › ${findNode(taxonomyTree, sub2Id)?.label || sub2Id}` : ''}
                {sub3Id ? ` › ${findNode(taxonomyTree, sub3Id)?.label || sub3Id}` : ''}
                {sub4Id ? ` › ${findNode(taxonomyTree, sub4Id)?.label || sub4Id}` : ''}
                {' · '}Image {imageSlot} ({imageSource === 'existing' ? 'existing' : imageSource === 'upload_transformed' ? 'BG removed' : 'new'})
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="adm-btn-red"
                  onClick={handlePublish}
                  disabled={!canPublish}
                >
                  {publishing ? <Loader2 size={15} className="spin" /> : <PackagePlus size={15} />}
                  {publishing ? 'Publishing…' : websiteRow ? 'Update Product' : 'Publish New Product'}
                </button>
                {publishError && (
                  <span style={{ fontSize: 13, color: '#dc2626' }}>{publishError}</span>
                )}
              </div>
            </section>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
