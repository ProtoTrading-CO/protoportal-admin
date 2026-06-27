import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ImageOff, Loader2, RefreshCw, Upload } from 'lucide-react';
import {
  fetchImageIntakeHistory,
  previewImageIntake,
  processImageIntake,
} from '../lib/imageIntake';

function PreviewCard({ preview, loading }) {
  if (loading) {
    return (
      <div className="adm-intake-preview adm-intake-preview--loading">
        <Loader2 size={16} className="spin" /> Loading STMAST preview…
      </div>
    );
  }
  if (!preview) return null;

  const blocked = preview.canProcess === false;
  const uploadOnly = preview.uploadOnlyWithoutSql;

  return (
    <div className={`adm-intake-preview${blocked ? ' adm-intake-preview--blocked' : ''}`}>
      <div className="adm-intake-preview-head">
        <strong>{preview.filename}</strong>
        <span className="adm-intake-preview-sku">{preview.sourceSku} · slot {preview.imageNumber}</span>
      </div>
      {uploadOnly && (
        <p className="adm-intake-preview-warn">Upload-only — product exists in Supabase; STMAST bridge not configured for new SKUs.</p>
      )}
      {blocked ? (
        <p className="adm-intake-preview-error">{preview.blockedReason}</p>
      ) : (
        <dl className="adm-intake-preview-grid">
          <div><dt>Action</dt><dd>{preview.action || (preview.productExists ? 'upload_to_existing_product' : 'create_product_then_upload')}</dd></div>
          <div><dt>SQL title</dt><dd>{preview.sql?.title || (uploadOnly ? '(skipped — upload only)' : '—')}</dd></div>
          <div><dt>Price</dt><dd>R{Number(preview.sql?.price || 0).toFixed(2)}</dd></div>
          <div><dt>On hand</dt><dd>{preview.sql?.onhand ?? 0}</dd></div>
          <div><dt>Dept</dt><dd>{preview.sql?.dept || '—'}</dd></div>
          <div><dt>Supabase</dt><dd>{preview.productExists ? 'Existing product' : 'Will create product'}</dd></div>
          <div><dt>Storage</dt><dd className="adm-intake-mono">{preview.storagePath}</dd></div>
        </dl>
      )}
    </div>
  );
}

function ResultRow({ row }) {
  const ok = row.ok;
  return (
    <div className={`adm-intake-result${ok ? ' adm-intake-result--ok' : ' adm-intake-result--fail'}`}>
      <div className="adm-intake-result-head">
        {ok ? <CheckCircle2 size={14} /> : <ImageOff size={14} />}
        <strong>{row.file}</strong>
      </div>
      <p>{row.message || row.error}</p>
      {row.imageUrl && <p className="adm-intake-mono">{row.imageUrl}</p>}
    </div>
  );
}

export default function ImageIntakePanel({ onShowToast }) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [intakeConfig, setIntakeConfig] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { rows, config } = await fetchImageIntakeHistory({ limit: 40 });
      setHistory(rows);
      setIntakeConfig(config);
    } catch (err) {
      onShowToast?.(err.message || 'Failed to load history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const loadPreviews = useCallback(async (fileList) => {
    setPreviewLoading(true);
    const next = {};
    for (const file of fileList) {
      try {
        next[file.name] = await previewImageIntake(file);
      } catch (err) {
        next[file.name] = { filename: file.name, sqlFound: false, blockedReason: err.message };
      }
    }
    setPreviews(next);
    setPreviewLoading(false);
  }, []);

  const onFilesSelected = (fileList) => {
    const list = Array.from(fileList || []);
    setFiles(list);
    setResults([]);
    if (list.length) void loadPreviews(list);
    else setPreviews({});
  };

  const handleProcess = async () => {
    if (!files.length) {
      onShowToast?.('Select at least one image', 'error');
      return;
    }
    setProcessing(true);
    const batch = [];
    let ok = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const result = await processImageIntake(file, { dryRun });
        batch.push({ file: file.name, ok: true, ...result });
        ok += 1;
      } catch (err) {
        batch.push({ file: file.name, ok: false, error: err.message });
        failed += 1;
      }
      setResults([...batch]);
    }

    setProcessing(false);
    setFiles([]);
    setPreviews({});
    await loadHistory();
    onShowToast?.(
      dryRun
        ? `Dry run complete — ${ok} preview(s)${failed ? `, ${failed} failed` : ''}`
        : `Processed ${ok} image(s)${failed ? `, ${failed} failed` : ''}`,
      failed ? 'error' : 'success',
    );
  };

  const readyCount = files.filter((f) => previews[f.name]?.canProcess !== false).length;

  return (
    <div className="adm-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title">Image Intake</h2>
          <p className="adm-section-note">
            Uses George&apos;s <code>product_image_intake.py</code> logic: STMAST lookup → create product if missing
            (sell_price ex VAT in ERP; website price = PRICE_A × 1.15 rounded up to whole rand) → upload to Cloudflare R2{' '}
            <code>proto-images/&#123;SKU&#125;/&#123;slot&#125;.jpg</code> when R2 env vars are set (otherwise Supabase{' '}
            <code>product-images</code>). Catalogue rows on <code>website_stock</code> get the public image URL.
            STMAST lookup needs <code>STOCK_SQL_BRIDGE_URL</code> (office SQL bridge) or{' '}
            <code>IMAGE_INTAKE_SERVICE_URL</code> on Vercel — Vercel cannot reach BLADERUNNER-PC directly.
          </p>
        </div>
        <button type="button" className="adm-btn-ghost" onClick={() => void loadHistory()} disabled={historyLoading}>
          <RefreshCw size={14} /> {historyLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {intakeConfig && !intakeConfig.stmastAccess && (
        <p className="adm-intake-config-warn">
          STMAST bridge not configured — you can upload images for SKUs already in Supabase only.
          On BLADERUNNER-PC run <code>python scripts/sql-stmast-bridge.py</code>, tunnel port 8765, then set{' '}
          <code>STOCK_SQL_BRIDGE_URL</code> + <code>STOCK_SQL_BRIDGE_KEY</code> in Vercel.
        </p>
      )}

      <div className="adm-intake-toolbar">
        <label className="adm-btn-ghost adm-intake-file-btn">
          <Upload size={14} /> Select images
          <input type="file" accept="image/*" multiple hidden onChange={(e) => onFilesSelected(e.target.files)} />
        </label>
        <label className="adm-intake-dry">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run (preview only, no upload)
        </label>
        <button
          type="button"
          className="adm-btn-red"
          disabled={processing || !files.length || (!dryRun && readyCount === 0)}
          onClick={() => void handleProcess()}
        >
          {processing ? 'Processing…' : dryRun ? 'Dry run batch' : `Process ${readyCount || files.length} image(s)`}
        </button>
      </div>

      <p className="adm-muted adm-intake-hint">
        <strong>TBAG91.jpg</strong> → SKU TBAG91, slot 1 · <strong>8619000833-1.jpg</strong> → SKU 8619000833, slot 1
      </p>

      {!!files.length && (
        <div className="adm-intake-preview-stack">
          <h3 className="adm-intake-subhead">STMAST preview</h3>
          {files.map((file) => (
            <PreviewCard
              key={file.name}
              preview={previews[file.name]}
              loading={previewLoading && !previews[file.name]}
            />
          ))}
        </div>
      )}

      {!!results.length && (
        <div className="adm-intake-results">
          <h3 className="adm-intake-subhead">Batch report</h3>
          {results.map((row, i) => (
            <ResultRow key={`${row.file}-${i}`} row={row} />
          ))}
        </div>
      )}

      <div className="adm-intake-history">
        <h3 className="adm-intake-subhead">Recent intake ({history.length})</h3>
        {!history.length ? (
          <p className="adm-muted">No intake history yet.</p>
        ) : (
          <div className="adm-intake-history-list">
            {history.map((row) => (
              <div key={row.id} className="adm-intake-history-row">
                <div>
                  <strong>{row.original_filename}</strong>
                  <span className="adm-muted"> · {row.source_sku}</span>
                </div>
                <span className={`adm-intake-status adm-intake-status--${row.status}`}>{row.status}</span>
                {row.error_message && <p className="adm-intake-preview-error">{row.error_message}</p>}
                {row.final_image_url && <p className="adm-intake-mono">{row.final_image_url}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
