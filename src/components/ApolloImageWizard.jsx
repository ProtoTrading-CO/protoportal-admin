import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Layers,
  Loader2,
  Ruler,
  Sparkles,
  Sun,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import ApolloProductPicker from './ApolloProductPicker';
import ApolloCompactProductList from './ApolloCompactProductList';
import ApolloSelectedProductPreview from './ApolloSelectedProductPreview';
import ReprocessLiveFeed from './ReprocessLiveFeed';
import { compressImage, applyDormantLive } from '../lib/products';
import {
  countRecipeJobs,
  expandProductSlots,
  recipeSummary,
  runReprocessBatch,
} from '../lib/reprocessQueue';
import { finishImageBatch, startImageBatch, updateImageBatch } from '../lib/imageBatchTracker';
import {
  createImageGenBatchId,
  registerImageGenBatch,
  syncImageGenBatchProgress,
  flushImageGenBatchProgress,
} from '../lib/imageGenSession';

const STEPS = ['Scope', 'Recipe', 'Generate', 'Done'];

const SLOT_META = [
  { slot: 1, label: 'Image 1', hint: 'Hero · front view' },
  { slot: 2, label: 'Image 2', hint: '45° angle · three-quarter' },
  { slot: 3, label: 'Image 3', hint: 'Side profile' },
  { slot: 4, label: 'Image 4', hint: 'Detail · alternate angle' },
];

const STYLE_OPTIONS = [
  { id: 'shadow', label: 'White BG', note: 'Studio white + soft shadow', icon: Sun },
  { id: 'generative', label: 'Generative AI', note: 'Match a reference look', icon: Sparkles },
  { id: 'measurements', label: 'Measurements', note: 'Dimension lines from description', icon: Ruler },
];

function createDefaultSlotPlans() {
  return {
    1: { enabled: true, style: 'shadow', prompt: '', referenceUrl: '' },
    2: { enabled: false, style: 'shadow', prompt: '', referenceUrl: '' },
    3: { enabled: false, style: 'shadow', prompt: '', referenceUrl: '' },
    4: { enabled: false, style: 'shadow', prompt: '', referenceUrl: '' },
  };
}

function enabledSlots(slotPlans) {
  return [1, 2, 3, 4].filter((s) => slotPlans[s]?.enabled);
}

function ReferenceImageLightbox({ gallery, index, onClose, onChangeIndex, onPick }) {
  const current = gallery?.[index];
  const hasPrev = gallery && index > 0;
  const hasNext = gallery && index < gallery.length - 1;

  useEffect(() => {
    if (!gallery?.length) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onChangeIndex(index - 1);
      if (e.key === 'ArrowRight' && index < gallery.length - 1) onChangeIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gallery, index, onClose, onChangeIndex]);

  if (!gallery?.length || index < 0 || !current) return null;

  return (
    <div className="apollo-ref-lightbox" role="dialog" aria-modal="true" aria-label="Reference preview">
      <button type="button" className="apollo-ref-lightbox-backdrop" onClick={onClose} aria-label="Close" />
      <div className="apollo-ref-lightbox-inner">
        <header className="apollo-ref-lightbox-head">
          <div>
            <strong>{current.title || current.sku}</strong>
            <span>{current.slot ? `Image ${current.slot}` : 'Uploaded reference'}</span>
          </div>
          <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="apollo-ref-lightbox-stage">
          {hasPrev && (
            <button type="button" className="apollo-ref-lightbox-nav apollo-ref-lightbox-nav--prev" onClick={() => onChangeIndex(index - 1)} aria-label="Previous">
              <ChevronLeft size={28} />
            </button>
          )}
          <img src={current.url} alt="" className="apollo-ref-lightbox-img" />
          {hasNext && (
            <button type="button" className="apollo-ref-lightbox-nav apollo-ref-lightbox-nav--next" onClick={() => onChangeIndex(index + 1)} aria-label="Next">
              <ChevronRight size={28} />
            </button>
          )}
        </div>
        {onPick && (
          <footer className="apollo-ref-lightbox-foot">
            <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => { onPick(current.url); onClose(); }}>
              <Check size={14} /> Use as reference
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

export default function ApolloImageWizard({
  taxonomyTree = [],
  prefillProducts = null,
  onExit,
  onRunInBackground,
  onShowToast,
  onGoToApproval,
  onRefreshCatalog,
}) {
  const prefillIds = useMemo(
    () => (prefillProducts?.length ? new Set(prefillProducts.map((p) => p.id || p.sku)) : null),
    [prefillProducts],
  );

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => prefillIds || new Set());
  const [slotPlans, setSlotPlans] = useState(createDefaultSlotPlans);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState([]);
  const [batchDone, setBatchDone] = useState(false);
  const [applyingLive, setApplyingLive] = useState(false);
  const [refCandidates, setRefCandidates] = useState([]);
  const [refCandidatesLoading, setRefCandidatesLoading] = useState(false);
  const [refLightboxIndex, setRefLightboxIndex] = useState(-1);
  const [refPickSlot, setRefPickSlot] = useState(null);
  const [refUploadSlot, setRefUploadSlot] = useState(null);
  const [refUploading, setRefUploading] = useState(false);
  const [sameCodeProducts, setSameCodeProducts] = useState(null);
  const [sameCodeSelected, setSameCodeSelected] = useState(new Set());
  const [applyingSameCode, setApplyingSameCode] = useState(false);
  const [sameCodeSuggestion, setSameCodeSuggestion] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedProductsLoading, setSelectedProductsLoading] = useState(false);

  const abortRef = useRef(null);
  const batchIdRef = useRef(null);
  const refInputRef = useRef(null);
  const backgroundRef = useRef(false);
  const generatedProductsRef = useRef([]);
  const allLiveRowsRef = useRef(null);

  const activeSlots = useMemo(() => enabledSlots(slotPlans), [slotPlans]);
  const totalJobs = countRecipeJobs(selectedIds.size, slotPlans);
  const summaryLines = useMemo(() => recipeSummary(slotPlans), [slotPlans]);

  const selectedIdsKey = [...selectedIds].sort().join(',');

  useEffect(() => {
    setSameCodeSelected(new Set((sameCodeProducts || []).map((p) => p.sku)));
  }, [sameCodeProducts]);

  useEffect(() => {
    if (!busy) return;
    const active = queue.find((q) => q.status === 'transforming')
      || queue.find((q) => q.status === 'pending');
    if (active) {
      updateImageBatch({ currentSku: active.sku, currentLabel: active.name || active.sku });
    }
  }, [queue, busy]);

  const ensureAllLiveRows = async () => {
    if (allLiveRowsRef.current) return allLiveRowsRef.current;
    const res = await fetch('/api/stock-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listLive' }),
    });
    const json = await res.json();
    allLiveRowsRef.current = res.ok ? (json.rows || []) : [];
    return allLiveRowsRef.current;
  };

  useEffect(() => {
    if (step >= 2 || selectedIds.size === 0) { setSameCodeSuggestion([]); return undefined; }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await ensureAllLiveRows();
        const selSkus = new Set(selectedIds);
        const selBarcodes = new Set(
          rows.filter((r) => selSkus.has(r.sku)).map((r) => String(r.barcode || '').trim()).filter(Boolean),
        );
        if (!selBarcodes.size) { if (!cancelled) setSameCodeSuggestion([]); return; }
        const suggestions = rows.filter((r) => {
          const bc = String(r.barcode || '').trim();
          return bc && selBarcodes.has(bc) && !selSkus.has(r.sku);
        });
        if (!cancelled) setSameCodeSuggestion(suggestions);
      } catch {
        if (!cancelled) setSameCodeSuggestion([]);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdsKey, step]);

  useEffect(() => {
    if (step !== 1 || selectedIds.size === 0) {
      setRefCandidates([]);
      return undefined;
    }
    let cancelled = false;
    setRefCandidatesLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/stock-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'listLive' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load images');
        const idSet = new Set(selectedIds);
        const list = [];
        for (const row of json.rows || []) {
          if (!idSet.has(row.sku)) continue;
          [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four].forEach((url, i) => {
            if (url) {
              list.push({
                url,
                sku: row.sku,
                title: row.title,
                slot: i + 1,
                label: `${row.title} · Image ${i + 1}`,
              });
            }
          });
        }
        if (!cancelled) setRefCandidates(list);
      } catch {
        if (!cancelled) setRefCandidates([]);
      } finally {
        if (!cancelled) setRefCandidatesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, selectedIdsKey]);

  const handleDeselectProduct = useCallback((sku) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(sku);
      if (next.size === 0) {
        setStep(0);
        onShowToast?.('All products removed — pick your scope again', 'warning');
      }
      return next;
    });
  }, [onShowToast]);

  const patchSlot = (slot, patch) => {
    setSlotPlans((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], ...patch },
    }));
  };

  const applyPresetAllWhite = () => {
    setSlotPlans({
      1: { enabled: true, style: 'shadow', prompt: '', referenceUrl: '' },
      2: { enabled: true, style: 'shadow', prompt: '45 degree angle, show depth', referenceUrl: '' },
      3: { enabled: true, style: 'shadow', prompt: 'Side profile view', referenceUrl: '' },
      4: { enabled: true, style: 'shadow', prompt: 'Detail or alternate angle', referenceUrl: '' },
    });
  };

  const applyPresetHeroOnly = () => {
    setSlotPlans(createDefaultSlotPlans());
  };

  const applyPresetMixed = () => {
    setSlotPlans({
      1: { enabled: true, style: 'shadow', prompt: 'Front hero, centred on white', referenceUrl: '' },
      2: { enabled: true, style: 'generative', prompt: 'Match reference style, keep product identity', referenceUrl: '' },
      3: { enabled: true, style: 'measurements', prompt: '', referenceUrl: '' },
      4: { enabled: true, style: 'shadow', prompt: '45° angle, soft shadow', referenceUrl: '' },
    });
  };

  const handleReferenceUpload = async (file, slot) => {
    if (!file || !file.type.startsWith('image/')) {
      onShowToast?.('Please choose an image file', 'error');
      return;
    }
    setRefUploading(true);
    try {
      const blob = await compressImage(file);
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const res = await fetch('/api/upload-reference-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, contentType: 'image/jpeg' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      patchSlot(slot, { referenceUrl: json.url });
      onShowToast?.(`Reference set for Image ${slot}`, 'success');
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setRefUploading(false);
      setRefUploadSlot(null);
    }
  };

  const validateRecipe = () => {
    if (!activeSlots.length) {
      onShowToast?.('Enable at least one image slot', 'error');
      return false;
    }
    for (const slot of activeSlots) {
      const plan = slotPlans[slot];
      if (plan.style === 'generative' && !plan.referenceUrl && !plan.prompt.trim()) {
        onShowToast?.(`Image ${slot}: Generative AI needs a reference or prompt`, 'error');
        return false;
      }
    }
    return true;
  };

  const loadProducts = async (idSet = selectedIds) => {
    const mapStockRow = (row) => ({
      id: row.sku,
      sku: row.sku,
      name: row.title,
      title: row.title,
      barcode: row.barcode || '',
      image: row.image_url_one,
      images: [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four].filter(Boolean),
    });
    const mapPrefillRow = (p) => {
      const images = p.images?.length
        ? p.images
        : [p.image, p.secondaryImage, p.imageThree, p.imageFour].filter(Boolean);
      return {
        id: p.id || p.sku,
        sku: p.sku || p.id,
        name: p.title || p.name || p.sku,
        title: p.title || p.name || p.sku,
        barcode: p.barcode || '',
        image: images[0] || p.image,
        images,
      };
    };

    let products = [];
    if (prefillProducts?.length) {
      products = prefillProducts.filter((p) => idSet.has(p.id || p.sku)).map(mapPrefillRow);
    }

    const haveSkus = new Set(products.map((p) => p.sku));
    let missing = [...idSet].filter((id) => !haveSkus.has(id));

    if (missing.length) {
      const res = await fetch('/api/stock-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listLive' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load products');
      for (const row of json.rows || []) {
        if (missing.includes(row.sku)) {
          products.push(mapStockRow(row));
          haveSkus.add(row.sku);
        }
      }
    }

    missing = [...idSet].filter((id) => !haveSkus.has(id));
    if (missing.length) {
      const res = await fetch('/api/stock-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listArchived' }),
      });
      const json = await res.json();
      if (res.ok) {
        for (const row of json.rows || []) {
          if (missing.includes(row.sku)) products.push(mapStockRow(row));
        }
      }
    }

    return products;
  };

  useEffect(() => {
    if (step < 1 || selectedIds.size === 0) {
      setSelectedProducts([]);
      return undefined;
    }
    let cancelled = false;
    setSelectedProductsLoading(true);
    void (async () => {
      try {
        const products = await loadProducts();
        if (!cancelled) setSelectedProducts(products);
      } catch {
        if (!cancelled) setSelectedProducts([]);
      } finally {
        if (!cancelled) setSelectedProductsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedIdsKey]);

  const startGen = async () => {
    if (!selectedIds.size) {
      onShowToast?.('Select at least one product', 'error');
      return;
    }
    if (!validateRecipe()) return;

    setStep(2);
    setBusy(true);
    setBatchDone(false);
    setQueue([]);
    setSameCodeProducts(null);
    generatedProductsRef.current = [];
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const products = selectedProducts.length
        ? selectedProducts
        : await loadProducts();
      if (!products.length) {
        onShowToast?.('Could not load selected products', 'error');
        setStep(1);
        return;
      }

      generatedProductsRef.current = products;
      const expanded = expandProductSlots(products, { defaultSlots: activeSlots });
      const initial = expanded.flatMap((p) => p.slots.map((slot) => ({
        sku: p.sku,
        name: p.name,
        thumbUrl: p.images?.[slot - 1] || p.image || null,
        slot,
        status: 'pending',
        message: 'Queued…',
      })));
      setQueue(initial);

      const batchId = createImageGenBatchId();
      batchIdRef.current = batchId;
      const styleLabel = summaryLines.length > 1 ? 'Mixed recipe' : summaryLines[0] || 'Image batch';

      await registerImageGenBatch({
        batchId,
        total: initial.length,
        style: styleLabel,
        productCount: products.length,
      });

      startImageBatch({ total: initial.length, style: styleLabel, productCount: products.length });

      let doneCount = 0;
      let failedCount = 0;

      await runReprocessBatch(expanded, {
        slotPlans,
        batchId,
        signal: ac.signal,
        onItemUpdate: (index, patch) => {
          const item = initial[index];
          if (patch.status === 'done') {
            doneCount += 1;
            updateImageBatch({ done: doneCount, failed: failedCount });
            void syncImageGenBatchProgress(batchId, { done: doneCount, failed: failedCount });
          }
          if (patch.status === 'error') {
            failedCount += 1;
            updateImageBatch({ done: doneCount, failed: failedCount });
            void syncImageGenBatchProgress(batchId, { done: doneCount, failed: failedCount });
          }
          if (backgroundRef.current) return;
          setQueue((prev) => prev.map((q, idx) => (idx === index ? { ...q, ...patch } : q)));
        },
      });

      const aborted = ac.signal.aborted;
      finishImageBatch({ aborted });
      if (batchIdRef.current) {
        await flushImageGenBatchProgress(batchIdRef.current, {
          done: doneCount,
          failed: failedCount,
          status: aborted ? 'cancelled' : 'complete',
        });
      }
      if (!aborted) {
        onShowToast?.(
          `Batch complete — ${doneCount} staged${failedCount ? `, ${failedCount} failed` : ''}. Review in Approval.`,
          failedCount && !doneCount ? 'error' : 'success',
        );
        onRefreshCatalog?.();
      }
      if (!backgroundRef.current) {
        setBatchDone(true);
        setStep(3);
        void findAndSetSameCodeProducts(generatedProductsRef.current);
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        onShowToast?.(err.message, 'error');
        finishImageBatch({ aborted: false });
        setStep(1);
      } else {
        finishImageBatch({ aborted: true });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const findAndSetSameCodeProducts = async (genProds) => {
    const generatedSkus = new Set(genProds.map((p) => p.sku).filter(Boolean));
    if (!generatedSkus.size) { setSameCodeProducts([]); return; }
    try {
      allLiveRowsRef.current = null;
      const rows = await ensureAllLiveRows();
      const generatedBarcodes = new Set(
        rows.filter((r) => generatedSkus.has(r.sku)).map((r) => String(r.barcode || '').trim()).filter(Boolean),
      );
      if (!generatedBarcodes.size) { setSameCodeProducts([]); return; }
      setSameCodeProducts(
        rows
          .filter((row) => {
            const bc = String(row.barcode || '').trim();
            return bc && generatedBarcodes.has(bc) && !generatedSkus.has(row.sku);
          })
          .map((row) => ({
            sku: row.sku,
            title: row.title,
            barcode: row.barcode,
            image: row.image_url_one,
            images: [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four].filter(Boolean),
          })),
      );
    } catch {
      setSameCodeProducts([]);
    }
  };

  const applyToSameCode = async () => {
    const toApply = (sameCodeProducts || []).filter((p) => sameCodeSelected.has(p.sku));
    if (!toApply.length) return;
    setApplyingSameCode(true);
    try {
      const expanded = expandProductSlots(toApply, { defaultSlots: activeSlots });
      const total = countRecipeJobs(toApply.length, slotPlans);
      const batchId = createImageGenBatchId();
      await registerImageGenBatch({ batchId, total, style: 'Same-code recipe', productCount: toApply.length });
      startImageBatch({ total, style: 'Same-code recipe', productCount: toApply.length });
      await runReprocessBatch(expanded, { slotPlans, batchId });
      finishImageBatch({ aborted: false });
      onShowToast?.(`Applied to ${toApply.length} product${toApply.length === 1 ? '' : 's'} — review in Approval`, 'success');
      setSameCodeProducts((prev) => (prev || []).filter((p) => !sameCodeSelected.has(p.sku)));
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setApplyingSameCode(false);
    }
  };

  const applyLiveNow = async () => {
    const skus = [...new Set(queue.filter((q) => q.status === 'done').map((q) => q.sku))];
    if (!skus.length) {
      onShowToast?.('No staged previews yet', 'error');
      return;
    }
    setApplyingLive(true);
    let applied = 0;
    const errors = [];
    for (const sku of skus) {
      try {
        const result = await applyDormantLive(sku);
        if (result.mode === 'image_applied') applied += 1;
        else errors.push(`${sku}: already up to date`);
      } catch (err) {
        errors.push(`${sku}: ${err.message}`);
      }
    }
    setApplyingLive(false);
    onRefreshCatalog?.();
    if (errors.length && applied === 0) onShowToast?.(`Set live failed — ${errors[0]}`, 'error');
    else if (errors.length) onShowToast?.(`${applied} set live, ${errors.length} skipped`, 'warning');
    else onShowToast?.(`${applied} product${applied === 1 ? '' : 's'} set live`, 'success');
    onExit?.();
  };

  const sendToApproval = () => {
    onShowToast?.('Previews saved — review in Approval tab', 'success');
    onGoToApproval?.();
    onExit?.();
  };

  const goToApprovalWhileRunning = () => {
    backgroundRef.current = true;
    onRunInBackground?.();
    onGoToApproval?.();
  };

  const handleExit = () => {
    if (busy) goToApprovalWhileRunning();
    else onExit?.();
  };

  const canNext = () => {
    if (step === 0) return selectedIds.size > 0;
    if (step === 1) return activeSlots.length > 0;
    return true;
  };

  const progressPct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="apollo-wizard">
      <div className="apollo-wizard-head">
        <div>
          <h3 className="apollo-wizard-title"><Sparkles size={20} strokeWidth={2.2} /> Image generation</h3>
          <p className="apollo-wizard-sub">
            Step {step + 1} of {STEPS.length} · <strong>{STEPS[step]}</strong>
          </p>
        </div>
        <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={handleExit}>
          <X size={14} /> {busy ? 'Run in background' : 'Exit'}
        </button>
      </div>

      <div className="apollo-wizard-progress" aria-hidden="true">
        <div className="apollo-wizard-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="apollo-wizard-steps">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`apollo-wizard-step${i === step ? ' apollo-wizard-step--active' : ''}${i < step ? ' apollo-wizard-step--done' : ''}`}
            onClick={() => { if (i < step && !busy) setStep(i); }}
            disabled={i > step || busy}
          >
            {i < step ? <Check size={11} /> : <span className="apollo-wizard-step-num">{i + 1}</span>}
            {label}
          </button>
        ))}
      </div>

      {step === 0 && prefillProducts?.length ? (
        <div className="apollo-wizard-panel">
          <header className="apollo-panel-intro">
            <h4>Select products</h4>
            <p>Choose which catalogue products to run through your image recipe.</p>
          </header>
          <ApolloCompactProductList
            products={prefillProducts}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
          />
        </div>
      ) : step === 0 ? (
        <ApolloProductPicker
          taxonomyTree={taxonomyTree}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      ) : null}

      {step < 2 && sameCodeSuggestion.length > 0 && (
        <div className="apollo-samecode-hint">
          <div className="apollo-samecode-hint-body">
            <Layers size={15} />
            <span>
              <strong>{sameCodeSuggestion.length} product{sameCodeSuggestion.length === 1 ? '' : 's'} share the same code</strong>
              {' '}— add them to this batch?
            </span>
          </div>
          <div className="apollo-samecode-hint-actions">
            <button
              type="button"
              className="adm-btn-red adm-btn--sm"
              onClick={() => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  sameCodeSuggestion.forEach((p) => next.add(p.sku));
                  return next;
                });
              }}
            >
              Add {sameCodeSuggestion.length} variant{sameCodeSuggestion.length === 1 ? '' : 's'}
            </button>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => setSameCodeSuggestion([])}>Dismiss</button>
          </div>
        </div>
      )}

      {step >= 1 && step <= 2 && selectedIds.size > 0 && (
        <ApolloSelectedProductPreview
          products={selectedProducts}
          loading={selectedProductsLoading}
          activeSlots={activeSlots}
          onEditSelection={step === 1 && !busy ? () => setStep(0) : undefined}
          onDeselectProduct={step === 1 && !busy ? handleDeselectProduct : undefined}
          compact={step === 2}
        />
      )}

      {step === 1 && (
        <div className="apollo-wizard-panel apollo-recipe-panel">
          <header className="apollo-panel-intro">
            <h4>Build your image recipe</h4>
            <p>
              Mix styles per slot — e.g. Image 1 white BG, Image 2 generative AI with your prompt,
              Image 3 measurements, Image 4 at 45°. Highlighted slots match your recipe below.
            </p>
          </header>

          <div className="apollo-recipe-presets">
            <span className="apollo-recipe-presets-label">Quick start</span>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={applyPresetAllWhite}>All white BG (4 angles)</button>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={applyPresetMixed}>Mixed example</button>
            <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={applyPresetHeroOnly}>Hero only</button>
          </div>

          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && refUploadSlot) void handleReferenceUpload(file, refUploadSlot);
              e.target.value = '';
            }}
          />

          <div className="apollo-recipe-grid">
            {SLOT_META.map(({ slot, label, hint }) => {
              const plan = slotPlans[slot];
              const StyleIcon = STYLE_OPTIONS.find((s) => s.id === plan.style)?.icon || Sun;
              return (
                <article
                  key={slot}
                  className={`apollo-recipe-card${plan.enabled ? ' apollo-recipe-card--on' : ''}`}
                >
                  <header className="apollo-recipe-card-head">
                    <label className="apollo-recipe-toggle">
                      <input
                        type="checkbox"
                        checked={plan.enabled}
                        onChange={(e) => patchSlot(slot, { enabled: e.target.checked })}
                      />
                      <span className="apollo-recipe-slot-num">{slot}</span>
                      <span className="apollo-recipe-slot-title">
                        <strong>{label}</strong>
                        <span>{hint}</span>
                      </span>
                    </label>
                    {plan.enabled && <StyleIcon size={16} className="apollo-recipe-style-icon" />}
                  </header>

                  {plan.enabled && (
                    <div className="apollo-recipe-card-body">
                      <div className="apollo-recipe-styles">
                        {STYLE_OPTIONS.map((s) => {
                          const Icon = s.icon;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`apollo-recipe-style-btn${plan.style === s.id ? ' apollo-recipe-style-btn--on' : ''}`}
                              onClick={() => patchSlot(slot, { style: s.id })}
                              title={s.note}
                            >
                              <Icon size={14} />
                              {s.label}
                            </button>
                          );
                        })}
                      </div>

                      <label className="apollo-recipe-prompt-label">
                        <span>Prompt for {label.toLowerCase()}</span>
                        <textarea
                          className="apollo-slot-prompt-input"
                          rows={2}
                          value={plan.prompt}
                          onChange={(e) => patchSlot(slot, { prompt: e.target.value })}
                          placeholder={
                            slot === 4
                              ? 'e.g. 45° angle, show depth and one side…'
                              : slot === 2
                                ? 'e.g. Match reference style, soft lifestyle look…'
                                : 'Optional — lighting, angle, props…'
                          }
                        />
                      </label>

                      {plan.style === 'generative' && (
                        <div className="apollo-recipe-ref">
                          <span className="apollo-recipe-ref-label">Reference image</span>
                          {plan.referenceUrl ? (
                            <div className="apollo-recipe-ref-preview">
                              <img src={plan.referenceUrl} alt="" />
                              <div className="apollo-recipe-ref-actions">
                                <button
                                  type="button"
                                  className="adm-btn-ghost adm-btn--sm"
                                  onClick={() => { setRefUploadSlot(slot); refInputRef.current?.click(); }}
                                  disabled={refUploading}
                                >
                                  Replace
                                </button>
                                <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => patchSlot(slot, { referenceUrl: '' })}>
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="apollo-recipe-ref-empty">
                              <button
                                type="button"
                                className="adm-btn-ghost adm-btn--sm"
                                onClick={() => { setRefUploadSlot(slot); refInputRef.current?.click(); }}
                                disabled={refUploading}
                              >
                                {refUploading && refUploadSlot === slot ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                                Upload
                              </button>
                              {refCandidates.length > 0 && (
                                <button
                                  type="button"
                                  className="adm-btn-ghost adm-btn--sm"
                                  onClick={() => { setRefPickSlot(slot); setRefLightboxIndex(0); }}
                                >
                                  Pick from catalogue
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {plan.style === 'measurements' && (
                        <p className="apollo-recipe-note"><Ruler size={12} /> Uses dimensions from each product description.</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {refCandidatesLoading && (
            <p className="adm-muted apollo-recipe-ref-loading"><Loader2 size={14} className="spin" /> Loading catalogue images for references…</p>
          )}

          <aside className="apollo-recipe-summary">
            <h5>Your recipe</h5>
            {summaryLines.length ? (
              <ul>
                {summaryLines.map((line) => <li key={line}>{line}</li>)}
              </ul>
            ) : (
              <p className="adm-muted">Enable at least one image slot above.</p>
            )}
            <p className="apollo-recipe-total">
              <strong>{totalJobs}</strong> images · {selectedIds.size} product{selectedIds.size === 1 ? '' : 's'}
            </p>
          </aside>

          {refLightboxIndex >= 0 && refPickSlot && (
            <ReferenceImageLightbox
              gallery={refCandidates}
              index={refLightboxIndex}
              onClose={() => { setRefLightboxIndex(-1); setRefPickSlot(null); }}
              onChangeIndex={setRefLightboxIndex}
              onPick={(url) => {
                patchSlot(refPickSlot, { referenceUrl: url });
                setRefPickSlot(null);
                onShowToast?.(`Reference set for Image ${refPickSlot}`, 'success');
              }}
            />
          )}
        </div>
      )}

      {step === 2 && (
        <div className="apollo-wizard-panel">
          <div className="apollo-gen-notice">
            <Sparkles size={16} />
            <p>Generating your recipe — switch to <strong>Approval</strong> anytime. We&apos;ll notify you when done.</p>
          </div>
          <ReprocessLiveFeed
            queue={queue}
            busy={busy}
            onDismiss={() => {}}
            onOpenNewProducts={() => {}}
            openLabel=""
            onStop={() => abortRef.current?.abort()}
          />
          {busy && (
            <button type="button" className="adm-btn-red" style={{ marginTop: 12 }} onClick={goToApprovalWhileRunning}>
              Go to Approval — notify me when done
            </button>
          )}
          {!busy && batchDone && (
            <button type="button" className="adm-btn-red" style={{ marginTop: 12 }} onClick={() => setStep(3)}>
              Continue
            </button>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="apollo-wizard-panel apollo-wizard-dest">
          <header className="apollo-panel-intro">
            <h4>Batch complete</h4>
            <p>Publish now or send to Approval for review.</p>
          </header>
          <div className="apollo-dest-actions">
            <button type="button" className="apollo-dest-btn apollo-dest-btn--primary" disabled={applyingLive} onClick={() => void applyLiveNow()}>
              {applyingLive ? <Loader2 size={16} className="spin" /> : <CheckCircle size={16} />}
              Set live straight away
            </button>
            <button type="button" className="apollo-dest-btn apollo-dest-btn--secondary" onClick={sendToApproval}>
              <ImagePlus size={16} /> Send to Approval
            </button>
          </div>

          {sameCodeProducts === null && (
            <p className="apollo-same-code-loading"><Loader2 size={14} className="spin" /> Checking for same-code products…</p>
          )}

          {sameCodeProducts?.length > 0 && (
            <section className="apollo-same-code-section">
              <div className="apollo-same-code-head">
                <h5><Layers size={15} /> Same code — apply recipe to others</h5>
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn--sm"
                  onClick={() => setSameCodeSelected(
                    sameCodeSelected.size === sameCodeProducts.length
                      ? new Set()
                      : new Set(sameCodeProducts.map((p) => p.sku)),
                  )}
                >
                  {sameCodeSelected.size === sameCodeProducts.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <ul className="apollo-same-code-list">
                {sameCodeProducts.map((p) => (
                  <li key={p.sku} className={sameCodeSelected.has(p.sku) ? 'apollo-same-code-item--on' : ''}>
                    <label className="apollo-same-code-label">
                      <input
                        type="checkbox"
                        checked={sameCodeSelected.has(p.sku)}
                        onChange={() => setSameCodeSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.sku)) next.delete(p.sku); else next.add(p.sku);
                          return next;
                        })}
                      />
                      <span className="apollo-same-code-title">{p.title}</span>
                      <span className="apollo-same-code-sku">{p.sku}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="adm-btn-red"
                disabled={applyingSameCode || sameCodeSelected.size === 0}
                onClick={() => void applyToSameCode()}
              >
                {applyingSameCode ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                Apply recipe to {sameCodeSelected.size} product{sameCodeSelected.size === 1 ? '' : 's'}
              </button>
            </section>
          )}
        </div>
      )}

      {step < 2 && (
        <div className="apollo-wizard-nav">
          <button type="button" className="adm-btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft size={14} /> Back
          </button>
          {step === 0 ? (
            <button type="button" className="adm-btn-red" disabled={!canNext()} onClick={() => setStep(1)}>
              Build recipe <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" className="adm-btn-red" disabled={!canNext() || busy} onClick={() => void startGen()}>
              <Sparkles size={14} /> Generate {totalJobs} image{totalJobs === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
