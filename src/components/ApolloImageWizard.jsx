import { useEffect, useRef, useState } from 'react';
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
import ReprocessLiveFeed from './ReprocessLiveFeed';
import { compressImage } from '../lib/products';
import { expandProductSlots, runReprocessBatch } from '../lib/reprocessQueue';
import { finishImageBatch, startImageBatch, updateImageBatch } from '../lib/imageBatchTracker';
import {
  createImageGenBatchId,
  registerImageGenBatch,
  syncImageGenBatchProgress,
} from '../lib/imageGenSession';

const STYLES = [
  {
    id: 'shadow',
    label: 'White background + shadows',
    note: 'Clean studio shot with a soft drop shadow on pure white.',
    icon: Sun,
  },
  {
    id: 'generative',
    label: 'Generative AI match',
    note: 'Upload a reference on the next step — every product matches that look.',
    icon: Sparkles,
  },
  {
    id: 'measurements',
    label: 'Measurement lines',
    note: 'Experimental — dimension lines pulled from each product description.',
    icon: Ruler,
  },
];

const STEPS = ['Scope', 'Style', 'Reference', 'Prompt', 'Options', 'Generate', 'Destination'];

function ReferenceImageLightbox({ gallery, index, onClose, onChangeIndex, onUseReference }) {
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
    <div className="apollo-ref-lightbox" role="dialog" aria-modal="true" aria-label="Reference image preview">
      <button type="button" className="apollo-ref-lightbox-backdrop" onClick={onClose} aria-label="Close" />
      <div className="apollo-ref-lightbox-inner">
        <header className="apollo-ref-lightbox-head">
          <div>
            <strong>{current.title || current.sku}</strong>
            <span>{current.slot ? `Image ${current.slot}` : 'Uploaded reference'}</span>
          </div>
          <span className="apollo-ref-lightbox-counter">{index + 1} / {gallery.length}</span>
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
        <footer className="apollo-ref-lightbox-foot">
          <button type="button" className="adm-btn-red adm-btn--sm" onClick={() => { onUseReference(current.url); onClose(); }}>
            <Check size={14} /> Use as reference
          </button>
        </footer>
        <div className="apollo-ref-lightbox-thumbs">
          {gallery.map((g, i) => (
            <button
              key={`${g.url}-${i}`}
              type="button"
              className={`apollo-ref-lightbox-thumb${i === index ? ' apollo-ref-lightbox-thumb--active' : ''}`}
              onClick={() => onChangeIndex(i)}
            >
              <img src={g.url} alt="" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ApolloImageWizard({
  taxonomyTree = [],
  onExit,
  onRunInBackground,
  onShowToast,
  onGoToApproval,
  onRefreshCatalog,
}) {
  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [imageStyle, setImageStyle] = useState('shadow');
  const [promptNotes, setPromptNotes] = useState('');
  const [multiAngle, setMultiAngle] = useState(true);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState([]);
  const [batchDone, setBatchDone] = useState(false);
  const [applyingLive, setApplyingLive] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [refCandidates, setRefCandidates] = useState([]);
  const [refCandidatesLoading, setRefCandidatesLoading] = useState(false);
  const [refLightboxIndex, setRefLightboxIndex] = useState(-1);
  const abortRef = useRef(null);
  const batchIdRef = useRef(null);
  const refInputRef = useRef(null);
  const backgroundRef = useRef(false);

  const selectedStyle = STYLES.find((s) => s.id === imageStyle);

  useEffect(() => {
    if (step !== 2 || selectedIds.size === 0) {
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
  }, [step, [...selectedIds].join(',')]);

  const refGallery = referenceUrl && !refCandidates.some((c) => c.url === referenceUrl)
    ? [{ url: referenceUrl, sku: '', title: 'Uploaded reference', slot: null, label: 'Uploaded reference' }, ...refCandidates]
    : refCandidates;

  const selectReference = (url) => {
    setReferenceUrl(url);
    onShowToast?.('Reference image selected', 'success');
  };

  const openRefLightbox = (index) => setRefLightboxIndex(index);

  const handleReferenceUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      onShowToast?.('Please choose an image file', 'error');
      return;
    }
    setReferenceUploading(true);
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
      setReferenceUrl(json.url);
      onShowToast?.('Reference image uploaded', 'success');
    } catch (err) {
      onShowToast?.(err.message, 'error');
    } finally {
      setReferenceUploading(false);
    }
  };

  const onRefDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleReferenceUpload(file);
  };

  const goToApprovalWhileRunning = () => {
    backgroundRef.current = true;
    onRunInBackground?.();
    onGoToApproval?.();
  };

  const handleExit = () => {
    if (busy) {
      goToApprovalWhileRunning();
      return;
    }
    onExit?.();
  };

  const startGen = async () => {
    if (!selectedIds.size) {
      onShowToast?.('Select at least one product', 'error');
      return;
    }
    if (imageStyle === 'generative' && !referenceUrl && !promptNotes.trim()) {
      onShowToast?.('Generative AI needs a reference image or a prompt', 'error');
      setStep(2);
      return;
    }

    setStep(5);
    setBusy(true);
    setBatchDone(false);
    setQueue([]);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch('/api/stock-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listLive' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load products');
      const idSet = new Set(selectedIds);
      const products = (json.rows || [])
        .filter((row) => idSet.has(row.sku))
        .map((row) => ({
          id: row.sku,
          sku: row.sku,
          name: row.title,
          title: row.title,
          image: row.image_url_one,
          images: [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four].filter(Boolean),
        }));

      if (!products.length) {
        onShowToast?.('Could not load selected products', 'error');
        return;
      }

      const expanded = expandProductSlots(products, { fillSlots: multiAngle, defaultSlots: [1] });
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
      await registerImageGenBatch({
        batchId,
        total: initial.length,
        style: selectedStyle?.label || imageStyle,
        productCount: products.length,
      });

      startImageBatch({
        total: initial.length,
        style: selectedStyle?.label || imageStyle,
        productCount: products.length,
      });

      let doneCount = 0;
      let failedCount = 0;

      await runReprocessBatch(expanded, {
        prompt: promptNotes,
        imageStyle,
        referenceImageUrl: referenceUrl || undefined,
        fillSlots: multiAngle,
        batchId,
        signal: ac.signal,
        onItemUpdate: (index, patch) => {
          const item = initial[index];
          if (patch.status === 'transforming') {
            updateImageBatch({
              currentSku: item?.sku,
              currentLabel: item?.name,
            });
          }
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
          setQueue((prev) => {
            const next = prev.map((q, idx) => (idx === index ? { ...q, ...patch } : q));
            if (patch.status === 'done' || patch.status === 'error') {
              const doneItem = next[index];
              return [doneItem, ...next.filter((_, idx) => idx !== index)];
            }
            return next;
          });
        },
      });

      const aborted = ac.signal.aborted;
      finishImageBatch({ aborted });
      if (batchIdRef.current) {
        void syncImageGenBatchProgress(batchIdRef.current, {
          done: doneCount,
          failed: failedCount,
          status: aborted ? 'cancelled' : 'complete',
        });
      }
      if (!aborted) {
        onShowToast?.(
          `Image batch complete — ${doneCount} staged${failedCount ? `, ${failedCount} failed` : ''}. Review in Approval.`,
          failedCount && !doneCount ? 'error' : 'success',
        );
        onRefreshCatalog?.();
      }
      if (!backgroundRef.current) {
        setBatchDone(true);
        setStep(6);
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        onShowToast?.(err.message, 'error');
        finishImageBatch({ aborted: false });
      } else {
        finishImageBatch({ aborted: true });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const applyLiveNow = async () => {
    const skus = [...new Set(queue.filter((q) => q.status === 'done').map((q) => q.sku))];
    if (!skus.length) return;
    setApplyingLive(true);
    let ok = 0;
    const errors = [];
    for (const sku of skus) {
      try {
        const res = await fetch('/api/apply-dormant-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        ok += 1;
      } catch (err) {
        errors.push(`${sku}: ${err.message}`);
      }
    }
    setApplyingLive(false);
    onRefreshCatalog?.();
    if (errors.length) {
      onShowToast?.(`Set live: ${ok} ok, ${errors.length} failed`, ok ? 'success' : 'error');
    } else {
      onShowToast?.(`${ok} product${ok === 1 ? '' : 's'} set live`, 'success');
    }
    onExit?.();
  };

  const sendToApproval = () => {
    onShowToast?.('Previews saved — review in Approval tab', 'success');
    onGoToApproval?.();
    onExit?.();
  };

  const canNext = () => {
    if (step === 0) return selectedIds.size > 0;
    if (step === 1) return !!imageStyle;
    if (step === 2 && imageStyle === 'generative') return !!referenceUrl;
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

      {step === 0 && (
        <ApolloProductPicker
          taxonomyTree={taxonomyTree}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      )}

      {step === 1 && (
        <div className="apollo-wizard-panel apollo-wizard-panel--style">
          <header className="apollo-panel-intro">
            <h4>Choose a look for this batch</h4>
            <p>Pick one style — it applies to every selected product.</p>
          </header>
          <div className="apollo-style-grid">
            {STYLES.map((s) => {
              const Icon = s.icon;
              const on = imageStyle === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`apollo-style-card${on ? ' apollo-style-card--on' : ''}`}
                  onClick={() => setImageStyle(s.id)}
                >
                  <span className="apollo-style-card-icon"><Icon size={22} strokeWidth={1.8} /></span>
                  <span className="apollo-style-card-body">
                    <strong>{s.label}</strong>
                    <span>{s.note}</span>
                  </span>
                  {on && <span className="apollo-style-card-check"><Check size={16} /></span>}
                </button>
              );
            })}
          </div>
          {imageStyle === 'measurements' && (
            <p className="apollo-callout apollo-callout--warn">
              <Ruler size={14} /> Experimental — results depend on dimensions in each product description.
            </p>
          )}
          {imageStyle === 'generative' && (
            <p className="apollo-callout apollo-callout--info">
              <Sparkles size={14} /> Next step: upload the reference image products should match.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="apollo-wizard-panel apollo-wizard-panel--reference">
          <header className="apollo-panel-intro">
            <h4>Reference image</h4>
            <p>
              {imageStyle === 'generative'
                ? 'Upload the style you want every product to match. Required for Generative AI.'
                : 'Optional — only used when Generative AI style is selected. You can skip this step.'}
            </p>
          </header>

          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void handleReferenceUpload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          {referenceUrl ? (
            <div className="apollo-ref-preview-large">
              <button type="button" className="apollo-ref-preview-large-btn" onClick={() => {
                const idx = refGallery.findIndex((g) => g.url === referenceUrl);
                openRefLightbox(idx >= 0 ? idx : 0);
              }}>
                <img src={referenceUrl} alt="Reference style" />
                <span className="apollo-ref-preview-zoom"><ZoomIn size={20} /></span>
              </button>
              <div className="apollo-ref-preview-actions">
                <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={() => refInputRef.current?.click()} disabled={referenceUploading}>
                  Replace upload
                </button>
                <button type="button" className="adm-btn-ghost adm-btn--sm adm-btn-ghost--danger" onClick={() => setReferenceUrl('')}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`apollo-ref-dropzone${dragOver ? ' apollo-ref-dropzone--over' : ''}`}
              onClick={() => refInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onRefDrop}
              disabled={referenceUploading}
            >
              {referenceUploading ? (
                <Loader2 size={28} className="spin" />
              ) : (
                <>
                  <Upload size={28} strokeWidth={1.5} />
                  <strong>Upload reference image</strong>
                  <span>Drag & drop or click to browse · JPG, PNG, WebP</span>
                </>
              )}
            </button>
          )}

          <section className="apollo-ref-gallery-section">
            <header className="apollo-ref-gallery-head">
              <h5>Browse selected product images</h5>
              <p>Click to view full size, or pick one as your reference style.</p>
            </header>
            {refCandidatesLoading && (
              <div className="adm-loading-inline"><Loader2 size={16} className="spin" /> Loading images…</div>
            )}
            {!refCandidatesLoading && refCandidates.length === 0 && (
              <p className="adm-muted apollo-ref-gallery-empty">No images on selected products yet — upload a reference above.</p>
            )}
            {!refCandidatesLoading && refCandidates.length > 0 && (
              <div className="apollo-ref-gallery-grid">
                {refCandidates.map((item, i) => {
                  const selected = referenceUrl === item.url;
                  return (
                    <div key={`${item.sku}-${item.slot}`} className={`apollo-ref-gallery-item${selected ? ' apollo-ref-gallery-item--selected' : ''}`}>
                      <button type="button" className="apollo-ref-gallery-thumb" onClick={() => openRefLightbox(i)} aria-label={`View ${item.label}`}>
                        <img src={item.url} alt="" loading="lazy" />
                        <span className="apollo-ref-gallery-zoom"><ZoomIn size={14} /></span>
                      </button>
                      <div className="apollo-ref-gallery-meta">
                        <span className="apollo-ref-gallery-title" title={item.title}>{item.title}</span>
                        <span className="apollo-ref-gallery-slot">Slot {item.slot}</span>
                      </div>
                      <button
                        type="button"
                        className={`apollo-ref-gallery-use${selected ? ' apollo-ref-gallery-use--on' : ''}`}
                        onClick={() => selectReference(item.url)}
                      >
                        {selected ? <><Check size={12} /> Selected</> : 'Use as reference'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {refLightboxIndex >= 0 && (
            <ReferenceImageLightbox
              gallery={refGallery}
              index={refLightboxIndex}
              onClose={() => setRefLightboxIndex(-1)}
              onChangeIndex={setRefLightboxIndex}
              onUseReference={selectReference}
            />
          )}
        </div>
      )}

      {step === 3 && (
        <div className="apollo-wizard-panel apollo-wizard-panel--prompt">
          <header className="apollo-panel-intro">
            <h4>Prompt</h4>
            <p>Optional extra instructions appended to every image in this batch — lighting, angle, props, etc.</p>
          </header>
          <textarea
            className="apollo-prompt-input"
            rows={8}
            value={promptNotes}
            onChange={(e) => setPromptNotes(e.target.value)}
            placeholder="e.g. Soft shadow, product centred, no props, keep branding visible…"
          />
          <p className="apollo-prompt-hint">{promptNotes.length > 0 ? `${promptNotes.length} characters` : 'Leave blank to use the default style prompt only.'}</p>
        </div>
      )}

      {step === 4 && (
        <div className="apollo-wizard-panel apollo-wizard-panel--options">
          <header className="apollo-panel-intro">
            <h4>Batch options</h4>
            <p>Review before starting generation.</p>
          </header>
          <label className="apollo-option-card">
            <input type="checkbox" checked={multiAngle} onChange={(e) => setMultiAngle(e.target.checked)} />
            <div>
              <strong><Layers size={15} /> Multiple angles (4 views per product)</strong>
              <p>Front hero plus three alternate angles — staged to image slots 1–4. Recommended for catalogue listings.</p>
            </div>
          </label>
          <div className="apollo-summary">
            <div><span>Products</span><strong>{selectedIds.size}</strong></div>
            <div><span>Images to generate</span><strong>{selectedIds.size * (multiAngle ? 4 : 1)}</strong></div>
            <div><span>Style</span><strong>{selectedStyle?.label}</strong></div>
            <div><span>Reference</span><strong>{referenceUrl ? 'Uploaded' : 'None'}</strong></div>
            <div><span>Prompt</span><strong>{promptNotes.trim() ? 'Custom' : 'Default'}</strong></div>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="apollo-wizard-panel">
          <div className="apollo-gen-notice">
            <Sparkles size={16} />
            <p>Generating images — you can switch to the <strong>Approval</strong> tab anytime. We&apos;ll notify you when the batch is done.</p>
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
            <button type="button" className="adm-btn-red" style={{ marginTop: 12 }} onClick={() => setStep(6)}>
              Continue to destination
            </button>
          )}
        </div>
      )}

      {step === 6 && (
        <div className="apollo-wizard-panel apollo-wizard-dest">
          <header className="apollo-panel-intro">
            <h4>Where should these go?</h4>
            <p>Batch complete — publish now or review in Approval first.</p>
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
        </div>
      )}

      {step < 5 && (
        <div className="apollo-wizard-nav">
          <button type="button" className="adm-btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft size={14} /> Back
          </button>
          {step < 4 ? (
            <button type="button" className="adm-btn-red" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" className="adm-btn-red" disabled={!canNext() || busy} onClick={() => void startGen()}>
              <Sparkles size={14} /> Start Gen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
