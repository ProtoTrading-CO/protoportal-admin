import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  PackagePlus,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import categories from '../data/categories.json';

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

export default function ProductLoaderPanel({ taxonomyTree = categories, onShowToast }) {
  const fileRef = useRef(null);

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
    setCategorySource('manual');
    setOverwriteConfirmed(false);
    setPriceZeroConfirmed(false);
    setPublishResult(null);
    setPublishError('');
  };

  const handleLookup = async () => {
    const c = code.trim();
    if (!c) return;
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
        setCategoryId(ws.category || '');
        setSub1Id(ws.subcategory_one || '');
        setSub2Id(ws.subcategory_two || '');
        setCategorySource('existing');
        const firstEmpty = SLOT_FIELDS.findIndex((f) => !ws[f]);
        const targetSlot = firstEmpty >= 0 ? firstEmpty + 1 : 1;
        setImageSlot(targetSlot);
        if (json.existingImages.length) {
          setImageUrl(json.existingImages[0]);
          setImageSource('existing');
        }
      }
    } catch (err) {
      setLookupError(err.message || 'Lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

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
          imageUrl,
          imageSlot,
          imageSource,
          overwriteImage: isOverwritingFilledSlot ? overwriteConfirmed : false,
          category: catNode?.label || categoryId,
          subcategoryOne: sub1Node?.label || sub1Id || catNode?.label || categoryId,
          subcategoryTwo: sub2Node?.label || sub2Id || null,
          description: websiteRow?.original_description || sqlRow?.title || '',
          categoryConfidence: categorySource === 'gemini' ? 0.85 : 1.0,
          publishMode: 'direct',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Publish failed');
      setPublishResult(json);
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
    <div className="adm-panel" style={{ maxWidth: 680 }}>
      {/* Header */}
      <div className="adm-section-head" style={{ marginBottom: 24 }}>
        <div>
          <h2 className="adm-section-title">Product Loader</h2>
          <p className="adm-section-note">Publish products directly to the website from Positill.</p>
        </div>
      </div>

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
          onClick={handleLookup}
          disabled={lookingUp || !code.trim()}
        >
          {lookingUp ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
          {lookingUp ? 'Looking up…' : 'Look up'}
        </button>
      </div>

      {lookupError && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{lookupError}</div>
      )}

      {/* SQL bridge offline notice */}
      {lookupData && !lookupData.sqlAvailable && (
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
          Positill bridge offline — price and stock figures from website data only.
        </div>
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
                  {sqlRow?.title || websiteRow?.title || '—'}
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

          {/* Category section — only shown once image is selected */}
          {imageUrl && (
            <section>
              <SectionHead
                title="Category"
                action={(
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
                )}
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
                    onChange={(e) => { setCategoryId(e.target.value); setSub1Id(''); setSub2Id(''); setCategorySource('manual'); }}
                  >
                    <option value="">— Select category —</option>
                    {taxonomyTree.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                {sub1Options.length > 0 && (
                  <div>
                    <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Subcategory</label>
                    <select
                      className="adm-select adm-select--enhanced"
                      style={{ width: '100%' }}
                      value={sub1Id}
                      onChange={(e) => { setSub1Id(e.target.value); setSub2Id(''); }}
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
                      onChange={(e) => setSub2Id(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {sub2Options.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Confirmations + Publish */}
          {imageUrl && categoryId && (
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
                {sqlRow?.title || websiteRow?.title || code} ·{' '}
                {findNode(taxonomyTree, categoryId)?.label || categoryId}
                {sub1Id ? ` › ${findNode(taxonomyTree, sub1Id)?.label || sub1Id}` : ''}
                {sub2Id ? ` › ${findNode(taxonomyTree, sub2Id)?.label || sub2Id}` : ''}
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
  );
}
