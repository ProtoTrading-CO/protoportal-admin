import { useRef, useState } from 'react';
import {
  ExternalLink,
  ImagePlus,
  Loader2,
  PackagePlus,
  Upload,
  X,
} from 'lucide-react';
import { isImageFile, websiteStatusLabel } from '../../lib/parseIntakeFilename';
import { lookupFilenames, logPublishFailure, publishLoaderImageItem } from '../../lib/productLoaderApi';

function displayTitle(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
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

export default function ProductLoaderSingleImage({
  taxonomyTree,
  batchDefaultCategoryId,
  setBatchDefaultCategoryId,
  batchDefaultSub1Id,
  setBatchDefaultSub1Id,
  batchOverwrite,
  setBatchOverwrite,
  onShowToast,
  onOpenAdvanced,
  onPublished,
  onAddDormant,
  mainSiteUrl = 'https://site.proto.co.za',
}) {
  const inputRef = useRef(null);
  const [item, setItem] = useState(null);
  const [preview, setPreview] = useState('');
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const batchSub1Options = batchDefaultCategoryId ? childrenOf(taxonomyTree, batchDefaultCategoryId) : [];

  const clear = () => {
    if (preview) {
      try { URL.revokeObjectURL(preview); } catch { /* ignore */ }
    }
    setPreview('');
    setItem(null);
    setError('');
  };

  const handleSelect = async (fileList) => {
    const file = [...(fileList || [])].filter(isImageFile)[0];
    if (!file) {
      setError('Please choose an image file (JPG, PNG, or WebP).');
      return;
    }
    setScanning(true);
    setError('');
    clear();
    try {
      const [row] = await lookupFilenames([file.name], [file]);
      if (!row) throw new Error('Lookup failed');
      setItem({ ...row, file });
      setPreview(URL.createObjectURL(file));
      if (row.canPublish) {
        onShowToast?.(`Matched ${row.code}`, 'success');
      } else {
        onShowToast?.('Could not match filename to catalogue', 'warning');
      }
    } catch (err) {
      setError(err.message || 'Lookup failed');
    } finally {
      setScanning(false);
    }
  };

  const handlePublish = async () => {
    if (!item || item.group === 'not_found') return;
    setProcessing(true);
    setError('');
    try {
      await publishLoaderImageItem(item, {
        taxonomyTree,
        findNode,
        defaultCategoryId: batchDefaultCategoryId,
        defaultSub1Id: batchDefaultSub1Id,
        overwrite: batchOverwrite,
      });
      onPublished?.({ sku: item.code, filename: item.filename, action: item.websiteRow ? 'update' : 'create' });
      clear();
    } catch (err) {
      setError(err.message || 'Publish failed');
      await logPublishFailure({ sku: item.code, filename: item.filename, reason: err.message });
    } finally {
      setProcessing(false);
    }
  };

  const soh = item?.stockOnHand ?? item?.sqlRow?.available ?? item?.websiteRow?.available_stock ?? '—';
  const status = item?.websiteStatus || 'not_found';
  const isLive = status === 'live';

  return (
    <div className="pl-section">
      <p className="pl-section-note">
        Name the file with the product code — e.g. <code>ME039-2.jpg</code>, <code>ME039 (1).jpg</code>, or <code>ME039 FRONT.jpg</code>.
      </p>

      <div
        className="pl-dropzone"
        role="button"
        tabIndex={0}
        onClick={() => !scanning && !processing && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => { void handleSelect(e.target.files); e.target.value = ''; }}
        />
        {scanning ? (
          <span><Loader2 size={16} className="spin" /> Looking up product…</span>
        ) : (
          <span><ImagePlus size={16} /> Choose image</span>
        )}
      </div>

      {error && <p className="pl-error">{error}</p>}

      {item && (
        <article className="pl-preview-card">
          <div className="pl-preview-card-body">
            {preview && (
              <div className="pl-preview-thumb">
                <img src={preview} alt="" />
              </div>
            )}
            <div className="pl-preview-meta">
              <span className={`pl-status-badge pl-status-badge--${status}`}>{websiteStatusLabel(status)}</span>
              <h4>{displayTitle(item.title, item.sqlRow?.title) || item.code || '—'}</h4>
              <dl className="pl-meta-grid">
                <div><dt>SKU</dt><dd>{item.code || '—'}</dd></div>
                <div><dt>Department</dt><dd>{item.department || item.sqlRow?.dept || '—'}</dd></div>
                <div><dt>Category</dt><dd>{item.category || item.websiteRow?.category || '—'}</dd></div>
                <div><dt>Price</dt><dd>R{Number(item.price ?? 0).toFixed(2)}</dd></div>
                <div><dt>SOH</dt><dd>{soh}</dd></div>
                <div><dt>Slot</dt><dd>{item.imageSlot}</dd></div>
              </dl>
              {item.parseError && <p className="pl-error">Invalid filename — {item.parseError}</p>}
              {item.group === 'not_found' && !item.parseError && (
                <p className="pl-error">Product not found in Positill or website catalogue.</p>
              )}
            </div>
          </div>

          {item.group !== 'not_found' && !item.websiteRow?.category && (
            <div className="pl-inline-fields">
              <label>
                Category (required for new products)
                <select className="adm-select adm-select--enhanced" value={batchDefaultCategoryId} onChange={(e) => { setBatchDefaultCategoryId(e.target.value); setBatchDefaultSub1Id(''); }}>
                  <option value="">— Select —</option>
                  {taxonomyTree.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                </select>
              </label>
              {batchSub1Options.length > 0 && (
                <label>
                  Subcategory
                  <select className="adm-select adm-select--enhanced" value={batchDefaultSub1Id} onChange={(e) => setBatchDefaultSub1Id(e.target.value)}>
                    <option value="">— Optional —</option>
                    {batchSub1Options.map((opt) => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                  </select>
                </label>
              )}
              <label className="pl-check">
                <input type="checkbox" checked={batchOverwrite} onChange={(e) => setBatchOverwrite(e.target.checked)} />
                Replace image if slot already filled
              </label>
            </div>
          )}

          <div className="pl-action-row">
            {item.group !== 'not_found' && (
              <>
                <button type="button" className="adm-btn-red" disabled={processing} onClick={() => void handlePublish()}>
                  {processing ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                  Publish Live
                </button>
                <button type="button" className="adm-btn-ghost" disabled={processing} onClick={() => onAddDormant?.(item)}>
                  <PackagePlus size={14} /> Add To Dormant
                </button>
              </>
            )}
            <button type="button" className="adm-btn-ghost" disabled={!item.code} onClick={() => onOpenAdvanced?.(item.code)}>
              Open Advanced Editor
            </button>
            {isLive && (
              <a className="adm-btn-ghost" href={`${mainSiteUrl.replace(/\/$/, '')}/products?search=${encodeURIComponent(item.code)}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} /> View Website
              </a>
            )}
            <button type="button" className="adm-btn-ghost" onClick={clear}>
              <X size={14} /> Cancel
            </button>
          </div>
        </article>
      )}
    </div>
  );
}
