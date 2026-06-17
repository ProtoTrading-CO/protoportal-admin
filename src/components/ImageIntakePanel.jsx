import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { enqueueImageIntake, fetchImageIntakeQueue } from '../lib/imageIntake';

const STATUS_LABEL = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

function statusColor(status) {
  if (status === 'completed') return '#065f46';
  if (status === 'failed') return '#991b1b';
  if (status === 'processing') return '#1d4ed8';
  return '#64748b';
}

export default function ImageIntakePanel({ onShowToast }) {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const fileCountLabel = useMemo(
    () => `${files.length} file${files.length === 1 ? '' : 's'} selected`,
    [files.length],
  );

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const rows = await fetchImageIntakeQueue({ status: statusFilter, limit: 100 });
      setQueue(rows);
    } catch (err) {
      onShowToast?.(err.message || 'Failed to load queue', 'error');
    } finally {
      setQueueLoading(false);
    }
  }, [onShowToast, statusFilter]);

  useEffect(() => {
    void loadQueue();
    const timer = setInterval(() => { void loadQueue(); }, 15000);
    return () => clearInterval(timer);
  }, [loadQueue]);

  const handleEnqueue = async () => {
    if (!files.length) {
      onShowToast?.('Select at least one image file', 'error');
      return;
    }
    setIsUploading(true);
    const nextResults = [];
    let ok = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const result = await enqueueImageIntake(file);
        nextResults.push({ file: file.name, ok: true, result });
        ok += 1;
      } catch (err) {
        nextResults.push({ file: file.name, ok: false, error: err.message });
        failed += 1;
      }
      setUploadResults([...nextResults]);
    }

    setIsUploading(false);
    setFiles([]);
    await loadQueue();
    onShowToast?.(
      `Queued ${ok} image(s)${failed ? `, ${failed} failed` : ''} — BLADERUNNER-PC worker will process.`,
      failed ? 'error' : 'success',
    );
  };

  return (
    <div className="adm-panel">
      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title">Image Intake Queue</h2>
          <p className="adm-section-note">
            Admin uploads images into a Supabase queue only. The website is <strong>not</strong> connected to SQL.
            <strong> BLADERUNNER-PC</strong> runs the intake worker: reads queue → reads SQL (read-only) → creates/updates products → uploads images → updates queue status.
          </p>
        </div>
        <button type="button" className="adm-btn-ghost" onClick={() => void loadQueue()} disabled={queueLoading}>
          <RefreshCw size={14} /> {queueLoading ? 'Refreshing…' : 'Refresh queue'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="adm-btn-ghost" style={{ cursor: 'pointer' }}>
            Select image files
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
          <span className="adm-muted" style={{ fontSize: 12 }}>{fileCountLabel}</span>
          <button type="button" className="adm-btn-red" disabled={isUploading || !files.length} onClick={() => void handleEnqueue()}>
            {isUploading ? 'Queuing…' : 'Queue for worker'}
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#475569' }}>
          Filename format: <strong>03070010.jpg</strong> (slot 1) or <strong>03070010-2.jpg</strong> (slot 2–4).
        </div>

        {!!uploadResults.length && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', maxWidth: 760 }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, fontWeight: 700 }}>
              Last upload batch
            </div>
            {uploadResults.map((row, i) => (
              <div key={`${row.file}-${i}`} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>{row.file}</div>
                {row.ok
                  ? <div style={{ color: '#065f46' }}>Queued — {row.result.sourceSku} ({row.result.imageColumn})</div>
                  : <div style={{ color: '#991b1b' }}>{row.error}</div>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>Queue status</span>
          {['', 'pending', 'processing', 'completed', 'failed'].map((value) => (
            <button
              key={value || 'all'}
              type="button"
              className={`adm-btn-ghost${statusFilter === value ? ' adm-tab--active' : ''}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setStatusFilter(value)}
            >
              {value ? STATUS_LABEL[value] : 'All'}
            </button>
          ))}
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, fontWeight: 700 }}>
            Worker queue ({queue.length})
          </div>
          {!queue.length ? (
            <div style={{ padding: 16, fontSize: 12, color: '#64748b' }}>No queue items yet.</div>
          ) : (
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {queue.map((row) => (
                <div key={row.id} style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{row.original_filename}</strong>
                    <span style={{ color: statusColor(row.status), fontWeight: 700 }}>{STATUS_LABEL[row.status] || row.status}</span>
                  </div>
                  <div className="adm-muted">SKU {row.source_sku} · {row.image_column}</div>
                  {row.error_message && <div style={{ color: '#991b1b' }}>{row.error_message}</div>}
                  {row.final_image_url && <div style={{ color: '#065f46' }}>Image live: {row.final_image_url}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
