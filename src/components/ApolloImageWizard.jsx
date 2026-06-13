import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ImagePlus,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import ApolloProductPicker from './ApolloProductPicker';
import ReprocessLiveFeed from './ReprocessLiveFeed';
import { compressImage } from '../lib/products';
import { expandProductSlots, runReprocessBatch } from '../lib/reprocessQueue';

const STYLES = [
  { id: 'shadow', label: 'White background + shadows', note: 'Studio drop shadow on pure white.' },
  { id: 'generative', label: 'White background + shadows + Generative AI', note: 'Optional reference image — other products match its look.' },
  { id: 'measurements', label: 'White background + shadows + Measurement lines', note: 'Experimental — pulls dimensions from description.' },
];

const STEPS = ['Scope', 'Style', 'Rules', 'Options', 'Generate', 'Destination'];

export default function ApolloImageWizard({
  taxonomyTree = [],
  onExit,
  onShowToast,
  onGoToApproval,
  onRefreshCatalog,
}) {
  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [imageStyle, setImageStyle] = useState('shadow');
  const [rulesNotes, setRulesNotes] = useState('');
  const [fillSlots, setFillSlots] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState([]);
  const [batchDone, setBatchDone] = useState(false);
  const [applyingLive, setApplyingLive] = useState(false);
  const abortRef = useRef(null);
  const refInputRef = useRef(null);

  const handleReferenceUpload = async (file) => {
    if (!file) return;
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

  const startGen = async () => {
    if (!selectedIds.size) {
      onShowToast?.('Select at least one product', 'error');
      return;
    }
    if (imageStyle === 'generative' && !referenceUrl && !rulesNotes.trim()) {
      onShowToast?.('Generative AI: upload a reference image or add rules/notes', 'error');
      return;
    }

    setStep(4);
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
        setBusy(false);
        return;
      }

      const expanded = expandProductSlots(products, { fillSlots, defaultSlots: [1] });
      const initial = expanded.flatMap((p) => p.slots.map((slot) => ({
        sku: p.sku,
        name: p.name,
        thumbUrl: p.images?.[slot - 1] || p.image || null,
        slot,
        status: 'pending',
        message: 'Queued…',
      })));
      setQueue(initial);

      await runReprocessBatch(expanded, {
        prompt: rulesNotes,
        imageStyle,
        referenceImageUrl: referenceUrl || undefined,
        fillSlots,
        signal: ac.signal,
        onItemUpdate: (index, patch) => {
          setQueue((prev) => {
            const next = prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item));
            if (patch.status === 'done' || patch.status === 'error') {
              const doneItem = next[index];
              return [doneItem, ...next.filter((_, idx) => idx !== index)];
            }
            return next;
          });
        },
      });
      setBatchDone(true);
      setStep(5);
      onRefreshCatalog?.();
    } catch (err) {
      if (!ac.signal.aborted) onShowToast?.(err.message, 'error');
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
    return true;
  };

  return (
    <div className="apollo-wizard">
      <div className="apollo-wizard-head">
        <div>
          <h3 className="apollo-wizard-title"><Sparkles size={18} /> Image generation</h3>
          <p className="apollo-wizard-sub">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
        </div>
        <button type="button" className="adm-btn-ghost adm-btn--sm" onClick={onExit} disabled={busy}>
          <X size={14} /> Exit wizard
        </button>
      </div>

      <div className="apollo-wizard-steps">
        {STEPS.map((label, i) => (
          <span key={label} className={`apollo-wizard-step${i === step ? ' apollo-wizard-step--active' : ''}${i < step ? ' apollo-wizard-step--done' : ''}`}>
            {label}
          </span>
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
        <div className="apollo-wizard-panel">
          <p className="adm-section-note">Choose exactly one style for this batch.</p>
          <div className="apollo-style-options">
            {STYLES.map((s) => (
              <label key={s.id} className={`apollo-style-option${imageStyle === s.id ? ' apollo-style-option--on' : ''}`}>
                <input type="radio" name="apolloStyle" value={s.id} checked={imageStyle === s.id} onChange={() => setImageStyle(s.id)} />
                <strong>{s.label}</strong>
                <span>{s.note}</span>
              </label>
            ))}
          </div>
          {imageStyle === 'generative' && (
            <div className="apollo-ref-upload">
              <input ref={refInputRef} type="file" accept="image/*" hidden onChange={(e) => void handleReferenceUpload(e.target.files?.[0])} />
              <button type="button" className="adm-btn-ghost" onClick={() => refInputRef.current?.click()} disabled={referenceUploading}>
                {referenceUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                Upload reference image
              </button>
              {referenceUrl && (
                <div className="apollo-ref-preview">
                  <img src={referenceUrl} alt="Reference" />
                  <button type="button" className="adm-icon-btn" onClick={() => setReferenceUrl('')} aria-label="Remove reference"><X size={12} /></button>
                </div>
              )}
            </div>
          )}
          {imageStyle === 'measurements' && (
            <p className="apollo-wizard-warn">Experimental — dimensions are parsed from each product&apos;s description. Results may vary.</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="apollo-wizard-panel">
          <label className="adm-field">
            <span className="adm-field-label">Rules &amp; notes (optional)</span>
            <textarea
              className="adm-textarea"
              rows={5}
              value={rulesNotes}
              onChange={(e) => setRulesNotes(e.target.value)}
              placeholder="Extra instructions appended to every image in this batch…"
            />
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="apollo-wizard-panel">
          <label className="apollo-fill-slots">
            <input type="checkbox" checked={fillSlots} onChange={(e) => setFillSlots(e.target.checked)} />
            <div>
              <strong>Fill all image slots</strong>
              <p className="adm-muted">Generate missing images (up to 4) using the primary as source. Alternate angles are AI-generated.</p>
            </div>
          </label>
          <p className="adm-muted" style={{ marginTop: 16 }}>
            {selectedIds.size} product{selectedIds.size === 1 ? '' : 's'} · Style: {STYLES.find((s) => s.id === imageStyle)?.label}
          </p>
        </div>
      )}

      {step === 4 && (
        <div className="apollo-wizard-panel">
          <ReprocessLiveFeed
            queue={queue}
            busy={busy}
            onDismiss={() => {}}
            onOpenNewProducts={() => {}}
            openLabel=""
            onStop={() => abortRef.current?.abort()}
          />
          {!busy && batchDone && (
            <button type="button" className="adm-btn-red" onClick={() => setStep(5)}>Continue to destination</button>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="apollo-wizard-panel apollo-wizard-dest">
          <p className="adm-section-note">Batch complete. Where should these previews go?</p>
          <div className="apollo-dest-actions">
            <button type="button" className="adm-btn-red" disabled={applyingLive} onClick={() => void applyLiveNow()}>
              {applyingLive ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
              Set live straight away
            </button>
            <button type="button" className="adm-btn-ghost" onClick={sendToApproval}>
              <ImagePlus size={14} /> Send to Approval
            </button>
          </div>
          <p className="adm-muted">Set live applies staged images immediately. Approval lets you review first.</p>
        </div>
      )}

      {step < 4 && (
        <div className="apollo-wizard-nav">
          <button type="button" className="adm-btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft size={14} /> Back
          </button>
          {step < 3 ? (
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
